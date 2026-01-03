/**
 * Simple Logger
 *
 * Structured JSON logging for backend operations.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    [key: string]: unknown;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...data,
    };
    console.log(JSON.stringify(entry));
}

export const logger = {
    debug: (message: string, data?: Record<string, unknown>) =>
        log("debug", message, data),
    info: (message: string, data?: Record<string, unknown>) =>
        log("info", message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
        log("warn", message, data),
    error: (message: string, data?: Record<string, unknown>) =>
        log("error", message, data),
};
