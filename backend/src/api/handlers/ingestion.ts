/**
 * Email Ingestion Handlers — V2
 *
 * Cloudflare worker sends raw MIME email here via POST /api/ingest/:token
 * Also accepts JSON for direct API calls and testing.
 */

import type { Context } from "hono";
import PostalMime from "postal-mime";
import { queryOne } from "../../db/client";
import { ingestEmail } from "../../ingestion/orchestrator";
import { logger } from "../../logger";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the ingest token from a route param that may be a full local part.
 * e.g. "ricky-personal-watch-9uw05nk7" → "9uw05nk7"
 * or just "9uw05nk7" → "9uw05nk7"
 */
function extractToken(param: string): string {
    const parts = param.split("-");
    return parts[parts.length - 1];
}

/**
 * Parse a raw MIME email string into structured fields.
 */
async function parseRawEmail(raw: string) {
    const parser = new PostalMime();
    const parsed = await parser.parse(raw);

    const headers: Record<string, string> = {};
    for (const h of parsed.headers ?? []) {
        headers[h.key.toLowerCase()] = h.value;
    }

    return {
        messageId: headers["message-id"] ?? crypto.randomUUID(),
        from: parsed.from?.address ?? parsed.from?.name ?? "unknown",
        to: parsed.to?.[0]?.address ?? "",
        subject: parsed.subject ?? "(no subject)",
        body: parsed.text ?? parsed.html ?? "",
        inReplyTo: headers["in-reply-to"] ?? undefined,
        headers,
    };
}

// ============================================================================
// Handlers
// ============================================================================

export const ingestionHandlers = {
    // POST /api/ingest/:token — called by Cloudflare worker (raw MIME) or API (JSON)
    async ingestByToken(c: Context) {
        try {
            const rawToken = c.req.param("token");
            const token = extractToken(rawToken);

            const watcher = queryOne<{ id: string; account_id: string; status: string }>(
                `SELECT id, account_id, status FROM watchers
                 WHERE ingest_token = ? AND status = 'active'`,
                [token]
            );

            if (!watcher) {
                logger.warn("Unknown watcher token", { rawToken, extractedToken: token });
                return c.json({ error: "Unknown or inactive watcher" }, 404);
            }

            // Determine if raw MIME or JSON based on content type
            const contentType = c.req.header("content-type") ?? "";
            let messageId: string, from: string, to: string, subject: string, emailBody: string, headers: Record<string, string>, inReplyTo: string | undefined;

            if (contentType.includes("text/plain") || contentType.includes("message/rfc822")) {
                // Raw MIME from Cloudflare Worker
                const rawEmail = await c.req.text();
                const parsed = await parseRawEmail(rawEmail);
                messageId = parsed.messageId;
                from = parsed.from;
                to = parsed.to;
                subject = parsed.subject;
                emailBody = parsed.body;
                headers = parsed.headers;
                inReplyTo = parsed.inReplyTo;

                // Fallback: use Cloudflare headers if MIME parsing missed them
                if (from === "unknown") from = c.req.header("x-cloudflare-email-from") ?? "unknown";
                if (!to) to = c.req.header("x-cloudflare-email-to") ?? "";

                logger.info("Parsed raw MIME email", { from, subject, to: to.substring(0, 30) });
            } else {
                // JSON from direct API calls / tests
                const body = await c.req.json();
                messageId = body.headers?.["message-id"] ?? body.messageId ?? body.message_id ?? crypto.randomUUID();
                from = body.from ?? body.envelope?.from ?? "unknown";
                to = body.to ?? body.envelope?.to?.[0] ?? "";
                subject = body.subject ?? "(no subject)";
                emailBody = body.text ?? body.html ?? body.body ?? "";
                headers = body.headers ?? {};
                inReplyTo = body.in_reply_to ?? body.inReplyTo ?? headers["in-reply-to"];
            }

            const result = await ingestEmail({
                watcherId: watcher.id,
                messageId,
                from,
                to,
                subject,
                body: emailBody,
                headers,
                inReplyTo,
                receivedAt: Date.now(),
            });

            return c.json({
                success: result.success,
                agent_invoked: result.agentInvoked,
            });
        } catch (err) {
            logger.error("Email ingestion failed", { err });
            return c.json({ error: "Ingestion failed" }, 500);
        }
    },

    // Legacy: POST /api/ingestion/cloudflare-email (old Cloudflare format)
    async cloudflareEmail(c: Context) {
        try {
            const body = await c.req.json();

            // Extract ingest token from recipient address (name-TOKEN@vigil.run)
            const to = body.to ?? body.envelope?.to?.[0];
            if (!to) return c.json({ error: "Missing recipient" }, 400);

            const match = to.match(/-([a-z0-9]{6,8})@vigil\.run$/i);
            if (!match) {
                logger.warn("Invalid ingestion address format", { to });
                return c.json({ error: "Invalid ingestion address" }, 400);
            }

            const ingestToken = match[1].toLowerCase();
            const watcher = queryOne<{ id: string; account_id: string; status: string }>(
                `SELECT id, account_id, status FROM watchers
                 WHERE ingest_token = ? AND status = 'active'`,
                [ingestToken]
            );

            if (!watcher) {
                return c.json({ error: "Unknown watcher" }, 404);
            }

            const messageId =
                body.headers?.["message-id"] ?? crypto.randomUUID();
            const from = body.from ?? body.envelope?.from ?? "unknown";
            const subject = body.subject ?? "(no subject)";
            const emailBody = body.text ?? body.html ?? "";
            const headers = body.headers ?? {};

            const result = await ingestEmail({
                watcherId: watcher.id,
                messageId,
                from,
                to,
                subject,
                body: emailBody,
                headers,
                receivedAt: Date.now(),
            });

            return c.json({
                success: result.success,
                agent_invoked: result.agentInvoked,
            });
        } catch (err) {
            logger.error("Email ingestion failed", { err });
            return c.json({ error: "Ingestion failed" }, 500);
        }
    },
};
