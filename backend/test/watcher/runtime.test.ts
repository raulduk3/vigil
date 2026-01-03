/**
 * Watcher Runtime Unit Tests
 *
 * Tests for event replay and state derivation.
 * Core to the event-sourced architecture.
 */

import { describe, it, expect } from "bun:test";
import {
    replayEvents,
    getOpenThreads,
    getThreadById,
    type WatcherState,
    type ThreadState,
} from "../../src/watcher/runtime";
import type {
    VigilEvent,
    WatcherCreatedEvent,
    WatcherActivatedEvent,
    WatcherPausedEvent,
    WatcherResumedEvent,
    WatcherDeletedEvent,
    PolicyUpdatedEvent,
    ThreadOpenedEvent,
    ThreadEmailAddedEvent,
    ThreadClosedEvent,
    SilenceThresholdExceededEvent,
    WatcherPolicy,
} from "../../src/events/types";

// ============================================================================
// Test Fixtures
// ============================================================================

const WATCHER_ID = "watcher-001";
const ACCOUNT_ID = "acct-001";
const USER_ID = "user-001";

const baseTimestamp = Date.now();

function createWatcherCreatedEvent(ts: number = baseTimestamp): WatcherCreatedEvent {
    return {
        event_id: `evt-created-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "WATCHER_CREATED",
        account_id: ACCOUNT_ID,
        name: "Finance Watcher",
        ingest_token: "abc123",
        created_by: USER_ID,
    };
}

function createWatcherActivatedEvent(ts: number): WatcherActivatedEvent {
    return {
        event_id: `evt-activated-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "WATCHER_ACTIVATED",
        activated_by: USER_ID,
    };
}

function createWatcherPausedEvent(ts: number): WatcherPausedEvent {
    return {
        event_id: `evt-paused-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "WATCHER_PAUSED",
        paused_by: USER_ID,
        reason: "Maintenance",
    };
}

function createWatcherResumedEvent(ts: number): WatcherResumedEvent {
    return {
        event_id: `evt-resumed-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "WATCHER_RESUMED",
        resumed_by: USER_ID,
    };
}

function createWatcherDeletedEvent(ts: number): WatcherDeletedEvent {
    return {
        event_id: `evt-deleted-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "WATCHER_DELETED",
        deleted_by: USER_ID,
    };
}

function createPolicyUpdatedEvent(ts: number, policy: WatcherPolicy): PolicyUpdatedEvent {
    return {
        event_id: `evt-policy-${ts}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "POLICY_UPDATED",
        policy,
        updated_by: USER_ID,
    };
}

function createThreadOpenedEvent(
    threadId: string,
    ts: number,
    sender: string = "alice@example.com"
): ThreadOpenedEvent {
    return {
        event_id: `evt-thread-opened-${threadId}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "THREAD_OPENED",
        thread_id: threadId,
        message_id: `msg-${threadId}-1`,
        opened_at: ts,
        normalized_subject: "quarterly report",
        original_sender: sender,
        action_request_event_id: `evt-action-${threadId}`,
    };
}

function createThreadEmailAddedEvent(
    threadId: string,
    messageId: string,
    ts: number,
    sender: string = "bob@example.com"
): ThreadEmailAddedEvent {
    return {
        event_id: `evt-email-added-${messageId}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "THREAD_EMAIL_ADDED",
        thread_id: threadId,
        message_id: messageId,
        sender,
        added_at: ts,
    };
}

function createThreadClosedEvent(threadId: string, ts: number): ThreadClosedEvent {
    return {
        event_id: `evt-thread-closed-${threadId}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "THREAD_CLOSED",
        thread_id: threadId,
        closed_at: ts,
        closed_by: "user_action",
        reason: "Resolved",
    };
}

function createSilenceThresholdExceededEvent(
    threadId: string,
    ts: number
): SilenceThresholdExceededEvent {
    return {
        event_id: `evt-silence-${threadId}`,
        timestamp: ts,
        watcher_id: WATCHER_ID,
        type: "SILENCE_THRESHOLD_EXCEEDED",
        thread_id: threadId,
        hours_silent: 76,
        threshold_hours: 72,
        last_activity_at: ts - 76 * 60 * 60 * 1000,
    };
}

const defaultPolicy: WatcherPolicy = {
    allowed_senders: [],
    silence_threshold_hours: 72,
    notification_channels: [{ type: "email", destination: "user@example.com", enabled: true }],
};

// ============================================================================
// Watcher Lifecycle Tests
// ============================================================================

describe("replayEvents - Watcher Lifecycle", () => {
    it("returns initial state for empty events", () => {
        const state = replayEvents([]);

        expect(state.watcher_id).toBe("");
        expect(state.account_id).toBeNull();
        expect(state.status).toBe("created");
        expect(state.policy).toBeNull();
        expect(state.threads.size).toBe(0);
    });

    it("sets watcher_id and account_id from WATCHER_CREATED", () => {
        const events = [createWatcherCreatedEvent(1000)];
        const state = replayEvents(events);

        expect(state.watcher_id).toBe(WATCHER_ID);
        expect(state.account_id).toBe(ACCOUNT_ID);
        expect(state.status).toBe("created");
    });

    it("transitions to active on WATCHER_ACTIVATED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createWatcherActivatedEvent(2000),
        ];
        const state = replayEvents(events);

        expect(state.status).toBe("active");
    });

    it("transitions to paused on WATCHER_PAUSED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createWatcherActivatedEvent(2000),
            createWatcherPausedEvent(3000),
        ];
        const state = replayEvents(events);

        expect(state.status).toBe("paused");
    });

    it("transitions back to active on WATCHER_RESUMED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createWatcherActivatedEvent(2000),
            createWatcherPausedEvent(3000),
            createWatcherResumedEvent(4000),
        ];
        const state = replayEvents(events);

        expect(state.status).toBe("active");
    });

    it("transitions to deleted on WATCHER_DELETED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createWatcherActivatedEvent(2000),
            createWatcherDeletedEvent(3000),
        ];
        const state = replayEvents(events);

        expect(state.status).toBe("deleted");
    });

    it("updates policy on POLICY_UPDATED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createPolicyUpdatedEvent(2000, defaultPolicy),
        ];
        const state = replayEvents(events);

        expect(state.policy).toEqual(defaultPolicy);
    });

    it("handles multiple policy updates, last one wins", () => {
        const policy1: WatcherPolicy = { ...defaultPolicy, silence_threshold_hours: 48 };
        const policy2: WatcherPolicy = { ...defaultPolicy, silence_threshold_hours: 96 };

        const events = [
            createWatcherCreatedEvent(1000),
            createPolicyUpdatedEvent(2000, policy1),
            createPolicyUpdatedEvent(3000, policy2),
        ];
        const state = replayEvents(events);

        expect(state.policy?.silence_threshold_hours).toBe(96);
    });
});

// ============================================================================
// Thread Lifecycle Tests
// ============================================================================

describe("replayEvents - Thread Lifecycle", () => {
    it("creates thread on THREAD_OPENED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];
        const state = replayEvents(events);

        expect(state.threads.size).toBe(1);

        const thread = state.threads.get("thread-001");
        expect(thread).toBeDefined();
        expect(thread?.thread_id).toBe("thread-001");
        expect(thread?.status).toBe("open");
        expect(thread?.opened_at).toBe(2000);
        expect(thread?.closed_at).toBeNull();
        expect(thread?.last_activity_at).toBe(2000);
        expect(thread?.message_ids).toEqual(["msg-thread-001-1"]);
        expect(thread?.participants).toContain("alice@example.com");
        expect(thread?.silence_alerted).toBe(false);
    });

    it("updates thread on THREAD_EMAIL_ADDED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000, "alice@example.com"),
            createThreadEmailAddedEvent("thread-001", "msg-002", 3000, "bob@example.com"),
        ];
        const state = replayEvents(events);

        const thread = state.threads.get("thread-001");
        expect(thread?.last_activity_at).toBe(3000);
        expect(thread?.message_ids).toHaveLength(2);
        expect(thread?.message_ids).toContain("msg-002");
        expect(thread?.participants).toContain("alice@example.com");
        expect(thread?.participants).toContain("bob@example.com");
    });

    it("does not duplicate participants on same sender email", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000, "alice@example.com"),
            createThreadEmailAddedEvent("thread-001", "msg-002", 3000, "alice@example.com"),
        ];
        const state = replayEvents(events);

        const thread = state.threads.get("thread-001");
        expect(thread?.participants).toHaveLength(1);
        expect(thread?.participants).toEqual(["alice@example.com"]);
    });

    it("closes thread on THREAD_CLOSED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
            createThreadClosedEvent("thread-001", 3000),
        ];
        const state = replayEvents(events);

        const thread = state.threads.get("thread-001");
        expect(thread?.status).toBe("closed");
        expect(thread?.closed_at).toBe(3000);
    });

    it("sets silence_alerted on SILENCE_THRESHOLD_EXCEEDED", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
            createSilenceThresholdExceededEvent("thread-001", 3000),
        ];
        const state = replayEvents(events);

        const thread = state.threads.get("thread-001");
        expect(thread?.silence_alerted).toBe(true);
    });

    it("resets silence_alerted on new activity", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
            createSilenceThresholdExceededEvent("thread-001", 3000),
            createThreadEmailAddedEvent("thread-001", "msg-002", 4000),
        ];
        const state = replayEvents(events);

        const thread = state.threads.get("thread-001");
        expect(thread?.silence_alerted).toBe(false);
    });
});

// ============================================================================
// Deprecated Event Tests
// ============================================================================

describe("replayEvents - Deprecated Events", () => {
    it("skips deprecated deadline events", () => {
        const deprecatedEvent = {
            event_id: "evt-deprecated-001",
            timestamp: 2000,
            watcher_id: WATCHER_ID,
            type: "HARD_DEADLINE_OBSERVED",
            message_id: "msg-001",
            deadline_utc: "2024-01-15T10:00:00Z",
        };

        const events = [
            createWatcherCreatedEvent(1000),
            deprecatedEvent as any,
            createWatcherActivatedEvent(3000),
        ];
        const state = replayEvents(events);

        // Should still process other events
        expect(state.status).toBe("active");
    });

    it("skips deprecated reminder events", () => {
        const reminderEvent = {
            event_id: "evt-reminder-001",
            timestamp: 2000,
            watcher_id: WATCHER_ID,
            type: "REMINDER_CREATED",
            reminder_id: "reminder-001",
        };

        const events = [
            createWatcherCreatedEvent(1000),
            reminderEvent as any,
        ];
        const state = replayEvents(events);

        // State should be unaffected
        expect(state.status).toBe("created");
    });

    it("skips deprecated urgency events", () => {
        const urgencyEvent = {
            event_id: "evt-urgency-001",
            timestamp: 2000,
            watcher_id: WATCHER_ID,
            type: "URGENCY_SIGNAL_OBSERVED",
            urgency_level: "high",
        };

        const events = [
            createWatcherCreatedEvent(1000),
            urgencyEvent as any,
        ];
        const state = replayEvents(events);

        expect(state.status).toBe("created");
    });
});

// ============================================================================
// Deterministic Replay Tests
// ============================================================================

describe("replayEvents - Determinism", () => {
    it("produces identical state from identical events", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createWatcherActivatedEvent(2000),
            createPolicyUpdatedEvent(3000, defaultPolicy),
            createThreadOpenedEvent("thread-001", 4000),
            createThreadEmailAddedEvent("thread-001", "msg-002", 5000),
        ];

        const state1 = replayEvents(events);
        const state2 = replayEvents(events);

        expect(state1.watcher_id).toBe(state2.watcher_id);
        expect(state1.status).toBe(state2.status);
        expect(state1.policy).toEqual(state2.policy);
        expect(state1.threads.size).toBe(state2.threads.size);

        const thread1 = state1.threads.get("thread-001");
        const thread2 = state2.threads.get("thread-001");
        expect(thread1?.last_activity_at).toBe(thread2?.last_activity_at);
        expect(thread1?.message_ids).toEqual(thread2?.message_ids);
    });

    it("is pure - no side effects", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];

        // Copy original events
        const originalLength = events.length;
        const originalEvent = { ...events[0] };

        replayEvents(events);

        // Events should be unmodified
        expect(events.length).toBe(originalLength);
        expect(events[0]).toEqual(originalEvent);
    });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("getOpenThreads", () => {
    it("returns only open threads", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
            createThreadOpenedEvent("thread-002", 3000),
            createThreadClosedEvent("thread-001", 4000),
        ];
        const state = replayEvents(events);

        const openThreads = getOpenThreads(state);

        expect(openThreads).toHaveLength(1);
        expect(openThreads[0].thread_id).toBe("thread-002");
    });

    it("returns empty array when no open threads", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
            createThreadClosedEvent("thread-001", 3000),
        ];
        const state = replayEvents(events);

        const openThreads = getOpenThreads(state);

        expect(openThreads).toHaveLength(0);
    });

    it("returns empty array when no threads exist", () => {
        const events = [createWatcherCreatedEvent(1000)];
        const state = replayEvents(events);

        const openThreads = getOpenThreads(state);

        expect(openThreads).toHaveLength(0);
    });
});

describe("getThreadById", () => {
    it("returns thread by ID", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];
        const state = replayEvents(events);

        const thread = getThreadById(state, "thread-001");

        expect(thread).toBeDefined();
        expect(thread?.thread_id).toBe("thread-001");
    });

    it("returns undefined for unknown thread ID", () => {
        const events = [createWatcherCreatedEvent(1000)];
        const state = replayEvents(events);

        const thread = getThreadById(state, "unknown-thread");

        expect(thread).toBeUndefined();
    });
});

// ============================================================================
// Commercial Model Constraints Tests
// ============================================================================

describe("Commercial Model - Thread State", () => {
    it("ThreadState does NOT contain deadline fields", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];
        const state = replayEvents(events);
        const thread = state.threads.get("thread-001") as any;

        expect(thread.deadline_utc).toBeUndefined();
        expect(thread.hard_deadline).toBeUndefined();
        expect(thread.soft_deadline).toBeUndefined();
    });

    it("ThreadState does NOT contain urgency fields", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];
        const state = replayEvents(events);
        const thread = state.threads.get("thread-001") as any;

        expect(thread.urgency_level).toBeUndefined();
    });

    it("ThreadState does NOT contain reminder fields", () => {
        const events = [
            createWatcherCreatedEvent(1000),
            createThreadOpenedEvent("thread-001", 2000),
        ];
        const state = replayEvents(events);
        const thread = state.threads.get("thread-001") as any;

        expect(thread.reminder_ids).toBeUndefined();
    });
});
