/**
 * Silence Tracker Unit Tests
 *
 * Tests for core commercial capability: silence tracking.
 * Verifies duration computation, threshold crossing detection,
 * and TIME_TICK processing.
 */

import { describe, it, expect } from "bun:test";
import {
    computeSilenceDuration,
    detectSilenceThresholdCrossing,
    processTimeTick,
    type ThresholdCrossing,
} from "../../src/watcher/silence-tracker";
import type { WatcherState, ThreadState } from "../../src/watcher/runtime";
import type { WatcherPolicy, SilenceThresholdExceededEvent } from "../../src/events/types";

// ============================================================================
// Test Fixtures
// ============================================================================

const WATCHER_ID = "watcher-001";

const defaultPolicy: WatcherPolicy = {
    allowed_senders: [],
    silence_threshold_hours: 72, // 3 days
    notification_channels: [{ type: "email", destination: "user@example.com", enabled: true }],
};

function createOpenThread(
    threadId: string,
    lastActivityAt: number,
    silenceAlerted: boolean = false
): ThreadState {
    return {
        thread_id: threadId,
        watcher_id: WATCHER_ID,
        status: "open",
        opened_at: lastActivityAt,
        closed_at: null,
        last_activity_at: lastActivityAt,
        last_action_request_event_id: `evt-action-${threadId}`,
        message_ids: [`msg-${threadId}-1`],
        participants: ["alice@example.com"],
        normalized_subject: "test subject",
        original_sender: "alice@example.com",
        silence_alerted: silenceAlerted,
    };
}

function createClosedThread(threadId: string, lastActivityAt: number): ThreadState {
    return {
        ...createOpenThread(threadId, lastActivityAt),
        status: "closed",
        closed_at: lastActivityAt + 1000,
    };
}

function createWatcherState(
    threads: ThreadState[],
    policy: WatcherPolicy = defaultPolicy,
    status: "active" | "paused" = "active"
): WatcherState {
    const threadMap = new Map<string, ThreadState>();
    for (const thread of threads) {
        threadMap.set(thread.thread_id, thread);
    }
    return {
        watcher_id: WATCHER_ID,
        account_id: "acct-001",
        status,
        policy,
        threads: threadMap,
    };
}

// ============================================================================
// computeSilenceDuration Tests
// ============================================================================

describe("computeSilenceDuration", () => {
    it("computes duration in hours", () => {
        const now = Date.now();
        const threeHoursAgo = now - 3 * 60 * 60 * 1000;

        const hours = computeSilenceDuration(threeHoursAgo, now);

        expect(hours).toBeCloseTo(3, 2);
    });

    it("returns 0 for future timestamps", () => {
        const now = Date.now();
        const future = now + 1000;

        const hours = computeSilenceDuration(future, now);

        expect(hours).toBe(0);
    });

    it("returns 0 for same timestamp", () => {
        const now = Date.now();

        const hours = computeSilenceDuration(now, now);

        expect(hours).toBe(0);
    });

    it("computes fractional hours correctly", () => {
        const now = Date.now();
        const ninetyMinutesAgo = now - 90 * 60 * 1000;

        const hours = computeSilenceDuration(ninetyMinutesAgo, now);

        expect(hours).toBeCloseTo(1.5, 2);
    });

    it("computes large durations correctly", () => {
        const now = Date.now();
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

        const hours = computeSilenceDuration(oneWeekAgo, now);

        expect(hours).toBeCloseTo(168, 1); // 7 days * 24 hours
    });
});

// ============================================================================
// detectSilenceThresholdCrossing Tests
// ============================================================================

describe("detectSilenceThresholdCrossing", () => {
    const now = Date.now();
    const hours = (h: number) => h * 60 * 60 * 1000;

    describe("threshold crossing detection", () => {
        it("returns null when silence is below threshold", () => {
            const thread = createOpenThread("thread-001", now - hours(24)); // 24 hours silent
            const crossing = detectSilenceThresholdCrossing(thread, defaultPolicy, now);

            expect(crossing).toBeNull();
        });

        it("returns exceeded when silence equals threshold", () => {
            const thread = createOpenThread("thread-001", now - hours(72)); // Exactly 72 hours
            const crossing = detectSilenceThresholdCrossing(thread, defaultPolicy, now);

            expect(crossing).not.toBeNull();
            expect(crossing?.crossed).toBe(true);
            expect(crossing?.direction).toBe("exceeded");
        });

        it("returns exceeded when silence exceeds threshold", () => {
            const thread = createOpenThread("thread-001", now - hours(100)); // 100 hours silent
            const crossing = detectSilenceThresholdCrossing(thread, defaultPolicy, now);

            expect(crossing).not.toBeNull();
            expect(crossing?.crossed).toBe(true);
            expect(crossing?.direction).toBe("exceeded");
            expect(crossing?.threshold_hours).toBe(72);
            expect(crossing?.silence_hours).toBeGreaterThanOrEqual(100);
        });
    });

    describe("already alerted threads", () => {
        it("returns null for already alerted thread", () => {
            const thread = createOpenThread("thread-001", now - hours(100), true); // Already alerted
            const crossing = detectSilenceThresholdCrossing(thread, defaultPolicy, now);

            expect(crossing).toBeNull();
        });
    });

    describe("closed threads", () => {
        it("returns null for closed threads", () => {
            const thread = createClosedThread("thread-001", now - hours(100));
            const crossing = detectSilenceThresholdCrossing(thread, defaultPolicy, now);

            expect(crossing).toBeNull();
        });
    });

    describe("custom threshold policies", () => {
        it("respects custom threshold hours", () => {
            const shortPolicy: WatcherPolicy = {
                ...defaultPolicy,
                silence_threshold_hours: 24, // 24 hour threshold
            };

            const thread = createOpenThread("thread-001", now - hours(30)); // 30 hours silent

            const crossing = detectSilenceThresholdCrossing(thread, shortPolicy, now);

            expect(crossing).not.toBeNull();
            expect(crossing?.threshold_hours).toBe(24);
        });

        it("handles very short thresholds", () => {
            const veryShortPolicy: WatcherPolicy = {
                ...defaultPolicy,
                silence_threshold_hours: 1, // 1 hour threshold
            };

            const thread = createOpenThread("thread-001", now - hours(2));

            const crossing = detectSilenceThresholdCrossing(thread, veryShortPolicy, now);

            expect(crossing).not.toBeNull();
            expect(crossing?.threshold_hours).toBe(1);
        });

        it("handles very long thresholds", () => {
            const longPolicy: WatcherPolicy = {
                ...defaultPolicy,
                silence_threshold_hours: 168, // 1 week threshold
            };

            const thread = createOpenThread("thread-001", now - hours(100)); // Less than a week

            const crossing = detectSilenceThresholdCrossing(thread, longPolicy, now);

            expect(crossing).toBeNull();
        });
    });
});

// ============================================================================
// processTimeTick Tests
// ============================================================================

describe("processTimeTick", () => {
    const now = Date.now();
    const hours = (h: number) => h * 60 * 60 * 1000;

    describe("basic TIME_TICK processing", () => {
        it("emits SILENCE_THRESHOLD_EXCEEDED for silent thread", () => {
            const thread = createOpenThread("thread-001", now - hours(100));
            const state = createWatcherState([thread]);

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(1);
            expect(result.emittedEvents[0].type).toBe("SILENCE_THRESHOLD_EXCEEDED");

            const event = result.emittedEvents[0] as SilenceThresholdExceededEvent;
            expect(event.thread_id).toBe("thread-001");
            expect(event.threshold_hours).toBe(72);
            expect(event.hours_silent).toBeGreaterThanOrEqual(100);
        });

        it("tracks evaluated threads", () => {
            const thread1 = createOpenThread("thread-001", now - hours(24)); // Not silent enough
            const thread2 = createOpenThread("thread-002", now - hours(100)); // Silent
            const state = createWatcherState([thread1, thread2]);

            const result = processTimeTick(state, now);

            expect(result.evaluatedThreads).toContain("thread-001");
            expect(result.evaluatedThreads).toContain("thread-002");
        });

        it("emits events for multiple silent threads", () => {
            const thread1 = createOpenThread("thread-001", now - hours(100));
            const thread2 = createOpenThread("thread-002", now - hours(80));
            const state = createWatcherState([thread1, thread2]);

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(2);
        });
    });

    describe("inactive watcher handling", () => {
        it("returns empty result for paused watcher", () => {
            const thread = createOpenThread("thread-001", now - hours(100));
            const state = createWatcherState([thread], defaultPolicy, "paused");

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(0);
            expect(result.evaluatedThreads).toHaveLength(0);
        });

        it("returns empty result for watcher without policy", () => {
            const thread = createOpenThread("thread-001", now - hours(100));
            const state: WatcherState = {
                watcher_id: WATCHER_ID,
                account_id: "acct-001",
                status: "active",
                policy: null, // No policy
                threads: new Map([["thread-001", thread]]),
            };

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(0);
        });
    });

    describe("closed and alerted thread handling", () => {
        it("does not emit for closed threads", () => {
            const thread = createClosedThread("thread-001", now - hours(100));
            const state = createWatcherState([thread]);

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(0);
        });

        it("does not emit for already alerted threads", () => {
            const thread = createOpenThread("thread-001", now - hours(100), true);
            const state = createWatcherState([thread]);

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(0);
        });
    });

    describe("mixed thread scenarios", () => {
        it("correctly handles mix of open, closed, and alerted threads", () => {
            const silentOpen = createOpenThread("thread-001", now - hours(100)); // Should alert
            const activeOpen = createOpenThread("thread-002", now - hours(10)); // Below threshold
            const closed = createClosedThread("thread-003", now - hours(100)); // Closed
            const alerted = createOpenThread("thread-004", now - hours(100), true); // Already alerted

            const state = createWatcherState([silentOpen, activeOpen, closed, alerted]);

            const result = processTimeTick(state, now);

            expect(result.emittedEvents).toHaveLength(1);
            expect((result.emittedEvents[0] as SilenceThresholdExceededEvent).thread_id).toBe(
                "thread-001"
            );
        });
    });

    describe("event structure validation", () => {
        it("emitted events have correct structure", () => {
            const thread = createOpenThread("thread-001", now - hours(80));
            const state = createWatcherState([thread]);

            const result = processTimeTick(state, now);
            const event = result.emittedEvents[0] as SilenceThresholdExceededEvent;

            expect(event.event_id).toBeDefined();
            expect(event.timestamp).toBe(now);
            expect(event.watcher_id).toBe(WATCHER_ID);
            expect(event.type).toBe("SILENCE_THRESHOLD_EXCEEDED");
            expect(event.thread_id).toBe("thread-001");
            expect(typeof event.hours_silent).toBe("number");
            expect(typeof event.threshold_hours).toBe("number");
            expect(typeof event.last_activity_at).toBe("number");
        });

        it("event IDs are unique UUIDs", () => {
            const thread1 = createOpenThread("thread-001", now - hours(100));
            const thread2 = createOpenThread("thread-002", now - hours(100));
            const state = createWatcherState([thread1, thread2]);

            const result = processTimeTick(state, now);

            const eventIds = result.emittedEvents.map((e) => e.event_id);
            const uniqueIds = new Set(eventIds);

            expect(uniqueIds.size).toBe(eventIds.length);
        });
    });
});

// ============================================================================
// Commercial Model Constraints Tests
// ============================================================================

describe("Commercial Model - Silence Tracking", () => {
    it("only tracks silence - no deadline comparison", () => {
        const now = Date.now();
        const hours = (h: number) => h * 60 * 60 * 1000;

        const thread = createOpenThread("thread-001", now - hours(100));
        const state = createWatcherState([thread]);

        const result = processTimeTick(state, now);

        // Event should be SILENCE_THRESHOLD_EXCEEDED, not deadline-related
        expect(result.emittedEvents[0].type).toBe("SILENCE_THRESHOLD_EXCEEDED");

        // No deadline checking
        const event = result.emittedEvents[0] as any;
        expect(event.deadline_exceeded).toBeUndefined();
        expect(event.deadline_utc).toBeUndefined();
    });

    it("alert fires once per threshold crossing (no continuous alerting)", () => {
        const now = Date.now();
        const hours = (h: number) => h * 60 * 60 * 1000;

        // First tick - should alert
        const thread1 = createOpenThread("thread-001", now - hours(100));
        const state1 = createWatcherState([thread1]);
        const result1 = processTimeTick(state1, now);

        expect(result1.emittedEvents).toHaveLength(1);

        // Simulate the thread being updated with silence_alerted = true
        // Second tick - should NOT alert again
        const thread2 = createOpenThread("thread-001", now - hours(110), true);
        const state2 = createWatcherState([thread2]);
        const result2 = processTimeTick(state2, now);

        expect(result2.emittedEvents).toHaveLength(0);
    });

    it("alert resets when activity resumes and then goes silent again", () => {
        const now = Date.now();
        const hours = (h: number) => h * 60 * 60 * 1000;

        // Thread was alerted, but new activity happened, so silence_alerted reset to false
        // Now it's silent again past threshold
        const thread = createOpenThread("thread-001", now - hours(80), false);
        const state = createWatcherState([thread]);

        const result = processTimeTick(state, now);

        expect(result.emittedEvents).toHaveLength(1);
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
    const now = Date.now();
    const hours = (h: number) => h * 60 * 60 * 1000;

    it("handles empty thread list", () => {
        const state = createWatcherState([]);
        const result = processTimeTick(state, now);

        expect(result.emittedEvents).toHaveLength(0);
        expect(result.evaluatedThreads).toHaveLength(0);
    });

    it("handles very recent activity", () => {
        const thread = createOpenThread("thread-001", now - 1000); // 1 second ago
        const state = createWatcherState([thread]);

        const result = processTimeTick(state, now);

        expect(result.emittedEvents).toHaveLength(0);
    });

    it("handles activity exactly at current time", () => {
        const thread = createOpenThread("thread-001", now);
        const state = createWatcherState([thread]);

        const result = processTimeTick(state, now);

        expect(result.emittedEvents).toHaveLength(0);
    });

    it("handles zero threshold policy", () => {
        const zeroPolicy: WatcherPolicy = {
            ...defaultPolicy,
            silence_threshold_hours: 0,
        };

        const thread = createOpenThread("thread-001", now - 1000);
        const state = createWatcherState([thread], zeroPolicy);

        const result = processTimeTick(state, now);

        // Any silence exceeds zero threshold
        expect(result.emittedEvents).toHaveLength(1);
    });
});
