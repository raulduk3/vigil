/**
 * Agent Engine — V2 Core
 *
 * 8-step invocation flow:
 * 1. Load watcher config
 * 2. Load memory
 * 3. Load active threads
 * 4. If email_received: get/create thread, load history
 * 5. Build prompt
 * 6. Call Claude API
 * 7. Execute tools + persist state
 * 8. Log invocation
 */

import { queryOne, queryMany, run } from "../db/client";
import { logger } from "../logger";
import { decrypt } from "../auth/encryption";
import { executeSkill, SKILL_CATALOG } from "../skills/registry";
import { reportInvocationCost } from "../billing/usage";
import {
    buildSystemPrompt,
    buildEmailTriggerPrompt,
    buildTickTriggerPrompt,
    buildDigestPrompt,
    buildUserQueryPrompt,
} from "./prompts";
import {
    retrieveMemories,
    storeMemories,
    formatMemoriesForContext,
    touchMemoryAccess,
    markObsolete,

} from "./memory";
import { executeTool } from "./tools";
import {
    findMatchingThread,
    normalizeSubject,
} from "../watcher/thread-detection";
import type {
    WatcherRow,
    ThreadRow,
    EmailRow,
    AgentResponse,
    InvocationTrigger,
    WatcherContext,
    ChannelRow,
} from "./schema";

// ============================================================================
// BYOK Key Cache
// In-memory cache of decrypted keys, keyed by account_id + provider.
// Keys are evicted after 5 minutes to limit exposure.
// ============================================================================

interface CachedKey {
    key: string;
    expiresAt: number;
}

const byokCache = new Map<string, CachedKey>();
const BYOK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getByokCacheKey(account_id: string, provider: string): string {
    return `${account_id}:${provider}`;
}

/**
 * Returns the decrypted BYOK key for the given account + provider, or null if not set.
 * Caches the result in memory for BYOK_CACHE_TTL_MS.
 */
function getByokKey(account_id: string, provider: "openai" | "anthropic" | "google"): string | null {
    const cacheKey = getByokCacheKey(account_id, provider);
    const cached = byokCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.key;
    }
    byokCache.delete(cacheKey);

    const columnMap = {
        openai: "openai_api_key_enc",
        anthropic: "anthropic_api_key_enc",
        google: "google_api_key_enc",
    } as const;

    const row = queryOne<{ enc: string | null }>(
        `SELECT ${columnMap[provider]} AS enc FROM accounts WHERE id = ?`,
        [account_id]
    );

    if (!row?.enc) return null;

    try {
        const key = decrypt(row.enc);
        byokCache.set(cacheKey, { key, expiresAt: Date.now() + BYOK_CACHE_TTL_MS });
        return key;
    } catch (err) {
        logger.warn("Failed to decrypt BYOK key", { account_id, provider, err: String(err) });
        return null;
    }
}

/** Check if account has any BYOK key configured (skip billing for these users) */
function hasAnyByokKey(account_id: string): boolean {
    const row = queryOne<{ has_key: number }>(
        `SELECT (CASE WHEN openai_api_key_enc IS NOT NULL OR anthropic_api_key_enc IS NOT NULL OR google_api_key_enc IS NOT NULL THEN 1 ELSE 0 END) AS has_key FROM accounts WHERE id = ?`,
        [account_id]
    );
    return !!row?.has_key;
}


// ============================================================================
// Main Entry Point
// ============================================================================

export async function invokeAgent(
    watcherId: string,
    trigger: InvocationTrigger
): Promise<AgentResponse | null> {
    const startMs = Date.now();
    let emailId: string | null = null;
    let threadId: string | null = null;

    // 1. Load watcher config
    const watcher = queryOne<WatcherRow>(
        `SELECT * FROM watchers WHERE id = ? AND status != 'deleted'`,
        [watcherId]
    );
    if (!watcher) {
        logger.warn("invokeAgent: watcher not found", { watcherId });
        return null;
    }

    // Load channels and account email for context
    const channels = queryMany<ChannelRow>(
        `SELECT * FROM channels WHERE watcher_id = ? AND enabled = TRUE`,
        [watcherId]
    );
    const account = queryOne<{ email: string }>(
        `SELECT email FROM accounts WHERE id = ?`,
        [watcher.account_id]
    );
    const ctx: WatcherContext = {
        watcher,
        channels,
        accountEmail: account?.email ?? "",
    };

    // 2. Load memory (pass email context for FTS5 retrieval when > 20 memories)
    const emailContext =
        trigger.type === "email_received"
            ? { from: trigger.email.originalFrom ?? trigger.email.from, subject: trigger.email.subject, body: trigger.email.body }
            : undefined;
    const memories = retrieveMemories(watcherId, emailContext);
    const memoryContext = formatMemoriesForContext(memories);

    // Track which memories were loaded into context
    if (memories.length > 0) {
        touchMemoryAccess(memories.map((m) => m.id));
    }

    // 3. Load active threads
    const activeThreads = queryMany<ThreadRow>(
        `SELECT * FROM threads
         WHERE watcher_id = ? AND status IN ('active', 'watching')
         ORDER BY last_activity DESC
         LIMIT 20`,
        [watcherId]
    );

    // 4. If email_received: handle email insertion + thread management
    let emailTriggerContext = "";
    if (trigger.type === "email_received") {
        const { email } = trigger;

        // Hash body for proof-of-receipt (never store the body itself)
        const bodyHash = await hashBody(email.body);

        // Use originalFrom (forwarded email's actual sender) when available
        const effectiveFrom = email.originalFrom ?? email.from;

        // Insert email record
        emailId = crypto.randomUUID();
        run(
            `INSERT INTO emails
             (id, watcher_id, message_id, from_addr, to_addr, subject, received_at, original_date, recipient_received_at, body_hash, processed, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)`,
            [
                emailId,
                watcherId,
                email.messageId,
                effectiveFrom,
                email.to,
                email.subject,
                new Date(email.receivedAt).toISOString(),
                email.originalDate ? new Date(email.originalDate).toISOString() : null,
                email.recipientReceivedAt ?? null,
                bodyHash,
            ]
        );

        // Thread detection
        const existingThreads = buildThreadMap(activeThreads);
        const messageIdMap = buildEmailMessageIdMap(watcherId);

        const match = findMatchingThread(
            {
                messageId: email.messageId,
                from: effectiveFrom,
                subject: email.subject,
                headers: email.headers,
            },
            existingThreads,
            messageIdMap
        );

        if (match) {
            threadId = match.threadId;
            run(
                `UPDATE threads SET email_count = email_count + 1, last_activity = CURRENT_TIMESTAMP WHERE id = ?`,
                [threadId]
            );
        } else {
            // Create new thread
            threadId = crypto.randomUUID();
            const participants = JSON.stringify([effectiveFrom]);
            run(
                `INSERT INTO threads
                 (id, watcher_id, subject, participants, status, first_seen, last_activity, email_count, created_at)
                 VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)`,
                [threadId, watcherId, email.subject, participants]
            );
        }

        // Attach email to thread
        run(`UPDATE emails SET thread_id = ? WHERE id = ?`, [threadId, emailId]);

        // Load thread email history (last 5, for context)
        const threadHistory = queryMany<EmailRow>(
            `SELECT * FROM emails
             WHERE thread_id = ? AND id != ?
             ORDER BY received_at DESC
             LIMIT 5`,
            [threadId, emailId]
        );

        emailTriggerContext = buildEmailTriggerPrompt(
            {
                from: effectiveFrom,
                to: email.to,
                subject: email.subject,
                body: email.body,
                receivedAt: email.receivedAt,
            },
            threadHistory,
            threadId!
        );
    }

    // 5. Chat mode — completely separate path, returns text not JSON
    if (trigger.type === "user_chat") {
        const { buildChatSystemPrompt, buildChatUserPrompt } = await import("./prompts");

        // Load recent emails for inbox context
        const recentEmails = queryMany<EmailRow>(
            `SELECT * FROM emails WHERE watcher_id = ? ORDER BY created_at DESC LIMIT 30`,
            [watcherId]
        );

        // Load ALL threads for chat context (not just active/watching)
        const allThreadsForChat = queryMany<ThreadRow>(
            `SELECT * FROM threads WHERE watcher_id = ? ORDER BY last_activity DESC LIMIT 50`,
            [watcherId]
        );
        const chatSystem = buildChatSystemPrompt(watcher, memoryContext, allThreadsForChat, recentEmails);
        const chatUser = buildChatUserPrompt(trigger.message);
        const model = watcher.model || process.env.VIGIL_MODEL || "gpt-4.1";

        try {
            const result = await callLLMRaw(chatSystem, chatUser, model, watcher.account_id);
            const rates = MODEL_CATALOG[model]?.pricing ?? { input: 0.0004, output: 0.0016 };
                        const tokenCost = (result.inputTokens / 1000) * rates.input + (result.outputTokens / 1000) * rates.output;
            const totalCost = tokenCost;

            // Parse and execute inline action blocks
            const { text: cleanText, actionsExecuted } = await executeChatActions(result.text, ctx);

            // Log the chat invocation cost
            await logAction(
                watcherId, null, null, "user_chat",
                null, "chat", null, null,
                "success", null, startMs,
                null, result.inputTokens, result.outputTokens, totalCost, model
            );

            logger.info("Chat invocation complete", {
                watcherId, model,
                tokens: result.inputTokens + result.outputTokens,
                cost: totalCost, actionsExecuted,
            });

            // Report flat rate to Stripe
            // Bill actual LLM cost + 5% margin for chat. BYOK users are free.
            if (!hasAnyByokKey(watcher.account_id) && totalCost > 0) {
                const MARGIN = 0.05;
                const billable = totalCost * (1 + MARGIN);
                reportInvocationCost(watcher.account_id, billable).catch(() => {});
            }

            return {
                actions: [],
                memory_append: null,
                memory_obsolete: null,
                thread_updates: null,
                email_analysis: null,
                chat_response: cleanText,
            } as AgentResponse & { chat_response: string };
        } catch (err) {
            logger.error("Chat LLM call failed", { watcherId, err, model });
            return {
                actions: [],
                memory_append: null,
                memory_obsolete: null,
                thread_updates: null,
                email_analysis: null,
                chat_response: "Sorry, I couldn't process that right now. Please try again.",
            } as AgentResponse & { chat_response: string };
        }
    }

    // 6. Build structured prompt (non-chat triggers)
    // Load custom tools for this watcher
    const customToolRows = queryMany<{ name: string; description: string; parameter_schema: string }>(
        `SELECT name, description, parameter_schema FROM custom_tools WHERE watcher_id = ? AND enabled = TRUE`,
        [watcherId]
    );
    const customTools = customToolRows.map(row => ({
        name: row.name,
        description: row.description,
        parameter_schema: (() => { try { return JSON.parse(row.parameter_schema); } catch { return {}; } })(),
    }));

    // Load enabled skills for this watcher and build skill tools
    const skillRows = queryMany<{ id: string; provider: string; name: string; config_enc: string | null }>(
        `SELECT id, provider, name, config_enc FROM skills WHERE watcher_id = ? AND enabled = TRUE`,
        [watcherId]
    );
    const skillTools = await buildSkillTools(skillRows);

    const systemPrompt = buildSystemPrompt(watcher, memoryContext, activeThreads, customTools, skillTools);
    let userPrompt: string;

    if (trigger.type === "email_received") {
        userPrompt = emailTriggerContext;
    } else if (trigger.type === "scheduled_tick") {
        userPrompt = buildTickTriggerPrompt(
            trigger.timestamp,
            activeThreads,
            watcher.silence_hours,
            memoryContext
        );
    } else if (trigger.type === "weekly_digest") {
        // Load all threads (not just active) for the digest
        const allThreads = queryMany<ThreadRow>(
            `SELECT * FROM threads WHERE watcher_id = ? ORDER BY last_activity DESC LIMIT 50`,
            [watcherId]
        );
        // Get action stats for the period
        const periodDays = 7;
        const cutoff = new Date(trigger.timestamp - periodDays * 86400000).toISOString();
        const actionStats = queryOne<{ total: number; alerts: number; ignored: number; cost: number }>(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN tool = 'send_alert' THEN 1 ELSE 0 END) as alerts,
                SUM(CASE WHEN tool = 'ignore_thread' THEN 1 ELSE 0 END) as ignored,
                COALESCE(SUM(cost_usd), 0) as cost
             FROM actions WHERE watcher_id = ? AND created_at >= ?`,
            [watcherId, cutoff]
        ) ?? { total: 0, alerts: 0, ignored: 0, cost: 0 };

        userPrompt = buildDigestPrompt(
            trigger.timestamp,
            activeThreads,
            allThreads,
            memoryContext,
            { total: actionStats.total, alerts: actionStats.alerts, ignored: actionStats.ignored, costUsd: actionStats.cost, periodDays }
        );
    } else {
        userPrompt = buildUserQueryPrompt(trigger.query);
    }

    // 6. Call Claude API
    let agentResponse: AgentResponse;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;

    // Ticks use nano (cheapest model, absorbed by platform). Emails/chat use watcher's model.
    const model = trigger.type === "scheduled_tick"
        ? "gpt-4.1-nano"
        : (watcher.model || process.env.VIGIL_MODEL || "gpt-4.1-mini");

    try {
        const result = await callLLM(systemPrompt, userPrompt, model, watcher.account_id);
        agentResponse = result.response;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        // Pricing: marked-up token cost + platform fee per invocation
        const rates = MODEL_CATALOG[model]?.pricing ?? { input: 0.0004, output: 0.0016 };
        costUsd =
            (result.inputTokens / 1000) * rates.input +
            (result.outputTokens / 1000) * rates.output +
            0;
    } catch (err) {
        // Retry once on LLM failure
        logger.warn("LLM call failed, retrying once", { watcherId, err: String(err), model });
        try {
            const retry = await callLLM(systemPrompt, userPrompt, model, watcher.account_id);
            agentResponse = retry.response;
            inputTokens = retry.inputTokens;
            outputTokens = retry.outputTokens;
            const rates = MODEL_CATALOG[model]?.pricing ?? { input: 0.0024, output: 0.0096 };
            costUsd =
                (retry.inputTokens / 1000) * rates.input +
                (retry.outputTokens / 1000) * rates.output +
                0;
            logger.info("LLM retry succeeded", { watcherId, model });
        } catch (retryErr) {
            logger.error("LLM retry also failed", { watcherId, err: String(retryErr), model });
            await logAction(watcherId, threadId, emailId, trigger.type, null, null, null, null, "failed", String(retryErr), startMs);
            return null;
        }
    }

    // 7. Execute tools
    const emailThreadCtx = trigger.type === "email_received" ? {
        threadId: threadId ?? undefined,
        emailFrom: trigger.email.originalFrom ?? trigger.email.from,
        emailSubject: trigger.email.subject,
        emailReceivedAt: new Date(trigger.email.receivedAt).toISOString(),
    } : { threadId: threadId ?? undefined };

    const toolResults: Array<{ tool: string; result: any }> = [];
    for (const action of agentResponse.actions ?? []) {
        // Inject thread context into send_alert if the agent didn't provide it
        if (action.tool === "send_alert" && !action.params.thread_id && threadId) {
            action.params.thread_id = threadId;
        }

        // Check if this is a skill tool (prefix: skill_<provider>_)
        const skillMatch = action.tool.match(/^skill_([^_]+)_(.+)$/);
        const matchedSkill = skillMatch
            ? skillRows.find(s => s.provider === skillMatch[1] && slugifyName(s.name) === skillMatch[2])
            : null;

        if (matchedSkill) {
            const result = await executeSkillTool(matchedSkill, action.params);
            toolResults.push({ tool: action.tool, result });
            logger.info("Skill tool executed", {
                tool: action.tool,
                provider: matchedSkill.provider,
                skillName: matchedSkill.name,
                ok: result.success,
            });
        } else {
            const result = await executeTool(action.tool, action.params, ctx, emailThreadCtx);
            toolResults.push({ tool: action.tool, result });
            logger.info("Tool executed", {
                tool: action.tool,
                success: result.success,
                reasoning: action.reasoning,
            });
        }
    }

    // Persist thread updates from agent response
    for (const update of agentResponse.thread_updates ?? []) {
        const sets: string[] = [];
        const vals: any[] = [];
        if (update.status) { sets.push("status = ?"); vals.push(update.status); }
        if (update.summary) { sets.push("summary = ?"); vals.push(update.summary); }
        if (update.flags) { sets.push("flags = ?"); vals.push(JSON.stringify(update.flags)); }
        if (sets.length > 0) {
            vals.push(update.thread_id);
            run(`UPDATE threads SET ${sets.join(", ")} WHERE id = ?`, vals);
        }
    }

    // Post-process: validate and correct urgency based on the model's own signals.
    // Smaller models (4.1-mini) systematically under-classify urgency even when they
    // correctly identify deadlines and action requests. If the model stored a high-importance
    // memory or triggered an alert, urgency should not be "low".
    if (agentResponse.email_analysis) {
        const analysis = agentResponse.email_analysis;
        const hasHighMemory = (agentResponse.memory_append ?? []).some(
            (m: any) => (m.importance ?? 3) >= 4
        );
        const hasAlert = (agentResponse.actions ?? []).some(
            (a: any) => a.tool === "send_alert"
        );

        if (analysis.urgency === "low" && (hasHighMemory || hasAlert)) {
            logger.info("Urgency correction: model said low but signals say otherwise", {
                watcherId, hadHighMemory: hasHighMemory, hadAlert: hasAlert,
                originalUrgency: "low", correctedTo: "normal",
            });
            analysis.urgency = "normal";
        }
    }

    // Store email analysis on the email record
    if (emailId && agentResponse.email_analysis) {
        run(
            `UPDATE emails SET analysis = ?, processed = TRUE WHERE id = ?`,
            [JSON.stringify(agentResponse.email_analysis), emailId]
        );
    } else if (emailId) {
        run(`UPDATE emails SET processed = TRUE WHERE id = ?`, [emailId]);
    }

    // Save memory
    if (agentResponse.memory_append) {
        storeMemories(watcherId, agentResponse.memory_append, threadId);
    }

    // Mark obsolete memories
    if (agentResponse.memory_obsolete?.length) {
        for (const memId of agentResponse.memory_obsolete) {
            markObsolete(memId);
        }
        logger.debug("Marked memories obsolete", { watcherId, count: agentResponse.memory_obsolete.length });
    }

    // Update last_tick_at for scheduled ticks
    if (trigger.type === "scheduled_tick") {
        run(`UPDATE watchers SET last_tick_at = CURRENT_TIMESTAMP WHERE id = ?`, [watcherId]);
    }

    // 8. Log all actions individually
    for (let i = 0; i < toolResults.length; i++) {
        const action = agentResponse.actions![i]!;
        const result = toolResults[i]!;
        // Add alert delivery cost to the action's cost if applicable
        const toolCost = result.result.cost ?? 0;
        const actionCost = (i === 0 ? costUsd : 0) + toolCost;
        await logAction(
            watcherId, threadId, emailId, trigger.type,
            null,
            action.tool,
            JSON.stringify(action.params),
            action.reasoning ?? null,
            result.result.success ? "success" : "failed",
            result.result.error ?? null,
            startMs,
            null, i === 0 ? inputTokens : 0, i === 0 ? outputTokens : 0, actionCost > 0 ? actionCost : null,
            i === 0 ? model : null
        );
    }

    // Always log one invocation record with cost, model, and analysis.
    // Tool actions (send_alert, webhook, etc.) are logged separately above.
    // Memory and thread operations are NOT logged as separate action rows
    // to avoid duplicate counting. They're part of the invocation.
    if (toolResults.length === 0) {
        await logAction(
            watcherId, threadId, emailId, trigger.type,
            agentResponse.email_analysis ? JSON.stringify(agentResponse.email_analysis) : null,
            null, null, null,
            "success", null, startMs,
            null, inputTokens, outputTokens, costUsd, model
        );
    }

    logger.info("Agent invocation complete", {
        watcherId,
        trigger: trigger.type,
        actions: agentResponse.actions?.length ?? 0,
        durationMs: Date.now() - startMs,
    });

    // Calculate total cost including tool costs (e.g. alert delivery)
    let totalToolCost = 0;
    if (agentResponse?.actions) {
        for (const action of agentResponse.actions) {
            if (action.result?.cost) totalToolCost += action.result.cost;
        }
    }
    const totalCostAll = costUsd + totalToolCost;

    // Bill all usage at actual cost + 5%. LLM + tools. BYOK skips LLM billing but tools still cost.
    if (!hasAnyByokKey(watcher.account_id) && totalCostAll > 0) {
        const MARGIN = 0.05;
        const billable = totalCostAll * (1 + MARGIN);
        reportInvocationCost(watcher.account_id, billable).catch((err) =>
            logger.error("Failed to report invocation cost", { watcherId, err })
        );
    }

    return agentResponse;
}

// ============================================================================
// Multi-Provider LLM API
// ============================================================================

/**
 * Supported models with provider routing and pricing.
 * Pricing is per 1K tokens (input/output).
 */
export const MODEL_CATALOG: Record<string, {
    provider: "openai" | "anthropic" | "google";
    label: string;
    tier: "nano" | "mini" | "standard" | "pro";
    pricing: { input: number; output: number };
    maxTokens: number;
}> = {
    // OpenAI
    // Pricing: actual provider rates (no markup — margin applied at billing time)
    "gpt-4.1-nano": {
        provider: "openai", label: "GPT-4.1 Nano", tier: "nano",
        pricing: { input: 0.0001, output: 0.0004 }, maxTokens: 1024,
    },
    "gpt-4.1-mini": {
        provider: "openai", label: "GPT-4.1 Mini", tier: "mini",
        pricing: { input: 0.0004, output: 0.0016 }, maxTokens: 1024,
    },
    "gpt-4.1": {
        provider: "openai", label: "GPT-4.1", tier: "standard",
        pricing: { input: 0.002, output: 0.008 }, maxTokens: 2048,
    },
    "gpt-4o": {
        provider: "openai", label: "GPT-4o", tier: "standard",
        pricing: { input: 0.0025, output: 0.01 }, maxTokens: 2048,
    },
    "gpt-4o-mini": {
        provider: "openai", label: "GPT-4o Mini", tier: "mini",
        pricing: { input: 0.00015, output: 0.0006 }, maxTokens: 1024,
    },
    // Anthropic
    "claude-haiku-4": {
        provider: "anthropic", label: "Claude Haiku 4", tier: "mini",
        pricing: { input: 0.0008, output: 0.004 }, maxTokens: 1024,
    },
    "claude-sonnet-4": {
        provider: "anthropic", label: "Claude Sonnet 4", tier: "standard",
        pricing: { input: 0.003, output: 0.015 }, maxTokens: 2048,
        apiModel: "claude-sonnet-4-20250514",
    },
    // Google
    "gemini-2.5-flash": {
        provider: "google", label: "Gemini 2.5 Flash", tier: "mini",
        pricing: { input: 0.00015, output: 0.0006 }, maxTokens: 1024,
    },
    "gemini-2.5-pro": {
        provider: "google", label: "Gemini 2.5 Pro", tier: "standard",
        pricing: { input: 0.00125, output: 0.01 }, maxTokens: 2048,
    },
};

async function callLLM(
    systemPrompt: string,
    userPrompt: string,
    model: string = "gpt-4.1",
    account_id?: string
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const catalog = MODEL_CATALOG[model];
    const provider = catalog?.provider ?? "openai";

    // Use apiModel override if the catalog specifies one (e.g. versioned Anthropic names)
    const apiModel = (catalog as any)?.apiModel ?? model;

    // Resolve BYOK key for this account (if provided)
    const byokKey = account_id ? getByokKey(account_id, provider) : null;

    switch (provider) {
        case "anthropic":
            return callAnthropic(systemPrompt, userPrompt, apiModel, catalog?.maxTokens ?? 1024, byokKey, account_id);
        case "google":
            return callGoogle(systemPrompt, userPrompt, apiModel, catalog?.maxTokens ?? 1024, byokKey, account_id);
        default:
            return callOpenAI(systemPrompt, userPrompt, apiModel, catalog?.maxTokens ?? 1024, byokKey, account_id);
    }
}

async function callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
    byokKey?: string | null,
    account_id?: string
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const platformKey = process.env.OPENAI_API_KEY;
    const apiKey = byokKey ?? platformKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const doCall = async (key: string) => {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
            }),
        });
        return resp;
    };

    let resp = await doCall(apiKey);

    // If BYOK key failed with auth error, fall back to platform key
    if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
        logger.warn("BYOK OpenAI key failed, falling back to platform key", { account_id, status: resp.status });
        if (!platformKey) throw new Error("OPENAI_API_KEY not configured (BYOK fallback)");
        resp = await doCall(platformKey);
    }

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI API error ${resp.status}: ${err}`);
    }

    const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
        response: parseAgentResponse(data.choices[0]?.message?.content ?? ""),
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
    };
}

async function callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
    byokKey?: string | null,
    account_id?: string
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const platformKey = process.env.ANTHROPIC_API_KEY;
    const apiKey = byokKey ?? platformKey;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const doCall = async (key: string) => {
        return fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt + "\n\nRespond with a single JSON object. No markdown fences." }],
            }),
        });
    };

    let resp = await doCall(apiKey);

    if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
        logger.warn("BYOK Anthropic key failed, falling back to platform key", { account_id, status: resp.status });
        if (!platformKey) throw new Error("ANTHROPIC_API_KEY not configured (BYOK fallback)");
        resp = await doCall(platformKey);
    }

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${err}`);
    }

    const data = (await resp.json()) as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content.find(c => c.type === "text")?.text ?? "";
    return {
        response: parseAgentResponse(text),
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
    };
}

async function callGoogle(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number,
    byokKey?: string | null,
    account_id?: string
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const platformKey = process.env.GOOGLE_AI_API_KEY;
    const apiKey = byokKey ?? platformKey;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

    const doCall = async (key: string) => {
        return fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: userPrompt + "\n\nRespond with a single JSON object. No markdown fences." }] }],
                    generationConfig: {
                        maxOutputTokens: maxTokens,
                        responseMimeType: "application/json",
                    },
                }),
            }
        );
    };

    let resp = await doCall(apiKey);

    if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
        logger.warn("BYOK Google key failed, falling back to platform key", { account_id, status: resp.status });
        if (!platformKey) throw new Error("GOOGLE_AI_API_KEY not configured (BYOK fallback)");
        resp = await doCall(platformKey);
    }

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Google AI API error ${resp.status}: ${err}`);
    }

    const data = (await resp.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
        response: parseAgentResponse(text),
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
}

// ============================================================================
// Chat Action Execution
// ============================================================================

/**
 * Parse [[action:...]] blocks from chat response, execute them, and return clean text.
 */
async function executeChatActions(
    responseText: string,
    ctx: WatcherContext
): Promise<{ text: string; actionsExecuted: number }> {
    const actionPattern = /\[\[action:(\w+)\|([^\]]+)\]\]/g;
    const actions: Array<{ tool: string; params: Record<string, string> }> = [];

    let match;
    while ((match = actionPattern.exec(responseText)) !== null) {
        const tool = match[1]!;
        const paramStr = match[2]!;
        const params: Record<string, string> = {};
        for (const pair of paramStr.split("|")) {
            const [key, ...rest] = pair.split("=");
            if (key) params[key.trim()] = rest.join("=").trim();
        }
        actions.push({ tool, params });
    }

    // Execute actions
    let executed = 0;
    for (const action of actions) {
        try {
            const VALID_STATUSES = ["active", "watching", "ignored", "resolved", "stale"];
            if (action.tool === "update_thread" && action.params.thread_id && action.params.status) {
                if (!VALID_STATUSES.includes(action.params.status)) {
                    logger.warn("Chat action rejected: invalid status", { status: action.params.status });
                    continue;
                }
                run(
                    `UPDATE threads SET status = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ? AND watcher_id = ?`,
                    [action.params.status, action.params.thread_id, ctx.watcher.id]
                );
                // If setting summary too
                if (action.params.summary) {
                    run(`UPDATE threads SET summary = ? WHERE id = ? AND watcher_id = ?`, [action.params.summary, action.params.thread_id, ctx.watcher.id]);
                }
                executed++;
                logger.info("Chat action executed", { tool: "update_thread", threadId: action.params.thread_id, status: action.params.status });
            } else if (action.tool === "ignore_sender" && action.params.from) {
                // Find all threads from this sender pattern and ignore them
                const pattern = `%${action.params.from}%`;
                const threads = queryMany<{ id: string }>(
                    `SELECT DISTINCT t.id FROM threads t
                     JOIN emails e ON e.thread_id = t.id
                     WHERE t.watcher_id = ? AND e.from_addr LIKE ? AND t.status != 'ignored'`,
                    [ctx.watcher.id, pattern]
                );
                for (const t of threads) {
                    run(`UPDATE threads SET status = 'ignored' WHERE id = ?`, [t.id]);
                }
                executed += threads.length;
                logger.info("Chat action executed", { tool: "ignore_sender", from: action.params.from, threadsIgnored: threads.length });
            } else if (action.tool === "send_alert" && action.params.message) {
                const { executeTool } = await import("./tools");
                await executeTool("send_alert", {
                    thread_id: action.params.thread_id,
                    message: action.params.message,
                }, ctx);
                executed++;
            } else if (action.tool === "add_rule" && action.params.content) {
                // Store as high-importance memory that persists as a behavioral rule
                run(
                    `INSERT INTO memories (id, watcher_id, content, importance, created_at)
                     VALUES (?, ?, ?, 5, CURRENT_TIMESTAMP)`,
                    [crypto.randomUUID(), ctx.watcher.id, `RULE: ${action.params.content}`]
                );
                executed++;
                logger.info("Chat action: rule added", { content: action.params.content });
            } else if (action.tool === "update_prompt" && action.params.append) {
                // Append to the watcher's system prompt
                const currentPrompt = ctx.watcher.system_prompt || "";
                const newPrompt = currentPrompt.trim() + "\n\n" + action.params.append.trim();
                run(
                    `UPDATE watchers SET system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [newPrompt, ctx.watcher.id]
                );
                executed++;
                logger.info("Chat action: prompt updated", { appended: action.params.append });
            }
        } catch (err) {
            logger.error("Chat action failed", { tool: action.tool, err });
        }
    }

    // Strip action blocks from the displayed text
    const cleanText = responseText.replace(/\s*\[\[action:[^\]]+\]\]\s*/g, "").trim();

    return { text: cleanText, actionsExecuted: executed };
}

// Raw text LLM call (for chat mode — no JSON parsing)
async function callLLMRaw(
    systemPrompt: string,
    userPrompt: string,
    model: string = "gpt-4.1",
    account_id?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const catalog = MODEL_CATALOG[model];
    const provider = catalog?.provider ?? "openai";
    const apiModel = (catalog as any)?.apiModel ?? model;

    const byokKey = account_id ? getByokKey(account_id, provider as "openai" | "anthropic" | "google") : null;

    if (provider === "anthropic") {
        const platformKey = process.env.ANTHROPIC_API_KEY;
        const apiKey = byokKey ?? platformKey;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
        const doCall = (key: string) => fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
                model: apiModel, max_tokens: catalog?.maxTokens ?? 1024,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
            }),
        });
        let resp = await doCall(apiKey);
        if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
            logger.warn("BYOK Anthropic key failed in chat, falling back to platform key", { account_id, status: resp.status });
            if (!platformKey) throw new Error("ANTHROPIC_API_KEY not configured (BYOK fallback)");
            resp = await doCall(platformKey);
        }
        if (!resp.ok) throw new Error(`Anthropic error ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as any;
        return {
            text: data.content?.find((c: any) => c.type === "text")?.text ?? "",
            inputTokens: data.usage?.input_tokens ?? 0,
            outputTokens: data.usage?.output_tokens ?? 0,
        };
    } else if (provider === "google") {
        const platformKey = process.env.GOOGLE_AI_API_KEY;
        const apiKey = byokKey ?? platformKey;
        if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");
        const doCall = (key: string) => fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                    generationConfig: { maxOutputTokens: catalog?.maxTokens ?? 1024 },
                }),
            }
        );
        let resp = await doCall(apiKey);
        if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
            logger.warn("BYOK Google key failed in chat, falling back to platform key", { account_id, status: resp.status });
            if (!platformKey) throw new Error("GOOGLE_AI_API_KEY not configured (BYOK fallback)");
            resp = await doCall(platformKey);
        }
        if (!resp.ok) throw new Error(`Google AI error ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as any;
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
            inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        };
    } else {
        const platformKey = process.env.OPENAI_API_KEY;
        const apiKey = byokKey ?? platformKey;
        if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
        const doCall = (key: string) => fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({
                model, max_tokens: catalog?.maxTokens ?? 1024,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            }),
        });
        let resp = await doCall(apiKey);
        if (!resp.ok && byokKey && (resp.status === 401 || resp.status === 403)) {
            logger.warn("BYOK OpenAI key failed in chat, falling back to platform key", { account_id, status: resp.status });
            if (!platformKey) throw new Error("OPENAI_API_KEY not configured (BYOK fallback)");
            resp = await doCall(platformKey);
        }
        if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as any;
        return {
            text: data.choices?.[0]?.message?.content ?? "",
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
        };
    }
}

function parseAgentResponse(text: string): AgentResponse {
    // Strip markdown fences if model adds them (common with smaller models)
    let cleaned = text
        .replace(/^```json\s*\n?/gm, "")
        .replace(/^```\s*\n?/gm, "")
        .replace(/\n?```\s*$/gm, "")
        .trim();

    // Some models prepend commentary before the JSON. Try to extract the JSON object.
    if (cleaned && !cleaned.startsWith("{")) {
        const jsonStart = cleaned.indexOf("{");
        if (jsonStart > 0) {
            const jsonEnd = cleaned.lastIndexOf("}");
            if (jsonEnd > jsonStart) {
                logger.warn("Stripping pre-JSON text from response", {
                    stripped: cleaned.slice(0, jsonStart).trim().slice(0, 100),
                });
                cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
            }
        }
    }

    try {
        const parsed = JSON.parse(cleaned);
        return {
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            memory_append: parsed.memory_append ?? null,
            memory_obsolete: parsed.memory_obsolete ?? null,
            thread_updates: parsed.thread_updates ?? null,
            email_analysis: parsed.email_analysis ?? null,
        };
    } catch (err) {
        logger.error("Failed to parse agent response as JSON", {
            text: text.slice(0, 300),
            error: String(err),
        });
        return { actions: [], memory_append: null, memory_obsolete: null, thread_updates: null, email_analysis: null };
    }
}

// ============================================================================
// Thread Detection Helpers
// ============================================================================

interface ThreadDetectionState {
    status: "open" | "closed";
    participants: string[];
    normalized_subject: string;
    message_ids: string[];
}

function buildThreadMap(
    threads: ThreadRow[]
): ReadonlyMap<string, ThreadDetectionState> {
    const map = new Map<string, ThreadDetectionState>();
    for (const t of threads) {
        const participants = safeParseJson<string[]>(t.participants, []);
        const isOpen = t.status === "active" || t.status === "watching";
        map.set(t.id, {
            status: isOpen ? "open" : "closed",
            participants,
            normalized_subject: normalizeSubject(t.subject ?? ""),
            message_ids: [], // populated by buildEmailMessageIdMap
        });
    }
    return map;
}

function buildEmailMessageIdMap(watcherId: string): ReadonlyMap<string, string> {
    const rows = queryMany<{ message_id: string; thread_id: string }>(
        `SELECT message_id, thread_id FROM emails
         WHERE watcher_id = ? AND thread_id IS NOT NULL AND message_id IS NOT NULL`,
        [watcherId]
    );
    const map = new Map<string, string>();
    for (const row of rows) {
        map.set(row.message_id, row.thread_id);
    }
    return map;
}

// ============================================================================
// Logging
// ============================================================================

async function logAction(
    watcherId: string,
    threadId: string | null,
    emailId: string | null,
    triggerType: string,
    decision: string | null,
    tool: string | null,
    toolParams: string | null,
    reasoning: string | null,
    result: string,
    error: string | null,
    startMs: number,
    memoryDelta?: string | null,
    inputTokens?: number,
    outputTokens?: number,
    costUsd?: number,
    modelUsed?: string | null
): Promise<void> {
    run(
        `INSERT INTO actions
         (id, watcher_id, thread_id, trigger_type, email_id, decision, tool, tool_params, reasoning, model, result, error, memory_delta, context_tokens, input_tokens, output_tokens, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            crypto.randomUUID(),
            watcherId,
            threadId,
            triggerType,
            emailId,
            decision,
            tool,
            toolParams,
            reasoning ?? null,
            modelUsed ?? null,
            result,
            error,
            memoryDelta ?? null,
            (inputTokens ?? 0) + (outputTokens ?? 0),  // backward compat context_tokens
            inputTokens ?? null,
            outputTokens ?? null,
            costUsd ?? null,
            Date.now() - startMs,
        ]
    );
}

// ============================================================================
// Helpers
// ============================================================================

async function hashBody(body: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

// ============================================================================
// Skills Helpers
// ============================================================================

/** Convert a skill name to a slug usable as part of a tool name */
function slugifyName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

interface SkillRowMin {
    id: string;
    provider: string;
    name: string;
    config_enc: string | null;
}

/** Build the SkillToolDescriptor list for the system prompt */
async function buildSkillTools(rows: SkillRowMin[]): Promise<import("./prompts").SkillToolDescriptor[]> {
    return rows.map(row => {
        const catalogEntry = SKILL_CATALOG.find(e => e.provider === row.provider);
        const description = catalogEntry
            ? `${catalogEntry.name} — ${catalogEntry.description} (skill: "${row.name}")`
            : `${row.provider} skill "${row.name}"`;
        return {
            tool_name: `skill_${row.provider}_${slugifyName(row.name)}`,
            provider: row.provider,
            skill_name: row.name,
            description,
        };
    });
}

/** Execute a skill tool call from the agent */
async function executeSkillTool(
    skill: SkillRowMin,
    params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; cost?: number }> {
    if (!skill.config_enc) {
        return { success: false, error: `Skill "${skill.name}" has no config — credentials not set` };
    }

    let config: unknown;
    try {
        config = JSON.parse(decrypt(skill.config_enc));
    } catch (err) {
        return { success: false, error: `Failed to decrypt skill config: ${String(err)}` };
    }

    try {
        const result = await executeSkill(skill.provider, config, params);
        // Increment execution_count and update last_executed_at
        run(
            `UPDATE skills SET execution_count = execution_count + 1, last_executed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [skill.id]
        );
        return { success: result.ok, error: result.ok ? undefined : result.message };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}
