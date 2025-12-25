/**
 * Vigil Event Types
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
  readonly ingest_token: string; // unique token for email routing (e.g., "a7f3k9")
  readonly created_by: string; // user_id
  readonly created_at: number; // creation timestamp (same as timestamp but explicit)
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
  // Sender Control
  readonly allowed_senders: readonly string[]; // Email allowlist (exact match, case-insensitive)
  
  // Timing Thresholds
  readonly silence_threshold_hours: number; // Hours of inactivity before silence alert (default: 72)
  readonly deadline_warning_hours: number; // Hours before deadline for warning alert (default: 24)
  readonly deadline_critical_hours: number; // Hours before deadline for critical alert (default: 2)
  
  // Notification Configuration
  readonly notification_channels: readonly NotificationChannel[];
  
  // Reporting Configuration
  readonly reporting_cadence: "daily" | "weekly" | "on_demand";
  readonly reporting_recipients: readonly string[]; // Email addresses for summary reports
  readonly reporting_time?: string; // ISO 8601 time (e.g., "09:00:00Z") for daily/weekly reports
  readonly reporting_day?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"; // Required for weekly
};

export type NotificationChannel = {
  readonly type: "email" | "sms" | "webhook";
  readonly destination: string; // Email address, phone number (E.164), or HTTPS URL
  readonly urgency_filter: "all" | "warning" | "critical"; // Minimum urgency to deliver
  readonly enabled: boolean; // Allow disabling without removing
};

// ──────────────────────────────────────────────────────────────
// MESSAGE INGRESS EVENTS
// ──────────────────────────────────────────────────────────────

export type MessageReceivedEvent = BaseEvent & {
  readonly type: "MESSAGE_RECEIVED";
  readonly watcher_id: string;
  readonly message_id: string; // unique identifier for deduplication
  readonly from: string;
  readonly subject: string;
  readonly body_text: string;
  readonly received_at: number; // Unix timestamp
  readonly headers: Record<string, string>;
};

// ──────────────────────────────────────────────────────────────
// LLM EXTRACTION EVENTS (frozen facts)
// ──────────────────────────────────────────────────────────────

export type MessageRoutedEvent = BaseEvent & {
  readonly type: "MESSAGE_ROUTED";
  readonly watcher_id: string;
  readonly message_id: string;
  readonly routed_to_thread_id: string | null; // null = new thread
  readonly evidence: string; // verbatim text excerpt
  readonly confidence: "high" | "medium" | "low";
};

export type HardDeadlineObservedEvent = BaseEvent & {
  readonly type: "HARD_DEADLINE_OBSERVED";
  readonly watcher_id: string;
  readonly message_id: string;
  readonly deadline_utc: number; // Unix timestamp of the deadline
  readonly deadline_text: string; // verbatim text from message (e.g., "Friday 5pm")
  readonly source_span: string; // exact text excerpt for evidence
  readonly confidence: "high" | "medium";
  readonly extractor_version: string;
  readonly binding: true; // always true for hard deadlines
};

export type SoftDeadlineSignalObservedEvent = BaseEvent & {
  readonly type: "SOFT_DEADLINE_SIGNAL_OBSERVED";
  readonly watcher_id: string;
  readonly message_id: string;
  readonly signal_text: string; // verbatim fuzzy temporal language (e.g., "next week")
  readonly source_span: string; // exact text excerpt for evidence
  readonly estimated_horizon_hours: number; // estimated hours until soft deadline
  readonly confidence: "high" | "medium";
  readonly extractor_version: string;
  readonly binding: false; // always false for soft signals
};

export type UrgencySignalObservedEvent = BaseEvent & {
  readonly type: "URGENCY_SIGNAL_OBSERVED";
  readonly watcher_id: string;
  readonly message_id: string;
  readonly signal_type: "question" | "escalation" | "waiting" | "follow_up";
  readonly signal_text: string; // verbatim urgency language
  readonly source_span: string; // exact text excerpt for evidence
  readonly confidence: "high" | "medium";
  readonly extractor_version: string;
  readonly binding: false; // always false for urgency signals
};

export type ClosureSignalObservedEvent = BaseEvent & {
  readonly type: "CLOSURE_SIGNAL_OBSERVED";
  readonly watcher_id: string;
  readonly message_id: string;
  readonly closure_type: "explicit" | "implicit";
  readonly source_span: string; // exact text excerpt for evidence
  readonly extractor_version: string;
};

// ──────────────────────────────────────────────────────────────
// THREAD LIFECYCLE EVENTS
// ──────────────────────────────────────────────────────────────

export type ThreadOpenedEvent = BaseEvent & {
  readonly type: "THREAD_OPENED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly message_id: string; // triggering message
  readonly opened_at: number;
};

export type ThreadUpdatedEvent = BaseEvent & {
  readonly type: "THREAD_UPDATED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly message_id: string; // new message in thread
  readonly deadline_timestamp: number | null;
};

export type ThreadActivityObservedEvent = BaseEvent & {
  readonly type: "THREAD_ACTIVITY_OBSERVED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly message_id: string;
  readonly observed_at: number;
};

export type ThreadClosedEvent = BaseEvent & {
  readonly type: "THREAD_CLOSED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly closed_at: number;
  readonly closed_by: "message_evidence" | "user_action";
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

/**
 * Generated when urgency transitions to a higher level (warning/critical/overdue).
 * This is the derived artifact that triggers alert queuing.
 * Contains causal traceability back to originating thread event.
 */
export type ReminderGeneratedEvent = BaseEvent & {
  readonly type: "REMINDER_GENERATED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly reminder_id: string;
  readonly reminder_type: "hard_deadline" | "soft_deadline" | "silence";
  readonly urgency_level: "warning" | "critical" | "overdue";
  readonly causal_event_id: string; // FR-19: Traceability to thread event
  readonly binding: boolean; // true for hard deadlines, false for soft/silence
  readonly generated_at: number;
};

// ──────────────────────────────────────────────────────────────
// NOTIFICATION EVENTS
// ──────────────────────────────────────────────────────────────

export type AlertQueuedEvent = BaseEvent & {
  readonly type: "ALERT_QUEUED";
  readonly watcher_id: string;
  readonly thread_id: string;
  readonly alert_id: string;
  readonly reminder_id: string; // FR-19: Links to ReminderGeneratedEvent
  readonly urgency_state: "warning" | "critical" | "overdue";
  readonly channels: readonly NotificationChannel[];
  readonly causal_event_id: string; // FR-19: Traceability chain
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
  readonly messages_received: number;
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

export type VigilEvent =
  // Control Plane
  | AccountCreatedEvent
  | UserCreatedEvent
  | WatcherCreatedEvent
  | WatcherActivatedEvent
  | WatcherPausedEvent
  | WatcherResumedEvent
  | PolicyUpdatedEvent
  // Message Ingress
  | MessageReceivedEvent
  // LLM Extraction (Three-Tier Model)
  | MessageRoutedEvent
  | HardDeadlineObservedEvent
  | SoftDeadlineSignalObservedEvent
  | UrgencySignalObservedEvent
  | ClosureSignalObservedEvent
  // Thread Lifecycle
  | ThreadOpenedEvent
  | ThreadUpdatedEvent
  | ThreadActivityObservedEvent
  | ThreadClosedEvent
  // Time & Reminders
  | TimeTickEvent
  | ReminderEvaluatedEvent
  | ReminderGeneratedEvent
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
export function isEventOfType<T extends VigilEvent["type"]>(
  event: VigilEvent,
  type: T
): event is Extract<VigilEvent, { type: T }> {
  return event.type === type;
}
