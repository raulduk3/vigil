/**
 * PostgreSQL Event Store Implementation
 *
 * Implements MR-EventStore-1,2,3 with PostgreSQL backend.
 * This replaces the in-memory event store with persistent storage.
 */

import { queryMany, queryOne, withTransaction } from "./client";
import type { VigilEvent } from "@/events/types";

// ============================================================================
// Types
// ============================================================================

export interface EventRow {
    id: number;
    event_id: string;
    watcher_id: string;
    timestamp: string; // bigint comes as string from pg
    type: string;
    payload: Record<string, any>;
    created_at: Date;
}

export interface EventQueryOptions {
    watcher_id?: string;
    types?: string[];
    since_timestamp?: number;
    until_timestamp?: number;
    limit?: number;
    offset?: number;
    order?: "ASC" | "DESC";
}

// ============================================================================
// MR-EventStore-1: Event Append
// ============================================================================

/**
 * Append a single event to the store.
 * Rejects duplicate event_ids (MR-EventStore-3).
 * Automatically maintains watcher projections.
 */
export async function appendEvent(event: VigilEvent): Promise<void> {
    const { event_id, watcher_id, timestamp, type, ...payload } = event;

    try {
        await withTransaction(async (client) => {
            // Insert event
            await client.query(
                `INSERT INTO events (event_id, watcher_id, timestamp, type, payload)
         VALUES ($1, $2, $3, $4, $5)`,
                [
                    event_id,
                    watcher_id,
                    timestamp,
                    type,
                    JSON.stringify({ ...payload, type }),
                ]
            );

            // Update watcher projection
            await updateWatcherProjection(client, event);
        });
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "23505"
        ) {
            // Unique violation - duplicate event_id
            throw new Error(`Duplicate event_id: ${event_id}`);
        }
        throw error;
    }
}

/**
 * Append multiple events atomically.
 * All events succeed or all fail.
 * Automatically maintains watcher projections.
 */
export async function appendEvents(events: VigilEvent[]): Promise<void> {
    if (events.length === 0) return;

    await withTransaction(async (client) => {
        for (const event of events) {
            const { event_id, watcher_id, timestamp, type, ...payload } = event;
            try {
                await client.query(
                    `INSERT INTO events (event_id, watcher_id, timestamp, type, payload)
           VALUES ($1, $2, $3, $4, $5)`,
                    [
                        event_id,
                        watcher_id,
                        timestamp,
                        type,
                        JSON.stringify({ ...payload, type }),
                    ]
                );

                // Update watcher projection
                await updateWatcherProjection(client, event);
            } catch (error) {
                if (
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "23505"
                ) {
                    throw new Error(`Duplicate event_id: ${event_id}`);
                }
                throw error;
            }
        }
    });
}

// ============================================================================
// MR-EventStore-2: Event Retrieval
// ============================================================================

/**
 * Get all events for a watcher, ordered by timestamp.
 */
export async function getEventsForWatcher(
    watcherId: string,
    options: Omit<EventQueryOptions, "watcher_id"> = {}
): Promise<VigilEvent[]> {
    return getEvents({ ...options, watcher_id: watcherId });
}

/**
 * Get events matching query options.
 */
export async function getEvents(
    options: EventQueryOptions = {}
): Promise<VigilEvent[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.watcher_id) {
        conditions.push(`watcher_id = $${paramIndex++}`);
        params.push(options.watcher_id);
    }

    if (options.types && options.types.length > 0) {
        conditions.push(`type = ANY($${paramIndex++})`);
        params.push(options.types);
    }

    if (options.since_timestamp !== undefined) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(options.since_timestamp);
    }

    if (options.until_timestamp !== undefined) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(options.until_timestamp);
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderClause = `ORDER BY timestamp ${options.order || "ASC"}, id ${options.order || "ASC"}`;

    // Use parameterized queries to prevent SQL injection
    let limitClause = "";
    if (options.limit !== undefined) {
        limitClause = `LIMIT $${paramIndex++}`;
        params.push(options.limit);
    }

    let offsetClause = "";
    if (options.offset !== undefined) {
        offsetClause = `OFFSET $${paramIndex++}`;
        params.push(options.offset);
    }

    const sql = `
    SELECT event_id, watcher_id, timestamp, type, payload
    FROM events
    ${whereClause}
    ${orderClause}
    ${limitClause}
    ${offsetClause}
  `;

    const rows = await queryMany<EventRow>(sql, params);
    return rows.map(rowToEvent);
}

/**
 * Get a single event by ID.
 */
export async function getEventById(
    eventId: string
): Promise<VigilEvent | null> {
    const row = await queryOne<EventRow>(
        `SELECT event_id, watcher_id, timestamp, type, payload
     FROM events WHERE event_id = $1`,
        [eventId]
    );
    return row ? rowToEvent(row) : null;
}

/**
 * Get the last event for a watcher.
 */
export async function getLastEvent(
    watcherId: string
): Promise<VigilEvent | null> {
    const row = await queryOne<EventRow>(
        `SELECT event_id, watcher_id, timestamp, type, payload
     FROM events
     WHERE watcher_id = $1
     ORDER BY timestamp DESC, id DESC
     LIMIT 1`,
        [watcherId]
    );
    return row ? rowToEvent(row) : null;
}

/**
 * Count events for a watcher.
 */
export async function countEvents(watcherId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM events WHERE watcher_id = $1",
        [watcherId]
    );
    return parseInt(result?.count || "0", 10);
}

/**
 * Check if an event exists (for deduplication).
 */
export async function eventExists(eventId: string): Promise<boolean> {
    const result = await queryOne<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM events WHERE event_id = $1) as exists",
        [eventId]
    );
    return result?.exists || false;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToEvent(row: EventRow): VigilEvent {
    const payload =
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    return {
        event_id: row.event_id,
        watcher_id: row.watcher_id,
        timestamp: parseInt(row.timestamp, 10),
        type: row.type,
        ...payload,
    } as VigilEvent;
}

// ============================================================================
// Specialized Queries
// ============================================================================

/**
 * Get all events for multiple watchers (batch query).
 */
export async function getEventsForWatchers(
    watcherIds: string[]
): Promise<Map<string, VigilEvent[]>> {
    if (watcherIds.length === 0) return new Map();

    const rows = await queryMany<EventRow>(
        `SELECT event_id, watcher_id, timestamp, type, payload
     FROM events
     WHERE watcher_id = ANY($1)
     ORDER BY timestamp ASC, id ASC`,
        [watcherIds]
    );

    const result = new Map<string, VigilEvent[]>();
    for (const watcherId of watcherIds) {
        result.set(watcherId, []);
    }

    for (const row of rows) {
        const events = result.get(row.watcher_id);
        if (events) {
            events.push(rowToEvent(row));
        }
    }

    return result;
}

/**
 * Get unprocessed alerts (ALERT_QUEUED without corresponding ALERT_SENT/ALERT_FAILED).
 */
export async function getUnprocessedAlerts(): Promise<VigilEvent[]> {
    const rows = await queryMany<EventRow>(
        `SELECT e.event_id, e.watcher_id, e.timestamp, e.type, e.payload
     FROM events e
     WHERE e.type = 'ALERT_QUEUED'
       AND NOT EXISTS (
         SELECT 1 FROM events e2
         WHERE e2.type IN ('ALERT_SENT', 'ALERT_FAILED')
           AND e2.payload->>'alert_id' = e.payload->>'alert_id'
       )
     ORDER BY e.timestamp ASC`,
        []
    );
    return rows.map(rowToEvent);
}

/**
 * Get active watchers (status = 'active').
 */
export async function getActiveWatcherIds(): Promise<string[]> {
    // Query watcher projections or derive from events
    const rows = await queryMany<{ watcher_id: string }>(
        `SELECT watcher_id FROM watcher_projections WHERE status = 'active'`,
        []
    );
    return rows.map((r) => r.watcher_id);
}

// ============================================================================
// Projection Maintenance
// ============================================================================

/**
 * Update watcher projection based on event.
 * Called within a transaction after event insertion.
 */
async function updateWatcherProjection(
    client: any,
    event: VigilEvent
): Promise<void> {
    switch (event.type) {
        case "WATCHER_CREATED":
            // Create initial projection
            await client.query(
                `INSERT INTO watcher_projections (
          watcher_id, account_id, name, ingest_token, status,
          policy, created_at, created_by, last_event_id, last_event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (watcher_id) DO NOTHING`,
                [
                    event.watcher_id,
                    event.account_id,
                    event.name,
                    event.ingest_token,
                    "created",
                    JSON.stringify({}),
                    event.created_at,
                    event.created_by,
                    event.event_id,
                    event.timestamp,
                ]
            );
            break;

        case "WATCHER_ACTIVATED":
            await client.query(
                `UPDATE watcher_projections
         SET status = 'active',
             last_event_id = $1,
             last_event_timestamp = $2
         WHERE watcher_id = $3`,
                [event.event_id, event.timestamp, event.watcher_id]
            );
            break;

        case "WATCHER_PAUSED":
            await client.query(
                `UPDATE watcher_projections
         SET status = 'paused',
             last_event_id = $1,
             last_event_timestamp = $2
         WHERE watcher_id = $3`,
                [event.event_id, event.timestamp, event.watcher_id]
            );
            break;

        case "WATCHER_RESUMED":
            await client.query(
                `UPDATE watcher_projections
         SET status = 'active',
             last_event_id = $1,
             last_event_timestamp = $2
         WHERE watcher_id = $3`,
                [event.event_id, event.timestamp, event.watcher_id]
            );
            break;

        case "WATCHER_DELETED":
            await client.query(
                `UPDATE watcher_projections
         SET status = 'deleted',
             deleted_at = $1,
             last_event_id = $2,
             last_event_timestamp = $3
         WHERE watcher_id = $4`,
                [
                    event.timestamp,
                    event.event_id,
                    event.timestamp,
                    event.watcher_id,
                ]
            );
            break;

        case "WATCHER_UPDATED":
            // Only name updates are currently supported by the API
            if (event.name) {
                await client.query(
                    `UPDATE watcher_projections
         SET name = $1,
             last_event_id = $2,
             last_event_timestamp = $3
         WHERE watcher_id = $4`,
                    [event.name, event.event_id, event.timestamp, event.watcher_id]
                );
            } else {
                await client.query(
                    `UPDATE watcher_projections
         SET last_event_id = $1,
             last_event_timestamp = $2
         WHERE watcher_id = $3`,
                    [event.event_id, event.timestamp, event.watcher_id]
                );
            }
            break;

        case "POLICY_UPDATED":
            await client.query(
                `UPDATE watcher_projections
         SET policy = $1,
             last_event_id = $2,
             last_event_timestamp = $3
         WHERE watcher_id = $4`,
                [
                    JSON.stringify(event.policy),
                    event.event_id,
                    event.timestamp,
                    event.watcher_id,
                ]
            );
            break;

        default:
            // For other events, just update last_event tracking
            await client.query(
                `UPDATE watcher_projections
         SET last_event_id = $1,
             last_event_timestamp = $2
         WHERE watcher_id = $3`,
                [event.event_id, event.timestamp, event.watcher_id]
            );
            break;
    }
}
