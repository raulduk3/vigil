/**
 * Unit tests for Traceability Chain
 *
 * Tests per SDD requirements:
 * - FR-19: Event Model Traceability
 * - Complete audit trail: email → extraction → thread → reminder → alert
 */

import { describe, test, expect } from "bun:test";
import {
  traceAlertToMessage,
  validateTraceChain,
  findAlertsForMessage,
  buildDependencyGraph,
  hasCycles,
  buildEventMap,
} from "@/events/traceability";
import type { VigilEvent } from "@/events/types";

// Helper to create a complete event chain for testing
function createEventChain(): VigilEvent[] {
  const now = Date.now();
  return [
    // 1. Message received
    {
      event_id: "msg_001",
      timestamp: now,
      watcher_id: "w1",
      type: "MESSAGE_RECEIVED",
      message_id: "email_abc",
      sender: "sender@example.com",
      recipients: ["me@example.com"],
      subject: "Invoice due Friday",
      normalized_subject: "Invoice due Friday",
      sent_at: now,
      ingested_at: now,
      body_text_extract: "Please pay by Friday...",
      raw_body_stored: false,
      headers: {},
    },
    // 2. Hard deadline extracted
    {
      event_id: "deadline_001",
      timestamp: now + 100,
      watcher_id: "w1",
      type: "HARD_DEADLINE_OBSERVED",
      message_id: "email_abc",
      deadline_utc: now + 86400000 * 2, // 2 days
      deadline_text: "Friday December 27th",
      source_span: "by Friday December 27th",
      confidence: "high",
      extractor_version: "1.0",
      binding: true,
    },
    // 3. Thread opened
    {
      event_id: "thread_001",
      timestamp: now + 200,
      watcher_id: "w1",
      type: "THREAD_OPENED",
      thread_id: "t1",
      message_id: "email_abc",
      opened_at: now + 200,
    },
    // 4. Reminder generated
    {
      event_id: "reminder_001",
      timestamp: now + 300,
      watcher_id: "w1",
      type: "REMINDER_GENERATED",
      thread_id: "t1",
      reminder_id: "reminder_001", // Same as event_id for simplicity
      reminder_type: "hard_deadline",
      urgency_level: "warning",
      causal_event_id: "deadline_001",
      binding: true,
      generated_at: now + 300,
    },
    // 5. Alert queued
    {
      event_id: "alert_evt_001",
      timestamp: now + 400,
      watcher_id: "w1",
      type: "ALERT_QUEUED",
      thread_id: "t1",
      alert_id: "alert_001",
      reminder_id: "reminder_001",
      urgency_state: "warning",
      channels: [],
      causal_event_id: "reminder_001",
    },
  ] as VigilEvent[];
}

describe("traceAlertToMessage (FR-19: Complete Audit Trail)", () => {
  test("should trace alert back to original message", () => {
    const events = createEventChain();
    const result = traceAlertToMessage("alert_001", events);

    expect(result.success).toBe(true);
    expect(result.chain.length).toBeGreaterThanOrEqual(3);

    // Verify chain order
    expect(result.chain[0]?.event_type).toBe("ALERT_QUEUED");
    expect(result.chain[1]?.event_type).toBe("REMINDER_GENERATED");
    expect(result.chain[2]?.event_type).toBe("HARD_DEADLINE_OBSERVED");
    expect(result.chain[3]?.event_type).toBe("MESSAGE_RECEIVED");
  });

  test("should return error for non-existent alert", () => {
    const events = createEventChain();
    const result = traceAlertToMessage("nonexistent", events);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("should return error for broken reference chain", () => {
    const events: VigilEvent[] = [
      {
        event_id: "alert_evt_001",
        timestamp: Date.now(),
        watcher_id: "w1",
        type: "ALERT_QUEUED",
        thread_id: "t1",
        alert_id: "alert_001",
        reminder_id: "nonexistent_reminder", // Broken reference
        urgency_state: "warning",
        channels: [],
        causal_event_id: "c1",
      },
    ];

    const result = traceAlertToMessage("alert_001", events);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Reminder");
  });

  test("should include helpful descriptions in chain", () => {
    const events = createEventChain();
    const result = traceAlertToMessage("alert_001", events);

    expect(result.success).toBe(true);
    expect(result.chain[0]?.description).toContain("warning");
    expect(result.chain[2]?.description).toContain("Hard deadline");
    expect(result.chain[3]?.description).toContain("sender@example.com");
  });
});

describe("validateTraceChain (FR-19)", () => {
  test("should validate complete chain", () => {
    const events = createEventChain();
    const traceResult = traceAlertToMessage("alert_001", events);
    const validation = validateTraceChain(traceResult.chain);

    expect(validation.valid).toBe(true);
    expect(validation.missingSteps.length).toBe(0);
  });

  test("should detect missing ALERT_QUEUED", () => {
    const chain = [
      { event_id: "r1", event_type: "REMINDER_GENERATED" as const, timestamp: 1000, description: "" },
    ];
    const validation = validateTraceChain(chain);

    expect(validation.valid).toBe(false);
    expect(validation.missingSteps).toContain("ALERT_QUEUED");
  });

  test("should detect missing REMINDER_GENERATED", () => {
    const chain = [
      { event_id: "a1", event_type: "ALERT_QUEUED" as const, timestamp: 1000, description: "" },
      { event_id: "d1", event_type: "HARD_DEADLINE_OBSERVED" as const, timestamp: 900, description: "" },
    ];
    const validation = validateTraceChain(chain);

    expect(validation.valid).toBe(false);
    expect(validation.missingSteps).toContain("REMINDER_GENERATED");
  });

  test("should detect missing causal event", () => {
    const chain = [
      { event_id: "a1", event_type: "ALERT_QUEUED" as const, timestamp: 1000, description: "" },
      { event_id: "r1", event_type: "REMINDER_GENERATED" as const, timestamp: 900, description: "" },
    ];
    const validation = validateTraceChain(chain);

    expect(validation.valid).toBe(false);
    expect(validation.missingSteps).toContain("Causal event (extraction or thread)");
  });
});

describe("findAlertsForMessage", () => {
  test("should find all alerts triggered by a message", () => {
    const events = createEventChain();
    const alerts = findAlertsForMessage("email_abc", events);

    expect(alerts.length).toBe(1);
    expect(alerts[0]?.alert_id).toBe("alert_001");
  });

  test("should return empty array for message with no alerts", () => {
    const events = createEventChain();
    const alerts = findAlertsForMessage("nonexistent_message", events);

    expect(alerts.length).toBe(0);
  });

  test("should find multiple alerts for same message", () => {
    const now = Date.now();
    const events: VigilEvent[] = [
      {
        event_id: "msg_001",
        timestamp: now,
        watcher_id: "w1",
        type: "MESSAGE_RECEIVED",
        message_id: "email_multi",
        from: "sender@example.com",
        subject: "Multiple deadlines",
        body_text: "First deadline Friday, second deadline Monday",
        received_at: now,
        headers: {},
      },
      {
        event_id: "deadline_001",
        timestamp: now + 100,
        watcher_id: "w1",
        type: "HARD_DEADLINE_OBSERVED",
        message_id: "email_multi",
        deadline_utc: now + 86400000,
        deadline_text: "Friday",
        source_span: "Friday",
        confidence: "high",
        extractor_version: "1.0",
        binding: true,
      },
      {
        event_id: "reminder_001",
        timestamp: now + 200,
        watcher_id: "w1",
        type: "REMINDER_GENERATED",
        thread_id: "t1",
        reminder_id: "reminder_001",
        reminder_type: "hard_deadline",
        urgency_level: "warning",
        causal_event_id: "deadline_001",
        binding: true,
        generated_at: now + 200,
      },
      {
        event_id: "reminder_002",
        timestamp: now + 300,
        watcher_id: "w1",
        type: "REMINDER_GENERATED",
        thread_id: "t1",
        reminder_id: "reminder_002",
        reminder_type: "hard_deadline",
        urgency_level: "critical",
        causal_event_id: "deadline_001",
        binding: true,
        generated_at: now + 300,
      },
      {
        event_id: "alert_evt_001",
        timestamp: now + 400,
        watcher_id: "w1",
        type: "ALERT_QUEUED",
        thread_id: "t1",
        alert_id: "alert_001",
        reminder_id: "reminder_001",
        urgency_state: "warning",
        channels: [],
        causal_event_id: "reminder_001",
      },
      {
        event_id: "alert_evt_002",
        timestamp: now + 500,
        watcher_id: "w1",
        type: "ALERT_QUEUED",
        thread_id: "t1",
        alert_id: "alert_002",
        reminder_id: "reminder_002",
        urgency_state: "critical",
        channels: [],
        causal_event_id: "reminder_002",
      },
    ] as VigilEvent[];

    const alerts = findAlertsForMessage("email_multi", events);
    expect(alerts.length).toBe(2);
  });
});

describe("buildDependencyGraph (FR-20: One-Way Flow)", () => {
  test("should build correct dependency graph", () => {
    const events = createEventChain();
    const graph = buildDependencyGraph(events);

    // Alert should depend on reminder
    const alertDeps = graph.get("alert_evt_001");
    expect(alertDeps).toContain("reminder_001");

    // Reminder should depend on deadline
    const reminderDeps = graph.get("reminder_001");
    expect(reminderDeps).toContain("deadline_001");

    // Message should have no dependencies
    const msgDeps = graph.get("msg_001");
    expect(msgDeps).toEqual([]);
  });
});

describe("hasCycles (FR-20: No Bidirectional References)", () => {
  test("should return false for DAG (no cycles)", () => {
    const events = createEventChain();
    const graph = buildDependencyGraph(events);
    const result = hasCycles(graph);

    expect(result.hasCycle).toBe(false);
  });

  test("should detect cycle in graph", () => {
    // Create a graph with a cycle: A -> B -> C -> A
    const graph = new Map<string, string[]>([
      ["A", ["B"]],
      ["B", ["C"]],
      ["C", ["A"]], // Creates cycle
    ]);

    const result = hasCycles(graph);

    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodes).toBeDefined();
  });

  test("should handle empty graph", () => {
    const graph = new Map<string, string[]>();
    const result = hasCycles(graph);

    expect(result.hasCycle).toBe(false);
  });

  test("should handle self-referencing node", () => {
    const graph = new Map<string, string[]>([["A", ["A"]]]);
    const result = hasCycles(graph);

    expect(result.hasCycle).toBe(true);
  });
});

describe("buildEventMap", () => {
  test("should build efficient lookup map", () => {
    const events = createEventChain();
    const map = buildEventMap(events);

    expect(map.size).toBe(events.length);
    expect(map.get("msg_001")).toBeDefined();
    expect(map.get("msg_001")?.type).toBe("MESSAGE_RECEIVED");
  });
});

describe("Traceability Performance (FR-19)", () => {
  test("should trace 100 alerts in < 500ms", () => {
    // Create a larger event set
    const baseEvents = createEventChain();
    const allEvents: VigilEvent[] = [];

    // Create 100 independent alert chains
    for (let i = 0; i < 100; i++) {
      const offset = i * 1000;
      allEvents.push(
        ...baseEvents.map((e) => ({
          ...e,
          event_id: `${e.event_id}_${i}`,
          timestamp: e.timestamp + offset,
          ...(e.type === "ALERT_QUEUED" ? { alert_id: `alert_${i}` } : {}),
          ...("reminder_id" in e ? { reminder_id: `reminder_001_${i}` } : {}),
          ...("causal_event_id" in e
            ? {
                causal_event_id:
                  e.type === "ALERT_QUEUED"
                    ? `reminder_001_${i}`
                    : e.type === "REMINDER_GENERATED"
                      ? `deadline_001_${i}`
                      : (e as any).causal_event_id,
              }
            : {}),
        }))
      );
    }

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      traceAlertToMessage(`alert_${i}`, allEvents as VigilEvent[]);
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });

  test("should validate 10,000 events for cycles in < 200ms", () => {
    // Create a large DAG
    const graph = new Map<string, string[]>();
    for (let i = 0; i < 10000; i++) {
      // Each event depends on previous (no cycles)
      graph.set(`e${i}`, i > 0 ? [`e${i - 1}`] : []);
    }

    const start = performance.now();
    hasCycles(graph);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(200);
  });
});

describe("Multi-hop Trace (FR-19)", () => {
  test("should trace complete chain: ALERT → REMINDER → EXTRACTION → MESSAGE", () => {
    const events = createEventChain();
    const result = traceAlertToMessage("alert_001", events);

    expect(result.success).toBe(true);

    // Verify we have 4 steps in the chain
    expect(result.chain.length).toBe(4);

    // Verify each step type in order
    const types = result.chain.map((s) => s.event_type);
    expect(types).toEqual([
      "ALERT_QUEUED",
      "REMINDER_GENERATED",
      "HARD_DEADLINE_OBSERVED",
      "MESSAGE_RECEIVED",
    ]);
  });
});
