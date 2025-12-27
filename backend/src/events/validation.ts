/**
 * Event Validation and Type Utilities
 *
 * Provides validation for event schemas and ensures
 * architectural constraints are maintained.
 *
 * Per SDD requirements:
 * - FR-16: Deterministic Replay
 * - FR-20: One-Way Data Flow Guarantee
 */

import type { VigilEvent } from "../events/types";
import { isEventOfType } from "../events/types";

/**
 * Event tier classification.
 * Used to enforce one-way data flow (FR-20).
 */
export type EventTier =
    | "baseline" // MESSAGE_RECEIVED, THREAD_ACTIVITY_OBSERVED
    | "extraction" // HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, etc.
    | "thread" // THREAD_OPENED, THREAD_CLOSED
    | "reminder" // REMINDER_EVALUATED, REMINDER_GENERATED
    | "alert" // ALERT_QUEUED, ALERT_SENT, ALERT_FAILED
    | "control_plane" // WATCHER_CREATED, POLICY_UPDATED, etc.
    | "scheduling" // TIME_TICK
    | "reporting"; // REPORT_GENERATED, REPORT_SENT

/**
 * Get the tier of an event.
 * Per FR-20: Events only reference same tier or upstream tiers.
 */
export function getEventTier(event: VigilEvent): EventTier {
    switch (event.type) {
        case "MESSAGE_RECEIVED":
            return "baseline";

        case "THREAD_ACTIVITY_OBSERVED":
            return "baseline";

        case "HARD_DEADLINE_OBSERVED":
        case "SOFT_DEADLINE_SIGNAL_OBSERVED":
        case "URGENCY_SIGNAL_OBSERVED":
        case "CLOSURE_SIGNAL_OBSERVED":
        case "MESSAGE_ROUTED":
        case "ROUTE_EXTRACTION_COMPLETE":
        case "EXTRACTION_COMPLETE":
            return "extraction";

        case "THREAD_OPENED":
        case "THREAD_UPDATED":
        case "THREAD_CLOSED":
            return "thread";

        case "REMINDER_EVALUATED":
        case "REMINDER_GENERATED":
            return "reminder";

        case "ALERT_QUEUED":
        case "ALERT_SENT":
        case "ALERT_FAILED":
            return "alert";

        case "ACCOUNT_CREATED":
        case "USER_CREATED":
        case "WATCHER_CREATED":
        case "WATCHER_UPDATED":
        case "WATCHER_ACTIVATED":
        case "WATCHER_PAUSED":
        case "WATCHER_RESUMED":
        case "WATCHER_DELETED":
        case "POLICY_UPDATED":
            return "control_plane";

        case "TIME_TICK":
            return "scheduling";

        case "REPORT_GENERATED":
        case "REPORT_SENT":
            return "reporting";

        // Reminder management events (user corrections)
        case "REMINDER_CREATED":
        case "REMINDER_MANUAL_CREATED":
        case "REMINDER_EDITED":
        case "REMINDER_DISMISSED":
        case "REMINDER_MERGED":
        case "REMINDER_REASSIGNED":
            return "reminder";

        // Message-thread association events (soft association model)
        case "MESSAGE_THREAD_ASSOCIATED":
        case "MESSAGE_THREAD_DEACTIVATED":
        case "MESSAGE_THREAD_REACTIVATED":
            return "thread";

        default:
            // Type exhaustiveness check
            const _exhaustive: never = event;
            throw new Error(
                `Unknown event type: ${(_exhaustive as VigilEvent).type}`
            );
    }
}

/**
 * Tier priority for one-way data flow validation.
 * Higher number = downstream tier.
 */
const TIER_PRIORITY: Record<EventTier, number> = {
    control_plane: 0,
    baseline: 1,
    extraction: 2,
    thread: 3,
    reminder: 4,
    alert: 5,
    scheduling: 0, // Scheduling can trigger any tier
    reporting: 6,
};

/**
 * Check if a reference from one tier to another is valid.
 * Per FR-20: Events can only reference same tier or upstream.
 */
export function isValidTierReference(
    fromTier: EventTier,
    toTier: EventTier
): boolean {
    // Scheduling tier can reference any tier
    if (fromTier === "scheduling") return true;

    // Control plane doesn't reference other events
    if (fromTier === "control_plane") return false;

    return TIER_PRIORITY[toTier] <= TIER_PRIORITY[fromTier];
}

/**
 * Validate that an event has all required base fields.
 */
export function validateBaseEvent(event: unknown): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (!event || typeof event !== "object") {
        return { valid: false, errors: ["Event must be an object"] };
    }

    const e = event as Record<string, unknown>;

    if (typeof e.event_id !== "string" || !e.event_id) {
        errors.push("event_id must be a non-empty string");
    }

    if (typeof e.timestamp !== "number" || e.timestamp <= 0) {
        errors.push("timestamp must be a positive number");
    }

    if (typeof e.type !== "string" || !e.type) {
        errors.push("type must be a non-empty string");
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Check if events are in chronological order.
 * Per FR-16: Replay requires chronological order.
 */
export function areEventsChronological(events: readonly VigilEvent[]): boolean {
    for (let i = 1; i < events.length; i++) {
        if (events[i]!.timestamp < events[i - 1]!.timestamp) {
            return false;
        }
    }
    return true;
}

/**
 * Get out-of-order events.
 */
export function findOutOfOrderEvents(
    events: readonly VigilEvent[]
): readonly { index: number; event: VigilEvent; previousTimestamp: number }[] {
    const outOfOrder: {
        index: number;
        event: VigilEvent;
        previousTimestamp: number;
    }[] = [];

    for (let i = 1; i < events.length; i++) {
        if (events[i]!.timestamp < events[i - 1]!.timestamp) {
            outOfOrder.push({
                index: i,
                event: events[i]!,
                previousTimestamp: events[i - 1]!.timestamp,
            });
        }
    }

    return outOfOrder;
}

/**
 * Validate event_id uniqueness.
 * Per MR-EventStore-2: Event IDs must be unique.
 */
export function findDuplicateEventIds(
    events: readonly VigilEvent[]
): readonly string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const event of events) {
        if (seen.has(event.event_id)) {
            duplicates.push(event.event_id);
        } else {
            seen.add(event.event_id);
        }
    }

    return duplicates;
}

/**
 * Extract all event references from an event.
 * Used for traceability validation.
 */
export function extractEventReferences(event: VigilEvent): readonly string[] {
    const refs: string[] = [];

    // Check common reference fields
    if (
        "causal_event_id" in event &&
        typeof event.causal_event_id === "string"
    ) {
        refs.push(event.causal_event_id);
    }

    if ("reminder_id" in event && typeof event.reminder_id === "string") {
        // Only include if it's a reference, not the definition
        if (event.type !== "REMINDER_GENERATED") {
            refs.push(event.reminder_id);
        }
    }

    if (
        "closure_event_id" in event &&
        typeof event.closure_event_id === "string"
    ) {
        refs.push(event.closure_event_id);
    }

    return refs;
}

/**
 * Validate that all event references point to existing events.
 * Per FR-19: No orphaned references.
 */
export function validateEventReferences(events: readonly VigilEvent[]): {
    valid: boolean;
    orphanedReferences: { eventId: string; reference: string }[];
} {
    const eventIds = new Set(events.map((e) => e.event_id));
    const orphaned: { eventId: string; reference: string }[] = [];

    for (const event of events) {
        const refs = extractEventReferences(event);
        for (const ref of refs) {
            if (!eventIds.has(ref)) {
                orphaned.push({ eventId: event.event_id, reference: ref });
            }
        }
    }

    return {
        valid: orphaned.length === 0,
        orphanedReferences: orphaned,
    };
}

/**
 * Check if baseline events have no downstream references.
 * Per FR-20: Baseline events never reference extraction/reminder/alert.
 */
export function validateBaselineIsolation(event: VigilEvent): {
    valid: boolean;
    violation?: string;
} {
    const tier = getEventTier(event);

    if (tier !== "baseline") {
        return { valid: true };
    }

    // Baseline events should not have causal references to downstream events
    const refs = extractEventReferences(event);
    if (refs.length > 0) {
        return {
            valid: false,
            violation: `Baseline event ${event.event_id} has downstream references: ${refs.join(", ")}`,
        };
    }

    return { valid: true };
}

/**
 * Validate extraction event has required message reference.
 * Per FR-19: Extraction events reference MESSAGE_RECEIVED.
 */
export function validateExtractionEvent(event: VigilEvent): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (isEventOfType(event, "HARD_DEADLINE_OBSERVED")) {
        if (!event.message_id) {
            errors.push("HARD_DEADLINE_OBSERVED must have message_id");
        }
        if (event.binding !== true) {
            errors.push("HARD_DEADLINE_OBSERVED must have binding = true");
        }
        if (!event.deadline_utc || event.deadline_utc <= 0) {
            errors.push("HARD_DEADLINE_OBSERVED must have valid deadline_utc");
        }
    }

    if (isEventOfType(event, "SOFT_DEADLINE_SIGNAL_OBSERVED")) {
        if (!event.message_id) {
            errors.push("SOFT_DEADLINE_SIGNAL_OBSERVED must have message_id");
        }
        if (event.binding !== false) {
            errors.push(
                "SOFT_DEADLINE_SIGNAL_OBSERVED must have binding = false"
            );
        }
    }

    if (isEventOfType(event, "URGENCY_SIGNAL_OBSERVED")) {
        if (!event.message_id) {
            errors.push("URGENCY_SIGNAL_OBSERVED must have message_id");
        }
        if (event.binding !== false) {
            errors.push("URGENCY_SIGNAL_OBSERVED must have binding = false");
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate reminder event has required causal reference.
 * Per FR-19: REMINDER_GENERATED must reference thread event.
 */
export function validateReminderEvent(event: VigilEvent): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (isEventOfType(event, "REMINDER_GENERATED")) {
        if (!event.causal_event_id) {
            errors.push("REMINDER_GENERATED must have causal_event_id");
        }
        if (!event.thread_id) {
            errors.push("REMINDER_GENERATED must have thread_id");
        }
        if (!event.reminder_id) {
            errors.push("REMINDER_GENERATED must have reminder_id");
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate alert event has required references.
 * Per FR-19: ALERT_QUEUED must reference REMINDER_GENERATED.
 */
export function validateAlertEvent(event: VigilEvent): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (isEventOfType(event, "ALERT_QUEUED")) {
        if (!event.reminder_id) {
            errors.push("ALERT_QUEUED must have reminder_id");
        }
        if (!event.alert_id) {
            errors.push("ALERT_QUEUED must have alert_id");
        }
        if (!event.causal_event_id) {
            errors.push("ALERT_QUEUED must have causal_event_id");
        }
    }

    return { valid: errors.length === 0, errors };
}
