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
    buildUserQueryPrompt,
} from "./prompts";
import {
    retrieveMemories,
    storeMemories,
    formatMemoriesForContext,
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
): Promise<void> {
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
        return;
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
            ? { from: trigger.email.from, subject: trigger.email.subject, body: trigger.email.body }
            : undefined;
    const memories = retrieveMemories(watcherId, emailContext);
    const memoryContext = formatMemoriesForContext(memories);

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
                email.from,
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
                from: email.from,
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
            const participants = JSON.stringify([email.from]);
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
                from: email.from,
                to: email.to,
                subject: email.subject,
                body: email.body,
                receivedAt: email.receivedAt,
            },
            threadHistory
        );
    }

    // 5. Build prompt
    const systemPrompt = buildSystemPrompt(watcher, memoryContext, activeThreads);
    const userPrompt =
        trigger.type === "email_received"
            ? emailTriggerContext
            : trigger.type === "scheduled_tick"
              ? buildTickTriggerPrompt(
                    trigger.timestamp,
                    activeThreads,
                    watcher.silence_hours
                )
              : buildUserQueryPrompt(trigger.query);

    // 6. Call Claude API
    let agentResponse: AgentResponse;
    let contextTokens = 0;
    let costUsd = 0;

    try {
        const result = await callClaude(systemPrompt, userPrompt);
        agentResponse = result.response;
        contextTokens = result.inputTokens + result.outputTokens;
        // Claude Haiku: ~$0.00025/1K input + $0.00125/1K output
        costUsd =
            (result.inputTokens / 1000) * 0.00025 +
            (result.outputTokens / 1000) * 0.00125;
    } catch (err) {
        logger.error("LLM call failed", { watcherId, err });
        await logAction(watcherId, threadId, emailId, trigger.type, null, null, null, "failed", String(err), startMs);
        return;
    }

    // 7. Execute tools
    const toolResults: Array<{ tool: string; result: any }> = [];
    for (const action of agentResponse.actions ?? []) {
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
        storeMemories(watcherId, agentResponse.memory_append);
    }

    // Update last_tick_at for scheduled ticks
    if (trigger.type === "scheduled_tick") {
        run(`UPDATE watchers SET last_tick_at = CURRENT_TIMESTAMP WHERE id = ?`, [watcherId]);
    }

    // 8. Log invocation
    const firstAction = agentResponse.actions?.[0];
    await logAction(
        watcherId,
        threadId,
        emailId,
        trigger.type,
        agentResponse.email_analysis
            ? JSON.stringify(agentResponse.email_analysis)
            : null,
        firstAction?.tool ?? null,
        firstAction ? JSON.stringify(firstAction.params) : null,
        toolResults.every((r) => r.result.success) ? "success" : "failed",
        null,
        startMs,
        agentResponse.memory_append,
        contextTokens,
        costUsd
    );

    logger.info("Agent invocation complete", {
        watcherId,
        trigger: trigger.type,
        actions: agentResponse.actions?.length ?? 0,
        durationMs: Date.now() - startMs,
    });
}

// ============================================================================
// Claude API
// ============================================================================

async function callClaude(
    systemPrompt: string,
    userPrompt: string
): Promise<{ response: AgentResponse; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const model = process.env.VIGIL_MODEL ?? "claude-haiku-4-5-20251001";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
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

    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const response = parseAgentResponse(text);

    return {
        response,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
    };
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
            thread_updates: parsed.thread_updates ?? null,
            email_analysis: parsed.email_analysis ?? null,
        };
    } catch (err) {
        logger.warn("Failed to parse agent response as JSON", { text: text.slice(0, 200) });
        return { actions: [], memory_append: null, thread_updates: null, email_analysis: null };
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
    result: string,
    error: string | null,
    startMs: number,
    memoryDelta?: string | null,
    contextTokens?: number,
    costUsd?: number
): Promise<void> {
    run(
        `INSERT INTO actions
         (id, watcher_id, thread_id, trigger_type, email_id, decision, tool, tool_params, result, error, memory_delta, context_tokens, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            crypto.randomUUID(),
            watcherId,
            threadId,
            triggerType,
            emailId,
            decision,
            tool,
            toolParams,
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
