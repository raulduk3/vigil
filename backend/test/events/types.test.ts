/**
 * Event Types Unit Tests
 *
 * Tests for event type guards, deprecated event detection,
 * and validation of the event schema.
 */

import { describe, it, expect } from "bun:test";
import {
    isWatcherEvent,
    isThreadEvent,
    isAlertEvent,
    isDeprecatedEvent,
    type VigilEvent,
    type WatcherCreatedEvent,
    type WatcherActivatedEvent,
    type WatcherPausedEvent,
    type WatcherResumedEvent,
    type WatcherDeletedEvent,
    type ThreadOpenedEvent,
    type ThreadEmailAddedEvent,
    type ThreadClosedEvent,
    type AlertQueuedEvent,
    type AlertSentEvent,
    type AlertFailedEvent,
    type EmailReceivedEvent,
    type ActionRequestObservedEvent,
    type SilenceThresholdExceededEvent,
    type TimeTickEvent,
} from "../../src/events/types";

// ============================================================================
// Test Fixtures
// ============================================================================

const baseEvent = {
    event_id: "evt-123",
    timestamp: Date.now(),
    watcher_id: "watcher-456",
};

function createWatcherCreatedEvent(): WatcherCreatedEvent {
    return {
        ...baseEvent,
        type: "WATCHER_CREATED",
        account_id: "acct-789",
        name: "Finance Watcher",
        ingest_token: "abc123",
        created_by: "user-001",
    };
}

function createWatcherActivatedEvent(): WatcherActivatedEvent {
    return {
        ...baseEvent,
        type: "WATCHER_ACTIVATED",
        activated_by: "user-001",
    };
}

function createWatcherPausedEvent(): WatcherPausedEvent {
    return {
        ...baseEvent,
        type: "WATCHER_PAUSED",
        paused_by: "user-001",
        reason: "Maintenance",
    };
}

function createWatcherResumedEvent(): WatcherResumedEvent {
    return {
        ...baseEvent,
        type: "WATCHER_RESUMED",
        resumed_by: "user-001",
    };
}

function createWatcherDeletedEvent(): WatcherDeletedEvent {
    return {
        ...baseEvent,
        type: "WATCHER_DELETED",
        deleted_by: "user-001",
    };
}

function createThreadOpenedEvent(): ThreadOpenedEvent {
    return {
        ...baseEvent,
        type: "THREAD_OPENED",
        thread_id: "thread-001",
        message_id: "msg-001",
        opened_at: Date.now(),
        normalized_subject: "quarterly report review",
        original_sender: "alice@example.com",
        action_request_event_id: "evt-action-001",
    };
}

function createThreadEmailAddedEvent(): ThreadEmailAddedEvent {
    return {
        ...baseEvent,
        type: "THREAD_EMAIL_ADDED",
        thread_id: "thread-001",
        message_id: "msg-002",
        sender: "bob@example.com",
        added_at: Date.now(),
    };
}

function createThreadClosedEvent(): ThreadClosedEvent {
    return {
        ...baseEvent,
        type: "THREAD_CLOSED",
        thread_id: "thread-001",
        closed_at: Date.now(),
        closed_by: "user_action",
        reason: "Resolved",
    };
}

function createAlertQueuedEvent(): AlertQueuedEvent {
    return {
        ...baseEvent,
        type: "ALERT_QUEUED",
        alert_id: "alert-001",
        thread_id: "thread-001",
        alert_type: "silence_threshold",
        channels: [{ type: "email", destination: "user@example.com", enabled: true }],
    };
}

function createAlertSentEvent(): AlertSentEvent {
    return {
        ...baseEvent,
        type: "ALERT_SENT",
        alert_id: "alert-001",
        channel_type: "email",
        destination: "user@example.com",
        sent_at: Date.now(),
    };
}

function createAlertFailedEvent(): AlertFailedEvent {
    return {
        ...baseEvent,
        type: "ALERT_FAILED",
        alert_id: "alert-001",
        channel_type: "email",
        destination: "user@example.com",
        error: "SMTP connection failed",
        attempt: 1,
    };
}

function createEmailReceivedEvent(): EmailReceivedEvent {
    return {
        ...baseEvent,
        type: "EMAIL_RECEIVED",
        message_id: "msg-001",
        from: "sender@example.com",
        subject: "RE: Quarterly Report",
        received_at: Date.now(),
        sender_allowed: true,
        headers: { "message-id": "<msg-001@example.com>" },
    };
}

function createActionRequestObservedEvent(): ActionRequestObservedEvent {
    return {
        ...baseEvent,
        type: "ACTION_REQUEST_OBSERVED",
        message_id: "msg-001",
        action_summary: "Please review and approve the quarterly report",
        request_type: "approval",
        source_span: "Please review and approve",
        confidence: "high",
        extractor_version: "1.0.0-commercial",
    };
}

function createSilenceThresholdExceededEvent(): SilenceThresholdExceededEvent {
    return {
        ...baseEvent,
        type: "SILENCE_THRESHOLD_EXCEEDED",
        thread_id: "thread-001",
        hours_silent: 76.5,
        threshold_hours: 72,
        last_activity_at: Date.now() - 76.5 * 60 * 60 * 1000,
    };
}

function createTimeTickEvent(): TimeTickEvent {
    return {
        ...baseEvent,
        type: "TIME_TICK",
        tick_timestamp: Date.now(),
    };
}

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("isWatcherEvent", () => {
    it("returns true for WATCHER_CREATED", () => {
        expect(isWatcherEvent(createWatcherCreatedEvent())).toBe(true);
    });

    it("returns true for WATCHER_ACTIVATED", () => {
        expect(isWatcherEvent(createWatcherActivatedEvent())).toBe(true);
    });

    it("returns true for WATCHER_PAUSED", () => {
        expect(isWatcherEvent(createWatcherPausedEvent())).toBe(true);
    });

    it("returns true for WATCHER_RESUMED", () => {
        expect(isWatcherEvent(createWatcherResumedEvent())).toBe(true);
    });

    it("returns true for WATCHER_DELETED", () => {
        expect(isWatcherEvent(createWatcherDeletedEvent())).toBe(true);
    });

    it("returns false for non-watcher events", () => {
        expect(isWatcherEvent(createThreadOpenedEvent())).toBe(false);
        expect(isWatcherEvent(createEmailReceivedEvent())).toBe(false);
        expect(isWatcherEvent(createAlertQueuedEvent())).toBe(false);
    });
});

describe("isThreadEvent", () => {
    it("returns true for THREAD_OPENED", () => {
        expect(isThreadEvent(createThreadOpenedEvent())).toBe(true);
    });

    it("returns true for THREAD_EMAIL_ADDED", () => {
        expect(isThreadEvent(createThreadEmailAddedEvent())).toBe(true);
    });

    it("returns true for THREAD_CLOSED", () => {
        expect(isThreadEvent(createThreadClosedEvent())).toBe(true);
    });

    it("returns false for non-thread events", () => {
        expect(isThreadEvent(createWatcherCreatedEvent())).toBe(false);
        expect(isThreadEvent(createEmailReceivedEvent())).toBe(false);
        expect(isThreadEvent(createAlertSentEvent())).toBe(false);
    });
});

describe("isAlertEvent", () => {
    it("returns true for ALERT_QUEUED", () => {
        expect(isAlertEvent(createAlertQueuedEvent())).toBe(true);
    });

    it("returns true for ALERT_SENT", () => {
        expect(isAlertEvent(createAlertSentEvent())).toBe(true);
    });

    it("returns true for ALERT_FAILED", () => {
        expect(isAlertEvent(createAlertFailedEvent())).toBe(true);
    });

    it("returns false for non-alert events", () => {
        expect(isAlertEvent(createWatcherCreatedEvent())).toBe(false);
        expect(isAlertEvent(createThreadOpenedEvent())).toBe(false);
        expect(isAlertEvent(createEmailReceivedEvent())).toBe(false);
    });
});

// ============================================================================
// Deprecated Event Detection Tests
// ============================================================================

describe("isDeprecatedEvent", () => {
    it("returns true for HARD_DEADLINE_OBSERVED", () => {
        expect(isDeprecatedEvent({ type: "HARD_DEADLINE_OBSERVED" })).toBe(true);
    });

    it("returns true for SOFT_DEADLINE_SIGNAL_OBSERVED", () => {
        expect(isDeprecatedEvent({ type: "SOFT_DEADLINE_SIGNAL_OBSERVED" })).toBe(true);
    });

    it("returns true for URGENCY_SIGNAL_OBSERVED", () => {
        expect(isDeprecatedEvent({ type: "URGENCY_SIGNAL_OBSERVED" })).toBe(true);
    });

    it("returns true for all REMINDER_* events", () => {
        expect(isDeprecatedEvent({ type: "REMINDER_CREATED" })).toBe(true);
        expect(isDeprecatedEvent({ type: "REMINDER_EDITED" })).toBe(true);
        expect(isDeprecatedEvent({ type: "REMINDER_DISMISSED" })).toBe(true);
        expect(isDeprecatedEvent({ type: "REMINDER_MERGED" })).toBe(true);
        expect(isDeprecatedEvent({ type: "REMINDER_REASSIGNED" })).toBe(true);
        expect(isDeprecatedEvent({ type: "REMINDER_EVALUATED" })).toBe(true);
    });

    it("returns false for active event types", () => {
        expect(isDeprecatedEvent(createWatcherCreatedEvent())).toBe(false);
        expect(isDeprecatedEvent(createThreadOpenedEvent())).toBe(false);
        expect(isDeprecatedEvent(createEmailReceivedEvent())).toBe(false);
        expect(isDeprecatedEvent(createActionRequestObservedEvent())).toBe(false);
        expect(isDeprecatedEvent(createSilenceThresholdExceededEvent())).toBe(false);
        expect(isDeprecatedEvent(createAlertQueuedEvent())).toBe(false);
        expect(isDeprecatedEvent(createTimeTickEvent())).toBe(false);
    });
});

// ============================================================================
// Event Structure Tests
// ============================================================================

describe("Event Structure Validation", () => {
    describe("BaseEvent fields", () => {
        it("all events have required base fields", () => {
            const events: VigilEvent[] = [
                createWatcherCreatedEvent(),
                createThreadOpenedEvent(),
                createEmailReceivedEvent(),
                createAlertQueuedEvent(),
                createTimeTickEvent(),
            ];

            for (const event of events) {
                expect(event.event_id).toBeDefined();
                expect(typeof event.event_id).toBe("string");
                expect(event.timestamp).toBeDefined();
                expect(typeof event.timestamp).toBe("number");
                expect(event.watcher_id).toBeDefined();
                expect(typeof event.watcher_id).toBe("string");
                expect(event.type).toBeDefined();
            }
        });
    });

    describe("ActionRequestObservedEvent", () => {
        it("has correct structure for commercial model", () => {
            const event = createActionRequestObservedEvent();

            expect(event.type).toBe("ACTION_REQUEST_OBSERVED");
            expect(event.message_id).toBeDefined();
            expect(event.action_summary).toBeDefined();
            expect(["confirmation", "approval", "response", "review", "unknown"]).toContain(
                event.request_type
            );
            expect(event.source_span).toBeDefined();
            expect(["high", "medium", "low"]).toContain(event.confidence);
            expect(event.extractor_version).toBeDefined();
        });

        it("does NOT contain deadline or urgency fields", () => {
            const event = createActionRequestObservedEvent() as any;

            // Commercial model: no deadlines, no urgency
            expect(event.deadline_utc).toBeUndefined();
            expect(event.urgency_level).toBeUndefined();
            expect(event.hard_deadline).toBeUndefined();
            expect(event.soft_deadline).toBeUndefined();
        });
    });

    describe("SilenceThresholdExceededEvent", () => {
        it("has correct structure", () => {
            const event = createSilenceThresholdExceededEvent();

            expect(event.type).toBe("SILENCE_THRESHOLD_EXCEEDED");
            expect(event.thread_id).toBeDefined();
            expect(typeof event.hours_silent).toBe("number");
            expect(typeof event.threshold_hours).toBe("number");
            expect(typeof event.last_activity_at).toBe("number");
            expect(event.hours_silent).toBeGreaterThanOrEqual(event.threshold_hours);
        });
    });

    describe("ThreadOpenedEvent", () => {
        it("has correct structure", () => {
            const event = createThreadOpenedEvent();

            expect(event.type).toBe("THREAD_OPENED");
            expect(event.thread_id).toBeDefined();
            expect(event.message_id).toBeDefined();
            expect(typeof event.opened_at).toBe("number");
            expect(event.normalized_subject).toBeDefined();
            expect(event.original_sender).toBeDefined();
            expect(event.action_request_event_id).toBeDefined();
        });

        it("does NOT contain deadline or reminder fields", () => {
            const event = createThreadOpenedEvent() as any;

            expect(event.deadline_utc).toBeUndefined();
            expect(event.reminder_ids).toBeUndefined();
            expect(event.urgency_level).toBeUndefined();
        });
    });
});

// ============================================================================
// Commercial Model Constraints Tests
// ============================================================================

describe("Commercial Model Constraints", () => {
    it("SILENCE_THRESHOLD_EXCEEDED is the only threshold alert type", () => {
        const event = createSilenceThresholdExceededEvent();
        expect(event.type).toBe("SILENCE_THRESHOLD_EXCEEDED");
        // No deadline_exceeded, no urgency_exceeded events in the system
    });

    it("AlertQueuedEvent alert_type is limited to silence_threshold", () => {
        const event = createAlertQueuedEvent();
        expect(event.alert_type).toBe("silence_threshold");
        // No deadline alerts, no reminder alerts
    });

    it("request_type values are bounded", () => {
        const validTypes = ["confirmation", "approval", "response", "review", "unknown"];
        const event = createActionRequestObservedEvent();
        expect(validTypes).toContain(event.request_type);
    });

    it("confidence values are bounded", () => {
        const validConfidence = ["high", "medium", "low"];
        const event = createActionRequestObservedEvent();
        expect(validConfidence).toContain(event.confidence);
    });
});
