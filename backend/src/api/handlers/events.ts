/**
 * Events Handlers
 *
 * Provides endpoints for querying the event store.
 */

import type { Context } from "hono";
import { queryOne, queryMany } from "../../db/client";
import { getEventStore } from "../../events/store";
import type { VigilEvent } from "../../events/types";

// ============================================================================
// Handlers
// ============================================================================

export const eventHandlers = {
    async list(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("watcherId");

        // Query params
        const limit = Math.min(parseInt(c.req.query("limit") || "100"), 500);
        const before = c.req.query("before")
            ? parseInt(c.req.query("before")!)
            : undefined;
        const type = c.req.query("type");

        // Verify watcher ownership
        const watcher = await queryOne(
            `SELECT watcher_id FROM watcher_projections
             WHERE watcher_id = $1 AND account_id = $2`,
            [watcherId, user.account_id]
        );

        if (!watcher) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        // Query events from event store
        const eventStore = getEventStore();
        let events = await eventStore.getByWatcher(watcherId);

        // Filter by type if specified
        if (type) {
            events = events.filter((e) => e.type === type);
        }

        // Filter by before timestamp if specified
        if (before) {
            events = events.filter((e) => e.timestamp < before);
        }

        // Sort by timestamp descending (newest first)
        events.sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit
        const hasMore = events.length > limit;
        const limitedEvents = events.slice(0, limit);

        return c.json({
            events: limitedEvents,
            pagination: {
                limit,
                has_more: hasMore,
            },
        });
    },
};