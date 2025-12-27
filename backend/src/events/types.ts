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
    readonly activated_by: string; // user_id who activated
};

export type WatcherDeletedEvent = BaseEvent & {
    readonly type: "WATCHER_DELETED";
    readonly watcher_id: string;
    readonly deleted_by: string; // user_id who deleted
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

export type WatcherUpdatedEvent = BaseEvent & {
    readonly type: "WATCHER_UPDATED";
    readonly watcher_id: string;
    readonly updated_by: string; // user_id
    readonly name?: string; // new name if changed
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
    readonly reporting_cadence: "daily" | "weekly" | "monthly" | "on_demand";
    readonly reporting_recipients: readonly string[]; // Email addresses for summary reports
    readonly reporting_time?: string; // ISO 8601 time (e.g., "09:00:00Z") for daily/weekly reports
    readonly reporting_day?:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
        | number; // Day name for weekly, or day number (1-31) for monthly

    // Feature Flags (optional)
    readonly enable_soft_deadline_reminders?: boolean; // Enable soft deadline alerting
    readonly enable_urgency_signal_reminders?: boolean; // Enable urgency signal alerting
};

export type NotificationChannel = {
    readonly type: "email" | "webhook";
    readonly destination: string; // Email address or HTTPS URL
    readonly urgency_filter: "all" | "warning" | "critical"; // Minimum urgency to deliver
    readonly enabled: boolean; // Allow disabling without removing
};

// ──────────────────────────────────────────────────────────────
// MESSAGE INGRESS EVENTS
// ──────────────────────────────────────────────────────────────

/**
 * Types of PII that may be detected and redacted from email body excerpts.
 * Vigil never stores raw email bodies - only sanitized excerpts.
 */
export type PIIType =
    | "ssn"
    | "credit_card"
    | "phone_number"
    | "email_address"
    | "ip_address"
    | "street_address"
    | "date_of_birth"
    | "passport"
    | "drivers_license"
    | "bank_account"
    | "routing_number";

/**
 * Types of secrets that may be detected and redacted from email body excerpts.
 */
export type SecretType =
    | "api_key"
    | "jwt_token"
    | "bearer_token"
    | "private_key"
    | "password"
    | "aws_key"
    | "github_token"
    | "stripe_key"
    | "generic_secret";

export type MessageReceivedEvent = BaseEvent & {
    readonly type: "MESSAGE_RECEIVED";
    readonly watcher_id: string;
    readonly message_id: string; // unique identifier for deduplication
    readonly sender: string; // original sender of the email (not the Vigil user who forwarded)
    readonly recipients: readonly string[]; // original recipients (to + cc, not the Vigil ingestion address)
    readonly subject: string;
    readonly normalized_subject: string;
    readonly sent_at: number; // when email was originally sent (from Date header) - used for timeline/urgency
    readonly ingested_at: number; // when Vigil received/processed the email (for audit only)
    readonly body_text_extract: string; // PII/secret-sanitized truncated excerpt (NOT full body)
    readonly raw_body_stored: false; // ALWAYS false - we NEVER store raw email bodies
    readonly pii_detected: boolean; // whether PII was found and redacted
    readonly pii_types_redacted: readonly PIIType[]; // types of PII that were redacted
    readonly secrets_redacted: readonly SecretType[]; // types of secrets that were redacted
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

export type RouteExtractionCompleteEvent = BaseEvent & {
    readonly type: "ROUTE_EXTRACTION_COMPLETE";
    readonly watcher_id: string;
    readonly message_id: string;
    readonly extract_deadline: boolean;
    readonly extract_soft_deadline: boolean;
    readonly extract_urgency: boolean;
    readonly extract_closure: boolean;
    readonly routing_reasoning: string;
};

export type ExtractionCompleteEvent = BaseEvent & {
    readonly type: "EXTRACTION_COMPLETE";
    readonly watcher_id: string;
    readonly message_id: string;
    readonly thread_id?: string; // present if thread was created
    readonly hard_deadline_found: boolean;
    readonly soft_deadline_found: boolean;
    readonly urgency_signal_found: boolean;
    readonly closure_signal_found: boolean;
    readonly signals_count: number;
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
    readonly confidence: "high" | "medium";
    readonly extractor_version: string;
};

// ──────────────────────────────────────────────────────────────
// THREAD LIFECYCLE EVENTS
// ──────────────────────────────────────────────────────────────

export type ThreadOpenedEvent = BaseEvent & {
    readonly type: "THREAD_OPENED";
    readonly watcher_id: string;
    readonly thread_id: string;
    readonly message_id: string; // triggering message (original email's Message-ID)
    readonly opened_at: number; // when thread was opened (uses sent_at from trigger message)
    readonly trigger_type?:
        | "hard_deadline"
        | "soft_deadline"
        | "urgency_signal"; // optional, defaults to "hard_deadline"
    readonly normalized_subject?: string; // optional normalized subject
    readonly original_sender?: string; // original sender of the conversation (not Vigil user)
    readonly original_sent_at?: number; // when the triggering email was originally sent
    // Extraction event references for deadline resolution (DC-1)
    readonly hard_deadline_event_id?: string; // Reference to HARD_DEADLINE_OBSERVED event
    readonly soft_deadline_event_id?: string; // Reference to SOFT_DEADLINE_SIGNAL_OBSERVED event
    readonly urgency_signal_event_id?: string; // Reference to URGENCY_SIGNAL_OBSERVED event
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
    readonly activity_at: number; // when the activity happened (sent_at from the message, not ingested_at)
    readonly sender: string; // who sent this message in the thread
};

export type ThreadClosedEvent = BaseEvent & {
    readonly type: "THREAD_CLOSED";
    readonly watcher_id: string;
    readonly thread_id: string;
    readonly closed_at: number;
    readonly closed_by: "message_evidence" | "user_action";
    readonly closure_event_id: string; // references triggering event
    readonly closure_reason?: string; // optional reason for manual closures
};

// ──────────────────────────────────────────────────────────────
// MESSAGE-THREAD ASSOCIATION EVENTS (Soft Association Model)
// ──────────────────────────────────────────────────────────────

/**
 * Message associated with a thread.
 * Messages have implications on thread state (activity, silence, participants).
 * Associations are ACTIVE by default.
 */
export type MessageThreadAssociatedEvent = BaseEvent & {
    readonly type: "MESSAGE_THREAD_ASSOCIATED";
    readonly watcher_id: string;
    readonly message_id: string;
    readonly thread_id: string;
    readonly association_status: "active"; // always created as active
    readonly associated_by: "system" | string; // "system" or user_id
    readonly associated_at: number;
};

/**
 * Message-thread association deactivated (soft delete).
 * Message no longer affects thread calculations but original association preserved.
 * Use this instead of deletion to maintain full audit trail.
 */
export type MessageThreadDeactivatedEvent = BaseEvent & {
    readonly type: "MESSAGE_THREAD_DEACTIVATED";
    readonly watcher_id: string;
    readonly message_id: string;
    readonly thread_id: string;
    readonly deactivated_by: string; // user_id
    readonly deactivated_at: number;
    readonly reason?: string;
};

/**
 * Message-thread association reactivated.
 * Reverses a previous deactivation.
 */
export type MessageThreadReactivatedEvent = BaseEvent & {
    readonly type: "MESSAGE_THREAD_REACTIVATED";
    readonly watcher_id: string;
    readonly message_id: string;
    readonly thread_id: string;
    readonly reactivated_by: string; // user_id
    readonly reactivated_at: number;
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
 * Reminder created automatically from LLM extraction.
 * Reminders are portable semantic obligations that can be moved between threads.
 * Created in "active" status - users correct the ~10% mistakes.
 */
export type ReminderCreatedEvent = BaseEvent & {
    readonly type: "REMINDER_CREATED";
    readonly watcher_id: string;
    readonly reminder_id: string;
    readonly thread_id: string; // initial thread association
    readonly extraction_event_id: string; // source extraction event
    readonly reminder_type: "hard_deadline" | "soft_deadline" | "urgency_signal";
    readonly deadline_utc: number | null; // resolved deadline timestamp
    readonly source_span: string; // verbatim text from email
    readonly confidence: "high" | "medium" | "low";
    readonly status: "active"; // always created as active
    readonly created_at: number;
};

/**
 * Reminder manually created by user (no extraction source).
 */
export type ReminderManualCreatedEvent = BaseEvent & {
    readonly type: "REMINDER_MANUAL_CREATED";
    readonly watcher_id: string;
    readonly reminder_id: string;
    readonly thread_id: string;
    readonly created_by: string; // user_id
    readonly reminder_type: "hard_deadline" | "soft_deadline" | "custom";
    readonly deadline_utc: number | null;
    readonly description: string;
    readonly status: "active";
    readonly created_at: number;
};

/**
 * User edited a reminder (correcting LLM mistake).
 */
export type ReminderEditedEvent = BaseEvent & {
    readonly type: "REMINDER_EDITED";
    readonly watcher_id: string;
    readonly reminder_id: string;
    readonly edited_by: string; // user_id
    readonly changes: {
        readonly deadline_utc?: number | null;
        readonly description?: string;
        readonly reminder_type?: "hard_deadline" | "soft_deadline" | "custom";
    };
    readonly edited_at: number;
};

/**
 * User dismissed an incorrect extraction.
 * Reminder is deactivated but preserved in audit log.
 */
export type ReminderDismissedEvent = BaseEvent & {
    readonly type: "REMINDER_DISMISSED";
    readonly watcher_id: string;
    readonly reminder_id: string;
    readonly dismissed_by: string; // user_id
    readonly reason?: string;
    readonly dismissed_at: number;
};

/**
 * User merged two duplicate reminders.
 * Source reminder is deactivated, target remains.
 */
export type ReminderMergedEvent = BaseEvent & {
    readonly type: "REMINDER_MERGED";
    readonly watcher_id: string;
    readonly source_reminder_id: string; // becomes inactive
    readonly target_reminder_id: string; // remains active
    readonly merged_by: string; // user_id
    readonly merged_at: number;
};

/**
 * User reassigned reminder to different thread (portable semantic obligation).
 * Reminder continues monitoring on new thread.
 */
export type ReminderReassignedEvent = BaseEvent & {
    readonly type: "REMINDER_REASSIGNED";
    readonly watcher_id: string;
    readonly reminder_id: string;
    readonly from_thread_id: string;
    readonly to_thread_id: string;
    readonly reassigned_by: string; // user_id
    readonly reassigned_at: number;
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
    | WatcherUpdatedEvent
    | WatcherDeletedEvent
    | PolicyUpdatedEvent
    // Message Ingress
    | MessageReceivedEvent
    // LLM Extraction (Three-Tier Model)
    | MessageRoutedEvent
    | RouteExtractionCompleteEvent
    | ExtractionCompleteEvent
    | HardDeadlineObservedEvent
    | SoftDeadlineSignalObservedEvent
    | UrgencySignalObservedEvent
    | ClosureSignalObservedEvent
    // Thread Lifecycle
    | ThreadOpenedEvent
    | ThreadUpdatedEvent
    | ThreadActivityObservedEvent
    | ThreadClosedEvent
    // Message-Thread Associations (Soft Association Model)
    | MessageThreadAssociatedEvent
    | MessageThreadDeactivatedEvent
    | MessageThreadReactivatedEvent
    // Time & Reminders
    | TimeTickEvent
    | ReminderEvaluatedEvent
    | ReminderCreatedEvent
    | ReminderManualCreatedEvent
    | ReminderEditedEvent
    | ReminderDismissedEvent
    | ReminderMergedEvent
    | ReminderReassignedEvent
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
