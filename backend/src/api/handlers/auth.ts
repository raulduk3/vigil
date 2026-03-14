/**
 * Authentication Handlers — V2
 *
 * Uses the accounts table directly (V2 merges user + account).
 * user_id = account_id = accounts.id
 */

import type { Context } from "hono";
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
            `INSERT INTO accounts (id, email, name, password_hash, plan, created_at)
             VALUES (?, ?, ?, ?, 'free', CURRENT_TIMESTAMP)`,
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

    async oauthStart(c: Context) {
        const provider = (c.req.param("provider") ?? "") as OAuthProvider;

        if (provider !== "google" && provider !== "github") {
            return c.json({ error: "Invalid provider" }, 400);
        }

        const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:4000";
        const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;
        const state = crypto.randomUUID();
        const authUrl = generateAuthUrl(provider, redirectUri, state);

        return c.redirect(authUrl);
    },

    async oauthCallback(c: Context) {
        const provider = (c.req.param("provider") ?? "") as OAuthProvider;
        const code = c.req.query("code");
        const errorParam = c.req.query("error");
        const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

        if (errorParam) {
            const params = new URLSearchParams({ error: errorParam });
            return c.redirect(`${frontendUrl}/auth/callback?${params}`);
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
