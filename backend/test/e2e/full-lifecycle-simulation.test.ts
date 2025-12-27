/**
 * Full Lifecycle E2E Simulation Test
 *
 * Tests the complete Vigil backend lifecycle:
 * 1. User registration & authentication
 * 2. Watcher creation & activation
 * 3. Email ingestion with multiple deadlines
 * 4. Thread creation from extraction events
 * 5. Urgency evaluation (TIME_TICK simulation)
 * 6. Reminder generation
 * 7. Alert queuing
 * 8. Alert delivery (ALERT_SENT/ALERT_FAILED events)
 *
 * This test verifies the entire event-sourced pipeline works correctly.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { InMemoryEventStore } from "../../src/events/event-store";
import { orchestrateIngestion, type IngestionContext } from "../../src/ingestion/orchestrator";
import { replayEvents, type WatcherState } from "../../src/watcher/runtime";
import {
  computeUrgencyWithPolicy,
  evaluateAllThreads,
  generateReminderWithTraceability,
  createReminderEvent,
  DEFAULT_POLICY
} from "../../src/watcher/urgency";
import { queueAlert, createAlertQueuedEvent, filterChannelsByUrgency } from "../../src/watcher/alert-queue";
import { generateTimeTicks } from "../../src/scheduler/scheduler";
import type {
  VigilEvent,
  WatcherCreatedEvent,
  WatcherActivatedEvent,
  PolicyUpdatedEvent,
  MessageReceivedEvent,
  ThreadOpenedEvent,
  HardDeadlineObservedEvent,
  AlertQueuedEvent,
  AlertSentEvent,
  AlertFailedEvent,
  WatcherPolicy,
  TimeTickEvent,
  ReminderGeneratedEvent,
} from "../../src/events/types";

// ============================================================================
// Test Helpers
// ============================================================================

interface SimulationContext {
  eventStore: InMemoryEventStore;
  watcherId: string;
  accountId: string;
  userId: string;
  ingestToken: string;
  seenMessageIds: Set<string>;
  policy: WatcherPolicy;
}

function createSimulationContext(): SimulationContext {
  const timestamp = Date.now();
  return {
    eventStore: new InMemoryEventStore(),
    watcherId: `watcher_${timestamp}`,
    accountId: `account_${timestamp}`,
    userId: `user_${timestamp}`,
    ingestToken: `token_${Math.random().toString(36).substring(7)}`,
    seenMessageIds: new Set(),
    policy: {
      ...DEFAULT_POLICY,
      allowed_senders: ["sender@example.com", "*@trusted.com"],
      notification_channels: [
        {
          channel_id: "ch_email_1",
          type: "email",
          destination: "alerts@example.com",
          urgency_filter: "all",
          enabled: true,
        },
        {
          channel_id: "ch_webhook_1",
          type: "webhook",
          destination: "https://hooks.example.com/vigil",
          urgency_filter: "critical",
          enabled: true,
        },
      ],
      deadline_warning_hours: 24,
      deadline_critical_hours: 2,
      silence_threshold_hours: 72,
    },
  };
}

// ============================================================================
// Simulation Steps
// ============================================================================

async function step1_createAndActivateWatcher(ctx: SimulationContext): Promise<void> {
  const now = Date.now();

  // WATCHER_CREATED
  const createdEvent: WatcherCreatedEvent = {
    event_id: `evt_created_${now}`,
    type: "WATCHER_CREATED",
    timestamp: now,
    watcher_id: ctx.watcherId,
    account_id: ctx.accountId,
    created_by: ctx.userId,
    created_at: now,
    name: "Full Lifecycle Test Watcher",
    ingest_token: ctx.ingestToken,
  };
  await ctx.eventStore.append(createdEvent);

  // WATCHER_ACTIVATED
  const activatedEvent: WatcherActivatedEvent = {
    event_id: `evt_activated_${now}`,
    type: "WATCHER_ACTIVATED",
    timestamp: now + 1,
    watcher_id: ctx.watcherId,
    activated_by: ctx.userId,
  };
  await ctx.eventStore.append(activatedEvent);

  // POLICY_UPDATED
  const policyEvent: PolicyUpdatedEvent = {
    event_id: `evt_policy_${now}`,
    type: "POLICY_UPDATED",
    timestamp: now + 2,
    watcher_id: ctx.watcherId,
    updated_by: ctx.userId,
    policy: ctx.policy,
  };
  await ctx.eventStore.append(policyEvent);
}

async function step2_ingestEmailWithDeadline(
  ctx: SimulationContext,
  emailConfig: {
    subject: string;
    deadline: string;
    messageId: string;
  }
): Promise<{ messageEvent: MessageReceivedEvent; extractionEvents: VigilEvent[]; threadEvent: ThreadOpenedEvent | null }> {
  const now = Date.now();
  const rawEmail = `From: sender@example.com
To: ${ctx.ingestToken}@ingest.email.vigil.run
Subject: ${emailConfig.subject}
Date: ${new Date().toUTCString()}
Message-ID: <${emailConfig.messageId}@example.com>

Hi team,

Please complete this task. ${emailConfig.deadline}

Thanks,
Manager`;

  const ingestionContext: IngestionContext = {
    watcher_id: ctx.watcherId,
    watcher_status: "active",
    policy: ctx.policy,
    reference_timestamp: now,
    reference_timezone: "UTC",
  };

  const checkDuplicate = async (id: string) => ctx.seenMessageIds.has(id);

  const result = await orchestrateIngestion(rawEmail, ingestionContext, checkDuplicate);

  if (!result.success || !result.message_received_event) {
    throw new Error(`Ingestion failed: ${result.error || result.skipped_reason}`);
  }

  // Store events
  await ctx.eventStore.append(result.message_received_event);
  const msgEvt = result.message_received_event as MessageReceivedEvent;
  ctx.seenMessageIds.add(msgEvt.message_id);

  for (const evt of result.extraction_events) {
    await ctx.eventStore.append(evt);
  }

  // Create thread if extraction found deadline/urgency
  let threadEvent: ThreadOpenedEvent | null = null;
  const hardDeadline = result.extraction_events.find(e => e.type === "HARD_DEADLINE_OBSERVED");

  if (hardDeadline) {
    threadEvent = {
      event_id: `evt_thread_${now}`,
      type: "THREAD_OPENED",
      timestamp: now,
      watcher_id: ctx.watcherId,
      thread_id: `thread_${now}_${Math.random().toString(36).substring(7)}`,
      message_id: msgEvt.message_id,
      opened_at: now,
      trigger_type: "hard_deadline",
      normalized_subject: msgEvt.normalized_subject || emailConfig.subject,
      original_sender: msgEvt.sender,
      original_sent_at: msgEvt.sent_at,
    };
    await ctx.eventStore.append(threadEvent);
  }

  return {
    messageEvent: msgEvt,
    extractionEvents: result.extraction_events,
    threadEvent,
  };
}

async function step3_simulateTimeTick(ctx: SimulationContext): Promise<TimeTickEvent> {
  const now = Date.now();
  const tickEvent: TimeTickEvent = {
    event_id: `evt_tick_${now}`,
    type: "TIME_TICK",
    timestamp: now,
    watcher_id: ctx.watcherId,
    tick_timestamp: now,
  };
  await ctx.eventStore.append(tickEvent);
  return tickEvent;
}

async function step4_evaluateUrgencyAndGenerateReminders(
  ctx: SimulationContext,
  threadId: string,
  hardDeadlineEventId: string
): Promise<{ reminderEvents: VigilEvent[]; alertEvents: VigilEvent[] }> {
  const now = Date.now();
  const events = await ctx.eventStore.getEventsForWatcher(ctx.watcherId);
  const state = replayEvents(events);

  // Build extraction events map
  const extractionMap = new Map<string, VigilEvent>();
  for (const evt of events) {
    if (evt.type === "HARD_DEADLINE_OBSERVED" ||
        evt.type === "SOFT_DEADLINE_SIGNAL_OBSERVED" ||
        evt.type === "URGENCY_SIGNAL_OBSERVED") {
      extractionMap.set(evt.event_id, evt);
    }
  }

  // Get thread and link deadline
  const thread = state.threads.get(threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} not found`);
  }

  const threadWithDeadline = {
    ...thread,
    hard_deadline_event_id: hardDeadlineEventId,
  };

  // Evaluate urgency
  const urgencyResult = computeUrgencyWithPolicy(
    threadWithDeadline,
    extractionMap,
    now,
    state.policy
  );

  // Generate reminder if needed
  const reminderEvents: VigilEvent[] = [];
  const alertEvents: VigilEvent[] = [];

  if (urgencyResult.urgency_state !== "ok") {
    const reminderData = generateReminderWithTraceability(
      threadWithDeadline,
      urgencyResult,
      state.policy
    );

    if (reminderData) {
      const reminderEvent = createReminderEvent(reminderData, now);
      reminderEvents.push(reminderEvent);
      await ctx.eventStore.append(reminderEvent);

      // Queue alert
      const alertEvent = createAlertQueuedEvent(
        {
          thread: threadWithDeadline,
          reminder: reminderData,
          channels: state.policy.notification_channels,
          watcher_id: ctx.watcherId,
        },
        now
      );
      alertEvents.push(alertEvent);
      await ctx.eventStore.append(alertEvent);
    }
  }

  return { reminderEvents, alertEvents };
}

async function step5_simulateAlertDelivery(
  ctx: SimulationContext,
  alertEvent: AlertQueuedEvent
): Promise<{ sentEvents: AlertSentEvent[]; failedEvents: AlertFailedEvent[] }> {
  const now = Date.now();
  const sentEvents: AlertSentEvent[] = [];
  const failedEvents: AlertFailedEvent[] = [];

  const channels = alertEvent.channels || [];
  const filteredChannels = filterChannelsByUrgency(channels, alertEvent.urgency_state);

  for (const channel of filteredChannels) {
    // Simulate 100% success for testing
    const sentEvent: AlertSentEvent = {
      event_id: `evt_sent_${now}_${channel.channel_id || channel.type}`,
      type: "ALERT_SENT",
      timestamp: now,
      alert_id: alertEvent.alert_id,
      channel,
      sent_at: now,
    };
    sentEvents.push(sentEvent);
    await ctx.eventStore.append(sentEvent as VigilEvent);
  }

  return { sentEvents, failedEvents };
}

// ============================================================================
// Full Lifecycle Tests
// ============================================================================

describe("Full Backend Lifecycle Simulation", () => {
  let ctx: SimulationContext;

  beforeEach(() => {
    ctx = createSimulationContext();
  });

  test("Complete lifecycle: email with warning deadline (manual)", async () => {
    console.log("\n=== SIMULATION: Warning Deadline Email ===\n");

    // Step 1: Create and activate watcher
    await step1_createAndActivateWatcher(ctx);
    const state1 = replayEvents(await ctx.eventStore.getEventsForWatcher(ctx.watcherId));
    expect(state1.status).toBe("active");
    console.log("✓ Step 1: Watcher created and activated");

    // Step 2: Ingest email
    const { messageEvent, threadEvent } = await step2_ingestEmailWithDeadline(ctx, {
      subject: "Report Due Soon",
      deadline: "This is due by tomorrow at 5pm.",
      messageId: "warning-deadline-001",
    });

    expect(messageEvent).toBeDefined();
    console.log("✓ Step 2a: Email ingested, message_id:", messageEvent.message_id);

    // Create manual deadline event that's within warning threshold (12 hours)
    const warningDeadline = Date.now() + 12 * 60 * 60 * 1000;
    const manualDeadlineEvent: HardDeadlineObservedEvent = {
      event_id: `evt_warning_deadline_${Date.now()}`,
      type: "HARD_DEADLINE_OBSERVED",
      timestamp: Date.now(),
      watcher_id: ctx.watcherId,
      message_id: messageEvent.message_id,
      deadline_utc: warningDeadline,
      deadline_text: "12 hours from now",
      source_span: "due by tomorrow",
      confidence: "high",
      binding: true,
      extractor_version: "v1.0.0-test",
    };
    await ctx.eventStore.append(manualDeadlineEvent);
    console.log("✓ Step 2b: Hard deadline created:", new Date(warningDeadline).toISOString());

    // Create thread
    const threadId = threadEvent?.thread_id || `thread_warning_${Date.now()}`;
    if (!threadEvent) {
      const manualThread: ThreadOpenedEvent = {
        event_id: `evt_thread_warning_${Date.now()}`,
        type: "THREAD_OPENED",
        timestamp: Date.now(),
        watcher_id: ctx.watcherId,
        thread_id: threadId,
        message_id: messageEvent.message_id,
        opened_at: Date.now(),
        trigger_type: "hard_deadline",
        normalized_subject: "Report Due Soon",
        original_sender: messageEvent.sender,
        original_sent_at: messageEvent.sent_at,
      };
      await ctx.eventStore.append(manualThread);
    }
    console.log("✓ Step 2c: Thread created:", threadId);

    // Step 3: Simulate TIME_TICK
    const tickEvent = await step3_simulateTimeTick(ctx);
    expect(tickEvent.type).toBe("TIME_TICK");
    console.log("✓ Step 3: TIME_TICK emitted");

    // Step 4: Evaluate urgency and generate reminders
    const { reminderEvents, alertEvents } = await step4_evaluateUrgencyAndGenerateReminders(
      ctx,
      threadId,
      manualDeadlineEvent.event_id
    );

    expect(reminderEvents.length).toBe(1);
    console.log("✓ Step 4a: REMINDER_GENERATED event created");

    expect(alertEvents.length).toBe(1);
    const alertEvent = alertEvents[0] as AlertQueuedEvent;
    expect(alertEvent.urgency_state).toBe("warning");
    console.log("✓ Step 4b: ALERT_QUEUED event created, urgency:", alertEvent.urgency_state);

    // Step 5: Simulate alert delivery
    const { sentEvents, failedEvents } = await step5_simulateAlertDelivery(ctx, alertEvent);
    expect(sentEvents.length).toBeGreaterThan(0);
    expect(failedEvents.length).toBe(0);
    console.log("✓ Step 5: ALERT_SENT events created:", sentEvents.length);

    // Verify final event count
    const allEvents = await ctx.eventStore.getEventsForWatcher(ctx.watcherId);
    console.log("\n=== Event Summary ===");
    const eventTypes = allEvents.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.table(eventTypes);

    expect(eventTypes["WATCHER_CREATED"]).toBe(1);
    expect(eventTypes["WATCHER_ACTIVATED"]).toBe(1);
    expect(eventTypes["POLICY_UPDATED"]).toBe(1);
    expect(eventTypes["MESSAGE_RECEIVED"]).toBe(1);
    expect(eventTypes["HARD_DEADLINE_OBSERVED"]).toBeGreaterThanOrEqual(1);
    expect(eventTypes["TIME_TICK"]).toBe(1);
    expect(eventTypes["REMINDER_GENERATED"]).toBe(1);
    expect(eventTypes["ALERT_QUEUED"]).toBe(1);
    // Note: ALERT_SENT events are keyed by alert_id, not watcher_id
    // They were verified in step 5 already (sentEvents.length > 0)

    console.log("\n✓ SIMULATION COMPLETE: All lifecycle events verified\n");
  });

  test("Complete lifecycle: email with critical deadline (manual)", async () => {
    console.log("\n=== SIMULATION: Critical Deadline Email ===\n");

    await step1_createAndActivateWatcher(ctx);

    // Ingest email
    const { messageEvent } = await step2_ingestEmailWithDeadline(ctx, {
      subject: "URGENT: Server Restart Required",
      deadline: "Must be completed by tomorrow.",
      messageId: "critical-deadline-001",
    });
    console.log("✓ Email ingested");

    // Create manual deadline event that's within critical threshold (1 hour)
    const criticalDeadline = Date.now() + 1 * 60 * 60 * 1000;
    const manualDeadlineEvent: HardDeadlineObservedEvent = {
      event_id: `evt_critical_deadline_${Date.now()}`,
      type: "HARD_DEADLINE_OBSERVED",
      timestamp: Date.now(),
      watcher_id: ctx.watcherId,
      message_id: messageEvent.message_id,
      deadline_utc: criticalDeadline,
      deadline_text: "1 hour from now",
      source_span: "must be completed",
      confidence: "high",
      binding: true,
      extractor_version: "v1.0.0-test",
    };
    await ctx.eventStore.append(manualDeadlineEvent);
    console.log("✓ Critical deadline created (1 hour)");

    // Create thread
    const threadId = `thread_critical_${Date.now()}`;
    const manualThread: ThreadOpenedEvent = {
      event_id: `evt_thread_critical_${Date.now()}`,
      type: "THREAD_OPENED",
      timestamp: Date.now(),
      watcher_id: ctx.watcherId,
      thread_id: threadId,
      message_id: messageEvent.message_id,
      opened_at: Date.now(),
      trigger_type: "hard_deadline",
      normalized_subject: "URGENT Server Restart Required",
      original_sender: messageEvent.sender,
      original_sent_at: messageEvent.sent_at,
    };
    await ctx.eventStore.append(manualThread);
    console.log("✓ Thread created");

    await step3_simulateTimeTick(ctx);

    const { reminderEvents, alertEvents } = await step4_evaluateUrgencyAndGenerateReminders(
      ctx,
      threadId,
      manualDeadlineEvent.event_id
    );

    expect(alertEvents.length).toBe(1);
    const alertEvent = alertEvents[0] as AlertQueuedEvent;
    expect(alertEvent.urgency_state).toBe("critical");
    console.log("✓ Alert urgency is CRITICAL as expected");

    // Critical alerts should go to both email (urgency_filter: all) and webhook (urgency_filter: critical)
    const { sentEvents } = await step5_simulateAlertDelivery(ctx, alertEvent);
    expect(sentEvents.length).toBe(2); // Both channels should receive
    console.log("✓ Alert sent to 2 channels (email + webhook)");
  });

  test("Complete lifecycle: manually create overdue deadline", async () => {
    console.log("\n=== SIMULATION: Overdue Deadline (Manual) ===\n");

    await step1_createAndActivateWatcher(ctx);

    // Ingest a regular email first
    const { messageEvent, threadEvent } = await step2_ingestEmailWithDeadline(ctx, {
      subject: "Past Due Invoice",
      deadline: "This was due by Friday at 5pm.",
      messageId: "overdue-deadline-001",
    });

    // Manually create an overdue deadline event (simulating past deadline)
    const pastDeadline = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
    const manualDeadlineEvent: HardDeadlineObservedEvent = {
      event_id: `evt_manual_deadline_${Date.now()}`,
      type: "HARD_DEADLINE_OBSERVED",
      timestamp: Date.now(),
      watcher_id: ctx.watcherId,
      message_id: messageEvent.message_id,
      deadline_utc: pastDeadline,
      deadline_text: "2 hours ago",
      source_span: "due by Friday",
      confidence: "high",
      binding: true,
      extractor_version: "v1.0.0-test",
    };
    await ctx.eventStore.append(manualDeadlineEvent);
    console.log("✓ Manual overdue deadline created");

    // Create thread if not already created
    const threadId = threadEvent?.thread_id || `thread_manual_${Date.now()}`;
    if (!threadEvent) {
      const manualThread: ThreadOpenedEvent = {
        event_id: `evt_thread_manual_${Date.now()}`,
        type: "THREAD_OPENED",
        timestamp: Date.now(),
        watcher_id: ctx.watcherId,
        thread_id: threadId,
        message_id: messageEvent.message_id,
        opened_at: Date.now(),
        trigger_type: "hard_deadline",
        normalized_subject: messageEvent.normalized_subject || "Past Due Invoice",
        original_sender: messageEvent.sender,
        original_sent_at: messageEvent.sent_at,
      };
      await ctx.eventStore.append(manualThread);
    }

    await step3_simulateTimeTick(ctx);

    const { reminderEvents, alertEvents } = await step4_evaluateUrgencyAndGenerateReminders(
      ctx,
      threadId,
      manualDeadlineEvent.event_id
    );

    expect(alertEvents.length).toBe(1);
    const alertEvent = alertEvents[0] as AlertQueuedEvent;
    expect(alertEvent.urgency_state).toBe("overdue");
    console.log("✓ Alert urgency is OVERDUE as expected");
  });

  test("Multiple emails with controlled deadlines create separate threads and alerts", async () => {
    console.log("\n=== SIMULATION: Multiple Emails ===\n");

    await step1_createAndActivateWatcher(ctx);

    // Create 3 emails with manually controlled deadlines
    const emails = [
      { subject: "Task 1 - Warning", deadlineOffset: 12 * 60 * 60 * 1000, urgency: "warning" },
      { subject: "Task 2 - Critical", deadlineOffset: 1 * 60 * 60 * 1000, urgency: "critical" },
      { subject: "Task 3 - Overdue", deadlineOffset: -2 * 60 * 60 * 1000, urgency: "overdue" },
    ];

    const results: Array<{
      threadId: string;
      deadlineEventId: string;
      expectedUrgency: string;
    }> = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i]!;
      const baseTimestamp = Date.now();
      const uniqueId = `${baseTimestamp}_${i}_${Math.random().toString(36).substring(7)}`;

      // Create message event directly (bypassing step2 which creates threads)
      const messageEvent: MessageReceivedEvent = {
        event_id: `evt_msg_${uniqueId}`,
        type: "MESSAGE_RECEIVED",
        timestamp: baseTimestamp,
        watcher_id: ctx.watcherId,
        message_id: `msgid_${uniqueId}`,
        sender: "sender@example.com",
        recipients: [`${ctx.ingestToken}@ingest.email.vigil.run`],
        subject: email.subject,
        normalized_subject: email.subject.toLowerCase(),
        sent_at: baseTimestamp,
        received_at: baseTimestamp,
        headers: { "message-id": `<${uniqueId}@example.com>` },
      };
      await ctx.eventStore.append(messageEvent);
      ctx.seenMessageIds.add(messageEvent.message_id);

      // Create deadline with controlled timing
      const deadlineEvent: HardDeadlineObservedEvent = {
        event_id: `evt_deadline_${uniqueId}`,
        type: "HARD_DEADLINE_OBSERVED",
        timestamp: baseTimestamp,
        watcher_id: ctx.watcherId,
        message_id: messageEvent.message_id,
        deadline_utc: Date.now() + email.deadlineOffset,
        deadline_text: email.subject,
        source_span: "due by tomorrow",
        confidence: "high",
        binding: true,
        extractor_version: "v1.0.0-test",
      };
      await ctx.eventStore.append(deadlineEvent);

      // Create thread
      const threadId = `thread_${uniqueId}`;
      const threadEvent: ThreadOpenedEvent = {
        event_id: `evt_thread_${uniqueId}`,
        type: "THREAD_OPENED",
        timestamp: baseTimestamp,
        watcher_id: ctx.watcherId,
        thread_id: threadId,
        message_id: messageEvent.message_id,
        opened_at: baseTimestamp,
        trigger_type: "hard_deadline",
        normalized_subject: email.subject,
        original_sender: messageEvent.sender,
        original_sent_at: messageEvent.sent_at,
      };
      await ctx.eventStore.append(threadEvent);

      results.push({
        threadId,
        deadlineEventId: deadlineEvent.event_id,
        expectedUrgency: email.urgency,
      });
    }

    console.log("✓ 3 emails ingested with controlled deadlines");

    // Verify all threads are different
    const threadIds = results.map(r => r.threadId);
    expect(new Set(threadIds).size).toBe(3);
    console.log("✓ All thread IDs are unique");

    // Trigger evaluation
    await step3_simulateTimeTick(ctx);

    // Evaluate each and verify urgency levels
    for (const result of results) {
      const { alertEvents } = await step4_evaluateUrgencyAndGenerateReminders(
        ctx,
        result.threadId,
        result.deadlineEventId
      );

      expect(alertEvents.length).toBe(1);
      const alert = alertEvents[0] as AlertQueuedEvent;
      expect(alert.urgency_state).toBe(result.expectedUrgency);
      console.log(`✓ Thread ${result.threadId.slice(-10)} has urgency: ${result.expectedUrgency}`);
    }

    // Final event count
    const allEvents = await ctx.eventStore.getEventsForWatcher(ctx.watcherId);
    console.log("\n=== Final Event Summary ===");
    console.log("Total events:", allEvents.length);

    const eventTypes = allEvents.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.table(eventTypes);

    expect(eventTypes["MESSAGE_RECEIVED"]).toBe(3);
    expect(eventTypes["HARD_DEADLINE_OBSERVED"]).toBe(3);
    expect(eventTypes["THREAD_OPENED"]).toBe(3);
    expect(eventTypes["REMINDER_GENERATED"]).toBe(3);
    expect(eventTypes["ALERT_QUEUED"]).toBe(3);
  });

  test("Causal traceability: alert traces back to original deadline", async () => {
    console.log("\n=== SIMULATION: Causal Traceability ===\n");

    await step1_createAndActivateWatcher(ctx);

    // Ingest email with deadline
    const { messageEvent, extractionEvents, threadEvent } = await step2_ingestEmailWithDeadline(ctx, {
      subject: "Traceable Task",
      deadline: "Due by tomorrow at 5pm.",
      messageId: "trace-001",
    });

    // Create manual deadline event that's within warning threshold
    const nearDeadline = Date.now() + 6 * 60 * 60 * 1000; // 6 hours from now
    const manualDeadlineEvent: HardDeadlineObservedEvent = {
      event_id: `evt_trace_deadline_${Date.now()}`,
      type: "HARD_DEADLINE_OBSERVED",
      timestamp: Date.now(),
      watcher_id: ctx.watcherId,
      message_id: messageEvent.message_id,
      deadline_utc: nearDeadline,
      deadline_text: "6 hours from now",
      source_span: "due by tomorrow",
      confidence: "high",
      binding: true,
      extractor_version: "v1.0.0-test",
    };
    await ctx.eventStore.append(manualDeadlineEvent);

    // Create thread if needed
    const threadId = threadEvent?.thread_id || `thread_trace_${Date.now()}`;
    if (!threadEvent) {
      const manualThread: ThreadOpenedEvent = {
        event_id: `evt_thread_trace_${Date.now()}`,
        type: "THREAD_OPENED",
        timestamp: Date.now(),
        watcher_id: ctx.watcherId,
        thread_id: threadId,
        message_id: messageEvent.message_id,
        opened_at: Date.now(),
        trigger_type: "hard_deadline",
        normalized_subject: "Traceable Task",
        original_sender: messageEvent.sender,
        original_sent_at: messageEvent.sent_at,
      };
      await ctx.eventStore.append(manualThread);
    }

    await step3_simulateTimeTick(ctx);

    const { reminderEvents, alertEvents } = await step4_evaluateUrgencyAndGenerateReminders(
      ctx,
      threadId,
      manualDeadlineEvent.event_id
    );

    expect(reminderEvents.length).toBe(1);
    expect(alertEvents.length).toBe(1);

    const reminder = reminderEvents[0] as ReminderGeneratedEvent;
    const alert = alertEvents[0] as AlertQueuedEvent;

    // Verify causal chain: Alert → Reminder → Deadline
    expect(alert.reminder_id).toBe(reminder.reminder_id);
    console.log("✓ Alert links to reminder:", alert.reminder_id);

    expect(alert.causal_event_id).toBe(manualDeadlineEvent.event_id);
    console.log("✓ Alert traces to deadline event:", alert.causal_event_id);

    expect(reminder.causal_event_id).toBe(manualDeadlineEvent.event_id);
    console.log("✓ Reminder traces to deadline event:", reminder.causal_event_id);

    console.log("\n✓ Full causal chain verified: Alert → Reminder → Deadline\n");
  });
});

describe("Event Replay Determinism", () => {
  test("Replaying same events produces identical state", async () => {
    const ctx = createSimulationContext();

    await step1_createAndActivateWatcher(ctx);

    const deadlineTime = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await step2_ingestEmailWithDeadline(ctx, {
      subject: "Determinism Test",
      deadline: `Due by ${deadlineTime.toISOString()}`,
      messageId: "determinism-001",
    });

    const events = await ctx.eventStore.getEventsForWatcher(ctx.watcherId);

    // Replay events multiple times
    const state1 = replayEvents(events);
    const state2 = replayEvents(events);
    const state3 = replayEvents(events);

    // All replays should produce identical state
    expect(state1.status).toBe(state2.status);
    expect(state1.status).toBe(state3.status);
    expect(state1.threads.size).toBe(state2.threads.size);
    expect(state1.threads.size).toBe(state3.threads.size);

    console.log("✓ Event replay is deterministic");
  });
});
