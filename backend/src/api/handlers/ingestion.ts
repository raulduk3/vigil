/**
 * Email Ingestion Handlers — V2
 *
 * Cloudflare worker sends parsed email here via POST /api/ingest/:token
 */

import type { Context } from "hono";
import { queryOne } from "../../db/client";
import { ingestEmail } from "../../ingestion/orchestrator";
import { logger } from "../../logger";

// ============================================================================
// Handlers
// ============================================================================

export const ingestionHandlers = {
    // POST /api/ingest/:token — called by Cloudflare worker
    async ingestByToken(c: Context) {
        try {
            const token = c.req.param("token");
            const body = await c.req.json();

            const watcher = queryOne<{ id: string; account_id: string; status: string }>(
                `SELECT id, account_id, status FROM watchers
                 WHERE ingest_token = ? AND status = 'active'`,
                [token]
            );

            if (!watcher) {
                return c.json({ error: "Unknown or inactive watcher" }, 404);
            }

            const messageId =
                body.headers?.["message-id"] ??
                body.messageId ??
                crypto.randomUUID();
            const from = body.from ?? body.envelope?.from ?? "unknown";
            const to = body.to ?? body.envelope?.to?.[0] ?? "";
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
