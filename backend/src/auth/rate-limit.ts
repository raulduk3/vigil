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
 * 5 requests per 15 minutes per IP.
 */
export const authRateLimit = rateLimit(5, 15 * 60 * 1000, "auth");

/**
 * Rate limit for ingestion endpoints.
 * 200 emails per minute per IP (Cloudflare Workers share IPs, needs to be generous).
 * Per-watcher rate limiting for ingest endpoints.
 */
export const ingestRateLimit = rateLimit(200, 60 * 1000, "ingest");

/**
 * General API rate limit.
 * 60 requests per minute per IP.
 */
export const apiRateLimit = rateLimit(60, 60 * 1000, "api");

/**
 * Rate limit for chat/invoke (expensive LLM calls).
 * 10 per minute per IP.
 */
export const invokeRateLimit = rateLimit(10, 60 * 1000, "invoke");

/**
 * Rate limit for watcher creation.
 * 5 per hour per IP.
 */
export const createRateLimit = rateLimit(5, 60 * 60 * 1000, "create");
