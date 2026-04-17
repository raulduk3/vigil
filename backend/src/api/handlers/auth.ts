/**
 * Authentication Handlers — V2
 *
 * Uses the accounts table directly (V2 merges user + account).
 * user_id = account_id = accounts.id
 */

import type { Context } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import {
    generateTokenPair,
    verifyRefreshToken,
    storeRefreshToken,
    revokeRefreshToken,
    type TokenPair,
} from "../../auth/jwt";
import {
    generateAuthUrl,
    exchangeCodeForTokens,
    type OAuthProvider,
} from "../../auth/oauth";
import { queryOne, run } from "../../db/client";
import { logger } from "../../logger";
import type { AccountRow } from "../../agent/schema";

// ============================================================================
// Helpers
// ============================================================================

function formatAuthResponse(
    tokens: TokenPair,
    account?: { id: string; email: string }
) {
    return {
        tokens: {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
        },
        user: account
            ? {
                  user_id: account.id,
                  account_id: account.id,
                  email: account.email,
                  role: "owner",
              }
            : undefined,
    };
}

// ============================================================================
// Handlers
// ============================================================================

export const authHandlers = {
    async oauthProviders(c: Context) {
        const providers = [];

        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
            providers.push({ id: "google", name: "Google", enabled: true });
        }

        if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
            providers.push({ id: "github", name: "GitHub", enabled: true });
        }

        return c.json({ providers });
    },

    async me(c: Context) {
        const user = c.get("user");
        if (!user) return c.json({ error: "Not authenticated" }, 401);

        return c.json({
            user: {
                user_id: user.user_id,
                account_id: user.account_id,
                email: user.email,
                role: user.role,
            },
        });
    },

    async login(c: Context) {
        const { email, password } = await c.req.json();

        if (!email || !password) {
            return c.json({ error: "Email and password required" }, 400);
        }

        const account = queryOne<AccountRow>(
            `SELECT * FROM accounts WHERE email = ?`,
            [email]
        );

        if (!account || !account.password_hash) {
            return c.json({ error: "Invalid credentials" }, 401);
        }

        const valid = await Bun.password.verify(password, account.password_hash);
        if (!valid) {
            return c.json({ error: "Invalid credentials" }, 401);
        }

        const tokens = generateTokenPair({
            user_id: account.id,
            account_id: account.id,
            email: account.email,
            role: "owner",
        });

        await storeRefreshToken(account.id, tokens.refreshToken);

        return c.json(formatAuthResponse(tokens, account));
    },

    async register(c: Context) {
        const { email, password, name } = await c.req.json();

        if (!email || !password) {
            return c.json({ error: "Email and password required" }, 400);
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email) || email.length > 254) {
            return c.json({ error: "Invalid email address" }, 400);
        }

        if (password.length < 8) {
            return c.json({ error: "Password must be at least 8 characters" }, 400);
        }

        const existing = queryOne(
            `SELECT id FROM accounts WHERE email = ?`,
            [email]
        );
        if (existing) {
            return c.json({ error: "Email already registered" }, 409);
        }

        const id = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(password);

        run(
            `INSERT INTO accounts (id, email, name, password_hash, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, email, name ?? null, passwordHash]
        );

        const tokens = generateTokenPair({
            user_id: id,
            account_id: id,
            email,
            role: "owner",
        });

        await storeRefreshToken(id, tokens.refreshToken);

        return c.json(
            formatAuthResponse(tokens, { id, email }),
            201
        );
    },

    async refresh(c: Context) {
        const body = await c.req.json();
        const refreshToken = body.refresh_token || body.refreshToken;

        if (!refreshToken) {
            return c.json({ error: "Refresh token required" }, 400);
        }

        const payload = await verifyRefreshToken(refreshToken);
        if (!payload) {
            return c.json({ error: "Invalid refresh token" }, 401);
        }

        const account = queryOne<AccountRow>(
            `SELECT * FROM accounts WHERE id = ?`,
            [payload.user_id]
        );

        if (!account) {
            return c.json({ error: "Account not found" }, 401);
        }

        await revokeRefreshToken(refreshToken);

        const tokens = generateTokenPair({
            user_id: account.id,
            account_id: account.id,
            email: account.email,
            role: "owner",
        });

        await storeRefreshToken(account.id, tokens.refreshToken);

        return c.json(formatAuthResponse(tokens, account));
    },

    async getConnections(c: Context) {
        const user = c.get("user");
        const account = queryOne<{ oauth_provider: string | null; oauth_id: string | null }>(
            `SELECT oauth_provider, oauth_id FROM accounts WHERE id = ?`,
            [user.account_id]
        );
        const connections: Array<{ provider: string; connected: boolean }> = [];
        if (process.env.GOOGLE_CLIENT_ID) {
            connections.push({ provider: 'google', connected: account?.oauth_provider === 'google' });
        }
        if (process.env.GITHUB_CLIENT_ID) {
            connections.push({ provider: 'github', connected: account?.oauth_provider === 'github' });
        }
        return c.json({ connections });
    },

    async changePassword(c: Context) {
        const user = c.get("user");
        const { current_password, new_password } = await c.req.json();

        if (!current_password || !new_password) {
            return c.json({ error: "Current and new password required" }, 400);
        }
        if (new_password.length < 8) {
            return c.json({ error: "Password must be at least 8 characters" }, 400);
        }

        const account = queryOne<{ password_hash: string | null }>(
            `SELECT password_hash FROM accounts WHERE id = ?`,
            [user.account_id]
        );

        if (account?.password_hash) {
            const valid = await Bun.password.verify(current_password, account.password_hash);
            if (!valid) {
                return c.json({ error: "Current password is incorrect" }, 400);
            }
        }

        const newHash = await Bun.password.hash(new_password);
        run(`UPDATE accounts SET password_hash = ? WHERE id = ?`, [newHash, user.account_id]);

        return c.json({ success: true });
    },

    async deleteAccount(c: Context) {
        const user = c.get("user");
        const body = await c.req.json().catch(() => ({}));

        // Require password confirmation OR explicit "confirm": true
        if (body.confirm !== true) {
            return c.json({ error: "Must confirm deletion with {\"confirm\": true}" }, 400);
        }

        // If account has a password, require it
        const account = queryOne<{ password_hash: string | null }>(
            `SELECT password_hash FROM accounts WHERE id = ?`,
            [user.account_id]
        );
        if (account?.password_hash) {
            if (!body.password) return c.json({ error: "Password required to delete account" }, 400);
            const valid = await Bun.password.verify(body.password, account.password_hash);
            if (!valid) return c.json({ error: "Incorrect password" }, 400);
        }

        // Delete everything in order (foreign key safe)
        run(`DELETE FROM actions WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM memories WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM emails WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM threads WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM channels WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM custom_tools WHERE watcher_id IN (SELECT id FROM watchers WHERE account_id = ?)`, [user.account_id]);
        run(`DELETE FROM watchers WHERE account_id = ?`, [user.account_id]);
        run(`DELETE FROM api_keys WHERE account_id = ?`, [user.account_id]);
        run(`DELETE FROM refresh_tokens WHERE account_id = ?`, [user.account_id]);
        run(`DELETE FROM accounts WHERE id = ?`, [user.account_id]);

        logger.info("Account deleted", { accountId: user.account_id, email: user.email });
        return c.json({ deleted: true });
    },

    async oauthStart(c: Context) {
        const provider = (c.req.param("provider") ?? "") as OAuthProvider;

        if (provider !== "google" && provider !== "github") {
            return c.json({ error: "Invalid provider" }, 400);
        }

        const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:4000";
        const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;
        const state = await signOAuthState();
        const authUrl = generateAuthUrl(provider, redirectUri, state);

        setCookie(c, "oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            path: "/",
            maxAge: 600, // 10 minutes
        });

        return c.redirect(authUrl);
    },

    async oauthCallback(c: Context) {
        const provider = (c.req.param("provider") ?? "") as OAuthProvider;
        const code = c.req.query("code");
        const errorParam = c.req.query("error");
        const stateParam = c.req.query("state");
        const stateCookie = getCookie(c, "oauth_state");
        const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

        // Clear the state cookie regardless of outcome
        setCookie(c, "oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });

        if (errorParam) {
            const params = new URLSearchParams({ error: errorParam });
            return c.redirect(`${frontendUrl}/auth/callback?${params}`);
        }

        // Verify CSRF: state param must match cookie and be validly signed
        if (!stateParam || !stateCookie || stateParam !== stateCookie) {
            logger.warn("OAuth state mismatch", { provider, hasState: !!stateParam, hasCookie: !!stateCookie });
            return c.redirect(`${frontendUrl}/auth/callback?error=invalid_state`);
        }

        if (!(await verifyOAuthState(stateParam))) {
            logger.warn("OAuth state signature invalid", { provider });
            return c.redirect(`${frontendUrl}/auth/callback?error=invalid_state`);
        }

        if (!code) {
            return c.redirect(
                `${frontendUrl}/auth/callback?error=missing_code`
            );
        }

        const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:4000";
        const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

        const tokens = await exchangeCodeForTokens(provider, code, redirectUri);
        if (!tokens) {
            return c.redirect(
                `${frontendUrl}/auth/callback?error=token_exchange_failed`
            );
        }

        const params = new URLSearchParams({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
        });

        return c.redirect(`${frontendUrl}/auth/callback?${params}`);
    },
};

// ============================================================================
// OAuth State CSRF Protection
// ============================================================================

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

async function signOAuthState(): Promise<string> {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now().toString();
    const payload = `${nonce}:${timestamp}`;
    const secret = process.env.JWT_SECRET ?? "";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${payload}:${hex}`;
}

async function verifyOAuthState(state: string): Promise<boolean> {
    const parts = state.split(":");
    if (parts.length !== 3) return false;
    const [nonce, timestamp, signature] = parts;
    if (!nonce || !timestamp || !signature) return false;

    // Check age
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age < 0 || age > OAUTH_STATE_MAX_AGE_MS) return false;

    // Verify HMAC
    const payload = `${nonce}:${timestamp}`;
    const secret = process.env.JWT_SECRET ?? "";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
}
