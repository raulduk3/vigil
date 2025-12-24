/**
 * Unit tests for event store
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { InMemoryEventStore } from "@/events/event-store";
import type { DevaEvent } from "@/events/types";

describe("InMemoryEventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  test("should append events", async () => {
    const event: DevaEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      type: "ACCOUNT_CREATED",
      account_id: "a1",
      owner_email: "test@example.com",
    };

    await store.append(event);

    expect(store.size()).toBe(1);
  });

  test("should prevent duplicate event IDs", async () => {
    const event: DevaEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      type: "ACCOUNT_CREATED",
      account_id: "a1",
      owner_email: "test@example.com",
    };

    await store.append(event);

    await expect(store.append(event)).rejects.toThrow(
      "Event ID e1 already exists"
    );
  });

  test("should retrieve events for watcher", async () => {
    const events: DevaEvent[] = [
      {
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Watcher 1",
        ingest_token: "token1",
        created_by: "u1",
      },
      {
        event_id: "e2",
        timestamp: Date.now(),
        watcher_id: "w2",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Watcher 2",
        ingest_token: "token2",
        created_by: "u1",
      },
      {
        event_id: "e3",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_ACTIVATED",
      },
    ];

    for (const event of events) {
      await store.append(event);
    }

    const w1Events = await store.getEventsForWatcher("w1");

    expect(w1Events.length).toBe(2);
    expect(w1Events[0]?.event_id).toBe("e1");
    expect(w1Events[1]?.event_id).toBe("e3");
  });

  test("should retrieve events by IDs", async () => {
    const events: DevaEvent[] = [
      {
        event_id: "e1",
        timestamp: Date.now(),
        type: "ACCOUNT_CREATED",
        account_id: "a1",
        owner_email: "test1@example.com",
      },
      {
        event_id: "e2",
        timestamp: Date.now(),
        type: "ACCOUNT_CREATED",
        account_id: "a2",
        owner_email: "test2@example.com",
      },
    ];

    for (const event of events) {
      await store.append(event);
    }

    const retrieved = await store.getEventsByIds(["e1"]);

    expect(retrieved.length).toBe(1);
    expect(retrieved[0]?.event_id).toBe("e1");
  });

  test("should retrieve events since timestamp", async () => {
    const baseTime = Date.now();
    const events: DevaEvent[] = [
      {
        event_id: "e1",
        timestamp: baseTime - 2000,
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Watcher 1",
        ingest_token: "token1",
        created_by: "u1",
      },
      {
        event_id: "e2",
        timestamp: baseTime,
        watcher_id: "w1",
        type: "WATCHER_ACTIVATED",
      },
      {
        event_id: "e3",
        timestamp: baseTime + 1000,
        watcher_id: "w1",
        type: "WATCHER_PAUSED",
        paused_by: "u1",
      },
    ];

    for (const event of events) {
      await store.append(event);
    }

    const recent = await store.getEventsSince("w1", baseTime);

    expect(recent.length).toBe(2);
    expect(recent[0]?.event_id).toBe("e2");
    expect(recent[1]?.event_id).toBe("e3");
  });
});
