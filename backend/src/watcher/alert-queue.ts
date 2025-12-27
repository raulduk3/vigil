/**
 * Alert Queuing Module
 *
 * Implements FR-11: Alert Queuing
 * Creates ALERT_QUEUED events when reminders meet urgency thresholds.
 */

import { randomUUID } from "crypto";
import type {
    VigilEvent,
    AlertQueuedEvent,
    NotificationChannel,
} from "@/events/types";
import type { ThreadState, UrgencyLevel } from "@/watcher/runtime";
import type { ReminderData } from "@/watcher/urgency";

// ============================================================================
// Types
// ============================================================================

export interface AlertQueueInput {
    thread: ThreadState;
    reminder: ReminderData;
    channels: NotificationChannel[];
    watcher_id: string;
}

export interface QueuedAlert {
    alert_id: string;
    reminder_id: string;
    thread_id: string;
    watcher_id: string;
    urgency_level: UrgencyLevel;
    channels: NotificationChannel[];
    queued_at: number;
}

// ============================================================================
// FR-11: Alert Queuing
// ============================================================================

/**
 * Determine if an alert should be queued based on reminder urgency.
 * Only queue for warning, critical, or overdue.
 */
export function shouldQueueAlert(urgencyLevel: UrgencyLevel): boolean {
    return urgencyLevel !== "ok";
}

/**
 * Filter channels based on urgency level.
 * Each channel has an urgency_filter: "all" | "warning" | "critical"
 */
export function filterChannelsByUrgency(
    channels: NotificationChannel[],
    urgencyLevel: UrgencyLevel
): NotificationChannel[] {
    return channels.filter((channel) => {
        if (!channel.enabled) return false;

        // "all" receives everything
        if (channel.urgency_filter === "all") return true;

        // Map urgency levels to numeric values for comparison
        const levelValue = {
            ok: 0,
            warning: 1,
            critical: 2,
            overdue: 3,
        };

        const filterValue = {
            all: 0,
            warning: 1,
            critical: 2,
        };

        const currentLevel = levelValue[urgencyLevel];
        const filterLevel = filterValue[channel.urgency_filter];

        // Only send if current urgency >= filter threshold
        return currentLevel >= filterLevel;
    });
}

/**
 * Create an ALERT_QUEUED event from a reminder.
 */
export function createAlertQueuedEvent(
    input: AlertQueueInput,
    now: number = Date.now()
): AlertQueuedEvent {
    const { thread, reminder, channels, watcher_id } = input;

    // Filter channels by urgency
    const eligibleChannels = filterChannelsByUrgency(
        channels,
        reminder.urgency_level
    );

    return {
        event_id: randomUUID(),
        timestamp: now,
        watcher_id,
        type: "ALERT_QUEUED",
        alert_id: randomUUID(),
        reminder_id: reminder.reminder_id,
        thread_id: thread.thread_id,
        urgency_state: reminder.urgency_level,
        channels: eligibleChannels,
        causal_event_id: reminder.causal_event_id, // FR-19: Traceability chain
    } as AlertQueuedEvent;
}

/**
 * Queue an alert if conditions are met.
 * Returns the ALERT_QUEUED event if queued, null otherwise.
 */
export function queueAlert(
    input: AlertQueueInput,
    now: number = Date.now()
): AlertQueuedEvent | null {
    const { reminder, channels } = input;

    // Check if urgency warrants an alert
    if (!shouldQueueAlert(reminder.urgency_level)) {
        return null;
    }

    // Check if there are eligible channels
    const eligibleChannels = filterChannelsByUrgency(
        channels,
        reminder.urgency_level
    );
    if (eligibleChannels.length === 0) {
        return null;
    }

    return createAlertQueuedEvent(input, now);
}

/**
 * Process multiple reminders and create alert events.
 * Returns all ALERT_QUEUED events that should be emitted.
 */
export function processRemindersForAlerts(
    reminders: Array<{ thread: ThreadState; reminder: ReminderData }>,
    channels: NotificationChannel[],
    watcherId: string,
    now: number = Date.now()
): AlertQueuedEvent[] {
    const alerts: AlertQueuedEvent[] = [];

    for (const { thread, reminder } of reminders) {
        const alert = queueAlert(
            { thread, reminder, channels, watcher_id: watcherId },
            now
        );

        if (alert) {
            alerts.push(alert);
        }
    }

    return alerts;
}

// ============================================================================
// Alert Deduplication
// ============================================================================

/**
 * Check if an alert has already been queued for this reminder.
 * Prevents duplicate alerts for the same escalation.
 */
export function isAlertAlreadyQueued(
    reminderId: string,
    existingAlerts: VigilEvent[]
): boolean {
    return existingAlerts.some(
        (event) =>
            event.type === "ALERT_QUEUED" &&
            (event as AlertQueuedEvent).reminder_id === reminderId
    );
}

/**
 * Check if thread has received an alert at this urgency level or higher.
 */
export function hasReceivedAlertAtLevel(
    threadId: string,
    urgencyLevel: UrgencyLevel,
    existingAlerts: VigilEvent[]
): boolean {
    const levelValue = { ok: 0, warning: 1, critical: 2, overdue: 3 };
    const targetLevel = levelValue[urgencyLevel];

    return existingAlerts.some((event) => {
        if (event.type !== "ALERT_QUEUED") return false;

        const alert = event as AlertQueuedEvent;
        if (alert.thread_id !== threadId) return false;

        const alertLevel = levelValue[alert.urgency_state];
        return alertLevel >= targetLevel;
    });
}

// ============================================================================
// Alert Content Generation
// ============================================================================

export interface AlertContent {
    subject: string;
    body: string;
    urgency: UrgencyLevel;
    thread_id: string;
    watcher_id: string;
}

/**
 * Generate alert content for notification delivery.
 */
export function generateAlertContent(
    thread: ThreadState,
    reminder: ReminderData,
    watcherName: string
): AlertContent {
    const urgencyPrefix = {
        warning: "⚠️ Warning",
        critical: "🚨 Critical",
        overdue: "❌ Overdue",
        ok: "ℹ️ Info",
    };

    const reminderTypeText = {
        hard_deadline: "deadline",
        soft_deadline: "estimated deadline",
        silence: "silence threshold",
    };

    const prefix = urgencyPrefix[reminder.urgency_level];
    const typeText = reminderTypeText[reminder.reminder_type];

    let subject = `${prefix}: ${watcherName} - ${thread.normalized_subject || "Thread"}`;
    let body = "";

    if (reminder.reminder_type === "silence") {
        body = `Thread "${thread.normalized_subject || thread.thread_id}" has been silent for ${Math.round(reminder.hours_since_activity)} hours.`;
    } else if (reminder.deadline_utc) {
        const deadline = new Date(reminder.deadline_utc);
        const hoursUntil = reminder.hours_until_deadline || 0;

        if (hoursUntil < 0) {
            body = `Thread "${thread.normalized_subject || thread.thread_id}" ${typeText} passed ${Math.abs(Math.round(hoursUntil))} hours ago (${deadline.toISOString()}).`;
        } else {
            body = `Thread "${thread.normalized_subject || thread.thread_id}" ${typeText} in ${Math.round(hoursUntil)} hours (${deadline.toISOString()}).`;
        }
    }

    return {
        subject,
        body,
        urgency: reminder.urgency_level,
        thread_id: thread.thread_id,
        watcher_id: thread.watcher_id,
    };
}
