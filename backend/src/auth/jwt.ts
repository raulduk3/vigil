/**
 * JWT Authentication — V2
 *
 * Access tokens (1h) + Refresh tokens (24h).
 * Refresh tokens stored in SQLite refresh_tokens table.
 * Server instance ID invalidates all tokens on restart.
 */

import jwt from "jsonwebtoken";
import { queryOne, run } from "../db/client";
import { logger } from "../logger";

// ============================================================================
// Configuration
// ============================================================================

const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "24h";

const SERVER_INSTANCE_ID = crypto.randomUUID();

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable required");
    return secret;
}

function getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error("JWT_REFRESH_SECRET environment variable required");
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

    return { accessToken, refreshToken, expiresIn: 3600 };
}

// ============================================================================
// Token Verification
// ============================================================================

export function verifyAccessToken(token: string): TokenPayload | null {
    try {
        const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
        if (payload.instance_id !== SERVER_INSTANCE_ID) {
            logger.debug("Token from different server instance");
            return null;
        }
        return payload;
    } catch {
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

        if (payload.instance_id !== SERVER_INSTANCE_ID) return null;

        const tokenHash = await hashToken(token);
        const row = queryOne<{ revoked: number }>(
            `SELECT revoked FROM refresh_tokens WHERE token_hash = ?`,
            [tokenHash]
        );

        if (row?.revoked) return null;

        return { user_id: payload.user_id };
    } catch {
        return null;
    }
}

// ============================================================================
// Token Storage
// ============================================================================

export async function storeRefreshToken(
    accountId: string,
    token: string
): Promise<void> {
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    run(
        `INSERT INTO refresh_tokens (id, account_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), accountId, tokenHash, expiresAt]
    );
}

export async function revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = await hashToken(token);
    run(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?`,
        [tokenHash]
    );
}

export async function revokeAllUserTokens(accountId: string): Promise<void> {
    run(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE account_id = ?`,
        [accountId]
    );
}

// ============================================================================
// Helpers
// ============================================================================

async function hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function getServerInstanceId(): string {
    return SERVER_INSTANCE_ID;
}
