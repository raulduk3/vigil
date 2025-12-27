/**
 * Unit tests for Event Validation
 *
 * Tests per SDD requirements:
 * - FR-16: Deterministic Replay (event ordering)
 * - FR-19: Event Model Traceability
 * - FR-20: One-Way Data Flow Guarantee
 * - MR-EventStore-2: Event ID uniqueness
 */

import { describe, test, expect } from "bun:test";
import {
  getEventTier,
  isValidTierReference,
  validateBaseEvent,
  areEventsChronological,
  findOutOfOrderEvents,
  findDuplicateEventIds,
  extractEventReferences,
  validateEventReferences,
  validateBaselineIsolation,
  validateExtractionEvent,
  validateReminderEvent,
  validateAlertEvent,
} from "@/events/validation";
import type { VigilEvent } from "@/events/types";

describe("getEventTier (FR-20: Event Tier Classification)", () => {
  test("should classify MESSAGE_RECEIVED as baseline", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "MESSAGE_RECEIVED",
      message_id: "m1",
      from: "sender@example.com",
      subject: "Test",
      body_text: "Body",
      received_at: Date.now(),
      headers: {},
    };
    expect(getEventTier(event)).toBe("baseline");
  });

  test("should classify HARD_DEADLINE_OBSERVED as extraction", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "HARD_DEADLINE_OBSERVED",
      message_id: "m1",
      deadline_utc: Date.now() + 86400000,
      deadline_text: "Friday",
      source_span: "by Friday",
      confidence: "high",
      extractor_version: "1.0",
      binding: true,
    };
    expect(getEventTier(event)).toBe("extraction");
  });

  test("should classify THREAD_OPENED as thread", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "THREAD_OPENED",
      thread_id: "t1",
      message_id: "m1",
      opened_at: Date.now(),
    };
    expect(getEventTier(event)).toBe("thread");
  });

  test("should classify REMINDER_GENERATED as reminder", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "r1",
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "c1",
      binding: true,
      generated_at: Date.now(),
    };
    expect(getEventTier(event)).toBe("reminder");
  });

  test("should classify ALERT_QUEUED as alert", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "ALERT_QUEUED",
      thread_id: "t1",
      alert_id: "a1",
      reminder_id: "r1",
      urgency_state: "warning",
      channels: [],
      causal_event_id: "c1",
    };
    expect(getEventTier(event)).toBe("alert");
  });

  test("should classify WATCHER_CREATED as control_plane", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "WATCHER_CREATED",
      account_id: "a1",
      name: "Test",
      ingest_token: "token",
      created_by: "u1",
      created_at: Date.now(),
    };
    expect(getEventTier(event)).toBe("control_plane");
  });

  test("should classify TIME_TICK as scheduling", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "TIME_TICK",
      tick_timestamp: Date.now(),
    };
    expect(getEventTier(event)).toBe("scheduling");
  });
});

describe("isValidTierReference (FR-20: One-Way Data Flow)", () => {
  test("should allow upstream reference from alert to reminder", () => {
    expect(isValidTierReference("alert", "reminder")).toBe(true);
  });

  test("should allow upstream reference from reminder to thread", () => {
    expect(isValidTierReference("reminder", "thread")).toBe(true);
  });

  test("should allow upstream reference from thread to extraction", () => {
    expect(isValidTierReference("thread", "extraction")).toBe(true);
  });

  test("should allow same-tier reference", () => {
    expect(isValidTierReference("extraction", "extraction")).toBe(true);
  });

  test("should reject downstream reference from baseline to extraction", () => {
    expect(isValidTierReference("baseline", "extraction")).toBe(false);
  });

  test("should reject downstream reference from extraction to reminder", () => {
    expect(isValidTierReference("extraction", "reminder")).toBe(false);
  });

  test("should allow scheduling tier to reference any tier", () => {
    expect(isValidTierReference("scheduling", "baseline")).toBe(true);
    expect(isValidTierReference("scheduling", "alert")).toBe(true);
  });
});

describe("validateBaseEvent", () => {
  test("should accept valid base event", () => {
    const event = {
      event_id: "e1",
      timestamp: Date.now(),
      type: "MESSAGE_RECEIVED",
    };
    const result = validateBaseEvent(event);
    expect(result.valid).toBe(true);
  });

  test("should reject event without event_id", () => {
    const event = { timestamp: Date.now(), type: "TEST" };
    const result = validateBaseEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("event_id must be a non-empty string");
  });

  test("should reject event without timestamp", () => {
    const event = { event_id: "e1", type: "TEST" };
    const result = validateBaseEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("timestamp must be a positive number");
  });

  test("should reject event without type", () => {
    const event = { event_id: "e1", timestamp: Date.now() };
    const result = validateBaseEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("type must be a non-empty string");
  });

  test("should reject non-object", () => {
    const result = validateBaseEvent(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Event must be an object");
  });
});

describe("areEventsChronological (FR-16: Deterministic Replay)", () => {
  test("should return true for chronologically ordered events", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 2000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e3", timestamp: 3000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
    ];
    expect(areEventsChronological(events)).toBe(true);
  });

  test("should return false for out-of-order events", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 3000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e3", timestamp: 2000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
    ];
    expect(areEventsChronological(events)).toBe(false);
  });

  test("should return true for empty array", () => {
    expect(areEventsChronological([])).toBe(true);
  });

  test("should return true for single event", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
    ];
    expect(areEventsChronological(events)).toBe(true);
  });

  test("should accept events with same timestamp", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 1000, type: "WATCHER_PAUSED", watcher_id: "w1", paused_by: "u1" },
    ];
    expect(areEventsChronological(events)).toBe(true);
  });
});

describe("findOutOfOrderEvents", () => {
  test("should find all out-of-order events", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 3000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e3", timestamp: 2000, type: "WATCHER_ACTIVATED", watcher_id: "w1" }, // Out of order
      { event_id: "e4", timestamp: 4000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
    ];

    const outOfOrder = findOutOfOrderEvents(events);

    expect(outOfOrder.length).toBe(1);
    expect(outOfOrder[0]?.event.event_id).toBe("e3");
    expect(outOfOrder[0]?.previousTimestamp).toBe(3000);
  });
});

describe("findDuplicateEventIds (MR-EventStore-2)", () => {
  test("should find duplicate event IDs", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 2000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e1", timestamp: 3000, type: "WATCHER_ACTIVATED", watcher_id: "w1" }, // Duplicate
    ];

    const duplicates = findDuplicateEventIds(events);

    expect(duplicates).toContain("e1");
  });

  test("should return empty array for unique IDs", () => {
    const events: VigilEvent[] = [
      { event_id: "e1", timestamp: 1000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
      { event_id: "e2", timestamp: 2000, type: "WATCHER_ACTIVATED", watcher_id: "w1" },
    ];

    const duplicates = findDuplicateEventIds(events);
    expect(duplicates.length).toBe(0);
  });
});

describe("extractEventReferences (FR-19: Traceability)", () => {
  test("should extract causal_event_id", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "r1",
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "causal_123",
      binding: true,
      generated_at: Date.now(),
    };

    const refs = extractEventReferences(event);
    expect(refs).toContain("causal_123");
  });

  test("should extract reminder_id from ALERT_QUEUED", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "ALERT_QUEUED",
      thread_id: "t1",
      alert_id: "a1",
      reminder_id: "reminder_456",
      urgency_state: "warning",
      channels: [],
      causal_event_id: "causal_123",
    };

    const refs = extractEventReferences(event);
    expect(refs).toContain("reminder_456");
    expect(refs).toContain("causal_123");
  });

  test("should return empty array for event without references", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "WATCHER_ACTIVATED",
    };

    const refs = extractEventReferences(event);
    expect(refs.length).toBe(0);
  });
});

describe("validateEventReferences (FR-19: No Orphaned References)", () => {
  test("should validate all references exist", () => {
    const events: VigilEvent[] = [
      {
        event_id: "msg_1",
        timestamp: 1000,
        watcher_id: "w1",
        type: "MESSAGE_RECEIVED",
        message_id: "m1",
        from: "test@example.com",
        subject: "Test",
        body_text: "Body",
        received_at: 1000,
        headers: {},
      },
      {
        event_id: "reminder_1",
        timestamp: 2000,
        watcher_id: "w1",
        type: "REMINDER_GENERATED",
        thread_id: "t1",
        reminder_id: "r1",
        reminder_type: "hard_deadline",
        urgency_level: "warning",
        causal_event_id: "msg_1", // Valid reference
        binding: true,
        generated_at: 2000,
      },
    ];

    const result = validateEventReferences(events);
    expect(result.valid).toBe(true);
    expect(result.orphanedReferences.length).toBe(0);
  });

  test("should detect orphaned references", () => {
    const events: VigilEvent[] = [
      {
        event_id: "reminder_1",
        timestamp: 2000,
        watcher_id: "w1",
        type: "REMINDER_GENERATED",
        thread_id: "t1",
        reminder_id: "r1",
        reminder_type: "hard_deadline",
        urgency_level: "warning",
        causal_event_id: "nonexistent_event", // Orphaned!
        binding: true,
        generated_at: 2000,
      },
    ];

    const result = validateEventReferences(events);
    expect(result.valid).toBe(false);
    expect(result.orphanedReferences.length).toBe(1);
    expect(result.orphanedReferences[0]?.reference).toBe("nonexistent_event");
  });
});

describe("validateBaselineIsolation (FR-20)", () => {
  test("should accept baseline event without references", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "MESSAGE_RECEIVED",
      message_id: "m1",
      from: "test@example.com",
      subject: "Test",
      body_text: "Body",
      received_at: Date.now(),
      headers: {},
    };

    const result = validateBaselineIsolation(event);
    expect(result.valid).toBe(true);
  });

  test("should skip validation for non-baseline events", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "r1",
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "causal_123",
      binding: true,
      generated_at: Date.now(),
    };

    const result = validateBaselineIsolation(event);
    expect(result.valid).toBe(true); // Not a baseline event, so passes
  });
});

describe("validateExtractionEvent", () => {
  test("should accept valid HARD_DEADLINE_OBSERVED", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "HARD_DEADLINE_OBSERVED",
      message_id: "m1",
      deadline_utc: Date.now() + 86400000,
      deadline_text: "Friday",
      source_span: "by Friday",
      confidence: "high",
      extractor_version: "1.0",
      binding: true,
    };

    const result = validateExtractionEvent(event);
    expect(result.valid).toBe(true);
  });

  test("should reject HARD_DEADLINE_OBSERVED without message_id", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "HARD_DEADLINE_OBSERVED",
      message_id: "", // Empty!
      deadline_utc: Date.now() + 86400000,
      deadline_text: "Friday",
      source_span: "by Friday",
      confidence: "high",
      extractor_version: "1.0",
      binding: true,
    };

    const result = validateExtractionEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("HARD_DEADLINE_OBSERVED must have message_id");
  });

  test("should reject HARD_DEADLINE_OBSERVED with binding=false", () => {
    const event = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "HARD_DEADLINE_OBSERVED",
      message_id: "m1",
      deadline_utc: Date.now() + 86400000,
      deadline_text: "Friday",
      source_span: "by Friday",
      confidence: "high",
      extractor_version: "1.0",
      binding: false, // Should be true!
    } as VigilEvent;

    const result = validateExtractionEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("HARD_DEADLINE_OBSERVED must have binding = true");
  });

  test("should accept valid SOFT_DEADLINE_SIGNAL_OBSERVED", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "SOFT_DEADLINE_SIGNAL_OBSERVED",
      message_id: "m1",
      signal_text: "next week",
      source_span: "next week",
      estimated_horizon_hours: 168,
      confidence: "medium",
      extractor_version: "1.0",
      binding: false,
    };

    const result = validateExtractionEvent(event);
    expect(result.valid).toBe(true);
  });
});

describe("validateReminderEvent", () => {
  test("should accept valid REMINDER_GENERATED", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "r1",
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "c1",
      binding: true,
      generated_at: Date.now(),
    };

    const result = validateReminderEvent(event);
    expect(result.valid).toBe(true);
  });

  test("should reject REMINDER_GENERATED without causal_event_id", () => {
    const event = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "r1",
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "", // Empty!
      binding: true,
      generated_at: Date.now(),
    } as VigilEvent;

    const result = validateReminderEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("REMINDER_GENERATED must have causal_event_id");
  });
});

describe("validateAlertEvent", () => {
  test("should accept valid ALERT_QUEUED", () => {
    const event: VigilEvent = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "ALERT_QUEUED",
      thread_id: "t1",
      alert_id: "a1",
      reminder_id: "r1",
      urgency_state: "warning",
      channels: [],
      causal_event_id: "c1",
    };

    const result = validateAlertEvent(event);
    expect(result.valid).toBe(true);
  });

  test("should reject ALERT_QUEUED without reminder_id", () => {
    const event = {
      event_id: "e1",
      timestamp: Date.now(),
      watcher_id: "w1",
      type: "ALERT_QUEUED",
      thread_id: "t1",
      alert_id: "a1",
      reminder_id: "", // Empty!
      urgency_state: "warning",
      channels: [],
      causal_event_id: "c1",
    } as VigilEvent;

    const result = validateAlertEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ALERT_QUEUED must have reminder_id");
  });
});

describe("Event Validation Performance", () => {
  test("should validate 10,000 events in < 200ms", () => {
    const events: VigilEvent[] = Array.from({ length: 10000 }, (_, i) => ({
      event_id: `e${i}`,
      timestamp: 1000 + i,
      watcher_id: "w1",
      type: "WATCHER_ACTIVATED",
    })) as VigilEvent[];

    const start = performance.now();
    areEventsChronological(events);
    findDuplicateEventIds(events);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(200);
  });
});
