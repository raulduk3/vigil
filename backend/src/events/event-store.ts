/**
 * Event Store Interface
 *
 * Immutable, append-only event storage.
 * Events are never modified or deleted.
 * Corrections are made by emitting new events.
 */

import type { VigilEvent } from "./types";

export interface EventStore {
    /**
     * Append a new event to the store.
     * Events are immutable once written.
     */
    append(event: VigilEvent): Promise<void>;

    /**
     * Retrieve all events for a specific watcher.
     * Returns events in chronological order.
     */
    getEventsForWatcher(watcherId: string): Promise<readonly VigilEvent[]>;

    /**
     * Retrieve all events for a specific account.
     */
    getEventsForAccount(accountId: string): Promise<readonly VigilEvent[]>;

    /**
     * Retrieve events by IDs.
     */
    getEventsByIds(eventIds: readonly string[]): Promise<readonly VigilEvent[]>;

    /**
     * Retrieve events in a time range.
     */
    getEventsSince(
        watcherId: string,
        sinceTimestamp: number
    ): Promise<readonly VigilEvent[]>;

    /**
     * Get all events (for full replay).
     * Use with caution - may return large datasets.
     */
    getAllEvents(): Promise<readonly VigilEvent[]>;

    /**
     * Query events with filtering options.
     * Supports watcher_id, type filters, timestamps, pagination.
     */
    getEvents?(options: {
        watcher_id?: string;
        types?: string[];
        since_timestamp?: number;
        until_timestamp?: number;
        limit?: number;
        offset?: number;
        order?: "ASC" | "DESC";
    }): Promise<readonly VigilEvent[]>;
}

/**
 * In-memory event store for development and testing.
 * NOT suitable for production.
 */
export class InMemoryEventStore implements EventStore {
    private readonly events: VigilEvent[] = [];

    async append(event: VigilEvent): Promise<void> {
        // Verify event_id uniqueness
        if (this.events.some((e) => e.event_id === event.event_id)) {
            throw new Error(`Event ID ${event.event_id} already exists`);
        }
        this.events.push(event);
    }

    async getEventsForWatcher(
        watcherId: string
    ): Promise<readonly VigilEvent[]> {
        return this.events.filter((e) => e.watcher_id === watcherId);
    }

    async getEventsForAccount(
        accountId: string
    ): Promise<readonly VigilEvent[]> {
        return this.events.filter((e) => {
            if (e.type === "ACCOUNT_CREATED" || e.type === "USER_CREATED") {
                return e.account_id === accountId;
            }
            if (e.type === "WATCHER_CREATED") {
                return e.account_id === accountId;
            }
            return false;
        });
    }

    async getEventsByIds(
        eventIds: readonly string[]
    ): Promise<readonly VigilEvent[]> {
        const idSet = new Set(eventIds);
        return this.events.filter((e) => idSet.has(e.event_id));
    }

    async getEventsSince(
        watcherId: string,
        sinceTimestamp: number
    ): Promise<readonly VigilEvent[]> {
        return this.events.filter(
            (e) => e.watcher_id === watcherId && e.timestamp >= sinceTimestamp
        );
    }

    async getAllEvents(): Promise<readonly VigilEvent[]> {
        return [...this.events];
    }

    /**
     * Development utility: clear all events.
     * NEVER use in production.
     */
    clear(): void {
        this.events.length = 0;
    }

    /**
     * Development utility: get event count.
     */
    size(): number {
        return this.events.length;
    }
}
