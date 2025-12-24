/**
 * Unit tests for event replay logic
 */

import { describe, test, expect } from "bun:test";
import { replayEvents, evaluateThreadUrgency } from "@/watcher/runtime";
import type { DevaEvent, ThreadState } from "@/watcher/runtime";

describe("replayEvents", () => {
  test("should start with created status", () => {
    const events: DevaEvent[] = [
      {
        event_id: "1",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
      },
    ];

    const state = replayEvents(events);

    expect(state.status).toBe("created");
    expect(state.watcher_id).toBe("w1");
    expect(state.threads.size).toBe(0);
  });

  test("should transition to active when activated", () => {
    const events: DevaEvent[] = [
      {
        event_id: "1",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
      },
      {
        event_id: "2",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_ACTIVATED",
      },
    ];

    const state = replayEvents(events);

    expect(state.status).toBe("active");
  });

  test("should open a thread", () => {
    const now = Date.now();
    const events: DevaEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
      },
      {
        event_id: "2",
        timestamp: now,
        watcher_id: "w1",
        type: "THREAD_OPENED",
        thread_id: "t1",
        email_id: "e1",
        opened_at: now,
      },
    ];

    const state = replayEvents(events);

    expect(state.threads.size).toBe(1);
    const thread = state.threads.get("t1");
    expect(thread?.status).toBe("open");
    expect(thread?.email_ids).toEqual(["e1"]);
  });

  test("should close a thread and never reopen", () => {
    const now = Date.now();
    const events: DevaEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "THREAD_OPENED",
        thread_id: "t1",
        email_id: "e1",
        opened_at: now,
      },
      {
        event_id: "2",
        timestamp: now + 1000,
        watcher_id: "w1",
        type: "THREAD_CLOSED",
        thread_id: "t1",
        closed_at: now + 1000,
        closed_by: "user_action",
        closure_event_id: "1",
      },
      {
        event_id: "3",
        timestamp: now + 2000,
        watcher_id: "w1",
        type: "THREAD_ACTIVITY_SEEN",
        thread_id: "t1",
        email_id: "e2",
        seen_at: now + 2000,
      },
    ];

    const state = replayEvents(events);

    const thread = state.threads.get("t1");
    expect(thread?.status).toBe("closed");
    // Activity after closure should not be added
    expect(thread?.email_ids).toEqual(["e1"]);
  });
});

describe("evaluateThreadUrgency", () => {
  test("should return ok for closed threads", () => {
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: Date.now() - 100000,
      last_activity_at: Date.now() - 50000,
      deadline_timestamp: Date.now() + 10000,
      status: "closed",
      closed_at: Date.now(),
      email_ids: ["e1"],
    };

    const result = evaluateThreadUrgency(thread, Date.now());

    expect(result.urgency_state).toBe("ok");
  });

  test("should return warning when deadline is within 24 hours", () => {
    const now = Date.now();
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      deadline_timestamp: now + 12 * 60 * 60 * 1000, // 12 hours from now
      status: "open",
      closed_at: null,
      email_ids: ["e1"],
    };

    const result = evaluateThreadUrgency(thread, now);

    expect(result.urgency_state).toBe("warning");
    expect(result.hours_until_deadline).toBeGreaterThan(0);
  });

  test("should return critical when deadline is within 2 hours", () => {
    const now = Date.now();
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      deadline_timestamp: now + 1 * 60 * 60 * 1000, // 1 hour from now
      status: "open",
      closed_at: null,
      email_ids: ["e1"],
    };

    const result = evaluateThreadUrgency(thread, now);

    expect(result.urgency_state).toBe("critical");
  });

  test("should return overdue when deadline has passed", () => {
    const now = Date.now();
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 100000,
      last_activity_at: now - 50000,
      deadline_timestamp: now - 1000, // 1 second ago
      status: "open",
      closed_at: null,
      email_ids: ["e1"],
    };

    const result = evaluateThreadUrgency(thread, now);

    expect(result.urgency_state).toBe("overdue");
    expect(result.hours_until_deadline).toBeLessThan(0);
  });

  test("should handle threads without deadlines", () => {
    const now = Date.now();
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      deadline_timestamp: null,
      status: "open",
      closed_at: null,
      email_ids: ["e1"],
    };

    const result = evaluateThreadUrgency(thread, now);

    expect(result.urgency_state).toBe("ok");
    expect(result.hours_until_deadline).toBeNull();
  });
});
