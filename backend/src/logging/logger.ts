/**
 * Vigil Production Logger
 *
 * Structured, hierarchical logging system with per-entity file output.
 *
 * Features:
 * - Structured JSON logging
 * - Per-user, per-watcher, per-thread log files
 * - Log rotation
 * - Correlation ID tracking
 * - Console + file output
 */

import { hostname } from "node:os";
import { LogFileWriter } from "./file-writer";
import {
    type LogLevel,
    type LogCategory,
    type LogContext,
    type LogEntry,
    type LoggerConfig,
    LOG_LEVEL_VALUES,
    DEFAULT_LOGGER_CONFIG,
} from "./types";

/**
 * ANSI color codes for console output
 */
const COLORS = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: COLORS.gray,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red,
    fatal: COLORS.magenta,
};

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
    return `cid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Main Logger class
 */
export class Logger {
    private config: LoggerConfig;
    private fileWriter: LogFileWriter;
    private processInfo: { pid: number; hostname: string };
    private defaultContext: LogContext;

    constructor(
        config: Partial<LoggerConfig> = {},
        defaultContext: LogContext = {}
    ) {
        this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
        this.fileWriter = new LogFileWriter(this.config);
        this.processInfo = {
            pid: process.pid,
            hostname: hostname(),
        };
        this.defaultContext = defaultContext;
    }

    /**
     * Create a child logger with additional context
     */
    child(context: LogContext): Logger {
        const childLogger = new Logger(this.config, {
            ...this.defaultContext,
            ...context,
        });
        // Share the file writer
        (childLogger as any).fileWriter = this.fileWriter;
        return childLogger;
    }

    /**
     * Check if a level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return (
            LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.minLevel]
        );
    }

    /**
     * Create a log entry
     */
    private createEntry(
        level: LogLevel,
        category: LogCategory,
        message: string,
        context: LogContext = {},
        data?: Record<string, unknown>,
        error?: Error
    ): LogEntry {
        const now = new Date();
        return {
            timestamp: now.toISOString(),
            timestamp_ms: now.getTime(),
            level,
            category,
            message,
            context: { ...this.defaultContext, ...context },
            data,
            error: error
                ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                  }
                : undefined,
            process: this.processInfo,
        };
    }

    /**
     * Format entry for console output
     */
    private formatConsole(entry: LogEntry): string {
        const levelColor = LEVEL_COLORS[entry.level];
        const levelStr = entry.level.toUpperCase().padEnd(5);

        const contextParts: string[] = [];
        if (entry.context.correlation_id) {
            contextParts.push(
                `cid=${entry.context.correlation_id.substring(0, 12)}`
            );
        }
        if (entry.context.user_id) {
            contextParts.push(`user=${entry.context.user_id.substring(0, 8)}`);
        }
        if (entry.context.watcher_id) {
            contextParts.push(
                `watcher=${entry.context.watcher_id.substring(0, 8)}`
            );
        }
        if (entry.context.thread_id) {
            contextParts.push(
                `thread=${entry.context.thread_id.substring(0, 8)}`
            );
        }

        const contextStr =
            contextParts.length > 0
                ? ` ${COLORS.dim}[${contextParts.join(" ")}]${COLORS.reset}`
                : "";

        const timeStr = `${COLORS.dim}${entry.timestamp.substring(11, 23)}${COLORS.reset}`;
        const categoryStr = `${COLORS.blue}${entry.category.padEnd(10)}${COLORS.reset}`;

        let output = `${timeStr} ${levelColor}${levelStr}${COLORS.reset} ${categoryStr}${contextStr} ${entry.message}`;

        if (this.config.prettyConsole) {
            if (entry.data && Object.keys(entry.data).length > 0) {
                output += `\n${COLORS.dim}  data: ${JSON.stringify(entry.data, null, 2).replace(/\n/g, "\n  ")}${COLORS.reset}`;
            }
            if (entry.error) {
                output += `\n${COLORS.red}  error: ${entry.error.name}: ${entry.error.message}${COLORS.reset}`;
                if (entry.error.stack) {
                    output += `\n${COLORS.dim}${entry.error.stack.split("\n").slice(1).join("\n")}${COLORS.reset}`;
                }
            }
        }

        return output;
    }

    /**
     * Determine which files to write to based on entry
     */
    private getLogFiles(entry: LogEntry): string[] {
        const files: string[] = [];

        // Main category log
        files.push(`${entry.category}.log`);

        // Combined log
        files.push("combined.log");

        // Error log for errors and fatals
        if (entry.level === "error" || entry.level === "fatal") {
            files.push("error.log");
        }

        // Per-entity logs if enabled
        if (this.config.perEntityLogs) {
            if (entry.context.user_id) {
                files.push(`users/${entry.context.user_id}.log`);
            }
            if (entry.context.watcher_id) {
                files.push(`watchers/${entry.context.watcher_id}.log`);
            }
            if (entry.context.thread_id) {
                files.push(`threads/${entry.context.thread_id}.log`);
            }
        }

        return files;
    }

    /**
     * Write a log entry
     */
    private async writeEntry(entry: LogEntry): Promise<void> {
        // Console output
        if (this.config.console) {
            const formatted = this.formatConsole(entry);
            if (entry.level === "error" || entry.level === "fatal") {
                console.error(formatted);
            } else {
                console.log(formatted);
            }
        }

        // File output
        if (this.config.file) {
            const jsonLine = JSON.stringify(entry) + "\n";
            const files = this.getLogFiles(entry);

            for (const file of files) {
                await this.fileWriter.write(file, jsonLine);
            }
        }
    }

    /**
     * Log a message
     */
    private log(
        level: LogLevel,
        category: LogCategory,
        message: string,
        context?: LogContext,
        data?: Record<string, unknown>,
        error?: Error
    ): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const entry = this.createEntry(
            level,
            category,
            message,
            context,
            data,
            error
        );
        this.writeEntry(entry).catch((err) => {
            console.error("[Logger] Failed to write log entry:", err);
        });
    }

    // Category-specific logging methods

    // System logs
    system = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "system", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "system", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "system", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "system", msg, ctx, data, err),
        fatal: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("fatal", "system", msg, ctx, data, err),
    };

    // API logs
    api = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "api", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "api", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "api", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "api", msg, ctx, data, err),
    };

    // Auth logs
    auth = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "auth", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "auth", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "auth", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "auth", msg, ctx, data, err),
    };

    // Ingestion logs
    ingestion = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "ingestion", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "ingestion", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "ingestion", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "ingestion", msg, ctx, data, err),
    };

    // Extraction logs
    extraction = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "extraction", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "extraction", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "extraction", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "extraction", msg, ctx, data, err),
    };

    // Watcher logs
    watcher = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "watcher", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "watcher", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "watcher", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "watcher", msg, ctx, data, err),
    };

    // Thread logs
    thread = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "thread", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "thread", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "thread", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "thread", msg, ctx, data, err),
    };

    // Urgency logs
    urgency = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "urgency", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "urgency", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "urgency", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "urgency", msg, ctx, data, err),
    };

    // Reminder logs
    reminder = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "reminder", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "reminder", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "reminder", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "reminder", msg, ctx, data, err),
    };

    // Alert logs
    alert = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "alert", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "alert", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "alert", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "alert", msg, ctx, data, err),
    };

    // Scheduler logs
    scheduler = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "scheduler", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "scheduler", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "scheduler", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "scheduler", msg, ctx, data, err),
    };

    // Worker logs
    worker = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "worker", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "worker", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "worker", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "worker", msg, ctx, data, err),
    };

    // Database logs
    database = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "database", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "database", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "database", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "database", msg, ctx, data, err),
    };

    // Delivery logs
    delivery = {
        debug: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>
        ) => this.log("debug", "delivery", msg, ctx, data),
        info: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("info", "delivery", msg, ctx, data),
        warn: (msg: string, ctx?: LogContext, data?: Record<string, unknown>) =>
            this.log("warn", "delivery", msg, ctx, data),
        error: (
            msg: string,
            ctx?: LogContext,
            data?: Record<string, unknown>,
            err?: Error
        ) => this.log("error", "delivery", msg, ctx, data, err),
    };

    /**
     * Flush all pending log writes
     */
    async flush(): Promise<void> {
        await this.fileWriter.flush();
    }

    /**
     * Close the logger
     */
    async close(): Promise<void> {
        await this.fileWriter.close();
    }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Initialize the global logger
 */
export function initLogger(config?: Partial<LoggerConfig>): Logger {
    globalLogger = new Logger(config);
    return globalLogger;
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
    if (!globalLogger) {
        globalLogger = new Logger();
    }
    return globalLogger;
}

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(
    correlationId?: string,
    userId?: string
): Logger {
    const logger = getLogger();
    return logger.child({
        correlation_id: correlationId || generateCorrelationId(),
        user_id: userId,
    });
}

/**
 * Create a watcher-scoped logger
 */
export function createWatcherLogger(
    watcherId: string,
    userId?: string
): Logger {
    const logger = getLogger();
    return logger.child({
        watcher_id: watcherId,
        user_id: userId,
    });
}

/**
 * Create a thread-scoped logger
 */
export function createThreadLogger(
    threadId: string,
    watcherId: string
): Logger {
    const logger = getLogger();
    return logger.child({
        thread_id: threadId,
        watcher_id: watcherId,
    });
}
