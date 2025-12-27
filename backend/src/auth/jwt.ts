/**
 * JWT Token Management
 *
 * Implements SEC-1: Token Expiry (1 hour access, 24 hours refresh)
 * Implements SEC-8: Token Scope (account_id)
 * 
 * Security: All tokens are invalidated on server restart via server instance ID.
 */

import { sign, verify, type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";

// ============================================================================
// Configuration
// ============================================================================

if (!process.env.JWT_SECRET) {
    throw new Error(
        "JWT_SECRET environment variable is required. " +
            "Generate with: openssl rand -base64 32"
    );
}

if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error(
        "JWT_REFRESH_SECRET environment variable is required. " +
            "Generate with: openssl rand -base64 32"
    );
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Server instance ID - changes on every restart, invalidating all tokens
// This ensures tokens don't persist across server restarts for security
const SERVER_INSTANCE_ID = randomUUID();
console.log(`[JWT] Server instance ID: ${SERVER_INSTANCE_ID.substring(0, 8)}... (tokens from previous instances are now invalid)`);

/**
 * Get the current server instance ID (useful for debugging/health checks).
 */
export function getServerInstanceId(): string {
    return SERVER_INSTANCE_ID;
}

// SEC-1: Token Expiry - reasonable defaults
// Access tokens: 1 hour (short-lived for security)
// Refresh tokens: 24 hours (requires re-login daily)
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "24h";

// ============================================================================
// Types
// ============================================================================

export interface TokenPayload {
    user_id: string;
    account_id: string;
    email: string;
    role: "owner" | "member";
}

export interface AccessTokenPayload extends TokenPayload {
    type: "access";
    sid: string; // Server instance ID
}

export interface RefreshTokenPayload {
    user_id: string;
    token_id: string;
    type: "refresh";
    sid: string; // Server instance ID
}

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate an access token for a user.
 * SEC-8: Token scoped to account_id.
 * Includes server instance ID to invalidate tokens on restart.
 */
export function generateAccessToken(payload: TokenPayload): string {
    const tokenPayload: AccessTokenPayload = {
        ...payload,
        type: "access",
        sid: SERVER_INSTANCE_ID,
    };

    return sign(tokenPayload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        algorithm: "HS256",
    });
}

/**
 * Generate a refresh token for a user.
 * Includes server instance ID to invalidate tokens on restart.
 */
export function generateRefreshToken(userId: string, tokenId: string): string {
    const payload: RefreshTokenPayload = {
        user_id: userId,
        token_id: tokenId,
        type: "refresh",
        sid: SERVER_INSTANCE_ID,
    };

    return sign(payload, JWT_REFRESH_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        algorithm: "HS256",
    });
}

/**
 * Generate both access and refresh tokens.
 * Tokens include the current server instance ID and will be invalid after restart.
 */
export function generateTokenPair(
    payload: TokenPayload,
    refreshTokenId: string
): TokenPair {
    return {
        access_token: generateAccessToken(payload),
        refresh_token: generateRefreshToken(payload.user_id, refreshTokenId),
        expires_in: 60 * 60, // 1 hour in seconds (matches ACCESS_TOKEN_EXPIRY)
    };
}

// ============================================================================
// Token Verification
// ============================================================================

export interface VerificationResult<T> {
    valid: boolean;
    payload?: T;
    error?: string;
    expired?: boolean;
}

/**
 * Verify an access token.
 * Validates server instance ID to reject tokens from previous server instances.
 */
export function verifyAccessToken(
    token: string
): VerificationResult<AccessTokenPayload> {
    try {
        const payload = verify(token, JWT_SECRET, {
            algorithms: ["HS256"],
        }) as JwtPayload & AccessTokenPayload;

        if (payload.type !== "access") {
            return { valid: false, error: "Invalid token type" };
        }

        // Reject tokens from previous server instances
        if (payload.sid !== SERVER_INSTANCE_ID) {
            return { valid: false, error: "Token invalidated by server restart", expired: true };
        }

        return { valid: true, payload };
    } catch (error: any) {
        if (error.name === "TokenExpiredError") {
            return { valid: false, error: "Token expired", expired: true };
        }
        if (error.name === "JsonWebTokenError") {
            return { valid: false, error: "Invalid token" };
        }
        return { valid: false, error: "Token verification failed" };
    }
}

/**
 * Verify a refresh token.
 * Validates server instance ID to reject tokens from previous server instances.
 */
export function verifyRefreshToken(
    token: string
): VerificationResult<RefreshTokenPayload> {
    try {
        const payload = verify(token, JWT_REFRESH_SECRET, {
            algorithms: ["HS256"],
        }) as JwtPayload & RefreshTokenPayload;

        if (payload.type !== "refresh") {
            return { valid: false, error: "Invalid token type" };
        }

        // Reject tokens from previous server instances
        if (payload.sid !== SERVER_INSTANCE_ID) {
            return { valid: false, error: "Token invalidated by server restart", expired: true };
        }

        return { valid: true, payload };
    } catch (error: any) {
        if (error.name === "TokenExpiredError") {
            return {
                valid: false,
                error: "Refresh token expired",
                expired: true,
            };
        }
        if (error.name === "JsonWebTokenError") {
            return { valid: false, error: "Invalid refresh token" };
        }
        return { valid: false, error: "Refresh token verification failed" };
    }
}

/**
 * Extract token from Authorization header.
 * Expects: "Bearer <token>"
 */
export function extractBearerToken(
    authHeader: string | null | undefined
): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(" ");
    if (
        parts.length !== 2 ||
        !parts[0] ||
        parts[0].toLowerCase() !== "bearer"
    ) {
        return null;
    }

    return parts[1] ?? null;
}

// ============================================================================
// Token Expiry Calculation
// ============================================================================

/**
 * Get the expiry timestamp for a refresh token (24 hours from now).
 * Note: Tokens are also invalidated on server restart regardless of expiry.
 */
export function getRefreshTokenExpiry(): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    return expiry;
}

/**
 * Parse JWT expiry to Date.
 */
export function getTokenExpiry(token: string): Date | null {
    try {
        // Decode without verification to read expiry
        const parts = token.split(".");
        if (parts.length !== 3 || !parts[1]) return null;

        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        if (!payload.exp) return null;

        return new Date(payload.exp * 1000);
    } catch {
        return null;
    }
}
