/**
 * Email Ingestion Handlers
 *
 * Cloudflare Email Routing webhook endpoint.
 */

import type { Context } from "hono";
import { queryOne } from "../../db/client";
import { ingestEmail } from "../../ingestion/orchestrator";
import { canProcessEmail, incrementEmailCount } from "../../billing/usage";
import { logger } from "../../logger";

// ============================================================================
// Handlers
// ============================================================================

export const ingestionHandlers = {
    async cloudflareEmail(c: Context) {
        try {
            const body = await c.req.json();

            // Extract recipient to get ingest token
            const to = body.to ?? body.envelope?.to?.[0];
            if (!to) {
                return c.json({ error: "Missing recipient" }, 400);
            }

            // Parse ingest token from address (format: name-token@vigil.run)
            const match = to.match(/-([a-z0-9]{6})@vigil\.run$/i);
            if (!match) {
                logger.warn("Invalid ingestion address format", { to });
                return c.json({ error: "Invalid ingestion address" }, 400);
            }

            const ingestToken = match[1].toLowerCase();

            // Look up watcher by token
            const watcher = await queryOne<{
                watcher_id: string;
                account_id: string;
                status: string;
            }>(
                `SELECT w.watcher_id, w.account_id, w.status
                    FROM watcher_projections w
                    WHERE w.ingest_token = $1 AND w.deleted_at IS NULL`,
                [ingestToken]
            );

            if (!watcher) {
                return c.json({ error: "Unknown watcher" }, 404);
            }

            // Check usage limits
            const account = await queryOne<{ plan: string }>(
                "SELECT plan FROM accounts WHERE account_id = $1",
                [watcher.account_id]
            );

            const canProcess = await canProcessEmail(
                watcher.account_id,
                (account?.plan ?? "free") as any
            );

            if (!canProcess) {
                logger.warn("Email limit reached", {
                    accountId: watcher.account_id,
                });
                return c.json({ error: "Email limit reached" }, 429);
            }

            // Extract email data
            const messageId =
                body.headers?.["message-id"] ?? crypto.randomUUID();
            const from = body.from ?? body.envelope?.from ?? "unknown";
            const subject = body.subject ?? "(no subject)";
            const emailBody = body.text ?? body.html ?? "";
            const headers = body.headers ?? {};

            // Ingest the email
            const result = await ingestEmail({
                watcherId: watcher.watcher_id,
                messageId,
                from,
                subject,
                body: emailBody,
                headers,
                receivedAt: Date.now(),
            });

            // Increment usage counter
            if (result.success) {
                await incrementEmailCount(watcher.account_id);
            }

            return c.json({
                success: result.success,
                thread_id: result.threadId,
                action_request_detected: result.actionRequestDetected,
                sender_allowed: result.senderAllowed,
            });
        } catch (error) {
            logger.error("Email ingestion failed", { error });
            return c.json({ error: "Ingestion failed" }, 500);
        }
    },
};
