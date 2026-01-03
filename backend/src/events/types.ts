/**
 * Vigil Event Types
 *
 * All events are immutable and append-only.
 * Events are the single source of truth.
 * Replay must be deterministic and side-effect free.
 *
 * Commercial Model: Silence tracking only.
 * No deadline extraction, no urgency inference, no reminders.
 */

// ============================================================================
// Base Event
// ============================================================================

export interface BaseEvent {
    readonly event_id: string;
    readonly timestamp: number; // Unix ms
    readonly watcher_id: string;
}

// ============================================================================
// Control Plane Events
// ============================================================================

export interface WatcherCreatedEvent extends BaseEvent {
    readonly type: "WATCHER_CREATED";
    readonly account_id: string;
    readonly name: string;
    readonly ingest_token: string;
    readonly created_by: string;
}

export interface WatcherActivatedEvent extends BaseEvent {
    readonly type: "WATCHER_ACTIVATED";
    readonly activated_by: string;
}

export interface WatcherPausedEvent extends BaseEvent {
    readonly type: "WATCHER_PAUSED";
    readonly paused_by: string;
    readonly reason?: string;
}

export interface WatcherResumedEvent extends BaseEvent {
    readonly type: "WATCHER_RESUMED";
    readonly resumed_by: string;
}

export interface WatcherDeletedEvent extends BaseEvent {
    readonly type: "WATCHER_DELETED";
    readonly deleted_by: string;
}

export interface PolicyUpdatedEvent extends BaseEvent {
    readonly type: "POLICY_UPDATED";
    readonly policy: WatcherPolicy;
    readonly updated_by: string;
}

// ============================================================================
// Policy Types
// ============================================================================

export interface NotificationChannel {
    readonly type: "email" | "webhook";
    readonly destination: string;
    readonly enabled: boolean;
}

export interface WatcherPolicy {
    readonly allowed_senders: readonly string[];
    readonly silence_threshold_hours: number;
    readonly notification_channels: readonly NotificationChannel[];
}

// ============================================================================
// Message Ingress Events
// ============================================================================

export interface EmailReceivedEvent extends BaseEvent {
    readonly type: "EMAIL_RECEIVED";
    readonly message_id: string;
    readonly from: string;
    readonly subject: string;
    readonly received_at: number;
    readonly sender_allowed: boolean;
    readonly headers: Record<string, string>;
}

// ============================================================================
// LLM Extraction Events (Bounded)
// ============================================================================

export interface ActionRequestObservedEvent extends BaseEvent {
    readonly type: "ACTION_REQUEST_OBSERVED";
    readonly message_id: string;
    readonly action_summary: string;
    readonly request_type:
        | "confirmation"
        | "approval"
        | "response"
        | "review"
        | "unknown";
    readonly source_span: string;
    readonly confidence: "high" | "medium" | "low";
    readonly extractor_version: string;
}

export interface ClosureSignalObservedEvent extends BaseEvent {
    readonly type: "CLOSURE_SIGNAL_OBSERVED";
    readonly message_id: string;
    readonly thread_id: string;
    readonly closure_type: "explicit" | "implicit";
    readonly source_span: string;
    readonly confidence: "high" | "medium";
    readonly extractor_version: string;
}

// ============================================================================
// Thread Lifecycle Events
// ============================================================================

export interface ThreadOpenedEvent extends BaseEvent {
    readonly type: "THREAD_OPENED";
    readonly thread_id: string;
    readonly message_id: string;
    readonly opened_at: number;
    readonly normalized_subject: string;
    readonly original_sender: string;
    readonly action_request_event_id: string;
}

export interface ThreadEmailAddedEvent extends BaseEvent {
    readonly type: "THREAD_EMAIL_ADDED";
    readonly thread_id: string;
    readonly message_id: string;
    readonly sender: string;
    readonly added_at: number;
}

export interface ThreadClosedEvent extends BaseEvent {
    readonly type: "THREAD_CLOSED";
    readonly thread_id: string;
    readonly closed_at: number;
    readonly closed_by: "signal_observed" | "user_action";
    readonly closure_event_id?: string;
    readonly reason?: string;
}

// ============================================================================
// Silence Tracking Events
// ============================================================================

export interface TimeTickEvent extends BaseEvent {
    readonly type: "TIME_TICK";
    readonly tick_timestamp: number;
}

export interface SilenceThresholdExceededEvent extends BaseEvent {
    readonly type: "SILENCE_THRESHOLD_EXCEEDED";
    readonly thread_id: string;
    readonly hours_silent: number;
    readonly threshold_hours: number;
    readonly last_activity_at: number;
}

// ============================================================================
// Alert Events
// ============================================================================

export interface AlertQueuedEvent extends BaseEvent {
    readonly type: "ALERT_QUEUED";
    readonly alert_id: string;
    readonly thread_id: string;
    readonly alert_type: "silence_threshold";
    readonly channels: readonly NotificationChannel[];
}

export interface AlertSentEvent extends BaseEvent {
    readonly type: "ALERT_SENT";
    readonly alert_id: string;
    readonly channel_type: "email" | "webhook";
    readonly destination: string;
    readonly sent_at: number;
}

export interface AlertFailedEvent extends BaseEvent {
    readonly type: "ALERT_FAILED";
    readonly alert_id: string;
    readonly channel_type: "email" | "webhook";
    readonly destination: string;
    readonly error: string;
    readonly attempt: number;
}

// ============================================================================
// Union Type
// ============================================================================

export type VigilEvent =
    | WatcherCreatedEvent
    | WatcherActivatedEvent
    | WatcherPausedEvent
    | WatcherResumedEvent
    | WatcherDeletedEvent
    | PolicyUpdatedEvent
    | EmailReceivedEvent
    | ActionRequestObservedEvent
    | ClosureSignalObservedEvent
    | ThreadOpenedEvent
    | ThreadEmailAddedEvent
    | ThreadClosedEvent
    | TimeTickEvent
    | SilenceThresholdExceededEvent
    | AlertQueuedEvent
    | AlertSentEvent
    | AlertFailedEvent;

// ============================================================================
// Type Guards
// ============================================================================

export function isWatcherEvent(
    event: VigilEvent
): event is
    | WatcherCreatedEvent
    | WatcherActivatedEvent
    | WatcherPausedEvent
    | WatcherResumedEvent
    | WatcherDeletedEvent {
    return event.type.startsWith("WATCHER_");
}

export function isThreadEvent(
    event: VigilEvent
): event is ThreadOpenedEvent | ThreadEmailAddedEvent | ThreadClosedEvent {
    return event.type.startsWith("THREAD_");
}

export function isAlertEvent(
    event: VigilEvent
): event is AlertQueuedEvent | AlertSentEvent | AlertFailedEvent {
    return event.type.startsWith("ALERT_");
}

// ============================================================================
// Deprecated Events (Backward Compatible - No Runtime Behavior)
// ============================================================================

/**
 * These events are preserved for historical replay but have no effect
 * in the commercial model. New logic skips them entirely.
 */
export type DeprecatedEventType =
    | "HARD_DEADLINE_OBSERVED"
    | "SOFT_DEADLINE_SIGNAL_OBSERVED"
    | "URGENCY_SIGNAL_OBSERVED"
    | "REMINDER_CREATED"
    | "REMINDER_EDITED"
    | "REMINDER_DISMISSED"
    | "REMINDER_MERGED"
    | "REMINDER_REASSIGNED"
    | "REMINDER_EVALUATED";

export function isDeprecatedEvent(event: { type: string }): boolean {
    const deprecatedTypes: string[] = [
        "HARD_DEADLINE_OBSERVED",
        "SOFT_DEADLINE_SIGNAL_OBSERVED",
        "URGENCY_SIGNAL_OBSERVED",
        "REMINDER_CREATED",
        "REMINDER_EDITED",
        "REMINDER_DISMISSED",
        "REMINDER_MERGED",
        "REMINDER_REASSIGNED",
        "REMINDER_EVALUATED",
    ];
    return deprecatedTypes.includes(event.type);
}
