/**
 * Watcher Runtime Executor
 *
 * Stateless function that rebuilds watcher state from events.
 * MUST be deterministic and side-effect free during replay.
 * Invoked by backend control plane only.
 *
 * Key Design Constraint (DC-1): Threads do NOT own deadlines.
 * Deadlines belong to Reminders. Threads reference extraction events
 * for deadline resolution during urgency computation.
 */

import type { VigilEvent, WatcherPolicy } from "../events/types";
import type { EventStore } from "../events/event-store";

/**
 * Urgency level type for thread evaluation
 */
export type UrgencyLevel = "ok" | "warning" | "critical" | "overdue";

/**
 * Convert urgency level to numeric priority for comparison.
 * Higher number = more urgent.
 */
export function urgencyPriority(level: UrgencyLevel): number {
    const priorities: Record<UrgencyLevel, number> = {
        ok: 0,
        warning: 1,
        critical: 2,
        overdue: 3,
    };
    return priorities[level];
}

/**
 * Deadline type for reminders (not threads)
 */
export type DeadlineType = "hard" | "soft" | "none";

/**
 * Trigger type for thread creation
 */
export type ThreadTriggerType =
    | "hard_deadline"
    | "soft_deadline"
    | "urgency_signal"
    | "closure";

/**
 * Thread state derived from events.
 * This is never persisted - always rebuilt from events.
 *
 * Per DC-1: Threads do NOT own deadline_timestamp.
 * Deadlines are resolved via hard_deadline_event_id or soft_deadline_event_id
 * during urgency computation.
 *
 * Note: Thread tracks the ORIGINAL conversation participants (sender, recipients),
 * not the Vigil user who forwarded the email. Timestamps reflect when emails
 * were originally sent, not when Vigil ingested them.
 */
export type ThreadState = {
    readonly thread_id: string;
    readonly watcher_id: string;
    readonly trigger_type: ThreadTriggerType;
    readonly opened_at: number; // when thread was opened (based on first message's sent_at)
    readonly last_activity_at: number; // when last message in thread was sent (not ingested)
    readonly status: "open" | "closed";
    readonly closed_at: number | null;
    readonly message_ids: readonly string[];
    readonly participants: readonly string[]; // original conversation participants (senders/recipients, not Vigil user)
    readonly normalized_subject: string;
    readonly original_sender: string; // who started the conversation
    readonly original_sent_at: number; // when the first message was sent
    // References to extraction events for deadline resolution
    readonly hard_deadline_event_id: string | null;
    readonly soft_deadline_event_id: string | null;
    // State tracking for transition detection (MR-WatcherRuntime-4)
    readonly last_urgency_state: UrgencyLevel;
    readonly last_alert_urgency: UrgencyLevel | null;
    // Active message associations (soft association model)
    readonly active_message_ids: readonly string[];
};

/**
 * Reminder state derived from events.
 * Reminders are portable semantic obligations that can move between threads.
 */
export type ReminderState = {
    readonly reminder_id: string;
    readonly watcher_id: string;
    readonly thread_id: string; // current thread association
    readonly reminder_type: "hard_deadline" | "soft_deadline" | "urgency_signal" | "custom";
    readonly deadline_utc: number | null;
    readonly source_span: string | null; // null for manual reminders
    readonly description: string | null; // for manual reminders
    readonly confidence: "high" | "medium" | "low" | null;
    readonly status: "active" | "dismissed" | "merged";
    readonly extraction_event_id: string | null; // null for manual reminders
    readonly created_by: "system" | string; // "system" for LLM extraction, user_id for manual
    readonly created_at: number;
    readonly merged_into: string | null; // target reminder_id if merged
};

/**
 * Message-thread association state.
 * Tracks whether a message actively affects a thread's calculations.
 */
export type MessageAssociationState = {
    readonly message_id: string;
    readonly thread_id: string;
    readonly status: "active" | "inactive";
};

/**
 * Watcher state derived from events.
 * This is never persisted - always rebuilt from events.
 */
export type WatcherState = {
    readonly watcher_id: string;
    readonly account_id: string | null;
    readonly status: "created" | "active" | "paused" | "deleted";
    readonly threads: ReadonlyMap<string, ThreadState>;
    readonly policy: WatcherPolicy | null;
    // Map of event_id -> extraction event for deadline resolution
    readonly extraction_events: ReadonlyMap<string, VigilEvent>;
    // Reminders (portable semantic obligations)
    readonly reminders: ReadonlyMap<string, ReminderState>;
    // Message-thread associations
    readonly message_associations: ReadonlyMap<string, MessageAssociationState>;
};

/**
 * Rebuild watcher state from events.
 * Pure function - no side effects.
 *
 * Per DC-3: Extraction events are always recorded for audit trail.
 * Per DC-1: Thread deadline resolution happens via extraction event references.
 */
export function replayEvents(events: readonly VigilEvent[]): WatcherState {
    let status: WatcherState["status"] = "created";
    let policy: WatcherPolicy | null = null;
    let accountId: string | null = null;
    const threads = new Map<string, ThreadState>();
    const extraction_events = new Map<string, VigilEvent>();
    const reminders = new Map<string, ReminderState>();
    const message_associations = new Map<string, MessageAssociationState>();

    for (const event of events) {
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

            // Store extraction events for deadline resolution (DC-1, DC-3)
            case "HARD_DEADLINE_OBSERVED":
            case "SOFT_DEADLINE_SIGNAL_OBSERVED":
            case "URGENCY_SIGNAL_OBSERVED":
            case "CLOSURE_SIGNAL_OBSERVED":
                extraction_events.set(event.event_id, event);
                break;

            case "THREAD_OPENED": {
                threads.set(event.thread_id, {
                    thread_id: event.thread_id,
                    watcher_id: event.watcher_id,
                    trigger_type: event.trigger_type ?? "hard_deadline",
                    opened_at: event.opened_at,
                    last_activity_at: event.opened_at,
                    status: "open",
                    closed_at: null,
                    message_ids: [event.message_id],
                    participants: event.original_sender
                        ? [event.original_sender]
                        : [],
                    normalized_subject: event.normalized_subject ?? "",
                    original_sender: event.original_sender ?? "",
                    original_sent_at: event.original_sent_at ?? event.opened_at,
                    // Link extraction events for deadline resolution (DC-1)
                    hard_deadline_event_id: event.hard_deadline_event_id ?? null,
                    soft_deadline_event_id: event.soft_deadline_event_id ?? null,
                    last_urgency_state: "ok",
                    last_alert_urgency: null,
                    active_message_ids: [event.message_id],
                });
                break;
            }

            case "THREAD_ACTIVITY_OBSERVED": {
                const thread = threads.get(event.thread_id);
                if (thread && thread.status === "open") {
                    // Add sender to participants if not already present
                    const updatedParticipants =
                        event.sender &&
                        !thread.participants.includes(event.sender)
                            ? [...thread.participants, event.sender]
                            : thread.participants;

                    threads.set(event.thread_id, {
                        ...thread,
                        last_activity_at: event.activity_at,
                        message_ids: [...thread.message_ids, event.message_id],
                        participants: updatedParticipants,
                        active_message_ids: [...thread.active_message_ids, event.message_id],
                    });
                }
                break;
            }

            case "THREAD_CLOSED": {
                const thread = threads.get(event.thread_id);
                if (thread) {
                    threads.set(event.thread_id, {
                        ...thread,
                        status: "closed",
                        closed_at: event.closed_at,
                    });
                }
                break;
            }

            // Message-thread association events (soft association model)
            case "MESSAGE_THREAD_ASSOCIATED": {
                const assocKey = `${event.message_id}:${event.thread_id}`;
                message_associations.set(assocKey, {
                    message_id: event.message_id,
                    thread_id: event.thread_id,
                    status: "active",
                });
                // Add to thread's active messages
                const thread = threads.get(event.thread_id);
                if (thread && !thread.active_message_ids.includes(event.message_id)) {
                    threads.set(event.thread_id, {
                        ...thread,
                        active_message_ids: [...thread.active_message_ids, event.message_id],
                    });
                }
                break;
            }

            case "MESSAGE_THREAD_DEACTIVATED": {
                const assocKey = `${event.message_id}:${event.thread_id}`;
                const existing = message_associations.get(assocKey);
                if (existing) {
                    message_associations.set(assocKey, {
                        ...existing,
                        status: "inactive",
                    });
                }
                // Remove from thread's active messages
                const thread = threads.get(event.thread_id);
                if (thread) {
                    threads.set(event.thread_id, {
                        ...thread,
                        active_message_ids: thread.active_message_ids.filter(
                            (id) => id !== event.message_id
                        ),
                    });
                }
                break;
            }

            case "MESSAGE_THREAD_REACTIVATED": {
                const assocKey = `${event.message_id}:${event.thread_id}`;
                const existing = message_associations.get(assocKey);
                if (existing) {
                    message_associations.set(assocKey, {
                        ...existing,
                        status: "active",
                    });
                }
                // Add back to thread's active messages
                const thread = threads.get(event.thread_id);
                if (thread && !thread.active_message_ids.includes(event.message_id)) {
                    threads.set(event.thread_id, {
                        ...thread,
                        active_message_ids: [...thread.active_message_ids, event.message_id],
                    });
                }
                break;
            }

            // Reminder events (portable semantic obligations)
            case "REMINDER_CREATED": {
                reminders.set(event.reminder_id, {
                    reminder_id: event.reminder_id,
                    watcher_id: event.watcher_id,
                    thread_id: event.thread_id,
                    reminder_type: event.reminder_type,
                    deadline_utc: event.deadline_utc,
                    source_span: event.source_span,
                    description: null,
                    confidence: event.confidence,
                    status: "active",
                    extraction_event_id: event.extraction_event_id,
                    created_by: "system",
                    created_at: event.created_at,
                    merged_into: null,
                });
                break;
            }

            case "REMINDER_MANUAL_CREATED": {
                reminders.set(event.reminder_id, {
                    reminder_id: event.reminder_id,
                    watcher_id: event.watcher_id,
                    thread_id: event.thread_id,
                    reminder_type: event.reminder_type,
                    deadline_utc: event.deadline_utc,
                    source_span: null,
                    description: event.description,
                    confidence: null,
                    status: "active",
                    extraction_event_id: null,
                    created_by: event.created_by,
                    created_at: event.created_at,
                    merged_into: null,
                });
                break;
            }

            case "REMINDER_EDITED": {
                const reminder = reminders.get(event.reminder_id);
                if (reminder) {
                    reminders.set(event.reminder_id, {
                        ...reminder,
                        ...(event.changes.deadline_utc !== undefined && {
                            deadline_utc: event.changes.deadline_utc,
                        }),
                        ...(event.changes.description !== undefined && {
                            description: event.changes.description,
                        }),
                        ...(event.changes.reminder_type !== undefined && {
                            reminder_type: event.changes.reminder_type,
                        }),
                    });
                }
                break;
            }

            case "REMINDER_DISMISSED": {
                const reminder = reminders.get(event.reminder_id);
                if (reminder) {
                    reminders.set(event.reminder_id, {
                        ...reminder,
                        status: "dismissed",
                    });
                }
                break;
            }

            case "REMINDER_MERGED": {
                const sourceReminder = reminders.get(event.source_reminder_id);
                if (sourceReminder) {
                    reminders.set(event.source_reminder_id, {
                        ...sourceReminder,
                        status: "merged",
                        merged_into: event.target_reminder_id,
                    });
                }
                break;
            }

            case "REMINDER_REASSIGNED": {
                const reminder = reminders.get(event.reminder_id);
                if (reminder) {
                    reminders.set(event.reminder_id, {
                        ...reminder,
                        thread_id: event.to_thread_id,
                    });
                }
                break;
            }

            case "REMINDER_EVALUATED": {
                const thread = threads.get(event.thread_id);
                if (thread) {
                    threads.set(event.thread_id, {
                        ...thread,
                        last_urgency_state: event.urgency_state,
                    });
                }
                break;
            }

            // Other events don't affect watcher state during replay
            default:
                break;
        }
    }

    // Extract watcher_id from events (should be consistent)
    const watcherId = events.find((e) => e.watcher_id)?.watcher_id ?? "";

    return {
        watcher_id: watcherId,
        account_id: accountId,
        status,
        threads,
        policy,
        extraction_events,
        reminders,
        message_associations,
    };
}

/**
 * Evaluate reminder urgency for a thread.
 * Pure function - deterministic based on inputs.
 *
 * Note: This is a simplified version. Full urgency evaluation should use
 * the extraction_events map to resolve deadline timestamps from event references.
 * See computeUrgencyWithPolicy in urgency.ts for the full implementation.
 */
export function evaluateThreadUrgency(
    thread: ThreadState,
    currentTime: number,
    deadlineTimestamp: number | null = null // Resolved from extraction events
): {
    urgency_state: "ok" | "warning" | "critical" | "overdue";
    hours_until_deadline: number | null;
    hours_since_activity: number;
} {
    if (thread.status === "closed") {
        return {
            urgency_state: "ok",
            hours_until_deadline: null,
            hours_since_activity: 0,
        };
    }

    const hours_since_activity =
        (currentTime - thread.last_activity_at) / (1000 * 60 * 60);

    if (deadlineTimestamp === null) {
        // No deadline - only check silence
        if (hours_since_activity > 72) {
            return {
                urgency_state: "warning",
                hours_until_deadline: null,
                hours_since_activity,
            };
        }
        return {
            urgency_state: "ok",
            hours_until_deadline: null,
            hours_since_activity,
        };
    }

    const hours_until_deadline =
        (deadlineTimestamp - currentTime) / (1000 * 60 * 60);

    if (hours_until_deadline < 0) {
        return {
            urgency_state: "overdue",
            hours_until_deadline,
            hours_since_activity,
        };
    }

    if (hours_until_deadline < 2) {
        return {
            urgency_state: "critical",
            hours_until_deadline,
            hours_since_activity,
        };
    }

    if (hours_until_deadline < 24) {
        return {
            urgency_state: "warning",
            hours_until_deadline,
            hours_since_activity,
        };
    }

    return {
        urgency_state: "ok",
        hours_until_deadline,
        hours_since_activity,
    };
}

/**
 * Watcher runtime invocation.
 * Called by backend control plane when:
 * - A new event arrives
 * - A scheduled time tick fires
 */
export async function runWatcher(
    watcherId: string,
    eventStore: EventStore,
    triggerEventId?: string
): Promise<readonly VigilEvent[]> {
    // Load all events for this watcher
    const events = await eventStore.getEventsForWatcher(watcherId);

    // Replay to rebuild state
    const state = replayEvents(events);

    // Generate new events based on state and trigger
    const newEvents: VigilEvent[] = [];

    // If triggered by TIME_TICK, evaluate all open threads
    const triggerEvent = triggerEventId
        ? events.find((e) => e.event_id === triggerEventId)
        : null;

    if (triggerEvent && triggerEvent.type === "TIME_TICK") {
        const currentTime = triggerEvent.tick_timestamp;

        for (const thread of state.threads.values()) {
            if (thread.status === "open") {
                const evaluation = evaluateThreadUrgency(thread, currentTime);

                newEvents.push({
                    event_id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    watcher_id: watcherId,
                    type: "REMINDER_EVALUATED",
                    thread_id: thread.thread_id,
                    evaluation_timestamp: currentTime,
                    urgency_state: evaluation.urgency_state,
                    hours_until_deadline: evaluation.hours_until_deadline,
                    hours_since_activity: evaluation.hours_since_activity,
                });

                // Queue alert if urgency increased
                if (
                    evaluation.urgency_state === "warning" ||
                    evaluation.urgency_state === "critical" ||
                    evaluation.urgency_state === "overdue"
                ) {
                    // Find policy to get notification channels
                    const policyEvent = events
                        .filter((e) => e.type === "POLICY_UPDATED")
                        .at(-1);

                    if (policyEvent && policyEvent.type === "POLICY_UPDATED") {
                        const reminderId = crypto.randomUUID();
                        newEvents.push({
                            event_id: crypto.randomUUID(),
                            timestamp: Date.now(),
                            watcher_id: watcherId,
                            type: "ALERT_QUEUED",
                            thread_id: thread.thread_id,
                            alert_id: crypto.randomUUID(),
                            reminder_id: reminderId,
                            urgency_state: evaluation.urgency_state,
                            channels: policyEvent.policy.notification_channels,
                            causal_event_id:
                                thread.hard_deadline_event_id ||
                                thread.soft_deadline_event_id ||
                                triggerEventId ||
                                "",
                        } as VigilEvent);
                    }
                }
            }
        }
    }

    return newEvents;
}
