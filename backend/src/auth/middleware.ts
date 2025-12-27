/**
 * Authentication Middleware
 *
 * Implements SEC-1: Token authentication
 * Implements SEC-7: Rate limiting
 * Implements SEC-8: Token scope validation
 */

import { extractBearerToken, verifyAccessToken } from "./jwt";

// ============================================================================
// Types
// ============================================================================

export interface AuthContext {
    user_id: string;
    account_id: string;
    email: string;
    role: "owner" | "member";
}

export interface AuthResult {
    authenticated: boolean;
    context?: AuthContext;
    error?: string;
    status_code?: number;
}

// ============================================================================
// Rate Limiting (SEC-7)
// ============================================================================

interface RateLimitEntry {
    count: number;
    window_start: number;
}

// SEC-7: 1000 req/min per account
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 1000;

// In-memory rate limit store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for an account.
 * Returns true if request should be allowed.
 */
export function checkRateLimit(accountId: string): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(accountId);

    if (!entry || now - entry.window_start > RATE_LIMIT_WINDOW_MS) {
        // New window
        rateLimitStore.set(accountId, { count: 1, window_start: now });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }

    entry.count++;
    return true;
}

/**
 * Get remaining rate limit for an account.
 */
export function getRateLimitRemaining(accountId: string): number {
    const now = Date.now();
    const entry = rateLimitStore.get(accountId);

    if (!entry || now - entry.window_start > RATE_LIMIT_WINDOW_MS) {
        return RATE_LIMIT_MAX_REQUESTS;
    }

    return Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
}

/**
 * Clean up expired rate limit entries (call periodically).
 */
export function cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (now - entry.window_start > RATE_LIMIT_WINDOW_MS) {
            rateLimitStore.delete(key);
        }
    }
}

// Auto-cleanup every 5 minutes to prevent unbounded memory growth
setInterval(cleanupRateLimits, 5 * 60 * 1000);

// ============================================================================
// Authentication
// ============================================================================

/**
 * Authenticate a request using Bearer token.
 */
export function authenticateRequest(
    authorizationHeader: string | null | undefined
): AuthResult {
    // Extract token
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
        return {
            authenticated: false,
            error: "Missing or invalid Authorization header",
            status_code: 401,
        };
    }

    // Verify token
    const result = verifyAccessToken(token);
    if (!result.valid || !result.payload) {
        return {
            authenticated: false,
            error: result.expired ? "Token expired" : "Invalid token",
            status_code: 401,
        };
    }

    const payload = result.payload;

    // Check rate limit (SEC-7)
    if (!checkRateLimit(payload.account_id)) {
        return {
            authenticated: false,
            error: "Rate limit exceeded",
            status_code: 429,
        };
    }

    return {
        authenticated: true,
        context: {
            user_id: payload.user_id,
            account_id: payload.account_id,
            email: payload.email,
            role: payload.role,
        },
    };
}

// ============================================================================
// Authorization
// ============================================================================

/**
 * Check if user can access a watcher.
 * SEC-8: Validates watcher belongs to user's account.
 */
export function canAccessWatcher(
    auth: AuthContext,
    watcherAccountId: string
): boolean {
    return auth.account_id === watcherAccountId;
}

/**
 * Check if user has owner role.
 */
export function isOwner(auth: AuthContext): boolean {
    return auth.role === "owner";
}

/**
 * Check if user can modify account settings.
 * Only owners can modify account-level settings.
 */
export function canModifyAccount(auth: AuthContext): boolean {
    return auth.role === "owner";
}

// ============================================================================
// Request Parsing Helpers
// ============================================================================

/**
 * Parse authentication from HTTP request headers.
 */
export function parseAuthFromHeaders(
    headers: Record<string, string | undefined>
): AuthResult {
    const authHeader =
        headers["authorization"] ||
        headers["Authorization"] ||
        headers["AUTHORIZATION"];

    return authenticateRequest(authHeader);
}

/**
 * Require authentication - throws if not authenticated.
 */
export function requireAuth(
    headers: Record<string, string | undefined>
): AuthContext {
    const result = parseAuthFromHeaders(headers);

    if (!result.authenticated || !result.context) {
        const error = new Error(
            result.error || "Authentication required"
        ) as any;
        error.status_code = result.status_code || 401;
        throw error;
    }

    return result.context;
}

// ============================================================================
// Ingest Token Authentication
// ============================================================================

/**
 * Authenticate email ingestion request using ingest token.
 * This is separate from user authentication.
 */
export function authenticateIngestToken(
    ingestToken: string,
    validTokens: Set<string>
): boolean {
    return validTokens.has(ingestToken);
}

/**
 * Extract ingest token from email address.
 * Format: <name>-<token>@ingest.email.vigil.run
 */
export function extractIngestToken(emailAddress: string): string | null {
    const match = emailAddress.match(/-([a-z0-9]+)@ingest\.email\.vigil\.run$/i);
    return match && match[1] ? match[1].toLowerCase() : null;
}
