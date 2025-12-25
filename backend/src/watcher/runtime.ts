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
 * Deadline type for reminders (not threads)
 */
export type DeadlineType = "hard" | "soft" | "none";

/**
 * Trigger type for thread creation
 */
export type ThreadTriggerType = "hard_deadline" | "soft_deadline" | "urgency_signal" | "closure";

/**
 * Thread state derived from events.
 * This is never persisted - always rebuilt from events.
 * 
 * Per DC-1: Threads do NOT own deadline_timestamp.
 * Deadlines are resolved via hard_deadline_event_id or soft_deadline_event_id
 * during urgency computation.
 */
export type ThreadState = {
  readonly thread_id: string;
  readonly watcher_id: string;
  readonly trigger_type: ThreadTriggerType;
  readonly opened_at: number;
  readonly last_activity_at: number;
  readonly status: "open" | "closed";
  readonly closed_at: number | null;
  readonly message_ids: readonly string[];
  readonly participants: readonly string[];
  readonly normalized_subject: string;
  readonly original_sender: string;
  readonly original_received_at: number;
  // References to extraction events for deadline resolution
  readonly hard_deadline_event_id: string | null;
  readonly soft_deadline_event_id: string | null;
  // State tracking for transition detection (MR-WatcherRuntime-4)
  readonly last_urgency_state: UrgencyLevel;
  readonly last_alert_urgency: UrgencyLevel | null;
};

/**
 * Watcher state derived from events.
 * This is never persisted - always rebuilt from events.
 */
export type WatcherState = {
  readonly watcher_id: string;
  readonly status: "created" | "active" | "paused" | "deleted";
  readonly threads: ReadonlyMap<string, ThreadState>;
  readonly policy: WatcherPolicy | null;
  // Map of event_id -> extraction event for deadline resolution
  readonly extraction_events: ReadonlyMap<string, VigilEvent>;
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
  const threads = new Map<string, ThreadState>();
  const extraction_events = new Map<string, VigilEvent>();

  for (const event of events) {
    switch (event.type) {
      case "WATCHER_CREATED":
        status = "created";
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
          participants: [],
          normalized_subject: event.normalized_subject ?? "",
          original_sender: event.original_sender ?? "",
          original_received_at: event.original_received_at ?? event.opened_at,
          hard_deadline_event_id: null,
          soft_deadline_event_id: null,
          last_urgency_state: "ok",
          last_alert_urgency: null,
        });
        break;
      }

      case "THREAD_ACTIVITY_OBSERVED": {
        const thread = threads.get(event.thread_id);
        if (thread && thread.status === "open") {
          threads.set(event.thread_id, {
            ...thread,
            last_activity_at: event.observed_at,
            message_ids: [...thread.message_ids, event.message_id],
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

      // Other events don't affect watcher state during replay
      default:
        break;
    }
  }

  // Extract watcher_id from events (should be consistent)
  const watcherId = events.find((e) => e.watcher_id)?.watcher_id ?? "";

  return {
    watcher_id: watcherId,
    status,
    threads,
  };
}

/**
 * Evaluate reminder urgency for a thread.
 * Pure function - deterministic based on inputs.
 */
export function evaluateThreadUrgency(
  thread: ThreadState,
  currentTime: number
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

  if (thread.deadline_timestamp === null) {
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
    (thread.deadline_timestamp - currentTime) / (1000 * 60 * 60);

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
            newEvents.push({
              event_id: crypto.randomUUID(),
              timestamp: Date.now(),
              watcher_id: watcherId,
              type: "ALERT_QUEUED",
              thread_id: thread.thread_id,
              alert_id: crypto.randomUUID(),
              urgency_state: evaluation.urgency_state,
              channels: policyEvent.policy.notification_channels,
            });
          }
        }
      }
    }
  }

  return newEvents;
}
