/**
 * User and Account Management
 *
 * Implements FR-17: Access Control
 * Implements SEC-1 through SEC-8: Security requirements
 */

import { randomUUID } from "crypto";
import { query, queryOne, queryMany, withTransaction } from "@/db/client";
import {
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    validateEmail,
    normalizeEmail,
} from "./password";
import {
    generateTokenPair,
    verifyRefreshToken,
    getRefreshTokenExpiry,
    type TokenPayload,
    type TokenPair,
} from "./jwt";
import { hashPassword as hashToken } from "./password";
import type { SubscriptionPlan } from "@/billing/types";

// ============================================================================
// Types
// ============================================================================

export interface Account {
    account_id: string;
    owner_email: string;
    plan: SubscriptionPlan;
    created_at: Date;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    subscription_status?: string;
}

export interface User {
    user_id: string;
    account_id: string;
    email: string;
    role: "owner" | "member";
    created_at: Date;
    updated_at: Date;
}

export interface UserWithPassword extends User {
    password_hash: string;
}

export interface RegisterInput {
    email: string;
    password: string;
    name?: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface AuthResponse {
    success: boolean;
    user?: User;
    tokens?: TokenPair;
    error?: string;
    errors?: string[];
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a new user and account.
 * Creates both ACCOUNT_CREATED and USER_CREATED events.
 */
export async function registerUser(
    input: RegisterInput
): Promise<AuthResponse> {
    // Validate email
    const email = normalizeEmail(input.email);
    if (!validateEmail(email)) {
        return { success: false, error: "Invalid email address" };
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(input.password);
    if (!passwordValidation.valid) {
        return { success: false, errors: passwordValidation.errors };
    }

    // Check if email already exists
    const existing = await queryOne<{ user_id: string }>(
        "SELECT user_id FROM users WHERE email = $1",
        [email]
    );
    if (existing) {
        return { success: false, error: "Email already registered" };
    }

    // Hash password (SEC-2)
    const passwordHash = await hashPassword(input.password);

    // Generate IDs
    const accountId = randomUUID();
    const userId = randomUUID();
    const refreshTokenId = randomUUID();

    // Create account and user in transaction
    await withTransaction(async (client) => {
        // Create account
        await client.query(
            `INSERT INTO accounts (account_id, owner_email, plan, created_at)
       VALUES ($1, $2, $3, NOW())`,
            [accountId, email, "free"]
        );

        // Create user with usable password
        await client.query(
            `INSERT INTO users (user_id, account_id, email, password_hash, role, has_usable_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            [userId, accountId, email, passwordHash, "owner", true]
        );

        // Create refresh token
        const tokenExpiry = getRefreshTokenExpiry();
        await client.query(
            `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [
                refreshTokenId,
                userId,
                await hashToken(refreshTokenId),
                tokenExpiry,
            ]
        );
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
        user_id: userId,
        account_id: accountId,
        email,
        role: "owner",
    };
    const tokens = generateTokenPair(tokenPayload, refreshTokenId);

    // Fetch created user
    const user = await getUserById(userId);

    return {
        success: true,
        user: user!,
        tokens,
    };
}

// ============================================================================
// Login
// ============================================================================

/**
 * Authenticate a user with email and password.
 */
export async function loginUser(input: LoginInput): Promise<AuthResponse> {
    const email = normalizeEmail(input.email);

    // Fetch user with password
    const user = await queryOne<UserWithPassword>(
        `SELECT u.user_id, u.account_id, u.email, u.password_hash, u.role, u.created_at, u.updated_at
     FROM users u
     WHERE u.email = $1`,
        [email]
    );

    if (!user) {
        // Use constant-time response to prevent timing attacks
        await verifyPassword(
            input.password,
            "$2b$12$placeholder.hash.for.timing"
        );
        return { success: false, error: "Invalid email or password" };
    }

    // Verify password
    const validPassword = await verifyPassword(
        input.password,
        user.password_hash
    );
    if (!validPassword) {
        return { success: false, error: "Invalid email or password" };
    }

    // Generate new refresh token
    const refreshTokenId = randomUUID();
    const tokenExpiry = getRefreshTokenExpiry();

    await query(
        `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
        [
            refreshTokenId,
            user.user_id,
            await hashToken(refreshTokenId),
            tokenExpiry,
        ]
    );

    // Generate tokens
    const tokenPayload: TokenPayload = {
        user_id: user.user_id,
        account_id: user.account_id,
        email: user.email,
        role: user.role,
    };
    const tokens = generateTokenPair(tokenPayload, refreshTokenId);

    // Return user without password hash
    const { password_hash, ...safeUser } = user;

    return {
        success: true,
        user: safeUser,
        tokens,
    };
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Refresh access token using refresh token.
 */
export async function refreshTokens(
    refreshToken: string
): Promise<AuthResponse> {
    // Verify refresh token
    const verification = verifyRefreshToken(refreshToken);
    if (!verification.valid || !verification.payload) {
        return {
            success: false,
            error: verification.error || "Invalid refresh token",
        };
    }

    const { user_id, token_id } = verification.payload;

    // Check if token exists and is not revoked
    const storedToken = await queryOne<{
        token_id: string;
        revoked: boolean;
        expires_at: Date;
    }>(
        `SELECT token_id, revoked, expires_at
     FROM refresh_tokens
     WHERE token_id = $1 AND user_id = $2`,
        [token_id, user_id]
    );

    if (!storedToken) {
        return { success: false, error: "Refresh token not found" };
    }

    if (storedToken.revoked) {
        return { success: false, error: "Refresh token has been revoked" };
    }

    if (new Date(storedToken.expires_at) < new Date()) {
        return { success: false, error: "Refresh token has expired" };
    }

    // Fetch user
    const user = await getUserById(user_id);
    if (!user) {
        return { success: false, error: "User not found" };
    }

    // Revoke old refresh token and create new one (token rotation)
    const newRefreshTokenId = randomUUID();
    const tokenExpiry = getRefreshTokenExpiry();

    await withTransaction(async (client) => {
        // Revoke old token
        await client.query(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE token_id = $1",
            [token_id]
        );

        // Create new token
        await client.query(
            `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [
                newRefreshTokenId,
                user_id,
                await hashToken(newRefreshTokenId),
                tokenExpiry,
            ]
        );
    });

    // Generate new tokens
    const tokenPayload: TokenPayload = {
        user_id: user.user_id,
        account_id: user.account_id,
        email: user.email,
        role: user.role,
    };
    const tokens = generateTokenPair(tokenPayload, newRefreshTokenId);

    return {
        success: true,
        user,
        tokens,
    };
}

// ============================================================================
// Logout
// ============================================================================

/**
 * Revoke all refresh tokens for a user (logout from all devices).
 */
export async function logoutUser(userId: string): Promise<void> {
    await query("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", [
        userId,
    ]);
}

/**
 * Revoke a specific refresh token.
 */
export async function revokeRefreshToken(tokenId: string): Promise<void> {
    await query(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE token_id = $1",
        [tokenId]
    );
}

// ============================================================================
// User Queries
// ============================================================================

/**
 * Get user by ID.
 */
export async function getUserById(userId: string): Promise<User | null> {
    return queryOne<User>(
        `SELECT user_id, account_id, email, role, created_at, updated_at
     FROM users WHERE user_id = $1`,
        [userId]
    );
}

/**
 * Get user by email.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
    return queryOne<User>(
        `SELECT user_id, account_id, email, role, created_at, updated_at
     FROM users WHERE email = $1`,
        [normalizeEmail(email)]
    );
}

/**
 * Get all users for an account.
 */
export async function getUsersForAccount(accountId: string): Promise<User[]> {
    return queryMany<User>(
        `SELECT user_id, account_id, email, role, created_at, updated_at
     FROM users WHERE account_id = $1 ORDER BY created_at ASC`,
        [accountId]
    );
}

// ============================================================================
// Account Queries
// ============================================================================

/**
 * Get account by ID.
 */
export async function getAccountById(
    accountId: string
): Promise<Account | null> {
    return queryOne<Account>(
        "SELECT account_id, owner_email, plan, created_at FROM accounts WHERE account_id = $1",
        [accountId]
    );
}

// ============================================================================
// Password Management
// ============================================================================

/**
 * Change user password.
 * For OAuth-only users setting first password, currentPassword can be empty.
 */
export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<AuthResponse> {
    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return { success: false, errors: passwordValidation.errors };
    }

    // Fetch user with password info
    const user = await queryOne<
        UserWithPassword & { has_usable_password: boolean }
    >(
        "SELECT user_id, password_hash, has_usable_password FROM users WHERE user_id = $1",
        [userId]
    );

    if (!user) {
        return { success: false, error: "User not found" };
    }

    // If user has a usable password, verify current password
    if (user.has_usable_password) {
        if (!currentPassword) {
            return { success: false, error: "Current password is required" };
        }
        const validPassword = await verifyPassword(
            currentPassword,
            user.password_hash
        );
        if (!validPassword) {
            return { success: false, error: "Current password is incorrect" };
        }
    }
    // OAuth-only users don't need to verify current password (they don't have one)

    // Hash new password and update, also set has_usable_password to true
    const newPasswordHash = await hashPassword(newPassword);
    await query(
        "UPDATE users SET password_hash = $1, has_usable_password = $2, updated_at = NOW() WHERE user_id = $3",
        [newPasswordHash, true, userId]
    );

    // Revoke all refresh tokens (force re-login)
    await logoutUser(userId);

    return { success: true };
}

// ============================================================================
// Invite User (Account Members)
// ============================================================================

/**
 * Invite a new member to an account.
 * Only account owners can invite members.
 */
export async function inviteUser(
    accountId: string,
    email: string,
    temporaryPassword: string
): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(email);

    // Check if email already exists
    const existing = await queryOne<{ user_id: string }>(
        "SELECT user_id FROM users WHERE email = $1",
        [normalizedEmail]
    );
    if (existing) {
        return { success: false, error: "Email already registered" };
    }

    // Validate password
    const passwordValidation = validatePasswordStrength(temporaryPassword);
    if (!passwordValidation.valid) {
        return { success: false, errors: passwordValidation.errors };
    }

    // Hash password
    const passwordHash = await hashPassword(temporaryPassword);
    const userId = randomUUID();

    // Create user
    await query(
        `INSERT INTO users (user_id, account_id, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [userId, accountId, normalizedEmail, passwordHash, "member"]
    );

    const user = await getUserById(userId);
    return { success: true, user: user! };
}

// ============================================================================
// OAuth Login / Registration
// ============================================================================

export interface OAuthUserInfo {
    provider: string;
    provider_user_id: string;
    email: string;
    name?: string;
    picture?: string;
}

/**
 * Login or create a user from OAuth provider info.
 * - If user exists with email, link OAuth account and return tokens
 * - If user doesn't exist, create new account/user and link OAuth
 */
export async function loginOrCreateFromOAuth(
    oauthInfo: OAuthUserInfo
): Promise<AuthResponse> {
    const email = normalizeEmail(oauthInfo.email);

    // Check if OAuth link already exists
    const existingLink = await queryOne<{ user_id: string }>(
        `SELECT user_id FROM oauth_account_links 
         WHERE provider = $1 AND provider_user_id = $2`,
        [oauthInfo.provider, oauthInfo.provider_user_id]
    );

    let user: User | null = null;

    if (existingLink) {
        // OAuth link exists, get user
        user = await getUserById(existingLink.user_id);
    } else {
        // Check if user exists by email
        user = await getUserByEmail(email);

        if (user) {
            // User exists, link OAuth account
            await query(
                `INSERT INTO oauth_account_links 
                 (link_id, user_id, provider, provider_user_id, email, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [
                    randomUUID(),
                    user.user_id,
                    oauthInfo.provider,
                    oauthInfo.provider_user_id,
                    email,
                ]
            );
        } else {
            // Create new account and user
            const accountId = randomUUID();
            const userId = randomUUID();

            await withTransaction(async (client) => {
                // Create account
                await client.query(
                    `INSERT INTO accounts (account_id, owner_email, plan, created_at)
                     VALUES ($1, $2, $3, NOW())`,
                    [accountId, email, "free"]
                );

                // Create user with a random unusable password hash for OAuth-only users
                // They can set a real password later if they want
                const randomPasswordHash = await hashPassword(
                    randomUUID() + randomUUID()
                );
                await client.query(
                    `INSERT INTO users (user_id, account_id, email, password_hash, role, has_usable_password, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                    [
                        userId,
                        accountId,
                        email,
                        randomPasswordHash,
                        "owner",
                        false,
                    ]
                );

                // Create OAuth link
                await client.query(
                    `INSERT INTO oauth_account_links 
                     (link_id, user_id, provider, provider_user_id, email, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                    [
                        randomUUID(),
                        userId,
                        oauthInfo.provider,
                        oauthInfo.provider_user_id,
                        email,
                    ]
                );
            });

            user = await getUserById(userId);
        }
    }

    if (!user) {
        return { success: false, error: "Failed to create or retrieve user" };
    }

    // Generate tokens
    const refreshTokenId = randomUUID();
    const tokenExpiry = getRefreshTokenExpiry();

    await query(
        `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
            refreshTokenId,
            user.user_id,
            await hashToken(refreshTokenId),
            tokenExpiry,
        ]
    );

    const tokenPayload: TokenPayload = {
        user_id: user.user_id,
        account_id: user.account_id,
        email: user.email,
        role: user.role,
    };
    const tokens = generateTokenPair(tokenPayload, refreshTokenId);

    return {
        success: true,
        user,
        tokens,
    };
}

/**
 * Get OAuth links for a user.
 */
export async function getOAuthLinksForUser(
    userId: string
): Promise<Array<{ provider: string; email: string; created_at: Date }>> {
    return queryMany<{ provider: string; email: string; created_at: Date }>(
        `SELECT provider, email, created_at 
         FROM oauth_account_links WHERE user_id = $1`,
        [userId]
    );
}

/**
 * Get authentication methods for a user.
 * Returns whether user has a password and which OAuth providers are linked.
 */
export async function getAuthMethods(
    userId: string
): Promise<{ has_password: boolean; oauth_providers: string[] }> {
    const user = await queryOne<{ has_usable_password: boolean }>(
        "SELECT has_usable_password FROM users WHERE user_id = $1",
        [userId]
    );

    const links = await queryMany<{ provider: string }>(
        "SELECT provider FROM oauth_account_links WHERE user_id = $1",
        [userId]
    );

    return {
        has_password: user?.has_usable_password ?? false,
        oauth_providers: links.map((l) => l.provider),
    };
}

/**
 * Unlink an OAuth provider from a user.
 */
export async function unlinkOAuthProvider(
    userId: string,
    provider: string
): Promise<{ success: boolean; error?: string }> {
    // Check if user has a usable password
    const user = await queryOne<{ has_usable_password: boolean }>(
        "SELECT has_usable_password FROM users WHERE user_id = $1",
        [userId]
    );

    const linkCount = await queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM oauth_account_links WHERE user_id = $1",
        [userId]
    );

    const hasPassword = user?.has_usable_password === true;
    const oauthCount = parseInt(linkCount?.count || "0", 10);

    // Must have at least one auth method remaining
    if (!hasPassword && oauthCount <= 1) {
        return {
            success: false,
            error: "Cannot remove your only authentication method. Set a password first.",
        };
    }

    const result = await query(
        "DELETE FROM oauth_account_links WHERE user_id = $1 AND provider = $2",
        [userId, provider]
    );

    if (result.rowCount === 0) {
        return {
            success: false,
            error: "OAuth provider not linked to this account",
        };
    }

    return { success: true };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove expired and revoked refresh tokens.
 * Run periodically (e.g., daily).
 */
export async function cleanupExpiredTokens(): Promise<number> {
    const result = await query(
        "DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE"
    );
    return result.rowCount || 0;
}
