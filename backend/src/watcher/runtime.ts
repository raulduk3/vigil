/**
 * Watcher Runtime
 *
 * Stateless function that rebuilds watcher state from events.
 * MUST be deterministic and side-effect free during replay.
 *
 * Commercial Model: Silence tracking only.
 * No deadline resolution, no urgency computation.
 */

import type {
    VigilEvent,
    WatcherPolicy,
    ThreadOpenedEvent,
    ThreadEmailAddedEvent,
    ThreadClosedEvent,
} from "../events/types";
import { isDeprecatedEvent } from "../events/types";

// ============================================================================
// State Types
// ============================================================================

export interface ThreadState {
    readonly thread_id: string;
    readonly watcher_id: string;
    readonly status: "open" | "closed";
    readonly opened_at: number;
    readonly closed_at: number | null;
    readonly last_activity_at: number;
    readonly last_action_request_event_id: string | null;
    readonly message_ids: readonly string[];
    readonly participants: readonly string[];
    readonly normalized_subject: string;
    readonly original_sender: string;
    readonly silence_alerted: boolean;
}

export interface WatcherState {
    readonly watcher_id: string;
    readonly account_id: string | null;
    readonly status: "created" | "active" | "paused" | "deleted";
    readonly policy: WatcherPolicy | null;
    readonly threads: ReadonlyMap<string, ThreadState>;
}

// ============================================================================
// Event Replay
// ============================================================================

/**
 * Rebuild watcher state from events.
 * Pure function - no side effects.
 */
export function replayEvents(events: readonly VigilEvent[]): WatcherState {
    let status: WatcherState["status"] = "created";
    let policy: WatcherPolicy | null = null;
    let accountId: string | null = null;
    let watcherId = "";
    const threads = new Map<string, ThreadState>();

    for (const event of events) {
        // Skip deprecated events (backward compatibility)
        if (isDeprecatedEvent(event)) {
            continue;
        }

        watcherId = event.watcher_id;

        switch (event.type) {
            case "WATCHER_CREATED":
                status = "created";
                accountId = event.account_id;
                break;

            case "WATCHER_ACTIVATED":
                status = "active";
                break;

            case "WATCHER_PAUSED":
                status = "paused";
                break;

            case "WATCHER_RESUMED":
                status = "active";
                break;

            case "WATCHER_DELETED":
                status = "deleted";
                break;

            case "POLICY_UPDATED":
                policy = event.policy;
                break;

            case "THREAD_OPENED": {
                const e = event as ThreadOpenedEvent;
                threads.set(e.thread_id, {
                    thread_id: e.thread_id,
                    watcher_id: e.watcher_id,
                    status: "open",
                    opened_at: e.opened_at,
                    closed_at: null,
                    last_activity_at: e.opened_at,
                    last_action_request_event_id: e.action_request_event_id,
                    message_ids: [e.message_id],
                    participants: [e.original_sender],
                    normalized_subject: e.normalized_subject,
                    original_sender: e.original_sender,
                    silence_alerted: false,
                });
                break;
            }

            case "THREAD_EMAIL_ADDED": {
                const e = event as ThreadEmailAddedEvent;
                const thread = threads.get(e.thread_id);
                if (thread) {
                    const participants = thread.participants.includes(e.sender)
                        ? thread.participants
                        : [...thread.participants, e.sender];
                    threads.set(e.thread_id, {
                        ...thread,
                        last_activity_at: e.added_at,
                        message_ids: [...thread.message_ids, e.message_id],
                        participants,
                        // Reset silence alert on new activity
                        silence_alerted: false,
                    });
                }
                break;
            }

            case "THREAD_CLOSED": {
                const e = event as ThreadClosedEvent;
                const thread = threads.get(e.thread_id);
                if (thread) {
                    threads.set(e.thread_id, {
                        ...thread,
                        status: "closed",
                        closed_at: e.closed_at,
                    });
                }
                break;
            }

            case "SILENCE_THRESHOLD_EXCEEDED": {
                const thread = threads.get(event.thread_id);
                if (thread) {
                    threads.set(event.thread_id, {
                        ...thread,
                        silence_alerted: true,
                    });
                }
                break;
            }

            // Events that don't affect watcher state
            case "EMAIL_RECEIVED":
            case "ACTION_REQUEST_OBSERVED":
            case "CLOSURE_SIGNAL_OBSERVED":
            case "TIME_TICK":
            case "ALERT_QUEUED":
            case "ALERT_SENT":
            case "ALERT_FAILED":
                // No state change
                break;
        }
    }

    return {
        watcher_id: watcherId,
        account_id: accountId,
        status,
        policy,
        threads,
    };
}

// ============================================================================
// Helpers
// ============================================================================

export function getOpenThreads(state: WatcherState): ThreadState[] {
    return Array.from(state.threads.values()).filter(
        (thread) => thread.status === "open"
    );
}

export function getThreadById(
    state: WatcherState,
    threadId: string
): ThreadState | undefined {
    return state.threads.get(threadId);
}
