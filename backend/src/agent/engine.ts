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
             (id, watcher_id, message_id, from_addr, to_addr, subject, received_at, body_hash, processed, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)`,
            [
                emailId,
                watcherId,
                email.messageId,
                effectiveFrom,
                email.to,
                email.subject,
                new Date(email.receivedAt).toISOString(),
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
        const model = watcher.model || process.env.VIGIL_MODEL || "gpt-4.1-mini";

        try {
            const result = await callLLMRaw(chatSystem, chatUser, model);
            const rates = MODEL_CATALOG[model]?.pricing ?? { input: 0.0004, output: 0.0016 };
            const PLATFORM_FEE = 0.001;
            const tokenCost = (result.inputTokens / 1000) * rates.input + (result.outputTokens / 1000) * rates.output;
            const totalCost = tokenCost + PLATFORM_FEE;

            // Parse and execute inline action blocks
            const { text: cleanText, actionsExecuted } = await executeChatActions(result.text, ctx);

            // Log the chat invocation cost
            await logAction(
                watcherId, null, null, "user_chat",
                null, "chat", null, null,
                "success", null, startMs,
                null, result.inputTokens + result.outputTokens, totalCost, model
            );

            logger.info("Chat invocation complete", {
                watcherId, model,
                tokens: result.inputTokens + result.outputTokens,
                cost: totalCost, actionsExecuted,
            });

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
    const systemPrompt = buildSystemPrompt(watcher, memoryContext, activeThreads);
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
    let contextTokens = 0;
    let costUsd = 0;

    // Use watcher's configured model (fallback to env var, then default)
    const model = watcher.model || process.env.VIGIL_MODEL || "gpt-4.1-mini";

    try {
        const result = await callLLM(systemPrompt, userPrompt, model);
        agentResponse = result.response;
        contextTokens = result.inputTokens + result.outputTokens;
        // Pricing: marked-up token cost + platform fee per invocation
        const rates = MODEL_CATALOG[model]?.pricing ?? { input: 0.0004, output: 0.0016 };
        const PLATFORM_FEE_PER_INVOCATION = 0.001; // $0.001 per agent invocation
        costUsd =
            (result.inputTokens / 1000) * rates.input +
            (result.outputTokens / 1000) * rates.output +
            PLATFORM_FEE_PER_INVOCATION;
    } catch (err) {
        logger.error("LLM call failed", { watcherId, err, model });
        await logAction(watcherId, threadId, emailId, trigger.type, null, null, null, null, "failed", String(err), startMs);
        return null;
    }

    // 7. Execute tools
    const toolResults: Array<{ tool: string; result: any }> = [];
    for (const action of agentResponse.actions ?? []) {
        // Inject thread context into send_alert if the agent didn't provide it
        if (action.tool === "send_alert" && !action.params.thread_id && threadId) {
            action.params.thread_id = threadId;
        }
        const result = await executeTool(action.tool, action.params, ctx);
        toolResults.push({ tool: action.tool, result });
        logger.info("Tool executed", {
            tool: action.tool,
            success: result.success,
            reasoning: action.reasoning,
        });
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
            null, i === 0 ? contextTokens : 0, actionCost > 0 ? actionCost : null,
            i === 0 ? model : null
        );
    }

    // Log memory operations as actions so they're visible in activity
    if (agentResponse.memory_append && Array.isArray(agentResponse.memory_append)) {
        for (const mem of agentResponse.memory_append) {
            if (!mem.content?.trim()) continue;
            await logAction(
                watcherId, threadId, emailId, trigger.type,
                null, "memory_store",
                JSON.stringify({ content: mem.content, importance: mem.importance ?? 3, confidence: mem.confidence ?? 5 }),
                null, "success", null, startMs
            );
        }
    }

    if (agentResponse.memory_obsolete?.length) {
        await logAction(
            watcherId, threadId, emailId, trigger.type,
            null, "memory_obsolete",
            JSON.stringify({ ids: agentResponse.memory_obsolete }),
            null, "success", null, startMs
        );
    }

    // Log thread updates as actions
    for (const update of agentResponse.thread_updates ?? []) {
        await logAction(
            watcherId, threadId, emailId, trigger.type,
            null, "thread_update",
            JSON.stringify(update),
            null, "success", null, startMs
        );
    }

    // If no tool actions at all, log the invocation itself
    if (toolResults.length === 0 && !(agentResponse.memory_append && Array.isArray(agentResponse.memory_append) && agentResponse.memory_append.length > 0)) {
        await logAction(
            watcherId, threadId, emailId, trigger.type,
            agentResponse.email_analysis ? JSON.stringify(agentResponse.email_analysis) : null,
            null, null, null,
            "success", null, startMs,
            null, contextTokens, costUsd, model
        );
    }

    logger.info("Agent invocation complete", {
        watcherId,
        trigger: trigger.type,
        actions: agentResponse.actions?.length ?? 0,
        durationMs: Date.now() - startMs,
    });

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
    // Pricing: 20% markup on base provider costs + $0.001 platform fee per invocation
    "gpt-4.1-nano": {
        provider: "openai", label: "GPT-4.1 Nano", tier: "nano",
        pricing: { input: 0.00012, output: 0.00048 }, maxTokens: 1024,
    },
    "gpt-4.1-mini": {
        provider: "openai", label: "GPT-4.1 Mini", tier: "mini",
        pricing: { input: 0.00048, output: 0.00192 }, maxTokens: 1024,
    },
    "gpt-4.1": {
        provider: "openai", label: "GPT-4.1", tier: "standard",
        pricing: { input: 0.0024, output: 0.0096 }, maxTokens: 2048,
    },
    "gpt-4o": {
        provider: "openai", label: "GPT-4o", tier: "standard",
        pricing: { input: 0.003, output: 0.012 }, maxTokens: 2048,
    },
    "gpt-4o-mini": {
        provider: "openai", label: "GPT-4o Mini", tier: "mini",
        pricing: { input: 0.00018, output: 0.00072 }, maxTokens: 1024,
    },
    // Anthropic
    "claude-haiku-4": {
        provider: "anthropic", label: "Claude Haiku 4", tier: "mini",
        pricing: { input: 0.00096, output: 0.0048 }, maxTokens: 1024,
    },
    "claude-sonnet-4": {
        provider: "anthropic", label: "Claude Sonnet 4", tier: "standard",
        pricing: { input: 0.0036, output: 0.018 }, maxTokens: 2048,
    },
    // Google
    "gemini-2.5-flash": {
        provider: "google", label: "Gemini 2.5 Flash", tier: "mini",
        pricing: { input: 0.00018, output: 0.00072 }, maxTokens: 1024,
    },
    "gemini-2.5-pro": {
        provider: "google", label: "Gemini 2.5 Pro", tier: "standard",
        pricing: { input: 0.0015, output: 0.012 }, maxTokens: 2048,
    },
};

async function callLLM(
    systemPrompt: string,
    userPrompt: string,
    model: string = "gpt-4.1-mini"
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const catalog = MODEL_CATALOG[model];
    const provider = catalog?.provider ?? "openai";

    switch (provider) {
        case "anthropic":
            return callAnthropic(systemPrompt, userPrompt, model, catalog?.maxTokens ?? 1024);
        case "google":
            return callGoogle(systemPrompt, userPrompt, model, catalog?.maxTokens ?? 1024);
        default:
            return callOpenAI(systemPrompt, userPrompt, model, catalog?.maxTokens ?? 1024);
    }
}

async function callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
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
    maxTokens: number
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
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
    maxTokens: number
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

    const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
            if (action.tool === "update_thread" && action.params.thread_id && action.params.status) {
                run(
                    `UPDATE threads SET status = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ? AND watcher_id = ?`,
                    [action.params.status, action.params.thread_id, ctx.watcher.id]
                );
                // If setting summary too
                if (action.params.summary) {
                    run(`UPDATE threads SET summary = ? WHERE id = ?`, [action.params.summary, action.params.thread_id]);
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
    model: string = "gpt-4.1-mini"
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const catalog = MODEL_CATALOG[model];
    const provider = catalog?.provider ?? "openai";

    if (provider === "anthropic") {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
                model, max_tokens: catalog?.maxTokens ?? 1024,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
            }),
        });
        if (!resp.ok) throw new Error(`Anthropic error ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as any;
        return {
            text: data.content?.find((c: any) => c.type === "text")?.text ?? "",
            inputTokens: data.usage?.input_tokens ?? 0,
            outputTokens: data.usage?.output_tokens ?? 0,
        };
    } else if (provider === "google") {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
        if (!resp.ok) throw new Error(`Google AI error ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as any;
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
            inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        };
    } else {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
                model, max_tokens: catalog?.maxTokens ?? 1024,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            }),
        });
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
    // Strip markdown fences if model adds them
    const cleaned = text
        .replace(/^```json\s*/m, "")
        .replace(/^```\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        return {
            actions: parsed.actions ?? [],
            memory_append: parsed.memory_append ?? null,
            memory_obsolete: parsed.memory_obsolete ?? null,
            thread_updates: parsed.thread_updates ?? null,
            email_analysis: parsed.email_analysis ?? null,
        };
    } catch (err) {
        logger.warn("Failed to parse agent response as JSON", { text: text.slice(0, 200) });
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
    contextTokens?: number,
    costUsd?: number,
    modelUsed?: string | null
): Promise<void> {
    run(
        `INSERT INTO actions
         (id, watcher_id, thread_id, trigger_type, email_id, decision, tool, tool_params, reasoning, model, result, error, memory_delta, context_tokens, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
            contextTokens ?? null,
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
