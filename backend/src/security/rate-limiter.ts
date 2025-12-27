/**
 * Rate Limiter
 *
 * Implements rate limiting for API endpoints.
 * Uses sliding window algorithm for accurate rate limiting.
 */

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    maxRequests: number;
    /** Window size in milliseconds */
    windowMs: number;
    /** Unique identifier for this limiter (for logging) */
    name: string;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterMs: number;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// ============================================================================
// Rate Limiter Class
// ============================================================================

export class RateLimiter {
    private readonly config: RateLimitConfig;
    private readonly entries = new Map<string, RateLimitEntry>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(config: RateLimitConfig) {
        this.config = config;
        this.startCleanup();
    }

    /**
     * Check if a request is allowed and consume a token.
     */
    check(key: string): RateLimitResult {
        const now = Date.now();
        let entry = this.entries.get(key);

        // Create new entry or reset if window expired
        if (!entry || now > entry.resetAt) {
            entry = {
                count: 0,
                resetAt: now + this.config.windowMs,
            };
            this.entries.set(key, entry);
        }

        // Check if over limit
        if (entry.count >= this.config.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetAt,
                retryAfterMs: entry.resetAt - now,
            };
        }

        // Consume a token
        entry.count++;

        return {
            allowed: true,
            remaining: this.config.maxRequests - entry.count,
            resetAt: entry.resetAt,
            retryAfterMs: 0,
        };
    }

    /**
     * Get current status without consuming a token.
     */
    status(key: string): RateLimitResult {
        const now = Date.now();
        const entry = this.entries.get(key);

        if (!entry || now > entry.resetAt) {
            return {
                allowed: true,
                remaining: this.config.maxRequests,
                resetAt: now + this.config.windowMs,
                retryAfterMs: 0,
            };
        }

        const allowed = entry.count < this.config.maxRequests;
        return {
            allowed,
            remaining: Math.max(0, this.config.maxRequests - entry.count),
            resetAt: entry.resetAt,
            retryAfterMs: allowed ? 0 : entry.resetAt - now,
        };
    }

    /**
     * Reset rate limit for a key (e.g., after successful auth).
     */
    reset(key: string): void {
        this.entries.delete(key);
    }

    /**
     * Start periodic cleanup of expired entries.
     */
    private startCleanup(): void {
        // Cleanup every 5 minutes
        this.cleanupInterval = setInterval(
            () => {
                const now = Date.now();
                for (const [key, entry] of this.entries) {
                    if (now > entry.resetAt) {
                        this.entries.delete(key);
                    }
                }
            },
            5 * 60 * 1000
        );
    }

    /**
     * Stop the cleanup interval.
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// ============================================================================
// Preconfigured Rate Limiters
// ============================================================================

/**
 * Rate limiter for authentication endpoints.
 * Strict limits to prevent brute force attacks.
 * 5 requests per 15 minutes per IP.
 */
export const authRateLimiter = new RateLimiter({
    name: "auth",
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
});

/**
 * Rate limiter for password reset requests.
 * Very strict to prevent email enumeration.
 * 3 requests per hour per IP.
 */
export const passwordResetRateLimiter = new RateLimiter({
    name: "password-reset",
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
});

/**
 * Rate limiter for API endpoints.
 * 1000 requests per minute per account (SEC-7).
 */
export const apiRateLimiter = new RateLimiter({
    name: "api",
    maxRequests: 1000,
    windowMs: 60 * 1000, // 1 minute
});

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Get client IP from request headers.
 * Handles X-Forwarded-For for reverse proxy setups.
 */
export function getClientIp(headers: Record<string, string>): string {
    // Check X-Forwarded-For header (from reverse proxies)
    const forwarded = headers["x-forwarded-for"];
    if (forwarded) {
        // Take the first IP in the chain (original client)
        const parts = forwarded.split(",");
        const firstIp = parts[0]?.trim();
        if (firstIp) return firstIp;
    }

    // Check X-Real-IP header (nginx)
    const realIp = headers["x-real-ip"];
    if (realIp) return realIp;

    // Fall back to unknown
    return "unknown";
}

/**
 * Build rate limit headers for response.
 */
export function buildRateLimitHeaders(
    result: RateLimitResult,
    limit?: number
): Record<string, string> {
    const actualLimit = limit ?? result.remaining + (result.allowed ? 0 : 1);
    const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(actualLimit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    };

    if (!result.allowed) {
        headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
    }

    return headers;
}
