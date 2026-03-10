/**
 * Tool Registry — V2
 *
 * Built-in tools: send_alert, update_thread, ignore_thread, webhook
 * Each tool has a handler that executes when the agent calls it.
 */

import { run, queryOne } from "../db/client";
import { logger } from "../logger";
import type { ToolResult, WatcherContext } from "./schema";
import { generateThreadActionToken } from "../api/handlers/thread-actions";

// ============================================================================
// Types
// ============================================================================

export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, string>; // simplified schema for prompt
    handler: (params: any, ctx: WatcherContext) => Promise<ToolResult>;
}

// ============================================================================
// Handlers
// ============================================================================

async function sendAlertHandler(
    params: { subject?: string; body?: string; message?: string; urgency?: string; thread_id?: string },
    ctx: WatcherContext
): Promise<ToolResult> {
    // Be flexible: accept {subject, body} or just {message}
    const alertBody = params.body ?? params.message ?? "";
    const urgency = params.urgency ?? "normal";

    if (!alertBody) {
        logger.warn("send_alert: no body or message provided", { rawParams: JSON.stringify(params) });
        return { success: false, error: "send_alert requires body or message" };
    }

    // Alert budget: max 5 alerts per watcher per 24h
    const recentAlerts = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM actions
         WHERE watcher_id = ? AND tool = 'send_alert' AND result = 'success'
         AND created_at >= datetime('now', '-24 hours')`,
        [ctx.watcher.id]
    );
    if ((recentAlerts?.count || 0) >= 5) {
        logger.info("Alert budget exceeded, suppressing", { watcherId: ctx.watcher.id, count: recentAlerts?.count });
        return { success: true, message: "Alert suppressed — daily budget of 5 alerts reached. Will include in next digest." };
    }

    // Look up thread context for the email reference
    let threadSubject: string | null = null;
    let threadFrom: string | null = null;
    let threadEmailCount = 0;
    if (params.thread_id) {
        const thread = queryOne<{ subject: string; email_count: number; participants: string }>(
            `SELECT subject, email_count, participants FROM threads WHERE id = ?`,
            [params.thread_id]
        );
        if (thread) {
            threadSubject = thread.subject;
            threadEmailCount = thread.email_count;
            try {
                const participants = JSON.parse(thread.participants);
                threadFrom = participants[0] ?? null;
            } catch {}
        }
    }

    // Build a clean, readable subject line
    // Priority: explicit subject > thread subject > truncated body
    let emailSubject: string;
    if (params.subject && params.subject !== alertBody.substring(0, 77)) {
        emailSubject = params.subject;
    } else if (threadSubject) {
        // Reference the original thread
        const urgencyPrefix = urgency === "high" ? "⚠️ " : "";
        emailSubject = `${urgencyPrefix}Re: ${threadSubject}`;
    } else {
        // Derive a clean subject from the body (first sentence or first 60 chars)
        const firstSentence = (alertBody.split(/[.!?\n]/)[0] ?? "").trim();
        emailSubject = firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn("RESEND_API_KEY not configured — skipping alert send");
        return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "alerts@vigil.run";
    const from = rawFrom.includes("<") ? rawFrom : `Vigil <${rawFrom}>`;

    const channels = ctx.channels.filter((c) => c.type === "email" && Boolean(c.enabled));
    const destinations = [...new Set([ctx.accountEmail, ...channels.map((c) => c.destination)])].filter(Boolean);

    if (destinations.length === 0) {
        return { success: false, error: "No alert destinations configured" };
    }

    let allSucceeded = true;
    for (const destination of destinations) {
        try {
            const resp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    from,
                    to: [destination],
                    subject: emailSubject,
                    html: buildAlertHtml(alertBody, urgency, ctx.watcher.name, threadSubject, threadFrom, threadEmailCount, params.thread_id),
                }),
            });

            if (!resp.ok) {
                const err = await resp.text();
                logger.error("Resend error", { status: resp.status, err, destination, from });
                allSucceeded = false;
            } else {
                const resendResp = await resp.json() as { id: string };
                logger.info("Alert sent", { destination, subject: emailSubject, resendId: resendResp.id, from });
            }
        } catch (err) {
            logger.error("Alert send failed", { err, destination });
            allSucceeded = false;
        }
    }

    // Webhook channels
    const webhookChannels = ctx.channels.filter((c) => c.type === "webhook" && Boolean(c.enabled));
    for (const channel of webhookChannels) {
        await webhookHandler(
            { url: channel.destination, payload: { event: "send_alert", subject: emailSubject, body: alertBody, urgency, watcher: ctx.watcher.name, thread_subject: threadSubject } },
            ctx
        );
    }

    return {
        success: allSucceeded,
        message: allSucceeded ? `Alert sent to ${destinations.length} recipient(s)` : "Some alert deliveries failed",
    };
}

async function updateThreadHandler(
    params: {
        thread_id: string;
        status?: string;
        summary?: string;
        flags?: Record<string, any>;
    },
    _ctx: WatcherContext
): Promise<ToolResult> {
    const { thread_id, status, summary, flags } = params;

    if (!thread_id) {
        return { success: false, error: "update_thread requires thread_id" };
    }

    const updates: string[] = [];
    const vals: any[] = [];

    if (status) {
        updates.push("status = ?");
        vals.push(status);
    }
    if (summary !== undefined) {
        updates.push("summary = ?");
        vals.push(summary);
    }
    if (flags !== undefined) {
        updates.push("flags = ?");
        vals.push(JSON.stringify(flags));
    }

    if (updates.length === 0) {
        return { success: false, error: "Nothing to update" };
    }

    // Verify thread exists
    const thread = queryOne<{ id: string }>(`SELECT id FROM threads WHERE id = ?`, [thread_id]);
    if (!thread) {
        logger.warn("update_thread: thread not found", { thread_id });
        return { success: false, error: `Thread ${thread_id} not found` };
    }

    updates.push("last_activity = CURRENT_TIMESTAMP");
    vals.push(thread_id);

    run(
        `UPDATE threads SET ${updates.join(", ")} WHERE id = ?`,
        vals
    );

    logger.debug("Thread updated via tool", { thread_id, status, summary });
    return { success: true, message: `Thread ${thread_id} updated` };
}

async function ignoreThreadHandler(
    params: { thread_id: string; reason?: string },
    _ctx: WatcherContext
): Promise<ToolResult> {
    const { thread_id, reason } = params;

    if (!thread_id) {
        return { success: false, error: "ignore_thread requires thread_id" };
    }

    // Verify thread exists
    const thread = queryOne<{ id: string }>(`SELECT id FROM threads WHERE id = ?`, [thread_id]);
    if (!thread) {
        logger.warn("ignore_thread: thread not found", { thread_id });
        return { success: false, error: `Thread ${thread_id} not found` };
    }

    run(
        `UPDATE threads SET status = 'ignored', summary = ? WHERE id = ?`,
        [reason ? `Ignored: ${reason}` : "Ignored by agent", thread_id]
    );

    logger.debug("Thread ignored", { thread_id, reason });
    return { success: true, message: `Thread ${thread_id} marked as ignored` };
}

async function webhookHandler(
    params: { url: string; payload: Record<string, any> },
    ctx: WatcherContext
): Promise<ToolResult> {
    const { url, payload } = params;

    if (!url) {
        return { success: false, error: "webhook requires url" };
    }

    const body = JSON.stringify({
        ...payload,
        watcher_id: ctx.watcher.id,
        watcher_name: ctx.watcher.name,
        timestamp: Date.now(),
    });

    const signature = await signPayload(body);

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Vigil-Signature": signature,
                "X-Vigil-Watcher": ctx.watcher.id,
            },
            body,
        });

        if (!resp.ok) {
            logger.error("Webhook failed", { url, status: resp.status });
            return { success: false, error: `Webhook returned ${resp.status}` };
        }

        return { success: true, message: "Webhook delivered" };
    } catch (err) {
        logger.error("Webhook error", { url, err });
        return { success: false, error: String(err) };
    }
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Alias handler: watching_thread → update_thread with status "watching"
 * Models sometimes hallucinate this tool name instead of using update_thread.
 */
async function watchingThreadHandler(
    params: { thread_id: string; reason?: string; summary?: string },
    ctx: WatcherContext
): Promise<ToolResult> {
    return updateThreadHandler(
        { thread_id: params.thread_id, status: "watching", summary: params.summary ?? params.reason },
        ctx
    );
}

/**
 * Alias handler: resolve_thread → update_thread with status "resolved"
 */
async function resolveThreadHandler(
    params: { thread_id: string; reason?: string; summary?: string },
    ctx: WatcherContext
): Promise<ToolResult> {
    return updateThreadHandler(
        { thread_id: params.thread_id, status: "resolved", summary: params.summary ?? params.reason },
        ctx
    );
}

export const BUILTIN_TOOLS: Tool[] = [
    {
        name: "send_alert",
        description:
            "Send an alert email to the watcher owner. Always include thread_id so the alert references the original email.",
        parameters: {
            thread_id: "string (REQUIRED) — the thread id from the email being processed",
            message: "string (REQUIRED) — concise explanation of what needs attention and what action to take",
            urgency: "low|normal|high — defaults to normal",
        },
        handler: sendAlertHandler,
    },
    {
        name: "update_thread",
        description:
            "Update thread status or summary. active = tracked with silence alerts, watching = tracked without silence alerts, resolved = closed/handled, ignored = closed/noise.",
        parameters: {
            thread_id: "string — thread id",
            status: "active|watching|resolved|ignored — new status (optional)",
            summary: "string — updated one-line summary (optional)",
            flags: "object — arbitrary key/value flags (optional)",
        },
        handler: updateThreadHandler,
    },
    {
        name: "ignore_thread",
        description:
            "Mark a thread as not worth watching (noise, spam, irrelevant).",
        parameters: {
            thread_id: "string — thread id",
            reason: "string — why this thread is being ignored (optional)",
        },
        handler: ignoreThreadHandler,
    },
    {
        name: "webhook",
        description: "Send data to a configured webhook URL.",
        parameters: {
            url: "string — destination URL",
            payload: "object — data to send",
        },
        handler: webhookHandler,
    },
];

// Alias tools — not in BUILTIN_TOOLS (so they don't show in UI) but registered in TOOL_MAP
const ALIAS_TOOLS: Tool[] = [
    { name: "watching_thread", description: "Alias for update_thread with status watching", parameters: { thread_id: "string" }, handler: watchingThreadHandler },
    { name: "resolve_thread", description: "Alias for update_thread with status resolved", parameters: { thread_id: "string" }, handler: resolveThreadHandler },
    { name: "watch_thread", description: "Alias for update_thread with status watching", parameters: { thread_id: "string" }, handler: watchingThreadHandler },
];

export const TOOL_MAP = new Map([...BUILTIN_TOOLS, ...ALIAS_TOOLS].map((t) => [t.name, t]));

export function getAvailableTools(enabledNames: string[]): Tool[] {
    return enabledNames
        .map((name) => TOOL_MAP.get(name))
        .filter(Boolean) as Tool[];
}

export async function executeTool(
    toolName: string,
    params: Record<string, any>,
    ctx: WatcherContext
): Promise<ToolResult> {
    const tool = TOOL_MAP.get(toolName);
    if (!tool) {
        logger.warn("Unknown tool called", { toolName });
        return { success: false, error: `Unknown tool: ${toolName}` };
    }

    try {
        return await tool.handler(params, ctx);
    } catch (err) {
        logger.error("Tool execution error", { toolName, err });
        return { success: false, error: String(err) };
    }
}

// ============================================================================
// Helpers
// ============================================================================

function buildAlertHtml(
    body: string,
    urgency: string,
    watcherName: string,
    threadSubject: string | null,
    threadFrom: string | null,
    threadEmailCount: number,
    threadId: string | null = null
): string {
    const urgencyConfig: Record<string, { color: string; bg: string; label: string; icon: string }> = {
        high: { color: "#dc2626", bg: "#fef2f2", label: "Urgent", icon: "⚠️" },
        normal: { color: "#2563eb", bg: "#eff6ff", label: "Info", icon: "📬" },
        low: { color: "#6b7280", bg: "#f9fafb", label: "FYI", icon: "📋" },
    };
    const u = urgencyConfig[urgency] ?? urgencyConfig["normal"]!;

    const bodyHtml = body
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#1f2937;">${escapeHtml(line)}</p>`)
        .join("");

    // Action links (signed, one-click from email)
    const apiUrl = process.env.API_URL ?? "https://api.vigil.run";
    let actionLinks = "";
    if (threadId) {
        const handledToken = generateThreadActionToken(threadId, "handled");
        const snoozeToken = generateThreadActionToken(threadId, "snooze");
        const watchingToken = generateThreadActionToken(threadId, "watching");
        actionLinks = `<div style="padding:16px 24px;border-top:1px solid #f1f5f9;text-align:center;">
            <a href="${apiUrl}/api/threads/${handledToken}/action" style="display:inline-block;padding:6px 16px;margin:0 4px;background:#059669;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">✓ Handled</a>
            <a href="${apiUrl}/api/threads/${snoozeToken}/action" style="display:inline-block;padding:6px 16px;margin:0 4px;background:#d97706;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">⏰ Snooze 24h</a>
            <a href="${apiUrl}/api/threads/${watchingToken}/action" style="display:inline-block;padding:6px 16px;margin:0 4px;background:#6b7280;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">👁 Watch Only</a>
        </div>`;
    }

    // Thread reference section
    const threadRef = threadSubject
        ? `<div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Original Thread</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${escapeHtml(threadSubject)}</p>
            ${threadFrom ? `<p style="margin:2px 0 0;font-size:13px;color:#64748b;">From: ${escapeHtml(threadFrom)}${threadEmailCount > 1 ? ` · ${threadEmailCount} emails in thread` : ""}</p>` : ""}
          </div>`
        : "";

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;background:#f1f5f9;color:#111827;">
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Urgency bar -->
    <div style="height:4px;background:${u.color};"></div>

    <!-- Header -->
    <div style="padding:20px 24px 16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:16px;">${u.icon}</span>
        <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${u.color};background:${u.bg};padding:3px 8px;border-radius:4px;">${u.label}</span>
        <span style="font-size:12px;color:#94a3b8;margin-left:auto;">${escapeHtml(watcherName)}</span>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:0 24px 20px;">
      ${threadRef}
      ${bodyHtml}
    </div>

    <!-- Actions -->
    ${actionLinks}

    <!-- Footer -->
    <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
      <span style="font-size:11px;color:#94a3b8;">Vigil · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function signPayload(payload: string): Promise<string> {
    const secret =
        process.env.WEBHOOK_SIGNING_SECRET ?? "vigil-webhook-secret";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload)
    );
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
