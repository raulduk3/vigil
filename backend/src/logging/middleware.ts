/**
 * Logging Middleware
 *
 * HTTP request/response logging middleware for Hono.
 */

import type { Context, Next } from "hono";
import { getLogger, generateCorrelationId } from "./logger";
import type { LogContext } from "./types";

/**
 * Extract user ID from request context (set by auth middleware)
 */
function getUserId(c: Context): string | undefined {
    try {
        const user = c.get("user");
        return user?.id || user?.user_id;
    } catch {
        return undefined;
    }
}

/**
 * Sanitize headers for logging (remove sensitive data)
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];

    headers.forEach((value, key) => {
        if (sensitiveHeaders.includes(key.toLowerCase())) {
            sanitized[key] = "[REDACTED]";
        } else {
            sanitized[key] = value;
        }
    });

    return sanitized;
}

/**
 * Request logging middleware
 *
 * Logs incoming requests and outgoing responses with timing.
 */
export function requestLoggingMiddleware() {
    const logger = getLogger();

    return async (c: Context, next: Next) => {
        const startTime = Date.now();

        // Generate or extract correlation ID
        const correlationId =
            c.req.header("x-correlation-id") || generateCorrelationId();

        // Store correlation ID for downstream use
        c.set("correlationId", correlationId);

        // Build context
        const ctx: LogContext = {
            correlation_id: correlationId,
        };

        // Log request
        const method = c.req.method;
        const path = c.req.path;
        const query = c.req.query();

        logger.api.info(`→ ${method} ${path}`, ctx, {
            method,
            path,
            query: Object.keys(query).length > 0 ? query : undefined,
            headers: sanitizeHeaders(c.req.raw.headers),
            ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
            user_agent: c.req.header("user-agent"),
        });

        try {
            // Execute request
            await next();

            // Get user ID if available after auth
            const userId = getUserId(c);
            if (userId) {
                ctx.user_id = userId;
            }

            // Calculate duration
            const duration = Date.now() - startTime;
            const status = c.res.status;

            // Determine log level based on status
            const logMethod =
                status >= 500
                    ? logger.api.error
                    : status >= 400
                      ? logger.api.warn
                      : logger.api.info;

            logMethod.call(logger.api, `← ${method} ${path} ${status}`, ctx, {
                method,
                path,
                status,
                duration_ms: duration,
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.api.error(
                `✗ ${method} ${path} - Unhandled error`,
                ctx,
                {
                    method,
                    path,
                    duration_ms: duration,
                },
                error instanceof Error ? error : new Error(String(error))
            );

            throw error;
        }
    };
}

/**
 * Error logging middleware
 *
 * Catches and logs unhandled errors.
 */
export function errorLoggingMiddleware() {
    const logger = getLogger();

    return async (c: Context, next: Next) => {
        try {
            await next();
        } catch (error) {
            const correlationId =
                c.get("correlationId") || generateCorrelationId();
            const userId = getUserId(c);

            logger.api.error(
                `Unhandled error in ${c.req.method} ${c.req.path}`,
                {
                    correlation_id: correlationId,
                    user_id: userId,
                },
                {
                    method: c.req.method,
                    path: c.req.path,
                },
                error instanceof Error ? error : new Error(String(error))
            );

            throw error;
        }
    };
}

/**
 * Auth logging helper
 */
export function logAuthEvent(
    event: "login" | "register" | "logout" | "token_refresh" | "token_invalid",
    userId: string | undefined,
    correlationId: string | undefined,
    data?: Record<string, unknown>,
    error?: Error
) {
    const logger = getLogger();
    const ctx: LogContext = {
        correlation_id: correlationId,
        user_id: userId,
    };

    switch (event) {
        case "login":
            logger.auth.info("User logged in", ctx, data);
            break;
        case "register":
            logger.auth.info("User registered", ctx, data);
            break;
        case "logout":
            logger.auth.info("User logged out", ctx, data);
            break;
        case "token_refresh":
            logger.auth.debug("Token refreshed", ctx, data);
            break;
        case "token_invalid":
            if (error) {
                logger.auth.warn("Invalid token", ctx, { ...data, error: String(error) });
            } else {
                logger.auth.warn("Invalid token", ctx, data);
            }
            break;
    }
}
