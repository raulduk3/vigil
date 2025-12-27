/**
 * Policy-Aware Urgency Evaluation
 *
 * Extended urgency computation that uses watcher policy settings.
 * Implements MR-WatcherRuntime-3 with full policy support.
 */

import type { VigilEvent, WatcherPolicy } from "@/events/types";
import type {
    ThreadState,
    UrgencyLevel,
    DeadlineType,
} from "@/watcher/runtime";

/**
 * Extended urgency evaluation result with policy context
 */
export interface PolicyAwareUrgencyResult {
    urgency_state: UrgencyLevel;
    hours_until_deadline: number | null;
    hours_since_activity: number;
    deadline_type: DeadlineType;
    deadline_utc: number | null;
    triggered_by: "deadline" | "silence" | "none";
    policy_thresholds: {
        warning_hours: number;
        critical_hours: number;
        silence_hours: number;
    };
}

/**
 * Default policy values per SDD
 */
export const DEFAULT_POLICY: WatcherPolicy = {
    allowed_senders: [],
    silence_threshold_hours: 72,
    deadline_warning_hours: 24,
    deadline_critical_hours: 2,
    notification_channels: [],
    reporting_cadence: "daily",
    reporting_recipients: [],
    enable_soft_deadline_reminders: false,
    enable_urgency_signal_reminders: false,
};

/**
 * Compute urgency state using policy thresholds (MR-WatcherRuntime-3).
 *
 * Per DC-1: Deadlines are resolved via extraction event references,
 * not owned by threads directly.
 */
export function computeUrgencyWithPolicy(
    thread: ThreadState,
    extractionEvents: ReadonlyMap<string, VigilEvent>,
    currentTime: number,
    policy: WatcherPolicy
): PolicyAwareUrgencyResult {
    // Closed threads are always ok
    if (thread.status === "closed") {
        return {
            urgency_state: "ok",
            hours_until_deadline: null,
            hours_since_activity: 0,
            deadline_type: "none",
            deadline_utc: null,
            triggered_by: "none",
            policy_thresholds: {
                warning_hours: policy.deadline_warning_hours,
                critical_hours: policy.deadline_critical_hours,
                silence_hours: policy.silence_threshold_hours,
            },
        };
    }

    const hours_since_activity =
        (currentTime - thread.last_activity_at) / (1000 * 60 * 60);

    // Resolve deadline from extraction events (DC-1)
    let deadline_utc: number | null = null;
    let deadline_type: DeadlineType = "none";

    // Priority 1: Hard deadline
    if (thread.hard_deadline_event_id) {
        const hardEvent = extractionEvents.get(thread.hard_deadline_event_id);
        if (hardEvent && hardEvent.type === "HARD_DEADLINE_OBSERVED") {
            deadline_utc = (hardEvent as any).deadline_utc;
            deadline_type = "hard";
        }
    }

    // Priority 2: Soft deadline (if enabled and no hard deadline)
    // Note: Use === null check to allow deadline_utc of 0 (Unix epoch)
    if (
        deadline_utc === null &&
        thread.soft_deadline_event_id &&
        policy.enable_soft_deadline_reminders
    ) {
        const softEvent = extractionEvents.get(thread.soft_deadline_event_id);
        if (softEvent && softEvent.type === "SOFT_DEADLINE_SIGNAL_OBSERVED") {
            const horizonHours = (softEvent as any).estimated_horizon_hours;
            if (horizonHours) {
                deadline_utc =
                    softEvent.timestamp + horizonHours * 60 * 60 * 1000;
                deadline_type = "soft";
            }
        }
    }

    const policy_thresholds = {
        warning_hours: policy.deadline_warning_hours,
        critical_hours: policy.deadline_critical_hours,
        silence_hours: policy.silence_threshold_hours,
    };

    // No deadline - check silence threshold
    // Note: Use === null check to allow deadline_utc of 0 (Unix epoch)
    if (deadline_utc === null) {
        if (hours_since_activity > policy.silence_threshold_hours) {
            return {
                urgency_state: "warning",
                hours_until_deadline: null,
                hours_since_activity,
                deadline_type: "none",
                deadline_utc: null,
                triggered_by: "silence",
                policy_thresholds,
            };
        }

        return {
            urgency_state: "ok",
            hours_until_deadline: null,
            hours_since_activity,
            deadline_type: "none",
            deadline_utc: null,
            triggered_by: "none",
            policy_thresholds,
        };
    }

    // Has deadline - evaluate against policy thresholds
    const hours_until_deadline =
        (deadline_utc - currentTime) / (1000 * 60 * 60);

    if (hours_until_deadline < 0) {
        return {
            urgency_state: "overdue",
            hours_until_deadline,
            hours_since_activity,
            deadline_type,
            deadline_utc,
            triggered_by: "deadline",
            policy_thresholds,
        };
    }

    if (hours_until_deadline < policy.deadline_critical_hours) {
        return {
            urgency_state: "critical",
            hours_until_deadline,
            hours_since_activity,
            deadline_type,
            deadline_utc,
            triggered_by: "deadline",
            policy_thresholds,
        };
    }

    if (hours_until_deadline < policy.deadline_warning_hours) {
        return {
            urgency_state: "warning",
            hours_until_deadline,
            hours_since_activity,
            deadline_type,
            deadline_utc,
            triggered_by: "deadline",
            policy_thresholds,
        };
    }

    return {
        urgency_state: "ok",
        hours_until_deadline,
        hours_since_activity,
        deadline_type,
        deadline_utc,
        triggered_by: "none",
        policy_thresholds,
    };
}

/**
 * Reminder data structure for generation (MR-WatcherRuntime-5)
 */
export interface ReminderData {
    reminder_id: string;
    thread_id: string;
    watcher_id: string;
    reminder_type: "hard_deadline" | "soft_deadline" | "silence";
    urgency_level: UrgencyLevel;
    causal_event_id: string;
    binding: boolean;
    hours_until_deadline: number | null;
    hours_since_activity: number;
    deadline_utc: number | null;
}

/**
 * Generate reminder with full causal traceability (MR-WatcherRuntime-5).
 * Returns null if no reminder should be generated.
 */
export function generateReminderWithTraceability(
    thread: ThreadState,
    urgencyResult: PolicyAwareUrgencyResult,
    policy: WatcherPolicy
): ReminderData | null {
    // No reminder for ok status
    if (urgencyResult.urgency_state === "ok") {
        return null;
    }

    // No reminder for closed threads
    if (thread.status === "closed") {
        return null;
    }

    // Determine causal event and reminder type
    let causal_event_id: string | null = null;
    let reminder_type: ReminderData["reminder_type"];
    let binding: boolean;

    if (urgencyResult.triggered_by === "deadline") {
        if (
            urgencyResult.deadline_type === "hard" &&
            thread.hard_deadline_event_id
        ) {
            causal_event_id = thread.hard_deadline_event_id;
            reminder_type = "hard_deadline";
            binding = true;
        } else if (
            urgencyResult.deadline_type === "soft" &&
            thread.soft_deadline_event_id &&
            policy.enable_soft_deadline_reminders
        ) {
            causal_event_id = thread.soft_deadline_event_id;
            reminder_type = "soft_deadline";
            binding = false;
        } else {
            return null; // No valid causal event
        }
    } else if (urgencyResult.triggered_by === "silence") {
        // For silence reminders, the causal event is the last activity
        // We use the last message ID as the causal reference
        causal_event_id =
            thread.message_ids[thread.message_ids.length - 1] || null;
        if (!causal_event_id) {
            return null;
        }
        reminder_type = "silence";
        binding = false;
    } else {
        return null; // No trigger
    }

    if (!causal_event_id) {
        return null; // Cannot trace causality
    }

    return {
        reminder_id: crypto.randomUUID(),
        thread_id: thread.thread_id,
        watcher_id: thread.watcher_id,
        reminder_type,
        urgency_level: urgencyResult.urgency_state,
        causal_event_id,
        binding,
        hours_until_deadline: urgencyResult.hours_until_deadline,
        hours_since_activity: urgencyResult.hours_since_activity,
        deadline_utc: urgencyResult.deadline_utc,
    };
}

/**
 * Create REMINDER_GENERATED event from reminder data
 */
export function createReminderEvent(
    reminderData: ReminderData,
    timestamp: number
): VigilEvent {
    return {
        event_id: crypto.randomUUID(),
        timestamp,
        watcher_id: reminderData.watcher_id,
        type: "REMINDER_GENERATED",
        reminder_id: reminderData.reminder_id,
        thread_id: reminderData.thread_id,
        reminder_type: reminderData.reminder_type,
        urgency_level: reminderData.urgency_level,
        causal_event_id: reminderData.causal_event_id,
        binding: reminderData.binding,
        generated_at: timestamp, // FR-19: generation timestamp
    } as VigilEvent;
}

/**
 * Detect if urgency transition requires a new alert (MR-WatcherRuntime-4).
 */
export function shouldEmitAlert(
    previousState: UrgencyLevel,
    currentState: UrgencyLevel,
    lastAlertLevel: UrgencyLevel | null
): boolean {
    const priorities: Record<UrgencyLevel, number> = {
        ok: 0,
        warning: 1,
        critical: 2,
        overdue: 3,
    };

    // No alert for ok or de-escalation
    if (
        currentState === "ok" ||
        priorities[currentState] <= priorities[previousState]
    ) {
        return false;
    }

    // Alert if we haven't alerted at this level or higher
    if (!lastAlertLevel) {
        return true;
    }

    return priorities[currentState] > priorities[lastAlertLevel];
}

/**
 * Process all threads for a watcher and generate needed events.
 * Main entry point for scheduled evaluation.
 */
export function evaluateAllThreads(
    threads: ReadonlyMap<string, ThreadState>,
    extractionEvents: ReadonlyMap<string, VigilEvent>,
    policy: WatcherPolicy,
    currentTime: number,
    watcherId: string
): {
    reminderEvents: VigilEvent[];
    alertEvents: VigilEvent[];
} {
    const reminderEvents: VigilEvent[] = [];
    const alertEvents: VigilEvent[] = [];

    for (const thread of threads.values()) {
        if (thread.status !== "open") {
            continue;
        }

        const urgencyResult = computeUrgencyWithPolicy(
            thread,
            extractionEvents,
            currentTime,
            policy
        );

        // Check if we need to emit an alert
        if (
            shouldEmitAlert(
                thread.last_urgency_state,
                urgencyResult.urgency_state,
                thread.last_alert_urgency
            )
        ) {
            // Generate reminder first
            const reminderData = generateReminderWithTraceability(
                thread,
                urgencyResult,
                policy
            );

            if (reminderData) {
                reminderEvents.push(
                    createReminderEvent(reminderData, currentTime)
                );

                // Queue alert
                alertEvents.push({
                    event_id: crypto.randomUUID(),
                    timestamp: currentTime,
                    watcher_id: watcherId,
                    type: "ALERT_QUEUED",
                    alert_id: crypto.randomUUID(),
                    reminder_id: reminderData.reminder_id,
                    thread_id: thread.thread_id,
                    urgency_state: urgencyResult.urgency_state,
                    channels: policy.notification_channels,
                } as VigilEvent);
            }
        }
    }

    return { reminderEvents, alertEvents };
}
