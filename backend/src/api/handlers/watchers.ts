/**
 * Watcher Handlers
 */

import type { Context } from "hono";
import { queryOne, queryMany, query } from "../../db/client";
import { getEventStore } from "../../events/store";
import type {
    WatcherCreatedEvent,
    WatcherActivatedEvent,
    WatcherPausedEvent,
    WatcherResumedEvent,
    WatcherDeletedEvent,
    PolicyUpdatedEvent,
    WatcherPolicy,
} from "../../events/types";
import { canCreateWatcher, incrementWatcherCount } from "../../billing/usage";

// ============================================================================
// Types
// ============================================================================

interface WatcherRow {
    watcher_id: string;
    account_id: string;
    name: string;
    ingest_token: string;
    status: string;
    policy: WatcherPolicy;
    created_at: number;
}

// ============================================================================
// Handlers
// ============================================================================

export const watcherHandlers = {
    async list(c: Context) {
        const user = c.get("user");

        const watchers = await queryMany<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE account_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC`,
            [user.account_id]
        );

        return c.json({
            watchers: watchers.map(formatWatcher),
        });
    },

    async get(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        return c.json({ watcher: formatWatcher(watcher) });
    },

    async create(c: Context) {
        const user = c.get("user");
        const { name, policy } = await c.req.json();

        if (!name) {
            return c.json({ error: "Name required" }, 400);
        }

        // Check plan limits
        const account = await queryOne<{ plan: string }>(
            "SELECT plan FROM accounts WHERE account_id = $1",
            [user.account_id]
        );
        const canCreate = await canCreateWatcher(
            user.account_id,
            (account?.plan ?? "free") as any
        );
        if (!canCreate) {
            return c.json(
                { error: "Watcher limit reached for your plan" },
                403
            );
        }

        const watcherId = crypto.randomUUID();
        const ingestToken = generateIngestToken();
        const now = Date.now();

        const defaultPolicy: WatcherPolicy = {
            allowed_senders: [],
            silence_threshold_hours: 72,
            notification_channels: [],
            ...policy,
        };

        // Emit event
        const event: WatcherCreatedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "WATCHER_CREATED",
            account_id: user.account_id,
            name,
            ingest_token: ingestToken,
            created_by: user.user_id,
        };

        await getEventStore().append(event);

        // Update projection
        await query(
            `INSERT INTO watcher_projections 
             (watcher_id, account_id, name, ingest_token, status, policy, created_at, created_by)
             VALUES ($1, $2, $3, $4, 'created', $5, $6, $7)`,
            [
                watcherId,
                user.account_id,
                name,
                ingestToken,
                JSON.stringify(defaultPolicy),
                now,
                user.user_id,
            ]
        );

        // Update usage
        await incrementWatcherCount(user.account_id);

        return c.json(
            {
                watcher: {
                    watcher_id: watcherId,
                    name,
                    ingest_token: ingestToken,
                    ingestion_address: `${slugify(name)}-${ingestToken}@vigil.run`,
                    status: "created",
                    policy: defaultPolicy,
                    created_at: now,
                },
            },
            201
        );
    },

    async update(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const { name, policy } = await c.req.json();

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const now = Date.now();
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }

        if (policy) {
            const mergedPolicy = { ...watcher.policy, ...policy };
            updates.push(`policy = $${paramIndex++}`);
            params.push(JSON.stringify(mergedPolicy));

            // Emit policy update event
            const event: PolicyUpdatedEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: watcherId,
                type: "POLICY_UPDATED",
                policy: mergedPolicy,
                updated_by: user.user_id,
            };
            await getEventStore().append(event);
        }

        if (updates.length > 0) {
            params.push(watcherId);
            await query(
                `UPDATE watcher_projections SET ${updates.join(", ")} WHERE watcher_id = $${paramIndex}`,
                params
            );
        }

        // Fetch and return updated watcher
        const updated = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections WHERE watcher_id = $1`,
            [watcherId]
        );

        return c.json({ watcher: formatWatcher(updated!) });
    },

    async updatePolicy(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const policyUpdates = await c.req.json();

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const now = Date.now();
        const mergedPolicy = { ...watcher.policy, ...policyUpdates };

        // Emit policy update event
        const event: PolicyUpdatedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "POLICY_UPDATED",
            policy: mergedPolicy,
            updated_by: user.user_id,
        };
        await getEventStore().append(event);

        await query(
            `UPDATE watcher_projections SET policy = $1 WHERE watcher_id = $2`,
            [JSON.stringify(mergedPolicy), watcherId]
        );

        return c.json({ updated: true, policy: mergedPolicy });
    },

    async delete_(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const now = Date.now();

        const event: WatcherDeletedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "WATCHER_DELETED",
            deleted_by: user.user_id,
        };

        await getEventStore().append(event);

        await query(
            `UPDATE watcher_projections SET status = 'deleted', deleted_at = $1 WHERE watcher_id = $2`,
            [now, watcherId]
        );

        return c.json({ deleted: true, watcher_id: watcherId });
    },

    async activate(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        if (watcher.status === "active") {
            return c.json({ error: "Watcher already active" }, 400);
        }

        const now = Date.now();

        const event: WatcherActivatedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "WATCHER_ACTIVATED",
            activated_by: user.user_id,
        };

        await getEventStore().append(event);

        await query(
            `UPDATE watcher_projections SET status = 'active' WHERE watcher_id = $1`,
            [watcherId]
        );

        // Fetch and return updated watcher
        const updated = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections WHERE watcher_id = $1`,
            [watcherId]
        );

        return c.json({ watcher: formatWatcher(updated!) });
    },

    async pause(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const { reason } = await c.req.json().catch(() => ({}));

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const now = Date.now();

        const event: WatcherPausedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "WATCHER_PAUSED",
            paused_by: user.user_id,
            reason,
        };

        await getEventStore().append(event);

        await query(
            `UPDATE watcher_projections SET status = 'paused' WHERE watcher_id = $1`,
            [watcherId]
        );

        // Fetch and return updated watcher
        const updated = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections WHERE watcher_id = $1`,
            [watcherId]
        );

        return c.json({ watcher: formatWatcher(updated!) });
    },

    async resume(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        const watcher = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections 
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const now = Date.now();

        const event: WatcherResumedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: watcherId,
            type: "WATCHER_RESUMED",
            resumed_by: user.user_id,
        };

        await getEventStore().append(event);

        await query(
            `UPDATE watcher_projections SET status = 'active' WHERE watcher_id = $1`,
            [watcherId]
        );

        // Fetch and return updated watcher
        const updated = await queryOne<WatcherRow>(
            `SELECT * FROM watcher_projections WHERE watcher_id = $1`,
            [watcherId]
        );

        return c.json({ watcher: formatWatcher(updated!) });
    },
};

// ============================================================================
// Helpers
// ============================================================================

function generateIngestToken(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 6; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20);
}

function formatWatcher(row: WatcherRow) {
    return {
        watcher_id: row.watcher_id,
        name: row.name,
        ingest_token: row.ingest_token,
        ingestion_address: `${slugify(row.name)}-${row.ingest_token}@vigil.run`,
        status: row.status,
        policy: row.policy,
        created_at: row.created_at,
    };
}
