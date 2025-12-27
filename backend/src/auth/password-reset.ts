/**
 * Password Reset
 *
 * Implements secure password reset flow with email verification.
 *
 * Flow:
 * 1. User requests reset -> token generated, stored, email sent
 * 2. User clicks link -> token verified
 * 3. User submits new password -> password updated, token invalidated
 */

import { randomBytes, createHash } from "crypto";
import { query, queryOne, withTransaction } from "@/db/client";
import {
    hashPassword,
    validatePasswordStrength,
    validateEmail,
    normalizeEmail,
} from "./password";

// ============================================================================
// Types
// ============================================================================

export interface PasswordResetToken {
    token_id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    used: boolean;
    created_at: Date;
}

export interface RequestResetResult {
    success: boolean;
    error?: string;
    /** Token to include in reset email (only returned on success) */
    token?: string;
    /** User email for sending the reset email */
    email?: string;
}

export interface VerifyResetTokenResult {
    valid: boolean;
    error?: string;
    user_id?: string;
    email?: string;
}

export interface ResetPasswordResult {
    success: boolean;
    error?: string;
    errors?: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/** Token expiry time in milliseconds (1 hour) */
const TOKEN_EXPIRY_MS = 60 * 60 * 1000;

/** Token length in bytes (32 bytes = 64 hex chars) */
const TOKEN_LENGTH = 32;

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a secure random token.
 */
function generateResetToken(): string {
    return randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Hash a token for storage (don't store raw tokens).
 */
function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

// ============================================================================
// Request Password Reset
// ============================================================================

/**
 * Request a password reset for an email address.
 *
 * Always returns success to prevent email enumeration.
 * If user exists, generates token and returns it for email sending.
 */
export async function requestPasswordReset(
    email: string
): Promise<RequestResetResult> {
    const normalizedEmail = normalizeEmail(email);

    if (!validateEmail(normalizedEmail)) {
        // Don't reveal if email is invalid format
        return { success: true };
    }

    // Look up user
    const user = await queryOne<{ user_id: string; email: string }>(
        "SELECT user_id, email FROM users WHERE email = $1",
        [normalizedEmail]
    );

    if (!user) {
        // Don't reveal if user doesn't exist
        return { success: true };
    }

    // Invalidate any existing tokens for this user
    await query(
        "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
        [user.user_id]
    );

    // Generate new token
    const token = generateResetToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
    const tokenId = randomBytes(16).toString("hex");

    // Store token
    await query(
        `INSERT INTO password_reset_tokens (token_id, user_id, token_hash, expires_at, used, created_at)
         VALUES ($1, $2, $3, $4, FALSE, NOW())`,
        [tokenId, user.user_id, tokenHash, expiresAt]
    );

    return {
        success: true,
        token,
        email: user.email,
    };
}

// ============================================================================
// Verify Reset Token
// ============================================================================

/**
 * Verify a password reset token is valid.
 */
export async function verifyResetToken(
    token: string
): Promise<VerifyResetTokenResult> {
    if (!token || token.length !== TOKEN_LENGTH * 2) {
        return { valid: false, error: "Invalid token format" };
    }

    const tokenHash = hashToken(token);

    const storedToken = await queryOne<{
        token_id: string;
        user_id: string;
        expires_at: Date;
        used: boolean;
    }>(
        `SELECT token_id, user_id, expires_at, used 
         FROM password_reset_tokens 
         WHERE token_hash = $1`,
        [tokenHash]
    );

    if (!storedToken) {
        return { valid: false, error: "Invalid or expired token" };
    }

    if (storedToken.used) {
        return { valid: false, error: "Token has already been used" };
    }

    if (new Date(storedToken.expires_at) < new Date()) {
        return { valid: false, error: "Token has expired" };
    }

    // Get user email for confirmation
    const user = await queryOne<{ email: string }>(
        "SELECT email FROM users WHERE user_id = $1",
        [storedToken.user_id]
    );

    return {
        valid: true,
        user_id: storedToken.user_id,
        email: user?.email,
    };
}

// ============================================================================
// Reset Password
// ============================================================================

/**
 * Reset password using a valid token.
 */
export async function resetPassword(
    token: string,
    newPassword: string
): Promise<ResetPasswordResult> {
    // Verify token first
    const tokenVerification = await verifyResetToken(token);
    if (!tokenVerification.valid) {
        return { success: false, error: tokenVerification.error };
    }

    // Validate new password
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return { success: false, errors: passwordValidation.errors };
    }

    const tokenHash = hashToken(token);
    const newPasswordHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
        // Mark token as used
        await client.query(
            "UPDATE password_reset_tokens SET used = TRUE WHERE token_hash = $1",
            [tokenHash]
        );

        // Update password
        await client.query(
            "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
            [newPasswordHash, tokenVerification.user_id]
        );

        // Revoke all refresh tokens (force re-login)
        await client.query(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1",
            [tokenVerification.user_id]
        );
    });

    return { success: true };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove expired and used reset tokens.
 * Run periodically (e.g., daily).
 */
export async function cleanupExpiredResetTokens(): Promise<number> {
    const result = await query(
        "DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE"
    );
    return result.rowCount || 0;
}
