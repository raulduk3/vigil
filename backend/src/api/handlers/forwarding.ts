/**
 * Forwarding Handlers
 *
 * Supports the Chrome extension setup wizard:
 * - GET /forwarding/confirm-code/:watcherId — poll for Gmail confirmation code
 * - GET /forwarding/status/:watcherId — check if forwarding is active
 */

import type { Context } from "hono";
import { queryOne, run } from "../../db/client";

// ============================================================================
// Schema — auto-create the confirm_codes table if missing
// ============================================================================

let tableCreated = false;

function ensureTable() {
    if (tableCreated) return;
    run(`
        CREATE TABLE IF NOT EXISTS confirm_codes (
            id TEXT PRIMARY KEY,
            watcher_id TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    run(`CREATE INDEX IF NOT EXISTS idx_confirm_codes_watcher ON confirm_codes(watcher_id)`);
    tableCreated = true;
}

// ============================================================================
// Gmail Confirmation Code Extraction
// ============================================================================

/**
 * Called from the ingestion pipeline. If the email looks like a Gmail
 * forwarding confirmation, extract the code and store it.
 * Returns true if the email was a confirmation (so the agent can skip it).
 */
export function tryExtractConfirmCode(
    watcherId: string,
    from: string,
    subject: string,
    body: string
): boolean {
    // Gmail confirmation emails come from forwarding-noreply@google.com
    const isGmailConfirm =
        from.includes("forwarding-noreply@google.com") ||
        subject.toLowerCase().includes("forwarding confirmation") ||
        subject.toLowerCase().includes("gmail forwarding");

    if (!isGmailConfirm) return false;

    // Extract the numeric confirmation code
    // Gmail format: "Confirmation code: 123456789" or similar
    const codeMatch =
        body.match(/[Cc]onfirmation\s+[Cc]ode[:\s]+(\d{5,12})/) ||
        body.match(/(\d{9})/) || // Gmail codes are typically 9 digits
        subject.match(/(\d{5,12})/);

    if (!codeMatch) return false;

    const code = codeMatch[1];

    ensureTable();
    const id = crypto.randomUUID();
    run(
        `INSERT INTO confirm_codes (id, watcher_id, code) VALUES (?, ?, ?)`,
        [id, watcherId, code]
    );

    return true;
}

// ============================================================================
// Handlers
// ============================================================================

export const forwardingHandlers = {
    /**
     * GET /forwarding/confirm-code/:watcherId
     * Returns the most recent Gmail confirmation code for this watcher.
     */
    async confirmCode(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");

        // Verify watcher belongs to user
        const watcher = queryOne<{ id: string }>(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ?`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        ensureTable();
        const row = queryOne<{ code: string; created_at: string }>(
            `SELECT code, created_at FROM confirm_codes
             WHERE watcher_id = ?
             ORDER BY created_at DESC LIMIT 1`,
            [watcherId]
        );

        if (!row) {
            return c.json({ code: null, waiting: true });
        }

        return c.json({ code: row.code, waiting: false, created_at: row.created_at });
    },

    /**
     * GET /forwarding/status/:watcherId
     * Checks whether forwarding appears active by looking at recent email activity.
     */
    async status(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");

        // Verify watcher belongs to user
        const watcher = queryOne<{ id: string; ingest_token: string; name: string }>(
            `SELECT id, ingest_token, name FROM watchers WHERE id = ? AND account_id = ?`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        // Check for any emails in the last 24 hours
        const recent = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM emails
             WHERE watcher_id = ? AND created_at >= datetime('now', '-1 day')`,
            [watcherId]
        );

        // Get the most recent email timestamp
        const lastEmail = queryOne<{ received_at: string }>(
            `SELECT received_at FROM emails
             WHERE watcher_id = ?
             ORDER BY received_at DESC LIMIT 1`,
            [watcherId]
        );

        // Total email count
        const total = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM emails WHERE watcher_id = ?`,
            [watcherId]
        );

        const forwarding_active = (total?.count ?? 0) > 0;

        return c.json({
            forwarding_active,
            emails_24h: recent?.count ?? 0,
            total_emails: total?.count ?? 0,
            last_email_at: lastEmail?.received_at ?? null,
            ingestion_address: `${watcher.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${watcher.ingest_token}@vigil.run`,
        });
    },
};
