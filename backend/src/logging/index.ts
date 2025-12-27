/**
 * Vigil Logging System
 *
 * Production-level structured logging with hierarchical file output.
 */

export {
    Logger,
    getLogger,
    initLogger,
    createRequestLogger,
    createWatcherLogger,
    createThreadLogger,
    generateCorrelationId,
} from "./logger";

export type {
    LogLevel,
    LogCategory,
    LogContext,
    LogEntry,
    LoggerConfig,
} from "./types";

export { LOG_LEVEL_VALUES, DEFAULT_LOGGER_CONFIG } from "./types";
