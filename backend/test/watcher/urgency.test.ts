/**
 * Unit tests for Policy-Aware Urgency Evaluation
 * 
 * Tests for Module Requirements:
 * - MR-WatcherRuntime-3: Urgency computation with policy
 * - MR-WatcherRuntime-4: State transition detection
 * - MR-WatcherRuntime-5: Reminder generation with causal traceability
 */

import { describe, test, expect } from "bun:test";
import {
  computeUrgencyWithPolicy,
  generateReminderWithTraceability,
  shouldEmitAlert,
  evaluateAllThreads,
  createReminderEvent,
  DEFAULT_POLICY,
  type PolicyAwareUrgencyResult,
} from "@/watcher/urgency";
import type { ThreadState, UrgencyLevel } from "@/watcher/runtime";
import type { VigilEvent, WatcherPolicy } from "@/events/types";

// ============================================================================
// Test Fixtures
// ============================================================================

function createThread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    thread_id: "thread-123",
    watcher_id: "watcher-456",
    trigger_type: "hard_deadline",
    opened_at: Date.now() - 86400000,
    last_activity_at: Date.now() - 3600000,
    status: "open",
    closed_at: null,
    message_ids: ["msg-1"],
    participants: ["sender@example.com"],
    normalized_subject: "test subject",
    original_sender: "sender@example.com",
    original_sent_at: Date.now() - 86400000,
    hard_deadline_event_id: null,
    soft_deadline_event_id: null,
    last_urgency_state: "ok",
    last_alert_urgency: null,
    ...overrides,
  };
}

function createHardDeadlineEvent(
  eventId: string,
  deadlineUtc: number
): VigilEvent {
  return {
    event_id: eventId,
    timestamp: Date.now(),
    watcher_id: "watcher-456",
    type: "HARD_DEADLINE_OBSERVED",
    message_id: "msg-1",
    deadline_utc: deadlineUtc,
    deadline_text: "Friday 5pm",
    source_span: "due by Friday 5pm",
    confidence: "high",
    binding: true,
    extractor_version: "v1.0.0",
  } as VigilEvent;
}

function createSoftDeadlineEvent(
  eventId: string,
  horizonHours: number
): VigilEvent {
  return {
    event_id: eventId,
    timestamp: Date.now(),
    watcher_id: "watcher-456",
    type: "SOFT_DEADLINE_SIGNAL_OBSERVED",
    message_id: "msg-1",
    signal_text: "end of week",
    source_span: "by end of week",
    estimated_horizon_hours: horizonHours,
    confidence: "medium",
    binding: false,
    extractor_version: "v1.0.0",
  } as VigilEvent;
}

// ============================================================================
// MR-WatcherRuntime-3: Urgency Computation with Policy Tests
// ============================================================================

describe("MR-WatcherRuntime-3: computeUrgencyWithPolicy", () => {
  const now = Date.now();

  describe("closed thread handling", () => {
    test("should return ok for closed threads regardless of deadline", () => {
      const thread = createThread({
        status: "closed",
        closed_at: now,
        hard_deadline_event_id: "hd-1",
      });

      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", now - 3600000)], // Past deadline
      ]);

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      expect(result.urgency_state).toBe("ok");
      expect(result.deadline_type).toBe("none");
    });
  });

  describe("hard deadline evaluation", () => {
    test("should return ok when deadline is far (> warning hours)", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 48 hours from now (> 24 hour warning threshold)
      const deadlineUtc = now + 48 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      expect(result.urgency_state).toBe("ok");
      expect(result.deadline_type).toBe("hard");
      expect(result.triggered_by).toBe("none");
      expect(result.hours_until_deadline).toBeGreaterThan(24);
    });

    test("should return warning when deadline within warning threshold", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 12 hours from now (< 24 hour warning, > 2 hour critical)
      const deadlineUtc = now + 12 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      expect(result.urgency_state).toBe("warning");
      expect(result.deadline_type).toBe("hard");
      expect(result.triggered_by).toBe("deadline");
    });

    test("should return critical when deadline within critical threshold", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 1 hour from now (< 2 hour critical)
      const deadlineUtc = now + 1 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      expect(result.urgency_state).toBe("critical");
      expect(result.hours_until_deadline).toBeLessThan(2);
    });

    test("should return overdue when deadline has passed", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 1 hour ago
      const deadlineUtc = now - 1 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      expect(result.urgency_state).toBe("overdue");
      expect(result.hours_until_deadline).toBeLessThan(0);
    });
  });

  describe("soft deadline evaluation", () => {
    test("should ignore soft deadline when not enabled in policy", () => {
      const thread = createThread({
        soft_deadline_event_id: "sd-1",
      });

      const events = new Map([
        ["sd-1", createSoftDeadlineEvent("sd-1", 12)], // 12 hour horizon
      ]);

      const policy = { ...DEFAULT_POLICY, enable_soft_deadline_reminders: false };
      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      // Should not evaluate soft deadline
      expect(result.deadline_type).toBe("none");
    });

    test("should evaluate soft deadline when enabled", () => {
      const thread = createThread({
        soft_deadline_event_id: "sd-1",
      });

      const events = new Map([
        ["sd-1", createSoftDeadlineEvent("sd-1", 12)], // 12 hour horizon
      ]);

      const policy = { ...DEFAULT_POLICY, enable_soft_deadline_reminders: true };
      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      expect(result.deadline_type).toBe("soft");
      expect(result.triggered_by).toBe("deadline");
    });

    test("should prefer hard deadline over soft deadline", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
        soft_deadline_event_id: "sd-1",
      });

      // Hard deadline in 48 hours, soft in 12 hours
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", now + 48 * 60 * 60 * 1000)],
        ["sd-1", createSoftDeadlineEvent("sd-1", 12)],
      ]);

      const policy = { ...DEFAULT_POLICY, enable_soft_deadline_reminders: true };
      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      expect(result.deadline_type).toBe("hard");
    });
  });

  describe("silence threshold evaluation", () => {
    test("should return ok when activity within silence threshold", () => {
      const thread = createThread({
        last_activity_at: now - 24 * 60 * 60 * 1000, // 24 hours ago
      });

      const events = new Map<string, VigilEvent>();

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      // 24 hours < 72 hour threshold
      expect(result.urgency_state).toBe("ok");
      expect(result.deadline_type).toBe("none");
    });

    test("should return warning when silence exceeds threshold", () => {
      const thread = createThread({
        last_activity_at: now - 100 * 60 * 60 * 1000, // 100 hours ago
      });

      const events = new Map<string, VigilEvent>();

      const result = computeUrgencyWithPolicy(thread, events, now, DEFAULT_POLICY);

      // 100 hours > 72 hour threshold
      expect(result.urgency_state).toBe("warning");
      expect(result.triggered_by).toBe("silence");
    });

    test("should respect custom silence threshold", () => {
      const thread = createThread({
        last_activity_at: now - 50 * 60 * 60 * 1000, // 50 hours ago
      });

      const events = new Map<string, VigilEvent>();
      const policy = { ...DEFAULT_POLICY, silence_threshold_hours: 48 };

      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      // 50 hours > 48 hour threshold
      expect(result.urgency_state).toBe("warning");
      expect(result.triggered_by).toBe("silence");
    });
  });

  describe("custom policy thresholds", () => {
    test("should use custom warning threshold", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 36 hours from now
      const deadlineUtc = now + 36 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      // Custom policy with 48 hour warning
      const policy = { ...DEFAULT_POLICY, deadline_warning_hours: 48 };
      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      // 36 < 48, so should be warning
      expect(result.urgency_state).toBe("warning");
    });

    test("should use custom critical threshold", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-1",
      });

      // Deadline 5 hours from now
      const deadlineUtc = now + 5 * 60 * 60 * 1000;
      const events = new Map([
        ["hd-1", createHardDeadlineEvent("hd-1", deadlineUtc)],
      ]);

      // Custom policy with 6 hour critical
      const policy = { ...DEFAULT_POLICY, deadline_critical_hours: 6 };
      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      // 5 < 6, so should be critical
      expect(result.urgency_state).toBe("critical");
    });

    test("should include policy thresholds in result", () => {
      const thread = createThread();
      const events = new Map<string, VigilEvent>();
      const policy = {
        ...DEFAULT_POLICY,
        deadline_warning_hours: 36,
        deadline_critical_hours: 4,
        silence_threshold_hours: 48,
      };

      const result = computeUrgencyWithPolicy(thread, events, now, policy);

      expect(result.policy_thresholds.warning_hours).toBe(36);
      expect(result.policy_thresholds.critical_hours).toBe(4);
      expect(result.policy_thresholds.silence_hours).toBe(48);
    });
  });
});

// ============================================================================
// MR-WatcherRuntime-4: State Transition Detection Tests
// ============================================================================

describe("MR-WatcherRuntime-4: shouldEmitAlert", () => {
  describe("escalation scenarios", () => {
    test("should emit alert for ok → warning", () => {
      expect(shouldEmitAlert("ok", "warning", null)).toBe(true);
    });

    test("should emit alert for warning → critical", () => {
      expect(shouldEmitAlert("warning", "critical", null)).toBe(true);
    });

    test("should emit alert for critical → overdue", () => {
      expect(shouldEmitAlert("critical", "overdue", null)).toBe(true);
    });

    test("should emit alert for ok → overdue (skip levels)", () => {
      expect(shouldEmitAlert("ok", "overdue", null)).toBe(true);
    });
  });

  describe("de-escalation scenarios", () => {
    test("should NOT emit alert for warning → ok", () => {
      expect(shouldEmitAlert("warning", "ok", null)).toBe(false);
    });

    test("should NOT emit alert for critical → warning", () => {
      expect(shouldEmitAlert("critical", "warning", null)).toBe(false);
    });

    test("should NOT emit alert for overdue → ok", () => {
      expect(shouldEmitAlert("overdue", "ok", null)).toBe(false);
    });
  });

  describe("same state scenarios", () => {
    test("should NOT emit alert when state unchanged (ok)", () => {
      expect(shouldEmitAlert("ok", "ok", null)).toBe(false);
    });

    test("should NOT emit alert when state unchanged (warning)", () => {
      expect(shouldEmitAlert("warning", "warning", null)).toBe(false);
    });

    test("should NOT emit alert when state unchanged (critical)", () => {
      expect(shouldEmitAlert("critical", "critical", null)).toBe(false);
    });
  });

  describe("last alert level scenarios", () => {
    test("should NOT emit if already alerted at same level", () => {
      expect(shouldEmitAlert("ok", "warning", "warning")).toBe(false);
    });

    test("should NOT emit if already alerted at higher level", () => {
      expect(shouldEmitAlert("ok", "warning", "critical")).toBe(false);
    });

    test("should emit if escalating past last alert level", () => {
      expect(shouldEmitAlert("warning", "critical", "warning")).toBe(true);
    });

    test("should emit if escalating from ok to critical with warning alert", () => {
      expect(shouldEmitAlert("ok", "critical", "warning")).toBe(true);
    });
  });
});

// ============================================================================
// MR-WatcherRuntime-5: Reminder Generation with Traceability Tests
// ============================================================================

describe("MR-WatcherRuntime-5: generateReminderWithTraceability", () => {
  const now = Date.now();

  describe("hard deadline reminders", () => {
    test("should generate hard_deadline reminder with causal event", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-123",
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: 12,
        hours_since_activity: 2,
        deadline_type: "hard",
        deadline_utc: now + 12 * 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).not.toBeNull();
      expect(reminder!.reminder_type).toBe("hard_deadline");
      expect(reminder!.causal_event_id).toBe("hd-123");
      expect(reminder!.binding).toBe(true);
      expect(reminder!.urgency_level).toBe("warning");
      expect(reminder!.thread_id).toBe("thread-123");
    });
  });

  describe("soft deadline reminders", () => {
    test("should generate soft_deadline reminder when enabled", () => {
      const thread = createThread({
        soft_deadline_event_id: "sd-456",
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: 8,
        hours_since_activity: 2,
        deadline_type: "soft",
        deadline_utc: now + 8 * 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const policy = { ...DEFAULT_POLICY, enable_soft_deadline_reminders: true };
      const reminder = generateReminderWithTraceability(thread, urgencyResult, policy);

      expect(reminder).not.toBeNull();
      expect(reminder!.reminder_type).toBe("soft_deadline");
      expect(reminder!.causal_event_id).toBe("sd-456");
      expect(reminder!.binding).toBe(false);
    });

    test("should NOT generate soft_deadline reminder when disabled", () => {
      const thread = createThread({
        soft_deadline_event_id: "sd-456",
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: 8,
        hours_since_activity: 2,
        deadline_type: "soft",
        deadline_utc: now + 8 * 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const policy = { ...DEFAULT_POLICY, enable_soft_deadline_reminders: false };
      const reminder = generateReminderWithTraceability(thread, urgencyResult, policy);

      expect(reminder).toBeNull();
    });
  });

  describe("silence reminders", () => {
    test("should generate silence reminder with message reference", () => {
      const thread = createThread({
        message_ids: ["msg-1", "msg-2", "msg-3"],
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: null,
        hours_since_activity: 100,
        deadline_type: "none",
        deadline_utc: null,
        triggered_by: "silence",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).not.toBeNull();
      expect(reminder!.reminder_type).toBe("silence");
      expect(reminder!.causal_event_id).toBe("msg-3"); // Last message
      expect(reminder!.binding).toBe(false);
    });
  });

  describe("no reminder scenarios", () => {
    test("should return null for ok urgency state", () => {
      const thread = createThread();

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "ok",
        hours_until_deadline: 48,
        hours_since_activity: 2,
        deadline_type: "hard",
        deadline_utc: now + 48 * 60 * 60 * 1000,
        triggered_by: "none",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).toBeNull();
    });

    test("should return null for closed thread", () => {
      const thread = createThread({
        status: "closed",
        closed_at: now,
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: 12,
        hours_since_activity: 2,
        deadline_type: "hard",
        deadline_utc: now + 12 * 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).toBeNull();
    });

    test("should return null when causal event missing", () => {
      const thread = createThread({
        hard_deadline_event_id: null, // No causal event
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "warning",
        hours_until_deadline: 12,
        hours_since_activity: 2,
        deadline_type: "hard",
        deadline_utc: now + 12 * 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).toBeNull();
    });
  });

  describe("traceability guarantee", () => {
    test("reminder should always have causal_event_id", () => {
      const thread = createThread({
        hard_deadline_event_id: "hd-999",
      });

      const urgencyResult: PolicyAwareUrgencyResult = {
        urgency_state: "critical",
        hours_until_deadline: 1,
        hours_since_activity: 2,
        deadline_type: "hard",
        deadline_utc: now + 60 * 60 * 1000,
        triggered_by: "deadline",
        policy_thresholds: {
          warning_hours: 24,
          critical_hours: 2,
          silence_hours: 72,
        },
      };

      const reminder = generateReminderWithTraceability(
        thread,
        urgencyResult,
        DEFAULT_POLICY
      );

      expect(reminder).not.toBeNull();
      expect(reminder!.causal_event_id).toBeTruthy();
      expect(reminder!.causal_event_id.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// createReminderEvent Tests
// ============================================================================

describe("createReminderEvent", () => {
  test("should create valid REMINDER_GENERATED event", () => {
    const reminderData = {
      reminder_id: "reminder-123",
      thread_id: "thread-456",
      watcher_id: "watcher-789",
      reminder_type: "hard_deadline" as const,
      urgency_level: "warning" as UrgencyLevel,
      causal_event_id: "hd-abc",
      binding: true,
      hours_until_deadline: 12,
      hours_since_activity: 2,
      deadline_utc: Date.now() + 12 * 60 * 60 * 1000,
    };

    const event = createReminderEvent(reminderData, Date.now());

    expect(event.type).toBe("REMINDER_GENERATED");
    expect(event.watcher_id).toBe("watcher-789");
    expect((event as any).reminder_id).toBe("reminder-123");
    expect((event as any).thread_id).toBe("thread-456");
    expect((event as any).causal_event_id).toBe("hd-abc");
    expect((event as any).binding).toBe(true);
    expect(event.event_id).toBeDefined();
  });
});

// ============================================================================
// evaluateAllThreads Integration Tests
// ============================================================================

describe("evaluateAllThreads", () => {
  const now = Date.now();

  test("should skip closed threads", () => {
    const threads = new Map([
      [
        "t1",
        createThread({
          thread_id: "t1",
          status: "closed",
          closed_at: now,
        }),
      ],
    ]);

    const events = new Map<string, VigilEvent>();

    const result = evaluateAllThreads(
      threads,
      events,
      DEFAULT_POLICY,
      now,
      "watcher-123"
    );

    expect(result.reminderEvents).toHaveLength(0);
    expect(result.alertEvents).toHaveLength(0);
  });

  test("should generate alert for thread requiring escalation", () => {
    const threads = new Map([
      [
        "t1",
        createThread({
          thread_id: "t1",
          hard_deadline_event_id: "hd-1",
          last_urgency_state: "ok",
          last_alert_urgency: null,
        }),
      ],
    ]);

    // Deadline in 1 hour (critical)
    const events = new Map([
      ["hd-1", createHardDeadlineEvent("hd-1", now + 60 * 60 * 1000)],
    ]);

    const result = evaluateAllThreads(
      threads,
      events,
      DEFAULT_POLICY,
      now,
      "watcher-123"
    );

    expect(result.reminderEvents).toHaveLength(1);
    expect(result.alertEvents).toHaveLength(1);
    expect((result.alertEvents[0] as any).urgency_state).toBe("critical");
  });

  test("should NOT generate alert when no escalation needed", () => {
    const threads = new Map([
      [
        "t1",
        createThread({
          thread_id: "t1",
          hard_deadline_event_id: "hd-1",
          last_urgency_state: "warning",
          last_alert_urgency: "warning", // Already alerted
        }),
      ],
    ]);

    // Deadline in 12 hours (still warning)
    const events = new Map([
      ["hd-1", createHardDeadlineEvent("hd-1", now + 12 * 60 * 60 * 1000)],
    ]);

    const result = evaluateAllThreads(
      threads,
      events,
      DEFAULT_POLICY,
      now,
      "watcher-123"
    );

    expect(result.reminderEvents).toHaveLength(0);
    expect(result.alertEvents).toHaveLength(0);
  });

  test("should process multiple threads", () => {
    const threads = new Map([
      [
        "t1",
        createThread({
          thread_id: "t1",
          hard_deadline_event_id: "hd-1",
          last_urgency_state: "ok",
        }),
      ],
      [
        "t2",
        createThread({
          thread_id: "t2",
          hard_deadline_event_id: "hd-2",
          last_urgency_state: "ok",
        }),
      ],
    ]);

    // Both in warning range
    const events = new Map([
      ["hd-1", createHardDeadlineEvent("hd-1", now + 12 * 60 * 60 * 1000)],
      ["hd-2", createHardDeadlineEvent("hd-2", now + 18 * 60 * 60 * 1000)],
    ]);

    const result = evaluateAllThreads(
      threads,
      events,
      DEFAULT_POLICY,
      now,
      "watcher-123"
    );

    expect(result.reminderEvents).toHaveLength(2);
    expect(result.alertEvents).toHaveLength(2);
  });

  test("should include notification channels from policy in alert", () => {
    const threads = new Map([
      [
        "t1",
        createThread({
          thread_id: "t1",
          hard_deadline_event_id: "hd-1",
          last_urgency_state: "ok",
        }),
      ],
    ]);

    const events = new Map([
      ["hd-1", createHardDeadlineEvent("hd-1", now + 60 * 60 * 1000)],
    ]);

    const policy = {
      ...DEFAULT_POLICY,
      notification_channels: [
        { type: "email" as const, destination: "test@example.com", enabled: true, urgency_filter: "all" as const },
      ],
    };

    const result = evaluateAllThreads(
      threads,
      events,
      policy,
      now,
      "watcher-123"
    );

    expect(result.alertEvents).toHaveLength(1);
    expect((result.alertEvents[0] as any).channels).toHaveLength(1);
  });
});
