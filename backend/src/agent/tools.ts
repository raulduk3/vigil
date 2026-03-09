/**
 * Tool Registry — V2
 *
 * Built-in tools: send_alert, update_thread, ignore_thread, webhook
 * Each tool has a handler that executes when the agent calls it.
 */

import { run } from "../db/client";
import { logger } from "../logger";
import type { ToolResult, WatcherContext } from "./schema";

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
    params: { subject?: string; body?: string; message?: string; urgency?: string },
    ctx: WatcherContext
): Promise<ToolResult> {
    // Be flexible: accept {subject, body} or just {message}
    const body = params.body ?? params.message ?? "";
    const subject = params.subject || (body.length > 80 ? body.substring(0, 77) + "..." : body) || "Alert";
    const urgency = params.urgency ?? "normal";

    if (!body) {
        logger.warn("send_alert: no body or message provided", { rawParams: JSON.stringify(params) });
        return { success: false, error: "send_alert requires body or message" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn("RESEND_API_KEY not configured — skipping alert send");
        return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "alerts@vigil.run";
    const from = rawFrom.includes("<") ? rawFrom : `Vigil <${rawFrom}>`;

    // Get email channels from watcher channels
    const channels = ctx.channels.filter(
        (c) => c.type === "email" && Boolean(c.enabled)
    );

    // Always also send to account owner email
    const destinations = [
        ...new Set([
            ctx.accountEmail,
            ...channels.map((c) => c.destination),
        ]),
    ].filter(Boolean);

    logger.info("send_alert destinations", { destinations, accountEmail: ctx.accountEmail, channelCount: channels.length, from });

    if (destinations.length === 0) {
        return { success: false, error: "No alert destinations configured" };
    }

    let allSucceeded = true;
    for (const destination of destinations) {
        try {
            const resp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    from,
                    to: [destination],
                    subject: `[Vigil: ${ctx.watcher.name}] ${subject}`,
                    html: buildAlertHtml(subject, body, urgency, ctx.watcher.name),
                }),
            });

            if (!resp.ok) {
                const err = await resp.text();
                logger.error("Resend error", { status: resp.status, err, destination, from });
                allSucceeded = false;
            } else {
                const resendResp = await resp.json() as { id: string };
                logger.info("Alert sent", { destination, subject, resendId: resendResp.id, from });
            }
        } catch (err) {
            logger.error("Alert send failed", { err, destination });
            allSucceeded = false;
        }
    }

    // Send to webhook channels too
    const webhookChannels = ctx.channels.filter(
        (c) => c.type === "webhook" && Boolean(c.enabled)
    );
    for (const channel of webhookChannels) {
        await webhookHandler(
            {
                url: channel.destination,
                payload: { event: "send_alert", subject, body, urgency, watcher: ctx.watcher.name },
            },
            ctx
        );
    }

    return {
        success: allSucceeded,
        message: allSucceeded
            ? `Alert sent to ${destinations.length} recipient(s)`
            : "Some alert deliveries failed",
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

export const BUILTIN_TOOLS: Tool[] = [
    {
        name: "send_alert",
        description:
            "Send an alert email to the watcher owner. Use when something needs attention.",
        parameters: {
            subject: "string — alert subject line",
            body: "string — alert body (plain text or markdown)",
            urgency: "low|normal|high — defaults to normal",
        },
        handler: sendAlertHandler,
    },
    {
        name: "update_thread",
        description:
            "Update thread status or summary. Use to track conversation state.",
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

export const TOOL_MAP = new Map(BUILTIN_TOOLS.map((t) => [t.name, t]));

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
    subject: string,
    body: string,
    urgency: string,
    watcherName: string
): string {
    const urgencyColor =
        urgency === "high" ? "#dc2626" : urgency === "low" ? "#6b7280" : "#2563eb";
    const bodyHtml = body
        .split("\n")
        .map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`)
        .join("");

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #111827;">
  <div style="background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="padding: 20px 24px; border-bottom: 3px solid ${urgencyColor}; background: #fafafa;">
      <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">
        Vigil Agent — ${escapeHtml(watcherName)}
      </p>
      <h1 style="margin: 8px 0 0; font-size: 18px; font-weight: 600; color: #111827;">
        ${escapeHtml(subject)}
      </h1>
    </div>
    <div style="padding: 24px; font-size: 14px; line-height: 1.6; color: #374151;">
      ${bodyHtml}
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      Sent by your Vigil agent. Urgency: ${urgency}.
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
