/**
 * JWT Authentication
 *
 * Access tokens (1h) + Refresh tokens (24h).
 * Server instance ID invalidates all tokens on restart.
 */

import jwt from "jsonwebtoken";
import { queryOne, query } from "../db/client";
import { logger } from "../logger";

// ============================================================================
// Configuration
// ============================================================================

const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "24h";

// Server instance ID - changes on restart, invalidating all tokens
const SERVER_INSTANCE_ID = crypto.randomUUID();

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET environment variable required");
    }
    return secret;
}

function getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new Error("JWT_REFRESH_SECRET environment variable required");
    }
    return secret;
}

// ============================================================================
// Types
// ============================================================================

export interface TokenPayload {
    user_id: string;
    account_id: string;
    email: string;
    role: "owner" | "member";
    instance_id: string;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

// ============================================================================
// Token Generation
// ============================================================================

export function generateTokenPair(
    payload: Omit<TokenPayload, "instance_id">
): TokenPair {
    const fullPayload: TokenPayload = {
        ...payload,
        instance_id: SERVER_INSTANCE_ID,
    };

    const accessToken = jwt.sign(fullPayload, getJwtSecret(), {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(
        { user_id: payload.user_id, instance_id: SERVER_INSTANCE_ID },
        getRefreshSecret(),
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    return {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
    };
}

// ============================================================================
// Token Verification
// ============================================================================

export function verifyAccessToken(token: string): TokenPayload | null {
    try {
        const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;

        // Check server instance ID
        if (payload.instance_id !== SERVER_INSTANCE_ID) {
            logger.debug("Token from different server instance");
            return null;
        }

        return payload;
    } catch (error) {
        return null;
    }
}

export async function verifyRefreshToken(
    token: string
): Promise<{ user_id: string } | null> {
    try {
        const payload = jwt.verify(token, getRefreshSecret()) as {
            user_id: string;
            instance_id: string;
        };

        // Check server instance ID
        if (payload.instance_id !== SERVER_INSTANCE_ID) {
            return null;
        }

        // Check if token is revoked in database
        const tokenHash = await hashToken(token);
        const dbToken = await queryOne<{ revoked: boolean }>(
            "SELECT revoked FROM refresh_tokens WHERE token_hash = $1",
            [tokenHash]
        );

        if (dbToken?.revoked) {
            return null;
        }

        return { user_id: payload.user_id };
    } catch (error) {
        return null;
    }
}

// ============================================================================
// Token Storage
// ============================================================================

export async function storeRefreshToken(
    userId: string,
    token: string
): Promise<void> {
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await query(
        `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), userId, tokenHash, expiresAt]
    );
}

export async function revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = await hashToken(token);
    await query(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1",
        [tokenHash]
    );
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
    await query("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", [
        userId,
    ]);
}

// ============================================================================
// Helpers
// ============================================================================

async function hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getServerInstanceId(): string {
    return SERVER_INSTANCE_ID;
}
