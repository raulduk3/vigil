/**
 * DEVA Event Types
 * 
 * All events are immutable and append-only.
 * Events are the single source of truth.
 * Replay must be deterministic and side-effect free.
 */

/**
 * Base event structure
 * Every event must have these fields
 */
export type BaseEvent = {
  readonly event_id: string;
  readonly timestamp: number; // Unix timestamp in milliseconds
  readonly watcher_id?: string; // Optional: not all events belong to a watcher
};

// ──────────────────────────────────────────────────────────────
// CONTROL PLANE EVENTS
// ──────────────────────────────────────────────────────────────

export type AccountCreatedEvent = BaseEvent & {
  readonly type: "ACCOUNT_CREATED";
  readonly account_id: string;
  readonly owner_email: string;
};

export type UserCreatedEvent = BaseEvent & {
  readonly type: "USER_CREATED";
  readonly account_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly role: "owner" | "member";
};

export type WatcherCreatedEvent = BaseEvent & {
  readonly type: "WATCHER_CREATED";
  readonly account_id: string;
  readonly watcher_id: string;
  readonly name: string;
  readonly ingest_token: string; // unique token for email routing
  readonly created_by: string; // user_id
};

export type WatcherActivatedEvent = BaseEvent & {
  readonly type: "WATCHER_ACTIVATED";
  readonly watcher_id: string;
};

export type WatcherPausedEvent = BaseEvent & {
  readonly type: "WATCHER_PAUSED";
  readonly watcher_id: string;
  readonly paused_by: string; // user_id
  readonly reason?: string;
};

export type WatcherResumedEvent = BaseEvent & {
  readonly type: "WATCHER_RESUMED";
  readonly watcher_id: string;
  readonly resumed_by: string; // user_id
};

export type PolicyUpdatedEvent = BaseEvent & {
  readonly type: "POLICY_UPDATED";
  readonly watcher_id: string;
  readonly policy: WatcherPolicy;
  readonly updated_by: string; // user_id
};

export type WatcherPolicy = {
  readonly allowed_senders: readonly string[]; // email addresses
  readonly silence_threshold_hours: number;
  readonly deadline_buffer_hours: number;
  readonly notification_channels: readonly NotificationChannel[];
};

export type NotificationChannel = {
  readonly type: "email" | "sms" | "webhook";
  readonly destination: string;
};

// ──────────────────────────────────────────────────────────────
// EMAIL INGRESS EVENTS
// ──────────────────────────────────────────────────────────────

export type EmailReceivedEvent = BaseEvent & {
  readonly type: "EMAIL_RECEIVED";
  readonly watcher_id: string;
  readonly email_id: string; // unique identifier for deduplication
  readonly from: string;
  readonly subject: string;
  readonly body_text: string;
  readonly received_at: number; // Unix timestamp
  readonly headers: Record<string, string>;
};

// ──────────────────────────────────────────────────────────────
// LLM EXTRACTION EVENTS (frozen facts)
// ──────────────────────────────────────────────────────────────

export type EmailRoutedEvent = BaseEvent & {
  readonly type: "EMAIL_ROUTED";
  readonly watcher_id: string;
  readonly email_id: string;
  readonly routed_to_thread_id: string | null; // null = new thread
  readonly evidence: string; // verbatim text excerpt
  readonly confidence: "high" | "medium" | "low";
};

export type DeadlineExtractedEvent = BaseEvent & {
  readonly type: "DEADLINE_EXTRACTED";
  readonly watcher_id: string;
  readonly email_id: string;
  readonly thread_id: string;
  readonly deadline_timestamp: number | null; // null = no deadline found
  readonly deadline_text: string; // verbatim text from email
  readonly evidence: string;
};

export type RiskExtractedEvent = BaseEvent & {
  readonly type: "RISK_EXTRACTED";
  readonly watcher_id: string;
  readonly email_id: string;
  readonly thread_id: string;
  readonly risk_level: "none" | "low" | "medium" | "high";
  readonly risk_indicators: readonly string[]; // specific phrases
  readonly evidence: string;
};

export type ClosureExtractedEvent = BaseEvent & {
  readonly type: "CLOSURE_EXTRACTED";
  readonly watcher_id: string;
  readonly email_id: string;
  readonly thread_id: string;
  readonly is_closure: boolean;
  readonly closure_type: "explicit" | "implicit" | "none";
  readonly evidence: string;
};

// ──────────────────────────────────────────────────────────────
// THREAD LIFECYCLE EVENTS
// ──────────────────────────────────────────────────────────────

export type ThreadOpenedEvent = BaseEvent & {
  readonly type: "THREAD_OPENED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly email_id: string; // triggering email
  readonly opened_at: number;
};

export type ThreadUpdatedEvent = BaseEvent & {
  readonly type: "THREAD_UPDATED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly email_id: string; // new email in thread
  readonly deadline_timestamp: number | null;
};

export type ThreadActivitySeenEvent = BaseEvent & {
  readonly type: "THREAD_ACTIVITY_SEEN";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly email_id: string;
  readonly seen_at: number;
};

export type ThreadClosedEvent = BaseEvent & {
  readonly type: "THREAD_CLOSED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly closed_at: number;
  readonly closed_by: "email_evidence" | "user_action";
  readonly closure_event_id: string; // references triggering event
};

// ──────────────────────────────────────────────────────────────
// TIME & REMINDER EVENTS
// ──────────────────────────────────────────────────────────────

export type TimeTickEvent = BaseEvent & {
  readonly type: "TIME_TICK";
  readonly tick_timestamp: number;
  readonly watcher_id: string;
};

export type ReminderEvaluatedEvent = BaseEvent & {
  readonly type: "REMINDER_EVALUATED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly evaluation_timestamp: number;
  readonly urgency_state: "ok" | "warning" | "critical" | "overdue";
  readonly hours_until_deadline: number | null;
  readonly hours_since_activity: number;
};

// ──────────────────────────────────────────────────────────────
// NOTIFICATION EVENTS
// ──────────────────────────────────────────────────────────────

export type AlertQueuedEvent = BaseEvent & {
  readonly type: "ALERT_QUEUED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly alert_id: string;
  readonly urgency_state: "warning" | "critical" | "overdue";
  readonly channels: readonly NotificationChannel[];
};

export type AlertSentEvent = BaseEvent & {
  readonly type: "ALERT_SENT";
  readonly alert_id: string;
  readonly channel: NotificationChannel;
  readonly sent_at: number;
};

export type AlertFailedEvent = BaseEvent & {
  readonly type: "ALERT_FAILED";
  readonly alert_id: string;
  readonly channel: NotificationChannel;
  readonly error_message: string;
  readonly failed_at: number;
};

// ──────────────────────────────────────────────────────────────
// REPORTING EVENTS
// ──────────────────────────────────────────────────────────────

export type ReportGeneratedEvent = BaseEvent & {
  readonly type: "REPORT_GENERATED";
  readonly watcher_id: string;
  readonly report_id: string;
  readonly report_type: "daily" | "weekly" | "on_demand";
  readonly generated_at: number;
  readonly summary: ReportSummary;
};

export type ReportSummary = {
  readonly threads_opened: number;
  readonly threads_closed: number;
  readonly threads_active: number;
  readonly alerts_sent: number;
  readonly emails_received: number;
};

export type ReportSentEvent = BaseEvent & {
  readonly type: "REPORT_SENT";
  readonly report_id: string;
  readonly recipient: string;
  readonly sent_at: number;
};

// ──────────────────────────────────────────────────────────────
// DISCRIMINATED UNION OF ALL EVENTS
// ──────────────────────────────────────────────────────────────

export type DevaEvent =
  // Control Plane
  | AccountCreatedEvent
  | UserCreatedEvent
  | WatcherCreatedEvent
  | WatcherActivatedEvent
  | WatcherPausedEvent
  | WatcherResumedEvent
  | PolicyUpdatedEvent
  // Email Ingress
  | EmailReceivedEvent
  // LLM Extraction
  | EmailRoutedEvent
  | DeadlineExtractedEvent
  | RiskExtractedEvent
  | ClosureExtractedEvent
  // Thread Lifecycle
  | ThreadOpenedEvent
  | ThreadUpdatedEvent
  | ThreadActivitySeenEvent
  | ThreadClosedEvent
  // Time & Reminders
  | TimeTickEvent
  | ReminderEvaluatedEvent
  // Notifications
  | AlertQueuedEvent
  | AlertSentEvent
  | AlertFailedEvent
  // Reporting
  | ReportGeneratedEvent
  | ReportSentEvent;

/**
 * Type guard for event type checking
 */
export function isEventOfType<T extends DevaEvent["type"]>(
  event: DevaEvent,
  type: T
): event is Extract<DevaEvent, { type: T }> {
  return event.type === type;
}
