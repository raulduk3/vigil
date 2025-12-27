/**
 * Unit tests for event replay logic
 */

import { describe, test, expect } from "bun:test";
import { 
  replayEvents, 
  evaluateThreadUrgency, 
  urgencyPriority,
} from "@/watcher/runtime";
import type { VigilEvent } from "@/events/types";
import type { ThreadState, UrgencyLevel } from "@/watcher/runtime";

describe("replayEvents", () => {
  test("should start with created status", () => {
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
        created_at: Date.now(),
      },
    ];

    const state = replayEvents(events);

    expect(state.status).toBe("created");
    expect(state.watcher_id).toBe("w1");
    expect(state.threads.size).toBe(0);
  });

  test("should transition to active when activated", () => {
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
        created_at: Date.now(),
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
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
        created_at: now,
      },
      {
        event_id: "2",
        timestamp: now,
        watcher_id: "w1",
        type: "THREAD_OPENED",
        thread_id: "t1",
        message_id: "e1",
        opened_at: now,
      },
    ];

    const state = replayEvents(events);

    expect(state.threads.size).toBe(1);
    const thread = state.threads.get("t1");
    expect(thread?.status).toBe("open");
    expect(thread?.message_ids).toEqual(["e1"]);
    expect(thread?.last_urgency_state).toBe("ok");
  });

  test("should close a thread and never reopen", () => {
    const now = Date.now();
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "THREAD_OPENED",
        thread_id: "t1",
        message_id: "e1",
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
        type: "THREAD_ACTIVITY_OBSERVED",
        thread_id: "t1",
        message_id: "e2",
        observed_at: now + 2000,
      },
    ];

    const state = replayEvents(events);

    const thread = state.threads.get("t1");
    expect(thread?.status).toBe("closed");
    // Activity after closure should not be added
    expect(thread?.message_ids).toEqual(["e1"]);
  });

  test("should track policy updates", () => {
    const now = Date.now();
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "WATCHER_CREATED",
        account_id: "a1",
        name: "Test Watcher",
        ingest_token: "token123",
        created_by: "u1",
        created_at: now,
      },
      {
        event_id: "2",
        timestamp: now + 1000,
        watcher_id: "w1",
        type: "POLICY_UPDATED",
        policy: {
          allowed_senders: ["test@example.com"],
          silence_threshold_hours: 72,
          deadline_warning_hours: 24,
          deadline_critical_hours: 2,
          notification_channels: [],
          reporting_cadence: "daily",
          reporting_recipients: [],
        },
        updated_by: "u1",
      },
    ];

    const state = replayEvents(events);

    expect(state.policy).not.toBeNull();
    expect(state.policy?.allowed_senders).toEqual(["test@example.com"]);
  });

  test("should update last_urgency_state on REMINDER_EVALUATED", () => {
    const now = Date.now();
    const events: VigilEvent[] = [
      {
        event_id: "1",
        timestamp: now,
        watcher_id: "w1",
        type: "THREAD_OPENED",
        thread_id: "t1",
        message_id: "e1",
        opened_at: now,
      },
      {
        event_id: "2",
        timestamp: now + 1000,
        watcher_id: "w1",
        type: "REMINDER_EVALUATED",
        thread_id: "t1",
        evaluation_timestamp: now + 1000,
        urgency_state: "warning",
        hours_until_deadline: 12,
        hours_since_activity: 1,
      },
    ];

    const state = replayEvents(events);

    const thread = state.threads.get("t1");
    expect(thread?.last_urgency_state).toBe("warning");
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
      deadline_type: "hard",
      status: "closed",
      closed_at: Date.now(),
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
    };

    const result = evaluateThreadUrgency(thread, Date.now());

    expect(result.urgency_state).toBe("ok");
  });

  test("should return warning when deadline is within 24 hours", () => {
    const now = Date.now();
    const deadline = now + 12 * 60 * 60 * 1000; // 12 hours from now
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
      trigger_type: "hard_deadline",
      participants: [],
      normalized_subject: "test",
      original_sender: "sender",
      original_sent_at: now,
      hard_deadline_event_id: "evt1",
      soft_deadline_event_id: null,
    };

    const result = evaluateThreadUrgency(thread, now, deadline);

    expect(result.urgency_state).toBe("warning");
    expect(result.hours_until_deadline).toBeGreaterThan(0);
  });

  test("should return critical when deadline is within 2 hours", () => {
    const now = Date.now();
    const deadline = now + 1 * 60 * 60 * 1000; // 1 hour from now
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
      trigger_type: "hard_deadline",
      participants: [],
      normalized_subject: "test",
      original_sender: "sender",
      original_sent_at: now,
      hard_deadline_event_id: "evt1",
      soft_deadline_event_id: null,
    };

    const result = evaluateThreadUrgency(thread, now, deadline);

    expect(result.urgency_state).toBe("critical");
  });

  test("should return overdue when deadline has passed", () => {
    const now = Date.now();
    const deadline = now - 1000; // 1 second ago
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 100000,
      last_activity_at: now - 50000,
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
      trigger_type: "hard_deadline",
      participants: [],
      normalized_subject: "test",
      original_sender: "sender",
      original_sent_at: now,
      hard_deadline_event_id: "evt1",
      soft_deadline_event_id: null,
    };

    const result = evaluateThreadUrgency(thread, now, deadline);

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
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
      trigger_type: "urgency_signal",
      participants: [],
      normalized_subject: "test",
      original_sender: "sender",
      original_sent_at: now,
      hard_deadline_event_id: null,
      soft_deadline_event_id: null,
    };

    const result = evaluateThreadUrgency(thread, now, null);

    expect(result.urgency_state).toBe("ok");
    expect(result.hours_until_deadline).toBeNull();
  });
});

describe("urgencyPriority", () => {
  test("should return correct priority values", () => {
    expect(urgencyPriority("ok")).toBe(0);
    expect(urgencyPriority("warning")).toBe(1);
    expect(urgencyPriority("critical")).toBe(2);
    expect(urgencyPriority("overdue")).toBe(3);
  });
});




