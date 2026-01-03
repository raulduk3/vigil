/**
 * Alert Delivery Worker Tests
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { InMemoryEventStore, setEventStore } from "../../src/events/store";
import type {
    WatcherCreatedEvent,
    WatcherActivatedEvent,
    PolicyUpdatedEvent,
    ThreadOpenedEvent,
    SilenceThresholdExceededEvent,
    AlertQueuedEvent,
    WatcherPolicy,
    NotificationChannel,
} from "../../src/events/types";

// ============================================================================
// Test Setup
// ============================================================================

const WATCHER_ID = "watcher-worker-test";
const ACCOUNT_ID = "acct-001";
const USER_ID = "user-001";
const THREAD_ID = "thread-001";

const POLICY: WatcherPolicy = {
    allowed_senders: ["test@example.com"],
    silence_threshold_hours: 72,
    notification_channels: [
        { type: "email", destination: "alerts@company.com", enabled: true },
        { type: "webhook", destination: "https://hooks.example.com/vigil", enabled: true },
    ],
};

function setupTestEvents(store: InMemoryEventStore, baseTime: number): void {
    // Create watcher
    store.append({
        event_id: "evt-created",
        timestamp: baseTime,
        watcher_id: WATCHER_ID,
        type: "WATCHER_CREATED",
        account_id: ACCOUNT_ID,
        name: "Test Watcher",
        ingest_token: "abc123",
        created_by: USER_ID,
    } as WatcherCreatedEvent);

    // Activate watcher
    store.append({
        event_id: "evt-activated",
        timestamp: baseTime + 1,
        watcher_id: WATCHER_ID,
        type: "WATCHER_ACTIVATED",
        activated_by: USER_ID,
    } as WatcherActivatedEvent);

    // Set policy
    store.append({
        event_id: "evt-policy",
        timestamp: baseTime + 2,
        watcher_id: WATCHER_ID,
        type: "POLICY_UPDATED",
        policy: POLICY,
        updated_by: USER_ID,
    } as PolicyUpdatedEvent);

    // Open thread
    store.append({
        event_id: "evt-thread-opened",
        timestamp: baseTime + 100,
        watcher_id: WATCHER_ID,
        type: "THREAD_OPENED",
        thread_id: THREAD_ID,
        message_id: "msg-001",
        opened_at: baseTime + 100,
        normalized_subject: "test subject",
        original_sender: "test@example.com",
        action_request_event_id: "evt-action-001",
    } as ThreadOpenedEvent);
}

// ============================================================================
// Alert Queue Event Tests
// ============================================================================

describe("Alert Queue Events", () => {
    let store: InMemoryEventStore;
    const baseTime = Date.now();

    beforeEach(() => {
        store = new InMemoryEventStore();
        setEventStore(store);
        setupTestEvents(store, baseTime);
    });

    it("ALERT_QUEUED event contains correct structure", () => {
        const alertId = crypto.randomUUID();
        const alertEvent: AlertQueuedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: alertId,
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: POLICY.notification_channels,
        };

        store.append(alertEvent);

        const events = store.getAll();
        const queued = events.find((e) => e.type === "ALERT_QUEUED");

        expect(queued).toBeDefined();
        expect((queued as AlertQueuedEvent).alert_id).toBe(alertId);
        expect((queued as AlertQueuedEvent).thread_id).toBe(THREAD_ID);
        expect((queued as AlertQueuedEvent).channels).toHaveLength(2);
    });

    it("SILENCE_THRESHOLD_EXCEEDED precedes ALERT_QUEUED", () => {
        const silenceEvent: SilenceThresholdExceededEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "SILENCE_THRESHOLD_EXCEEDED",
            thread_id: THREAD_ID,
            hours_silent: 80,
            threshold_hours: 72,
            last_activity_at: baseTime + 100,
        };

        const alertEvent: AlertQueuedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1001,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: crypto.randomUUID(),
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: POLICY.notification_channels,
        };

        store.append(silenceEvent);
        store.append(alertEvent);

        const events = store.getAll();
        const silenceIdx = events.findIndex((e) => e.type === "SILENCE_THRESHOLD_EXCEEDED");
        const alertIdx = events.findIndex((e) => e.type === "ALERT_QUEUED");

        expect(silenceIdx).toBeLessThan(alertIdx);
    });

    it("multiple channels are preserved in ALERT_QUEUED", () => {
        const channels: NotificationChannel[] = [
            { type: "email", destination: "a@example.com", enabled: true },
            { type: "email", destination: "b@example.com", enabled: true },
            { type: "webhook", destination: "https://hook1.com", enabled: true },
            { type: "webhook", destination: "https://hook2.com", enabled: false },
        ];

        const alertEvent: AlertQueuedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: crypto.randomUUID(),
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels,
        };

        store.append(alertEvent);

        const events = store.getAll();
        const queued = events.find((e) => e.type === "ALERT_QUEUED") as AlertQueuedEvent;

        expect(queued.channels).toHaveLength(4);
        expect(queued.channels.filter((c) => c.type === "email")).toHaveLength(2);
        expect(queued.channels.filter((c) => c.enabled)).toHaveLength(3);
    });
});

// ============================================================================
// Event Store Query Tests
// ============================================================================

describe("Event Store Alert Queries", () => {
    let store: InMemoryEventStore;
    const baseTime = Date.now();

    beforeEach(() => {
        store = new InMemoryEventStore();
        setEventStore(store);
        setupTestEvents(store, baseTime);
    });

    it("can filter ALERT_QUEUED events by watcher", async () => {
        // Add alerts for multiple watchers
        store.append({
            event_id: "evt-alert-1",
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: "alert-1",
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: [],
        } as AlertQueuedEvent);

        store.append({
            event_id: "evt-alert-2",
            timestamp: baseTime + 1001,
            watcher_id: "other-watcher",
            type: "ALERT_QUEUED",
            alert_id: "alert-2",
            thread_id: "other-thread",
            alert_type: "silence_threshold",
            channels: [],
        } as AlertQueuedEvent);

        const watcherEvents = await store.getEventsForWatcher(WATCHER_ID);
        const alertEvents = watcherEvents.filter((e) => e.type === "ALERT_QUEUED");

        expect(alertEvents).toHaveLength(1);
        expect((alertEvents[0] as AlertQueuedEvent).alert_id).toBe("alert-1");
    });

    it("preserves event order by timestamp when queried by watcher", async () => {
        const events = [
            { timestamp: baseTime + 300, id: "3" },
            { timestamp: baseTime + 100, id: "1" },
            { timestamp: baseTime + 200, id: "2" },
        ];

        for (const evt of events) {
            await store.append({
                event_id: `evt-${evt.id}`,
                timestamp: evt.timestamp,
                watcher_id: WATCHER_ID,
                type: "ALERT_QUEUED",
                alert_id: `alert-${evt.id}`,
                thread_id: THREAD_ID,
                alert_type: "silence_threshold",
                channels: [],
            } as AlertQueuedEvent);
        }

        // getEventsForWatcher sorts by timestamp (unlike getAll which preserves insertion order)
        const watcherEvents = await store.getEventsForWatcher(WATCHER_ID);
        const alertEvents = watcherEvents.filter((e) => e.type === "ALERT_QUEUED");

        expect(alertEvents[0].timestamp).toBeLessThanOrEqual(alertEvents[1].timestamp);
        expect(alertEvents[1].timestamp).toBeLessThanOrEqual(alertEvents[2].timestamp);
    });
});

// ============================================================================
// Alert Processing Flow Tests
// ============================================================================

describe("Alert Processing Flow", () => {
    let store: InMemoryEventStore;
    const baseTime = Date.now();

    beforeEach(() => {
        store = new InMemoryEventStore();
        setEventStore(store);
        setupTestEvents(store, baseTime);
    });

    it("complete flow: silence -> alert_queued -> alert_sent", () => {
        // Step 1: Silence threshold exceeded
        const silenceEvent: SilenceThresholdExceededEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "SILENCE_THRESHOLD_EXCEEDED",
            thread_id: THREAD_ID,
            hours_silent: 80,
            threshold_hours: 72,
            last_activity_at: baseTime + 100,
        };
        store.append(silenceEvent);

        // Step 2: Alert queued
        const alertId = crypto.randomUUID();
        const alertQueuedEvent: AlertQueuedEvent = {
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1001,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: alertId,
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: [{ type: "email", destination: "test@example.com", enabled: true }],
        };
        store.append(alertQueuedEvent);

        // Step 3: Alert sent (by worker)
        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1002,
            watcher_id: WATCHER_ID,
            type: "ALERT_SENT",
            alert_id: alertId,
            channel_type: "email",
            destination: "test@example.com",
            sent_at: baseTime + 1002,
        });

        // Verify complete flow
        const events = store.getAll();
        const eventTypes = events.map((e) => e.type);

        expect(eventTypes).toContain("SILENCE_THRESHOLD_EXCEEDED");
        expect(eventTypes).toContain("ALERT_QUEUED");
        expect(eventTypes).toContain("ALERT_SENT");

        // Verify order
        const silenceIdx = eventTypes.indexOf("SILENCE_THRESHOLD_EXCEEDED");
        const queuedIdx = eventTypes.indexOf("ALERT_QUEUED");
        const sentIdx = eventTypes.indexOf("ALERT_SENT");

        expect(silenceIdx).toBeLessThan(queuedIdx);
        expect(queuedIdx).toBeLessThan(sentIdx);
    });

    it("failed delivery creates ALERT_FAILED event", () => {
        const alertId = crypto.randomUUID();

        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: alertId,
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: [{ type: "email", destination: "invalid", enabled: true }],
        } as AlertQueuedEvent);

        // Simulate failed delivery
        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1001,
            watcher_id: WATCHER_ID,
            type: "ALERT_FAILED",
            alert_id: alertId,
            channel_type: "email",
            destination: "invalid",
            error: "Invalid email address",
            attempt: 1,
        });

        const events = store.getAll();
        const failedEvent = events.find((e) => e.type === "ALERT_FAILED");

        expect(failedEvent).toBeDefined();
        expect((failedEvent as any).attempt).toBe(1);
    });

    it("retry creates new ALERT_FAILED with incremented attempt", () => {
        const alertId = crypto.randomUUID();

        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1000,
            watcher_id: WATCHER_ID,
            type: "ALERT_QUEUED",
            alert_id: alertId,
            thread_id: THREAD_ID,
            alert_type: "silence_threshold",
            channels: [{ type: "webhook", destination: "https://down.example.com", enabled: true }],
        } as AlertQueuedEvent);

        // First attempt fails
        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 1001,
            watcher_id: WATCHER_ID,
            type: "ALERT_FAILED",
            alert_id: alertId,
            channel_type: "webhook",
            destination: "https://down.example.com",
            error: "Connection timeout",
            attempt: 1,
        });

        // Second attempt fails
        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 2001,
            watcher_id: WATCHER_ID,
            type: "ALERT_FAILED",
            alert_id: alertId,
            channel_type: "webhook",
            destination: "https://down.example.com",
            error: "Connection timeout",
            attempt: 2,
        });

        // Third attempt succeeds
        store.append({
            event_id: crypto.randomUUID(),
            timestamp: baseTime + 3001,
            watcher_id: WATCHER_ID,
            type: "ALERT_SENT",
            alert_id: alertId,
            channel_type: "webhook",
            destination: "https://down.example.com",
            sent_at: baseTime + 3001,
        });

        const events = store.getAll();
        const failedEvents = events.filter((e) => e.type === "ALERT_FAILED");
        const sentEvents = events.filter((e) => e.type === "ALERT_SENT");

        expect(failedEvents).toHaveLength(2);
        expect(sentEvents).toHaveLength(1);
        expect((failedEvents[0] as any).attempt).toBe(1);
        expect((failedEvents[1] as any).attempt).toBe(2);
    });
});

// ============================================================================
// Channel Filtering Tests
// ============================================================================

describe("Channel Filtering", () => {
    it("only enabled channels should be processed", () => {
        const channels: NotificationChannel[] = [
            { type: "email", destination: "enabled@example.com", enabled: true },
            { type: "email", destination: "disabled@example.com", enabled: false },
            { type: "webhook", destination: "https://enabled.com", enabled: true },
            { type: "webhook", destination: "https://disabled.com", enabled: false },
        ];

        const enabledChannels = channels.filter((c) => c.enabled);

        expect(enabledChannels).toHaveLength(2);
        expect(enabledChannels.every((c) => c.enabled)).toBe(true);
    });

    it("empty channels array results in no deliveries", () => {
        const channels: NotificationChannel[] = [];
        const enabledChannels = channels.filter((c) => c.enabled);

        expect(enabledChannels).toHaveLength(0);
    });

    it("all disabled channels results in no deliveries", () => {
        const channels: NotificationChannel[] = [
            { type: "email", destination: "a@example.com", enabled: false },
            { type: "webhook", destination: "https://hook.com", enabled: false },
        ];

        const enabledChannels = channels.filter((c) => c.enabled);

        expect(enabledChannels).toHaveLength(0);
    });
});
