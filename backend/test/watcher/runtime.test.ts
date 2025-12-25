/**
 * Unit tests for event replay logic
 */

import { describe, test, expect } from "bun:test";
import { 
  replayEvents, 
  evaluateThreadUrgency,
  detectUrgencyTransition,
  urgencyPriority,
  generateReminderData,
  determineReminderType,
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
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: now - 10000,
      last_activity_at: now - 5000,
      deadline_timestamp: now + 12 * 60 * 60 * 1000, // 12 hours from now
      deadline_type: "hard",
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
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
      deadline_type: "hard",
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
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
      deadline_type: "hard",
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
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
      deadline_type: null,
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
    };

    const result = evaluateThreadUrgency(thread, now);

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

describe("detectUrgencyTransition", () => {
  const baseThread: ThreadState = {
    thread_id: "t1",
    watcher_id: "w1",
    opened_at: Date.now(),
    last_activity_at: Date.now(),
    deadline_timestamp: Date.now() + 100000,
    deadline_type: "hard",
    status: "open",
    closed_at: null,
    message_ids: ["e1"],
    last_urgency_state: "ok",
    last_alert_urgency: null,
  };

  test("should return null when urgency unchanged", () => {
    const result = detectUrgencyTransition(baseThread, "ok");
    expect(result).toBeNull();
  });

  test("should detect escalation from ok to warning", () => {
    const result = detectUrgencyTransition(baseThread, "warning");
    
    expect(result).not.toBeNull();
    expect(result?.is_escalation).toBe(true);
    expect(result?.requires_alert).toBe(true);
    expect(result?.previous_urgency).toBe("ok");
    expect(result?.current_urgency).toBe("warning");
  });

  test("should detect de-escalation and not require alert", () => {
    const warningThread = { ...baseThread, last_urgency_state: "warning" as UrgencyLevel };
    const result = detectUrgencyTransition(warningThread, "ok");
    
    expect(result).not.toBeNull();
    expect(result?.is_escalation).toBe(false);
    expect(result?.requires_alert).toBe(false);
  });

  test("should not require alert if already alerted at this level", () => {
    const alertedThread = { 
      ...baseThread, 
      last_urgency_state: "ok" as UrgencyLevel,
      last_alert_urgency: "warning" as UrgencyLevel,
    };
    const result = detectUrgencyTransition(alertedThread, "warning");
    
    expect(result).not.toBeNull();
    expect(result?.is_escalation).toBe(true);
    expect(result?.requires_alert).toBe(false); // Already alerted at warning
  });

  test("should require alert when escalating past last alert level", () => {
    const alertedThread = { 
      ...baseThread, 
      last_urgency_state: "warning" as UrgencyLevel,
      last_alert_urgency: "warning" as UrgencyLevel,
    };
    const result = detectUrgencyTransition(alertedThread, "critical");
    
    expect(result).not.toBeNull();
    expect(result?.is_escalation).toBe(true);
    expect(result?.requires_alert).toBe(true); // Critical > warning
  });
});

describe("generateReminderData", () => {
  test("should generate hard_deadline reminder for hard deadline thread", () => {
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: Date.now(),
      last_activity_at: Date.now(),
      deadline_timestamp: Date.now() + 100000,
      deadline_type: "hard",
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
    };

    const result = generateReminderData(thread, "warning", "causal_123");

    expect(result.reminder_type).toBe("hard_deadline");
    expect(result.binding).toBe(true);
    expect(result.causal_event_id).toBe("causal_123");
    expect(result.urgency_level).toBe("warning");
  });

  test("should generate soft_deadline reminder for soft deadline thread", () => {
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: Date.now(),
      last_activity_at: Date.now(),
      deadline_timestamp: Date.now() + 100000,
      deadline_type: "soft",
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
    };

    const result = generateReminderData(thread, "warning", "causal_456");

    expect(result.reminder_type).toBe("soft_deadline");
    expect(result.binding).toBe(false);
  });

  test("should generate silence reminder for thread without deadline", () => {
    const thread: ThreadState = {
      thread_id: "t1",
      watcher_id: "w1",
      opened_at: Date.now(),
      last_activity_at: Date.now(),
      deadline_timestamp: null,
      deadline_type: null,
      status: "open",
      closed_at: null,
      message_ids: ["e1"],
      last_urgency_state: "ok",
      last_alert_urgency: null,
    };

    const result = generateReminderData(thread, "warning", "causal_789");

    expect(result.reminder_type).toBe("silence");
    expect(result.binding).toBe(false);
  });
});
