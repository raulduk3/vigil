/**
 * Event Store Interface and PostgreSQL Implementation
 *
 * Append-only event storage. Events are never modified or deleted.
 */

import type { VigilEvent } from "./types";

// ============================================================================
// Interface
// ============================================================================

export interface EventStore {
    append(event: VigilEvent): Promise<void>;
    appendBatch(events: VigilEvent[]): Promise<void>;
    getEventsForWatcher(watcherId: string): Promise<VigilEvent[]>;
    getEventsForWatcherSince(
        watcherId: string,
        sinceTimestamp: number
    ): Promise<VigilEvent[]>;
    getEventById(eventId: string): Promise<VigilEvent | null>;
}

// ============================================================================
// PostgreSQL Implementation
// ============================================================================

import { query, queryOne, queryMany, withTransaction } from "../db/client";
import type { PoolClient } from "pg";

export class PostgresEventStore implements EventStore {
    async append(event: VigilEvent): Promise<void> {
        await query(
            `INSERT INTO events (event_id, watcher_id, timestamp, type, payload)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                event.event_id,
                event.watcher_id,
                event.timestamp,
                event.type,
                JSON.stringify(event),
            ]
        );
    }

    async appendBatch(events: VigilEvent[]): Promise<void> {
        if (events.length === 0) return;

        await withTransaction(async (client: PoolClient) => {
            for (const event of events) {
                await client.query(
                    `INSERT INTO events (event_id, watcher_id, timestamp, type, payload)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        event.event_id,
                        event.watcher_id,
                        event.timestamp,
                        event.type,
                        JSON.stringify(event),
                    ]
                );
            }
        });
    }

    async getEventsForWatcher(watcherId: string): Promise<VigilEvent[]> {
        const rows = await queryMany<{ payload: VigilEvent }>(
            `SELECT payload FROM events 
             WHERE watcher_id = $1 
             ORDER BY timestamp ASC, id ASC`,
            [watcherId]
        );
        return rows.map((row) => row.payload);
    }

    async getEventsForWatcherSince(
        watcherId: string,
        sinceTimestamp: number
    ): Promise<VigilEvent[]> {
        const rows = await queryMany<{ payload: VigilEvent }>(
            `SELECT payload FROM events 
             WHERE watcher_id = $1 AND timestamp > $2
             ORDER BY timestamp ASC, id ASC`,
            [watcherId, sinceTimestamp]
        );
        return rows.map((row) => row.payload);
    }

    async getEventById(eventId: string): Promise<VigilEvent | null> {
        const row = await queryOne<{ payload: VigilEvent }>(
            `SELECT payload FROM events WHERE event_id = $1`,
            [eventId]
        );
        return row?.payload ?? null;
    }
}

// ============================================================================
// In-Memory Implementation (Testing)
// ============================================================================

export class InMemoryEventStore implements EventStore {
    private events: VigilEvent[] = [];

    async append(event: VigilEvent): Promise<void> {
        this.events.push(event);
    }

    async appendBatch(events: VigilEvent[]): Promise<void> {
        this.events.push(...events);
    }

    async getEventsForWatcher(watcherId: string): Promise<VigilEvent[]> {
        return this.events
            .filter((e) => e.watcher_id === watcherId)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    async getEventsForWatcherSince(
        watcherId: string,
        sinceTimestamp: number
    ): Promise<VigilEvent[]> {
        return this.events
            .filter(
                (e) =>
                    e.watcher_id === watcherId && e.timestamp > sinceTimestamp
            )
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    async getEventById(eventId: string): Promise<VigilEvent | null> {
        return this.events.find((e) => e.event_id === eventId) ?? null;
    }

    // Testing helpers
    clear(): void {
        this.events = [];
    }

    getAll(): VigilEvent[] {
        return [...this.events];
    }
}

// ============================================================================
// Singleton
// ============================================================================

let eventStore: EventStore | null = null;

export function getEventStore(): EventStore {
    if (!eventStore) {
        eventStore = new PostgresEventStore();
    }
    return eventStore;
}

export function setEventStore(store: EventStore): void {
    eventStore = store;
}
