/**
 * Public Thread Actions — No Auth Required
 *
 * Handles one-click actions from alert emails (mark as handled, snooze, etc.)
 * Uses HMAC-signed tokens to verify the link is legitimate.
 */

import type { Context } from "hono";
import { queryOne, run } from "../../db/client";
import { logger } from "../../logger";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "vigil-dev-secret";

// ============================================================================
// Token Generation (called when building alert emails)
// ============================================================================

export function generateThreadActionToken(threadId: string, action: string): string {
    const payload = `${threadId}:${action}:${Math.floor(Date.now() / 1000)}`;
    const hmac = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex").substring(0, 16);
    // Base64url encode: threadId:action:timestamp:hmac
    return Buffer.from(`${payload}:${hmac}`).toString("base64url");
}

export function verifyThreadActionToken(token: string): { threadId: string; action: string; timestamp: number } | null {
    try {
        const decoded = Buffer.from(token, "base64url").toString("utf-8");
        const parts = decoded.split(":");
        if (parts.length < 4) return null;

        const threadId = parts[0]!;
        const action = parts[1]!;
        const timestamp = parseInt(parts[2]!, 10);
        const hmac = parts[3]!;

        // Verify HMAC
        const payload = `${threadId}:${action}:${timestamp}`;
        const expected = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex").substring(0, 16);
        if (hmac !== expected) return null;

        // Tokens expire after 7 days
        const age = Math.floor(Date.now() / 1000) - timestamp;
        if (age > 7 * 86400) return null;

        return { threadId, action, timestamp };
    } catch {
        return null;
    }
}

// ============================================================================
// Handler
// ============================================================================

export const threadActionHandlers = {
    async handleAction(c: Context) {
        const token = c.req.param("token");
        const verified = verifyThreadActionToken(token);

        if (!verified) {
            return c.html(renderPage("Link Expired", "This action link has expired or is invalid. You can manage this thread from your Vigil dashboard.", "error"));
        }

        const { threadId, action } = verified;

        const thread = queryOne<{ id: string; subject: string; status: string }>(
            `SELECT id, subject, status FROM threads WHERE id = ?`,
            [threadId]
        );

        if (!thread) {
            return c.html(renderPage("Thread Not Found", "This thread no longer exists.", "error"));
        }

        if (action === "handled") {
            run(`UPDATE threads SET status = 'resolved', summary = COALESCE(summary, '') || ' [Marked as handled via email]' WHERE id = ?`, [threadId]);
            logger.info("Thread marked as handled via email link", { threadId });
            return c.html(renderPage(
                "Thread Resolved",
                `"${thread.subject ?? "(no subject)"}" has been marked as handled. You won't receive further silence alerts for this thread.`,
                "success"
            ));
        }

        if (action === "snooze") {
            // Push last_activity forward by 24h so it doesn't trigger silence for another day
            const newActivity = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            run(`UPDATE threads SET last_activity = ? WHERE id = ?`, [newActivity, threadId]);
            logger.info("Thread snoozed 24h via email link", { threadId });
            return c.html(renderPage(
                "Thread Snoozed",
                `"${thread.subject ?? "(no subject)"}" has been snoozed for 24 hours. You'll be reminded again if it stays silent after that.`,
                "success"
            ));
        }

        if (action === "watching") {
            run(`UPDATE threads SET status = 'watching' WHERE id = ?`, [threadId]);
            logger.info("Thread downgraded to watching via email link", { threadId });
            return c.html(renderPage(
                "Thread Watching",
                `"${thread.subject ?? "(no subject)"}" has been moved to watching. It will be tracked but won't trigger silence alerts.`,
                "success"
            ));
        }

        return c.html(renderPage("Unknown Action", "This action is not recognized.", "error"));
    },
};

// ============================================================================
// HTML Response
// ============================================================================

function renderPage(title: string, message: string, type: "success" | "error"): string {
    const color = type === "success" ? "#059669" : "#dc2626";
    const icon = type === "success" ? "✓" : "✕";

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title} — Vigil</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:80px auto;padding:0 20px;text-align:center;color:#111827;">
    <div style="width:48px;height:48px;border-radius:50%;background:${color};color:white;font-size:24px;line-height:48px;margin:0 auto 20px;">${icon}</div>
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;">${title}</h1>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">${message}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">You can close this tab.</p>
</body>
</html>`;
}
