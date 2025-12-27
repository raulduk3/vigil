/**
 * Logging System Types
 *
 * Type definitions for the Vigil production logging system.
 */

/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Numeric values for log levels (for filtering)
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};

/**
 * Log categories for routing to different files
 */
export type LogCategory =
    | "system" // System startup, shutdown, health
    | "api" // HTTP requests and responses
    | "auth" // Authentication events
    | "ingestion" // Email ingestion pipeline
    | "extraction" // LLM/regex extraction
    | "watcher" // Watcher lifecycle events
    | "thread" // Thread lifecycle events
    | "urgency" // Urgency evaluation
    | "reminder" // Reminder generation
    | "alert" // Alert queuing and delivery
    | "scheduler" // Scheduler ticks and jobs
    | "worker" // Background workers
    | "database" // Database operations
    | "delivery"; // Notification delivery (email/webhook)

/**
 * Context for hierarchical logging
 */
export interface LogContext {
    /** Correlation ID for request tracing */
    correlation_id?: string;
    /** User ID for per-user logs */
    user_id?: string;
    /** Watcher ID for per-watcher logs */
    watcher_id?: string;
    /** Thread ID for per-thread logs */
    thread_id?: string;
    /** Message ID for email tracing */
    message_id?: string;
    /** Event ID for event tracing */
    event_id?: string;
    /** Additional metadata */
    [key: string]: unknown;
}

/**
 * Structured log entry
 */
export interface LogEntry {
    /** ISO timestamp */
    timestamp: string;
    /** Unix timestamp in milliseconds */
    timestamp_ms: number;
    /** Log level */
    level: LogLevel;
    /** Log category */
    category: LogCategory;
    /** Log message */
    message: string;
    /** Hierarchical context */
    context: LogContext;
    /** Additional structured data */
    data?: Record<string, unknown>;
    /** Error details if applicable */
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    /** Process info */
    process: {
        pid: number;
        hostname: string;
    };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
    /** Minimum log level to output */
    minLevel: LogLevel;
    /** Base directory for log files */
    logDir: string;
    /** Enable console output */
    console: boolean;
    /** Enable file output */
    file: boolean;
    /** Enable per-entity log files (user, watcher, thread) */
    perEntityLogs: boolean;
    /** Max file size before rotation (bytes) */
    maxFileSize: number;
    /** Max number of rotated files to keep */
    maxFiles: number;
    /** Pretty print JSON in console */
    prettyConsole: boolean;
}

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
    minLevel: (process.env.LOG_LEVEL as LogLevel) || "info",
    logDir: process.env.LOG_DIR || "./logs",
    console: process.env.LOG_CONSOLE !== "false",
    file: process.env.LOG_FILE !== "false",
    perEntityLogs: process.env.LOG_PER_ENTITY !== "false",
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    prettyConsole: process.env.NODE_ENV !== "production",
};
