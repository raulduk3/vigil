/**
 * Simple In-Memory Rate Limiter
 *
 * Sliding window counter per key (IP or token).
 * Production: replace with Redis-backed limiter.
 */

import type { Context, Next } from "hono";
import { logger } from "../logger";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 5 * 60 * 1000);

function getClientIp(c: Context): string {
    return (
        c.req.header("cf-connecting-ip") ??
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "unknown"
    );
}

/**
 * Create a rate limit middleware.
 * @param maxRequests - Max requests per window
 * @param windowMs - Window duration in milliseconds
 * @param keyPrefix - Prefix for the rate limit key (to separate different endpoints)
 */
export function rateLimit(maxRequests: number, windowMs: number, keyPrefix: string = "rl") {
    return async (c: Context, next: Next): Promise<Response | void> => {
        const ip = getClientIp(c);
        const key = `${keyPrefix}:${ip}`;
        const now = Date.now();

        let entry = store.get(key);
        if (!entry || entry.resetAt < now) {
            entry = { count: 0, resetAt: now + windowMs };
            store.set(key, entry);
        }

        entry.count++;

        // Set rate limit headers
        c.header("X-RateLimit-Limit", String(maxRequests));
        c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count > maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            c.header("Retry-After", String(retryAfter));
            logger.warn("Rate limit exceeded", { ip, key, count: entry.count });
            return c.json({ error: "Too many requests" }, 429);
        }

        await next();
    };
}

/**
 * Strict rate limit for auth endpoints (login/register).
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimit = rateLimit(10, 15 * 60 * 1000, "auth");

/**
 * Rate limit for ingestion endpoints.
 * 100 emails per minute per IP (generous, but prevents abuse).
 */
export const ingestRateLimit = rateLimit(100, 60 * 1000, "ingest");

/**
 * General API rate limit.
 * 120 requests per minute per IP.
 */
export const apiRateLimit = rateLimit(120, 60 * 1000, "api");
