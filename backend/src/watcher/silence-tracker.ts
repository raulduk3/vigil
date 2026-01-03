/**
 * Silence Tracker
 *
 * Computes silence duration and detects threshold crossings.
 * Core commercial capability.
 */

import type {
    WatcherPolicy,
    SilenceThresholdExceededEvent,
    VigilEvent,
} from "../events/types";
import type { ThreadState, WatcherState } from "./runtime";
import { getOpenThreads } from "./runtime";

// ============================================================================
// Silence Duration Computation
// ============================================================================

/**
 * Compute silence duration in hours.
 */
export function computeSilenceDuration(
    lastActivityAt: number,
    currentTime: number
): number {
    const diffMs = currentTime - lastActivityAt;
    const hours = diffMs / (1000 * 60 * 60);
    return Math.max(0, hours);
}

// ============================================================================
// Threshold Crossing Detection
// ============================================================================

export interface ThresholdCrossing {
    crossed: boolean;
    direction: "exceeded" | "recovered";
    threshold_hours: number;
    silence_hours: number;
}

/**
 * Detect if silence has crossed the policy threshold.
 * Only detects NEW crossings - if already alerted, returns null.
 */
export function detectSilenceThresholdCrossing(
    thread: ThreadState,
    policy: WatcherPolicy,
    currentTime: number
): ThresholdCrossing | null {
    // Closed threads don't generate silence alerts
    if (thread.status === "closed") {
        return null;
    }

    // Already alerted for this silence period
    if (thread.silence_alerted) {
        return null;
    }

    const threshold = policy.silence_threshold_hours;
    const currentSilence = computeSilenceDuration(
        thread.last_activity_at,
        currentTime
    );

    if (currentSilence >= threshold) {
        return {
            crossed: true,
            direction: "exceeded",
            threshold_hours: threshold,
            silence_hours: currentSilence,
        };
    }

    return null;
}

// ============================================================================
// TIME_TICK Processing
// ============================================================================

export interface TimeTickResult {
    emittedEvents: VigilEvent[];
    evaluatedThreads: string[];
}

/**
 * Process a TIME_TICK event and emit SILENCE_THRESHOLD_EXCEEDED for any
 * threads that have crossed the silence threshold.
 */
export function processTimeTick(
    state: WatcherState,
    tickTimestamp: number
): TimeTickResult {
    const emittedEvents: VigilEvent[] = [];
    const evaluatedThreads: string[] = [];

    if (!state.policy || state.status !== "active") {
        return { emittedEvents, evaluatedThreads };
    }

    const openThreads = getOpenThreads(state);

    for (const thread of openThreads) {
        evaluatedThreads.push(thread.thread_id);

        const crossing = detectSilenceThresholdCrossing(
            thread,
            state.policy,
            tickTimestamp
        );

        if (crossing?.crossed && crossing.direction === "exceeded") {
            const event: SilenceThresholdExceededEvent = {
                event_id: crypto.randomUUID(),
                timestamp: tickTimestamp,
                watcher_id: state.watcher_id,
                type: "SILENCE_THRESHOLD_EXCEEDED",
                thread_id: thread.thread_id,
                hours_silent: crossing.silence_hours,
                threshold_hours: crossing.threshold_hours,
                last_activity_at: thread.last_activity_at,
            };
            emittedEvents.push(event);
        }
    }

    return { emittedEvents, evaluatedThreads };
}
