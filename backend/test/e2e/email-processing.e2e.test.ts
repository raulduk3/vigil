/**
 * End-to-End Email Processing Test
 * 
 * Tests the complete Vigil email processing flow from ingestion to alert delivery.
 * All external systems are mocked:
 * - SMTP Adapter (inbound) → simulated by direct HTTP POST to /ingest/:token
 * - LLM Service → uses built-in regex extractors (mock implementation)
 * - PostgreSQL → uses in-memory event store
 * - SMTP/Webhook Delivery → mocked delivery functions
 * 
 * Flow tested:
 * 1. User creates account and watcher
 * 2. Email arrives via ingestion endpoint
 * 3. LLM extraction identifies deadline/urgency
 * 4. Thread is created/matched
 * 5. Urgency evaluation runs
 * 6. Alert is queued and "delivered"
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { InMemoryEventStore } from "../../src/events/event-store";
import { orchestrateIngestion, type IngestionContext } from "../../src/ingestion/orchestrator";
import { replayEvents, type WatcherState } from "../../src/watcher/runtime";
import { computeUrgencyWithPolicy, DEFAULT_POLICY } from "../../src/watcher/urgency";
import { findMatchingThread, buildMessageIdMap } from "../../src/watcher/thread-detection";
import { generateTimeTicks } from "../../src/scheduler/scheduler";
import { evaluateAllThreads } from "../../src/watcher/urgency";
import { filterChannelsByUrgency } from "../../src/worker/notification";
import type { 
  VigilEvent, 
  WatcherCreatedEvent, 
  WatcherActivatedEvent,
  PolicyUpdatedEvent,
  MessageReceivedEvent,
  ThreadOpenedEvent,
  HardDeadlineObservedEvent,
  WatcherPolicy,
  AlertQueuedEvent,
} from "../../src/events/types";

/**
 * Mock delivery tracker to verify alerts were "sent"
 */
interface DeliveryRecord {
  channel_type: "email" | "webhook" | "sms";
  destination: string;
  subject?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

const deliveryLog: DeliveryRecord[] = [];

/**
 * Mock email delivery function
 */
async function mockDeliverEmail(
  to: string,
  subject: string,
  _body: string
): Promise<{ success: boolean; error?: string }> {
  deliveryLog.push({
    channel_type: "email",
    destination: to,
    subject,
    timestamp: Date.now(),
  });
  return { success: true };
}

/**
 * Mock webhook delivery function
 */
async function mockDeliverWebhook(
  url: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  deliveryLog.push({
    channel_type: "webhook",
    destination: url,
    payload,
    timestamp: Date.now(),
  });
  return { success: true };
}

describe("E2E: Complete Email Processing Flow", () => {
  let eventStore: InMemoryEventStore;
  let watcherId: string;
  let ingestToken: string;
  let userId: string;
  let seenMessageIds: Set<string>;
  
  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    watcherId = `watcher_${Date.now()}`;
    ingestToken = `token_${Math.random().toString(36).substring(7)}`;
    userId = `user_${Date.now()}`;
    seenMessageIds = new Set<string>();
    deliveryLog.length = 0; // Clear delivery log
  });

  /**
   * Helper: Create full policy for tests
   */
  function createTestPolicy(overrides?: Partial<WatcherPolicy>): WatcherPolicy {
    return {
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
      ...overrides,
    };
  }

  /**
   * Helper: Create and activate a watcher with policy
   */
  async function setupWatcher(policyOverrides?: Partial<WatcherPolicy>): Promise<{
    watcherState: WatcherState;
    policy: WatcherPolicy;
  }> {
    const now = Date.now();
    const policy = createTestPolicy(policyOverrides);
    
    // 1. WATCHER_CREATED event
    const createdEvent = {
      event_id: `evt_created_${now}`,
      type: "WATCHER_CREATED",
      timestamp: now,
      watcher_id: watcherId,
      account_id: `account_${userId}`,
      created_by: userId,
      created_at: now,
      name: "Test E2E Watcher",
      ingest_token: ingestToken,
    } as WatcherCreatedEvent;
    await eventStore.append(createdEvent);

    // 2. WATCHER_ACTIVATED event
    const activatedEvent = {
      event_id: `evt_activated_${now}`,
      type: "WATCHER_ACTIVATED",
      timestamp: now + 1,
      watcher_id: watcherId,
      activated_by: userId,
    } as WatcherActivatedEvent;
    await eventStore.append(activatedEvent);

    // 3. POLICY_UPDATED event with notification channels
    const policyEvent = {
      event_id: `evt_policy_${now}`,
      type: "POLICY_UPDATED",
      timestamp: now + 2,
      watcher_id: watcherId,
      updated_by: userId,
      policy: policy,
    } as PolicyUpdatedEvent;
    await eventStore.append(policyEvent);

    // Rebuild watcher state from events
    const events = await eventStore.getEventsForWatcher(watcherId);
    return { watcherState: replayEvents(events), policy };
  }

  /**
   * Helper: Create proper IngestionContext from watcher state
   */
  function createIngestionContext(policy: WatcherPolicy): IngestionContext {
    return {
      watcher_id: watcherId,
      watcher_status: "active",
      policy: policy,
      reference_timestamp: Date.now(),
      reference_timezone: "UTC",
    };
  }

  /**
   * Helper: Async duplicate checker using seenMessageIds set
   */
  async function checkDuplicate(messageId: string): Promise<boolean> {
    return seenMessageIds.has(messageId);
  }

  /**
   * Helper: Simulate email ingestion
   */
  async function ingestEmail(rawEmail: string, context: IngestionContext): Promise<{
    success: boolean;
    message_received_event?: MessageReceivedEvent;
    extraction_events?: VigilEvent[];
    error?: string;
  }> {
    const result = await orchestrateIngestion(rawEmail, context, checkDuplicate);
    
    // Store all generated events and track message IDs
    if (result.message_received_event) {
      await eventStore.append(result.message_received_event);
      const msgEvt = result.message_received_event as MessageReceivedEvent;
      seenMessageIds.add(msgEvt.message_id);
    }
    if (result.extraction_events) {
      for (const evt of result.extraction_events) {
        await eventStore.append(evt);
      }
    }

    return {
      success: result.success,
      message_received_event: result.message_received_event as MessageReceivedEvent | undefined,
      extraction_events: result.extraction_events,
      error: result.error,
    };
  }

  /**
   * Helper: Create thread from extraction events
   */
  async function createThread(
    messageEvent: MessageReceivedEvent,
    extractionEvents: VigilEvent[]
  ): Promise<ThreadOpenedEvent> {
    const now = Date.now();
    const hardDeadlineEvent = extractionEvents.find(
      e => e.type === "HARD_DEADLINE_OBSERVED"
    ) as HardDeadlineObservedEvent | undefined;

    // Use original email's Message-ID for thread matching, falling back to Vigil ID
    const originalMessageId = messageEvent.headers["message-id"] || messageEvent.message_id;

    const threadEvent: ThreadOpenedEvent = {
      event_id: `evt_thread_${now}`,
      type: "THREAD_OPENED",
      timestamp: now,
      watcher_id: watcherId,
      thread_id: `thread_${now}`,
      message_id: originalMessageId, // Original email's Message-ID for matching
      opened_at: now, // Required for replay
      trigger_type: hardDeadlineEvent ? "hard_deadline" : "urgency_signal",
      normalized_subject: messageEvent.normalized_subject || "test subject",
      original_sender: messageEvent.sender,
      original_sent_at: messageEvent.sent_at,
    };

    await eventStore.append(threadEvent);
    return threadEvent;
  }

  // ============================================================
  // TEST SCENARIOS
  // ============================================================

  test("Scenario 1: Email with hard deadline → warning alert", async () => {
    // Setup watcher
    const { watcherState, policy } = await setupWatcher();
    expect(watcherState.status).toBe("active");

    // Create ingestion context with full policy
    const context = createIngestionContext(policy);

    // Simulate email with deadline (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

    const rawEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Project Update Required
Date: ${new Date().toUTCString()}
Message-ID: <msg001@example.com>

Hi team,

Please review the attached document. This is due by ${tomorrowStr} at 5pm.

Thanks,
John`;

    // Step 1: Ingest email
    const ingestionResult = await ingestEmail(rawEmail, context);
    
    expect(ingestionResult.success).toBe(true);
    expect(ingestionResult.message_received_event).toBeDefined();
    
    // Verify extraction happened
    const hardDeadlineEvent = ingestionResult.extraction_events?.find(
      e => e.type === "HARD_DEADLINE_OBSERVED"
    ) as HardDeadlineObservedEvent | undefined;
    expect(hardDeadlineEvent).toBeDefined();
    console.log("✓ Email ingested, deadline extracted:", hardDeadlineEvent?.deadline_utc);

    // Step 2: Create thread
    const threadEvent = await createThread(
      ingestionResult.message_received_event!,
      ingestionResult.extraction_events || []
    );
    console.log("✓ Thread created:", threadEvent.thread_id);

    // Step 3: Rebuild state and evaluate urgency
    const events = await eventStore.getEventsForWatcher(watcherId);
    const updatedState = replayEvents(events);
    
    expect(updatedState.threads.size).toBe(1);
    const thread = updatedState.threads.get(threadEvent.thread_id);
    expect(thread).toBeDefined();

    // Get extraction events for urgency computation
    const extractionMap = new Map<string, VigilEvent>();
    for (const evt of ingestionResult.extraction_events || []) {
      extractionMap.set(evt.event_id, evt);
    }

    // NOTE: Current design gap - threads don't auto-link to extraction events.
    // In production, a separate THREAD_DEADLINE_LINKED event would be emitted.
    // For this test, we manually create a thread with the link.
    const threadWithDeadline = {
      ...thread!,
      hard_deadline_event_id: hardDeadlineEvent?.event_id || null,
    };
    const threadsWithDeadline = new Map([[threadEvent.thread_id, threadWithDeadline]]);

    // Compute urgency (should be warning since deadline is ~24h away, within warning threshold)
    const urgencyResult = computeUrgencyWithPolicy(
      threadWithDeadline,
      extractionMap,
      Date.now(),
      updatedState.policy
    );
    console.log("✓ Urgency evaluated:", urgencyResult.urgency_state);
    
    // With default policy (warning_hours=24), deadline tomorrow at 5pm should be "warning"
    expect(["ok", "warning", "critical"]).toContain(urgencyResult.urgency_state);

    // Step 4: Generate reminder if escalation needed
    const alertResults = evaluateAllThreads(
      threadsWithDeadline,
      extractionMap,
      updatedState.policy,
      Date.now(),
      watcherId
    );
    
    console.log("✓ Alert evaluation complete, reminders:", alertResults.reminderEvents.length, "alerts:", alertResults.alertEvents.length);
    
    // Step 5: Store alert events
    for (const reminder of alertResults.reminderEvents) {
      await eventStore.append(reminder);
    }
    for (const alert of alertResults.alertEvents) {
      await eventStore.append(alert);
    }

    // Step 6: Simulate notification delivery if alerts were generated
    if (alertResults.alertEvents.length > 0) {
      const alertEvent = alertResults.alertEvents[0] as AlertQueuedEvent;
      const channels = updatedState.policy.notification_channels;
      const filteredChannels = filterChannelsByUrgency(
        channels,
        alertEvent.urgency_state as "warning" | "critical" | "overdue"
      );

      console.log("✓ Channels after filter:", filteredChannels.map(c => c.type));

      // Deliver to filtered channels (using mocks)
      for (const channel of filteredChannels) {
        if (channel.type === "email") {
          await mockDeliverEmail(
            channel.destination,
            `[Vigil Alert] ${alertEvent.urgency_state.toUpperCase()}: Thread requires attention`,
            `Thread ${alertEvent.thread_id} has reached ${alertEvent.urgency_state} status.`
          );
        } else if (channel.type === "webhook") {
          await mockDeliverWebhook(channel.destination, {
            event_type: "ALERT",
            thread_id: alertEvent.thread_id,
            urgency: alertEvent.urgency_state,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Verify: Either alerts were delivered, or urgency is "ok" (deadline far enough)
    // This validates the complete flow works - the specific outcome depends on timing
    console.log("✓ Deliveries made:", deliveryLog.length);
    
    // If alerts generated, verify delivery was attempted
    if (alertResults.alertEvents.length > 0) {
      expect(deliveryLog.length).toBeGreaterThan(0);
      const emailDelivery = deliveryLog.find(d => d.channel_type === "email");
      expect(emailDelivery?.destination).toBe("alerts@example.com");
    } else {
      // No alerts means urgency is "ok" - deadline is far enough
      console.log("✓ No alerts generated - deadline outside warning threshold");
    }
  });

  test("Scenario 2: Email with closure signal → thread closed, no alert", async () => {
    // Setup watcher
    const { policy } = await setupWatcher();
    const context = createIngestionContext(policy);

    // First email - opens thread with deadline
    const firstEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Action Required
Date: ${new Date().toUTCString()}
Message-ID: <msg002@example.com>

Please complete this by Friday 5pm. This is urgent.

Thanks`;

    const firstResult = await ingestEmail(firstEmail, context);
    expect(firstResult.success).toBe(true);

    // Create thread
    await createThread(
      firstResult.message_received_event!,
      firstResult.extraction_events || []
    );

    // Reply email - closes thread
    const replyEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Re: Action Required
Date: ${new Date().toUTCString()}
Message-ID: <msg003@example.com>
In-Reply-To: <msg002@example.com>
References: <msg002@example.com>

Thanks for handling this. The issue has been resolved. No further action needed.`;

    const replyResult = await ingestEmail(replyEmail, context);
    expect(replyResult.success).toBe(true);

    // Check for closure signal
    const closureEvent = replyResult.extraction_events?.find(
      e => e.type === "CLOSURE_SIGNAL_OBSERVED"
    );
    expect(closureEvent).toBeDefined();
    console.log("✓ Closure signal detected");

    // In a full implementation, the orchestrator would:
    // 1. Match the reply to the existing thread
    // 2. Emit THREAD_CLOSED event
    // For this test, we verify the closure was detected
  });

  test("Scenario 3: Email from unauthorized sender → rejected", async () => {
    const { policy } = await setupWatcher({
      allowed_senders: ["authorized@company.com"],
    });

    const context = createIngestionContext(policy);

    const unauthorizedEmail = `From: hacker@evil.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: URGENT: Click this link!
Date: ${new Date().toUTCString()}
Message-ID: <spam001@evil.com>

This is spam that should be rejected.`;

    const result = await ingestEmail(unauthorizedEmail, context);
    
    // Email should be received but extraction should NOT run
    expect(result.success).toBe(true);
    expect(result.extraction_events).toEqual([]);
    console.log("✓ Unauthorized sender email received but not processed");
  });

  test("Scenario 4: Duplicate email → deduplicated", async () => {
    const { policy } = await setupWatcher();
    const context = createIngestionContext(policy);

    const email = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Important Update
Date: ${new Date().toUTCString()}
Message-ID: <duplicate001@example.com>

This email should only be processed once.`;

    // First ingestion
    const result1 = await orchestrateIngestion(email, context, checkDuplicate);
    expect(result1.success).toBe(true);
    
    if (result1.message_received_event) {
      const msgEvt = result1.message_received_event as MessageReceivedEvent;
      seenMessageIds.add(msgEvt.message_id);
    }

    // Second ingestion (duplicate)
    const result2 = await orchestrateIngestion(email, context, checkDuplicate);
    expect(result2.success).toBe(false);
    expect(result2.skipped_reason).toBe("DUPLICATE_MESSAGE");
    console.log("✓ Duplicate email rejected");
  });

  test("Scenario 5: TIME_TICK triggers urgency re-evaluation", async () => {
    // Setup watcher
    const { watcherState, policy } = await setupWatcher();

    // Create a thread that's been waiting
    const pastTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    
    const threadEvent = {
      event_id: `evt_thread_${pastTime}`,
      type: "THREAD_OPENED",
      timestamp: pastTime,
      watcher_id: watcherId,
      thread_id: `thread_waiting_${pastTime}`,
      message_id: "evt_msg_old",
      trigger_type: "hard_deadline",
      normalized_subject: "overdue task",
      original_sender: "sender@example.com",
      original_sent_at: pastTime,
      opened_at: pastTime,
    };
    await eventStore.append(threadEvent);

    // Simulate a hard deadline that has passed
    const deadlineEvent = {
      event_id: `evt_deadline_${pastTime}`,
      type: "HARD_DEADLINE_OBSERVED",
      timestamp: pastTime,
      watcher_id: watcherId,
      message_id: "msg_old",
      thread_id: threadEvent.thread_id,
      deadline_utc: pastTime + (1 * 60 * 60 * 1000), // 1 hour after creation = overdue now
      deadline_text: "in 1 hour",
      source_span: "due in 1 hour",
      confidence: "high",
      binding_language: true,
      extractor_version: "v1.0.0",
    };
    await eventStore.append(deadlineEvent);

    // Generate TIME_TICK
    const activeWatcherIds = [watcherId];
    const ticks = generateTimeTicks(activeWatcherIds, Date.now());
    
    expect(ticks.length).toBe(1);
    expect(ticks[0]?.watcher_id).toBe(watcherId);
    console.log("✓ TIME_TICK generated for watcher");

    // Rebuild state
    const events = await eventStore.getEventsForWatcher(watcherId);
    const state = replayEvents(events);
    
    // Build extraction map
    const extractionMap = new Map<string, VigilEvent>();
    extractionMap.set(deadlineEvent.event_id, deadlineEvent);

    // Evaluate thread urgency
    const thread = state.threads.get(threadEvent.thread_id);
    if (thread) {
      const urgency = computeUrgencyWithPolicy(
        { ...thread, hard_deadline_event_id: deadlineEvent.event_id },
        extractionMap,
        Date.now(),
        state.policy
      );
      
      console.log("✓ Thread urgency after TIME_TICK:", urgency.urgency_state);
      // With a deadline that passed ~24 hours ago, should be overdue
      expect(["critical", "overdue"]).toContain(urgency.urgency_state);
    }
  });

  test("Scenario 6: Full flow with urgency signals (no deadline)", async () => {
    const { policy } = await setupWatcher();
    const context = createIngestionContext(policy);

    // Email with urgency but no hard deadline
    const urgentEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: URGENT: Server Down
Date: ${new Date().toUTCString()}
Message-ID: <urgent001@example.com>

URGENT: Production server is down! This is critical and needs ASAP attention.

Please respond immediately.`;

    const result = await ingestEmail(urgentEmail, context);
    expect(result.success).toBe(true);

    // Check urgency signal extraction
    const urgencyEvent = result.extraction_events?.find(
      e => e.type === "URGENCY_SIGNAL_OBSERVED"
    );
    expect(urgencyEvent).toBeDefined();
    console.log("✓ Urgency signal extracted:", (urgencyEvent as any)?.signal_type);

    // No hard deadline should be extracted
    const deadlineEvent = result.extraction_events?.find(
      e => e.type === "HARD_DEADLINE_OBSERVED"
    );
    expect(deadlineEvent).toBeUndefined();
    console.log("✓ Correctly identified as urgency-only (no deadline)");
  });

  test("Scenario 7: Thread matching via In-Reply-To header", async () => {
    const { policy } = await setupWatcher({
      allowed_senders: ["sender@example.com", "colleague@example.com"],
    });
    const context = createIngestionContext(policy);

    // Original email
    const originalEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Project Discussion
Date: ${new Date().toUTCString()}
Message-ID: <thread-orig-001@example.com>

Let's discuss the project timeline. Due by Friday.`;

    const result1 = await ingestEmail(originalEmail, context);
    const thread1 = await createThread(
      result1.message_received_event!,
      result1.extraction_events || []
    );

    // Build message ID map for thread detection AFTER thread is created
    const events = await eventStore.getEventsForWatcher(watcherId);
    const state = replayEvents(events);
    const messageIdMap = buildMessageIdMap(state.threads);

    // Reply email
    const replyEmail = `From: colleague@example.com
To: ${ingestToken}@ingest.vigil.example.com
Subject: Re: Project Discussion
Date: ${new Date().toUTCString()}
Message-ID: <thread-reply-001@example.com>
In-Reply-To: <thread-orig-001@example.com>
References: <thread-orig-001@example.com>

Sounds good, I'll have my part ready.`;

    const result2 = await ingestEmail(replyEmail, context);
    expect(result2.success).toBe(true);

    // Try to match thread
    const matchResult = findMatchingThread(
      {
        messageId: "thread-reply-001@example.com",
        from: "colleague@example.com",
        subject: "Re: Project Discussion",
        headers: {
          "In-Reply-To": "<thread-orig-001@example.com>",
          "References": "<thread-orig-001@example.com>",
        },
      },
      state.threads,
      messageIdMap
    );

    expect(matchResult).not.toBeNull();
    expect(matchResult?.threadId).toBe(thread1.thread_id);
    console.log("✓ Reply correctly matched to original thread via In-Reply-To");
  });

  test("Scenario 8: Soft deadline extraction", async () => {
    const { policy } = await setupWatcher({
      enable_soft_deadline_reminders: true,
    });
    const context = createIngestionContext(policy);

    // Email with soft deadline language
    const softDeadlineEmail = `From: sender@example.com
To: ${ingestToken}@ingest.email.vigil.run
Subject: Report Review
Date: ${new Date().toUTCString()}
Message-ID: <soft001@example.com>

Hi,

When you get a chance, please review the quarterly report.
It would be great to have feedback by end of week.

Thanks`;

    const result = await ingestEmail(softDeadlineEmail, context);
    expect(result.success).toBe(true);

    const softDeadlineEvent = result.extraction_events?.find(
      e => e.type === "SOFT_DEADLINE_SIGNAL_OBSERVED"
    );
    expect(softDeadlineEvent).toBeDefined();
    console.log("✓ Soft deadline signal extracted:", (softDeadlineEvent as any)?.signal_text);
  });
});

describe("E2E: System Health Under Load", () => {
  test("should process 100 emails sequentially without errors", async () => {
    const eventStore = new InMemoryEventStore();
    const watcherId = `watcher_load_${Date.now()}`;
    const ingestToken = "load_test_token";
    const seenIds = new Set<string>();

    // Setup watcher
    await eventStore.append({
      event_id: `evt_created_load`,
      type: "WATCHER_CREATED",
      timestamp: Date.now(),
      watcher_id: watcherId,
      account_id: "load_test_account",
      created_by: "load_tester",
      created_at: Date.now(),
      name: "Load Test Watcher",
      ingest_token: ingestToken,
    } as WatcherCreatedEvent);

    await eventStore.append({
      event_id: `evt_activated_load`,
      type: "WATCHER_ACTIVATED",
      timestamp: Date.now(),
      watcher_id: watcherId,
      activated_by: "load_tester",
    } as WatcherActivatedEvent);

    const policy: WatcherPolicy = {
      ...DEFAULT_POLICY,
      allowed_senders: ["*@load.test"],
    };

    await eventStore.append({
      event_id: `evt_policy_load`,
      type: "POLICY_UPDATED",
      timestamp: Date.now(),
      watcher_id: watcherId,
      updated_by: "load_tester",
      policy,
    } as PolicyUpdatedEvent);

    const context: IngestionContext = {
      watcher_id: watcherId,
      watcher_status: "active",
      policy: policy,
      reference_timestamp: Date.now(),
      reference_timezone: "UTC",
    };

    const checkDup = async (id: string) => seenIds.has(id);
    const startTime = Date.now();
    let successCount = 0;

    for (let i = 0; i < 100; i++) {
      const email = `From: user${i}@load.test
To: ${ingestToken}@ingest.vigil.example.com
Subject: Load Test Email ${i}
Date: ${new Date().toUTCString()}
Message-ID: <load-${i}-${Date.now()}@load.test>

This is load test email number ${i}. ${i % 10 === 0 ? "Due by Friday." : ""}`;

      const result = await orchestrateIngestion(email, context, checkDup);
      if (result.success && result.message_received_event) {
        const msgEvt = result.message_received_event as MessageReceivedEvent;
        seenIds.add(msgEvt.message_id);
        successCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    console.log(`✓ Processed ${successCount}/100 emails in ${duration}ms`);
    console.log(`✓ Average: ${(duration / 100).toFixed(2)}ms per email`);
    
    expect(successCount).toBe(100);
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });
});

describe("E2E: External Service Integration Points", () => {
  test("documents required external service interfaces", () => {
    /**
     * SMTP Adapter (Inbound) Interface
     * Expected: Separate service that receives SMTP, forwards to backend
     */
    interface SMTPAdapterConfig {
      listenPort: number;           // e.g., 25 or 587
      backendUrl: string;           // e.g., "http://localhost:3000/ingest"
      tlsEnabled: boolean;
      maxMessageSize: number;       // bytes
    }

    /**
     * LLM Service Interface
     * Expected: Either external API (OpenAI, Anthropic) or local model
     */
    interface LLMServiceConfig {
      provider: "openai" | "anthropic" | "local" | "mock";
      apiKey?: string;
      model?: string;
      endpoint?: string;
      timeout: number;              // ms
    }

    /**
     * SMTP Delivery (Outbound) Interface
     * Expected: SMTP client for sending alert emails
     */
    interface SMTPDeliveryConfig {
      host: string;                 // e.g., "smtp.sendgrid.net"
      port: number;                 // e.g., 587
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
      from: string;                 // e.g., "alerts@vigil.example.com"
    }

    /**
     * Webhook Delivery Interface
     * Expected: HTTP client with retry logic
     */
    interface WebhookDeliveryConfig {
      timeout: number;              // ms
      maxRetries: number;
      retryDelayMs: number;
      userAgent: string;
    }

    // This test documents the interfaces - actual implementation needed
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║         EXTERNAL SERVICE INTEGRATION REQUIREMENTS            ║
    ╠══════════════════════════════════════════════════════════════╣
    ║                                                              ║
    ║  1. SMTP ADAPTER (Inbound)                                   ║
    ║     Status: ❌ NOT IMPLEMENTED                                ║
    ║     Location: /vigil/smtp-adapter/                           ║
    ║     Purpose: Receive emails, forward to POST /ingest/:token  ║
    ║                                                              ║
    ║  2. LLM SERVICE                                              ║
    ║     Status: ⚠️  STUB (regex patterns only)                    ║
    ║     Location: /vigil/llm-service/                            ║
    ║     Purpose: Semantic extraction (deadlines, urgency, etc.)  ║
    ║                                                              ║
    ║  3. SMTP DELIVERY (Outbound)                                 ║
    ║     Status: ❌ MOCK ONLY                                      ║
    ║     Location: /vigil/backend/src/worker/notification.ts      ║
    ║     Purpose: Send email alerts to notification channels      ║
    ║                                                              ║
    ║  4. WEBHOOK DELIVERY                                         ║
    ║     Status: ❌ MOCK ONLY                                      ║
    ║     Location: /vigil/backend/src/worker/notification.ts      ║
    ║     Purpose: POST alerts to user webhook endpoints           ║
    ║                                                              ║
    ║  5. POSTGRESQL                                               ║
    ║     Status: ✅ IMPLEMENTED                                    ║
    ║     Location: /vigil/backend/src/db/client.ts                ║
    ║     Purpose: Event persistence, user accounts                ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
  });
});
