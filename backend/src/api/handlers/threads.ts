/**
 * Thread Handlers
 */

import type { Context } from "hono";
import { queryOne, queryMany, query } from "../../db/client";
import { getEventStore } from "../../events/store";
import type { ThreadClosedEvent } from "../../events/types";

// ============================================================================
// Types
// ============================================================================

interface ThreadRow {
    thread_id: string;
    watcher_id: string;
    status: string;
    opened_at: number;
    closed_at: number | null;
    last_activity_at: number;
    normalized_subject: string;
    original_sender: string;
    message_count: number;
    silence_alerted: boolean;
}

// ============================================================================
// Handlers
// ============================================================================

export const threadHandlers = {
    async list(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");
        const status = c.req.query("status"); // open, closed, or all

        // Verify watcher ownership
        const watcher = await queryOne(
            `SELECT watcher_id FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        let sql = `SELECT * FROM thread_projections WHERE watcher_id = $1`;
        const params: any[] = [watcherId];

        if (status === "open" || status === "closed") {
            sql += ` AND status = $2`;
            params.push(status);
        }

        sql += ` ORDER BY last_activity_at DESC`;

        const threads = await queryMany<ThreadRow>(sql, params);

        return c.json({
            threads: threads.map(formatThread),
        });
    },

    async get(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");
        const threadId = c.req.param("threadId");

        // Verify watcher ownership
        const watcher = await queryOne(
            `SELECT watcher_id FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const thread = await queryOne<ThreadRow>(
            `SELECT * FROM thread_projections WHERE thread_id = $1 AND watcher_id = $2`,
            [threadId, watcherId]
        );

        if (!thread) {
            return c.json({ error: "Thread not found" }, 404);
        }

        return c.json({ thread: formatThread(thread) });
    },

    async close(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");
        const threadId = c.req.param("threadId");
        const { reason } = await c.req.json().catch(() => ({}));

        // Verify watcher ownership
        const watcher = await queryOne(
            `SELECT watcher_id FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const thread = await queryOne<ThreadRow>(
            `SELECT * FROM thread_projections WHERE thread_id = $1 AND watcher_id = $2`,
            [threadId, watcherId]
        );

        if (!thread) {
            return c.json({ error: "Thread not found" }, 404);
        }

        if (thread.status === "closed") {
            return c.json({ error: "Thread already closed" }, 400);
        }

        const now = Date.now();

        const event: ThreadClosedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "THREAD_CLOSED",
            thread_id: threadId,
            closed_at: now,
            closed_by: "user_action",
            reason,
        };

        await getEventStore().append(event);

        await query(
            `UPDATE thread_projections SET status = 'closed', closed_at = $1 WHERE thread_id = $2`,
            [now, threadId]
        );

        return c.json({ closed: true, thread_id: threadId, closed_at: now });
    },
};

// ============================================================================
// Helpers
// ============================================================================

function formatThread(row: ThreadRow) {
    return {
        thread_id: row.thread_id,
        watcher_id: row.watcher_id,
        status: row.status,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        last_activity_at: row.last_activity_at,
        normalized_subject: row.normalized_subject,
        original_sender: row.original_sender,
        message_count: row.message_count,
        silence_alerted: row.silence_alerted,
    };
}
