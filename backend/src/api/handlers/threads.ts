/**
 * Thread Handlers — V2
 */

import type { Context } from "hono";
import { queryOne, queryMany, run } from "../../db/client";
import type { ThreadRow, EmailRow } from "../../agent/schema";

// ============================================================================
// Handlers
// ============================================================================

export const threadHandlers = {
    async list(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId") ?? "";
        const status = c.req.query("status");

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        let sql = `SELECT * FROM threads WHERE watcher_id = ?`;
        const params: any[] = [watcherId];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY last_activity DESC`;

        const limit = parseInt(c.req.query("limit") ?? "100", 10);
        if (limit > 0 && limit <= 500) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }

        const rawThreads = queryMany<ThreadRow>(sql, params);

        // Enrich with original_date from the earliest email in each thread
        const threads = rawThreads.map(t => {
            const earliest = queryOne<{ original_date: string | null }>(
                `SELECT original_date FROM emails WHERE thread_id = ? AND original_date IS NOT NULL ORDER BY original_date ASC LIMIT 1`,
                [t.id]
            );
            return { ...t, original_date: earliest?.original_date ?? null };
        });
        return c.json({ threads: threads.map(formatThread) });
    },

    async get(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId") ?? "";
        const threadId = c.req.param("threadId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const thread = queryOne<ThreadRow>(
            `SELECT * FROM threads WHERE id = ? AND watcher_id = ?`,
            [threadId, watcherId]
        );
        if (!thread) return c.json({ error: "Thread not found" }, 404);

        // Load email metadata for this thread (no body — just analysis + metadata)
        const emails = queryMany<EmailRow>(
            `SELECT id, message_id, from_addr, to_addr, subject, received_at, original_date, recipient_received_at, analysis, processed, created_at
             FROM emails WHERE thread_id = ? ORDER BY received_at ASC`,
            [threadId]
        );

        // Load agent actions for this thread
        const actions = queryMany(
            `SELECT * FROM actions WHERE thread_id = ? ORDER BY created_at DESC LIMIT 20`,
            [threadId]
        );

        return c.json({
            thread: formatThread(thread),
            emails: emails.map(formatEmail),
            actions,
        });
    },

    async update(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId") ?? "";
        const threadId = c.req.param("threadId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const thread = queryOne<ThreadRow>(
            `SELECT * FROM threads WHERE id = ? AND watcher_id = ?`,
            [threadId, watcherId]
        );
        if (!thread) return c.json({ error: "Thread not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        const sets: string[] = [];
        const vals: any[] = [];

        if (body.status && ["active", "watching", "resolved", "ignored"].includes(body.status)) {
            sets.push("status = ?");
            vals.push(body.status);
        }
        if (body.summary !== undefined) {
            sets.push("summary = ?");
            vals.push(body.summary);
        }
        if (body.flags !== undefined) {
            sets.push("flags = ?");
            vals.push(JSON.stringify(body.flags));
        }

        if (sets.length === 0) {
            return c.json({ error: "Nothing to update" }, 400);
        }

        sets.push("last_activity = CURRENT_TIMESTAMP");
        vals.push(threadId);

        run(`UPDATE threads SET ${sets.join(", ")} WHERE id = ?`, vals);

        const updated = queryOne<ThreadRow>(
            `SELECT * FROM threads WHERE id = ?`,
            [threadId]
        );

        return c.json({ thread: updated ? formatThread(updated) : null });
    },

    async close(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId") ?? "";
        const threadId = c.req.param("threadId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const thread = queryOne<ThreadRow>(
            `SELECT * FROM threads WHERE id = ? AND watcher_id = ?`,
            [threadId, watcherId]
        );
        if (!thread) return c.json({ error: "Thread not found" }, 404);

        if (thread.status === "resolved" || thread.status === "ignored") {
            return c.json({ error: "Thread already closed" }, 400);
        }

        run(
            `UPDATE threads SET status = 'resolved', last_activity = CURRENT_TIMESTAMP WHERE id = ?`,
            [threadId]
        );

        return c.json({ closed: true, thread_id: threadId });
    },

    async delete_(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId") ?? "";
        const threadId = c.req.param("threadId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const thread = queryOne<ThreadRow>(
            `SELECT * FROM threads WHERE id = ? AND watcher_id = ?`,
            [threadId, watcherId]
        );
        if (!thread) return c.json({ error: "Thread not found" }, 404);

        // Delete associated records (cascade)
        run(`DELETE FROM memories WHERE thread_id = ?`, [threadId]);
        run(`DELETE FROM actions WHERE thread_id = ?`, [threadId]);
        run(`DELETE FROM emails WHERE thread_id = ?`, [threadId]);
        run(`DELETE FROM threads WHERE id = ?`, [threadId]);

        return c.json({ deleted: true, thread_id: threadId });
    },
};

// ============================================================================
// Helpers
// ============================================================================

function formatThread(row: ThreadRow) {
    let participants: string[] = [];
    let flags: Record<string, any> = {};
    try { participants = JSON.parse(row.participants); } catch {}
    try { if (row.flags) flags = JSON.parse(row.flags); } catch {}

    return {
        id: row.id,
        watcher_id: row.watcher_id,
        subject: row.subject,
        participants,
        status: row.status,
        first_seen: row.first_seen,
        last_activity: row.last_activity,
        email_count: row.email_count,
        summary: row.summary,
        flags,
        created_at: row.created_at,
    };
}

function formatEmail(row: EmailRow) {
    let analysis: any = null;
    try { if (row.analysis) analysis = JSON.parse(row.analysis); } catch {}

    return {
        id: row.id,
        message_id: row.message_id,
        from_addr: row.from_addr,
        to_addr: row.to_addr,
        subject: row.subject,
        received_at: row.received_at,
        analysis,
        processed: Boolean(row.processed),
    };
}
