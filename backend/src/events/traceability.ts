/**
 * Traceability Chain Utilities
 *
 * Implements causal chain tracing from alerts back to original messages.
 *
 * Per SDD requirements:
 * - FR-19: Event Model Traceability
 * - Complete audit trail from email → extraction → thread → reminder → alert
 */

import type {
    VigilEvent,
    AlertQueuedEvent,
    ReminderGeneratedEvent,
    MessageReceivedEvent,
} from "../events/types";
import { isEventOfType } from "../events/types";

export type TraceChainStep = {
    readonly event_id: string;
    readonly event_type: VigilEvent["type"];
    readonly timestamp: number;
    readonly description: string;
};

export type TraceChainResult = {
    readonly success: boolean;
    readonly chain: readonly TraceChainStep[];
    readonly error?: string;
};

/**
 * Build a map of event IDs to events for efficient lookup.
 */
export function buildEventMap(
    events: readonly VigilEvent[]
): Map<string, VigilEvent> {
    return new Map(events.map((e) => [e.event_id, e]));
}

/**
 * Trace backward from an alert to the original message.
 * Per FR-19: ALERT_QUEUED → REMINDER_GENERATED → thread event → MESSAGE_RECEIVED
 *
 * @param alertId - The alert_id to trace from
 * @param events - All events to search through
 * @returns Trace chain result
 */
export function traceAlertToMessage(
    alertId: string,
    events: readonly VigilEvent[]
): TraceChainResult {
    const eventMap = buildEventMap(events);
    const chain: TraceChainStep[] = [];

    // Step 1: Find the ALERT_QUEUED event
    const alertEvent = events.find(
        (e) => isEventOfType(e, "ALERT_QUEUED") && e.alert_id === alertId
    ) as AlertQueuedEvent | undefined;

    if (!alertEvent) {
        return {
            success: false,
            chain: [],
            error: `Alert ${alertId} not found`,
        };
    }

    chain.push({
        event_id: alertEvent.event_id,
        event_type: "ALERT_QUEUED",
        timestamp: alertEvent.timestamp,
        description: `Alert queued with urgency: ${alertEvent.urgency_state}`,
    });

    // Step 2: Find the REMINDER_GENERATED event via reminder_id
    const reminderEvent = eventMap.get(alertEvent.reminder_id) as
        | ReminderGeneratedEvent
        | undefined;

    if (!reminderEvent || reminderEvent.type !== "REMINDER_GENERATED") {
        return {
            success: false,
            chain,
            error: `Reminder ${alertEvent.reminder_id} not found or invalid type`,
        };
    }

    chain.push({
        event_id: reminderEvent.event_id,
        event_type: "REMINDER_GENERATED",
        timestamp: reminderEvent.timestamp,
        description: `Reminder generated: ${reminderEvent.reminder_type} (${reminderEvent.urgency_level})`,
    });

    // Step 3: Follow causal_event_id to find thread/extraction event
    const causalEvent = eventMap.get(reminderEvent.causal_event_id);

    if (!causalEvent) {
        return {
            success: false,
            chain,
            error: `Causal event ${reminderEvent.causal_event_id} not found`,
        };
    }

    chain.push({
        event_id: causalEvent.event_id,
        event_type: causalEvent.type,
        timestamp: causalEvent.timestamp,
        description: describeCausalEvent(causalEvent),
    });

    // Step 4: If causal event is extraction, find MESSAGE_RECEIVED
    let messageId: string | undefined;

    if (isEventOfType(causalEvent, "HARD_DEADLINE_OBSERVED")) {
        messageId = causalEvent.message_id;
    } else if (isEventOfType(causalEvent, "SOFT_DEADLINE_SIGNAL_OBSERVED")) {
        messageId = causalEvent.message_id;
    } else if (isEventOfType(causalEvent, "URGENCY_SIGNAL_OBSERVED")) {
        messageId = causalEvent.message_id;
    } else if (isEventOfType(causalEvent, "THREAD_OPENED")) {
        messageId = causalEvent.message_id;
    }

    if (messageId) {
        // Find MESSAGE_RECEIVED with this message_id
        const messageEvent = events.find(
            (e) =>
                isEventOfType(e, "MESSAGE_RECEIVED") &&
                e.message_id === messageId
        ) as MessageReceivedEvent | undefined;

        if (messageEvent) {
            chain.push({
                event_id: messageEvent.event_id,
                event_type: "MESSAGE_RECEIVED",
                timestamp: messageEvent.timestamp,
                description: `Email from ${messageEvent.sender}: "${messageEvent.subject}"`,
            });
        }
    }

    return {
        success: true,
        chain,
    };
}

/**
 * Get human-readable description for causal event.
 */
function describeCausalEvent(event: VigilEvent): string {
    if (isEventOfType(event, "HARD_DEADLINE_OBSERVED")) {
        return `Hard deadline detected: ${event.deadline_text}`;
    }
    if (isEventOfType(event, "SOFT_DEADLINE_SIGNAL_OBSERVED")) {
        return `Soft deadline signal: ${event.signal_text}`;
    }
    if (isEventOfType(event, "URGENCY_SIGNAL_OBSERVED")) {
        return `Urgency signal: ${event.signal_type}`;
    }
    if (isEventOfType(event, "THREAD_OPENED")) {
        return "Thread opened";
    }
    if (isEventOfType(event, "TIME_TICK")) {
        return "Scheduled time tick (silence check)";
    }
    return `Event: ${event.type}`;
}

/**
 * Validate that a complete trace chain exists for an alert.
 * Per FR-19: Complete audit trail required.
 */
export function validateTraceChain(chain: readonly TraceChainStep[]): {
    valid: boolean;
    missingSteps: string[];
} {
    const missingSteps: string[] = [];

    // Must have at least ALERT_QUEUED
    if (!chain.some((s) => s.event_type === "ALERT_QUEUED")) {
        missingSteps.push("ALERT_QUEUED");
    }

    // Must have REMINDER_GENERATED
    if (!chain.some((s) => s.event_type === "REMINDER_GENERATED")) {
        missingSteps.push("REMINDER_GENERATED");
    }

    // Must have some causal event (extraction or thread)
    const hasCausal = chain.some(
        (s) =>
            s.event_type === "HARD_DEADLINE_OBSERVED" ||
            s.event_type === "SOFT_DEADLINE_SIGNAL_OBSERVED" ||
            s.event_type === "URGENCY_SIGNAL_OBSERVED" ||
            s.event_type === "THREAD_OPENED" ||
            s.event_type === "TIME_TICK"
    );
    if (!hasCausal) {
        missingSteps.push("Causal event (extraction or thread)");
    }

    return {
        valid: missingSteps.length === 0,
        missingSteps,
    };
}

/**
 * Find all alerts that trace back to a specific message.
 */
export function findAlertsForMessage(
    messageId: string,
    events: readonly VigilEvent[]
): readonly AlertQueuedEvent[] {
    // First, find all extraction events for this message
    const extractionEventIds = events
        .filter(
            (e) =>
                (isEventOfType(e, "HARD_DEADLINE_OBSERVED") &&
                    e.message_id === messageId) ||
                (isEventOfType(e, "SOFT_DEADLINE_SIGNAL_OBSERVED") &&
                    e.message_id === messageId) ||
                (isEventOfType(e, "URGENCY_SIGNAL_OBSERVED") &&
                    e.message_id === messageId)
        )
        .map((e) => e.event_id);

    // Find thread events for this message
    const threadEventIds = events
        .filter(
            (e) =>
                isEventOfType(e, "THREAD_OPENED") && e.message_id === messageId
        )
        .map((e) => e.event_id);

    const causalEventIds = new Set([...extractionEventIds, ...threadEventIds]);

    // Find reminders triggered by these causal events
    const reminderIds = events
        .filter(
            (e) =>
                isEventOfType(e, "REMINDER_GENERATED") &&
                causalEventIds.has(e.causal_event_id)
        )
        .map((e) => e.event_id);

    // Find alerts triggered by these reminders
    const alerts = events.filter(
        (e) =>
            isEventOfType(e, "ALERT_QUEUED") &&
            reminderIds.includes(e.reminder_id)
    ) as AlertQueuedEvent[];

    return alerts;
}

/**
 * Build complete event dependency graph.
 * Returns map of event_id → event_ids it references.
 */
export function buildDependencyGraph(
    events: readonly VigilEvent[]
): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const event of events) {
        const deps: string[] = [];

        if (
            "causal_event_id" in event &&
            typeof event.causal_event_id === "string"
        ) {
            deps.push(event.causal_event_id);
        }
        // Only check reminder_id as a dependency if it's a reference (e.g. in AlertQueuedEvent)
        // In ReminderGeneratedEvent, it's the ID being defined, not a dependency
        if (
            "reminder_id" in event &&
            typeof event.reminder_id === "string" &&
            event.type !== "REMINDER_GENERATED"
        ) {
            deps.push(event.reminder_id);
        }
        if (
            "closure_event_id" in event &&
            typeof event.closure_event_id === "string"
        ) {
            deps.push(event.closure_event_id);
        }

        graph.set(event.event_id, deps);
    }

    return graph;
}

/**
 * Check for cycles in event dependency graph.
 * Per FR-20: No bidirectional references.
 */
export function hasCycles(graph: Map<string, string[]>): {
    hasCycle: boolean;
    cycleNodes?: string[];
} {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function dfs(nodeId: string, path: string[]): string[] | null {
        if (recursionStack.has(nodeId)) {
            // Found a cycle
            return [...path, nodeId];
        }
        if (visited.has(nodeId)) {
            return null;
        }

        visited.add(nodeId);
        recursionStack.add(nodeId);

        const deps = graph.get(nodeId) || [];
        for (const dep of deps) {
            const cycle = dfs(dep, [...path, nodeId]);
            if (cycle) return cycle;
        }

        recursionStack.delete(nodeId);
        return null;
    }

    for (const nodeId of graph.keys()) {
        const cycle = dfs(nodeId, []);
        if (cycle) {
            return { hasCycle: true, cycleNodes: cycle };
        }
    }

    return { hasCycle: false };
}
