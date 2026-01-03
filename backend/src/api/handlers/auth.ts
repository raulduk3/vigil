/**
 * Authentication Handlers
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
import { queryOne } from "../../db/client";
import bcrypt from "bcrypt";

// Format tokens for frontend consumption (snake_case)
function formatAuthResponse(
    tokens: TokenPair,
    user?: { user_id: string; account_id: string; email: string; role: string }
) {
    return {
        tokens: {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
        },
        user: user
            ? {
                  user_id: user.user_id,
                  account_id: user.account_id,
                  email: user.email,
                  role: user.role,
              }
            : undefined,
    };
}

export const authHandlers = {
    async oauthProviders(c: Context) {
        // Return available OAuth providers based on configuration
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
        // Get current user from JWT payload (set by requireAuth middleware)
        const user = c.get("user");
        if (!user) {
            return c.json({ error: "Not authenticated" }, 401);
        }

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

        const user = await queryOne<{
            user_id: string;
            account_id: string;
            email: string;
            password_hash: string;
            role: "owner" | "member";
        }>("SELECT * FROM users WHERE email = $1", [email]);

        if (!user || !user.password_hash) {
            return c.json({ error: "Invalid credentials" }, 401);
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return c.json({ error: "Invalid credentials" }, 401);
        }

        const tokens = generateTokenPair({
            user_id: user.user_id,
            account_id: user.account_id,
            email: user.email,
            role: user.role,
        });

        await storeRefreshToken(user.user_id, tokens.refreshToken);

        return c.json(formatAuthResponse(tokens, user));
    },

    async register(c: Context) {
        const { email, password } = await c.req.json();

        if (!email || !password) {
            return c.json({ error: "Email and password required" }, 400);
        }

        if (password.length < 8) {
            return c.json(
                { error: "Password must be at least 8 characters" },
                400
            );
        }

        // Check if user exists
        const existing = await queryOne(
            "SELECT user_id FROM users WHERE email = $1",
            [email]
        );
        if (existing) {
            return c.json({ error: "Email already registered" }, 409);
        }

        // Create account and user
        const accountId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(password, 10);

        await queryOne(
            `INSERT INTO accounts (account_id, owner_email, plan)
             VALUES ($1, $2, 'free')
             RETURNING account_id`,
            [accountId, email]
        );

        await queryOne(
            `INSERT INTO users (user_id, account_id, email, password_hash, role)
             VALUES ($1, $2, $3, $4, 'owner')
             RETURNING user_id`,
            [userId, accountId, email, passwordHash]
        );

        const tokens = generateTokenPair({
            user_id: userId,
            account_id: accountId,
            email,
            role: "owner",
        });

        await storeRefreshToken(userId, tokens.refreshToken);

        return c.json(
            formatAuthResponse(tokens, {
                user_id: userId,
                account_id: accountId,
                email,
                role: "owner",
            }),
            201
        );
    },

    async refresh(c: Context) {
        const body = await c.req.json();
        // Accept both snake_case (frontend) and camelCase formats
        const refreshToken = body.refresh_token || body.refreshToken;

        if (!refreshToken) {
            return c.json({ error: "Refresh token required" }, 400);
        }

        const payload = await verifyRefreshToken(refreshToken);
        if (!payload) {
            return c.json({ error: "Invalid refresh token" }, 401);
        }

        // Get user info
        const user = await queryOne<{
            user_id: string;
            account_id: string;
            email: string;
            role: "owner" | "member";
        }>("SELECT * FROM users WHERE user_id = $1", [payload.user_id]);

        if (!user) {
            return c.json({ error: "User not found" }, 401);
        }

        // Revoke old token and issue new pair
        await revokeRefreshToken(refreshToken);

        const tokens = generateTokenPair({
            user_id: user.user_id,
            account_id: user.account_id,
            email: user.email,
            role: user.role,
        });

        await storeRefreshToken(user.user_id, tokens.refreshToken);

        return c.json(formatAuthResponse(tokens, user));
    },

    async oauthStart(c: Context) {
        const provider = c.req.param("provider") as OAuthProvider;

        if (provider !== "google" && provider !== "github") {
            return c.json({ error: "Invalid provider" }, 400);
        }

        const state = crypto.randomUUID();
        const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:4000";
        const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

        const authUrl = generateAuthUrl(provider, redirectUri, state);

        // Redirect to the OAuth provider
        return c.redirect(authUrl);
    },

    async oauthCallback(c: Context) {
        const provider = c.req.param("provider") as OAuthProvider;
        const code = c.req.query("code");
        const errorParam = c.req.query("error");
        const errorDescription = c.req.query("error_description");
        const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

        // Handle OAuth provider errors (user denied, etc.)
        if (errorParam) {
            const params = new URLSearchParams({
                error: errorParam,
                error_description:
                    errorDescription || "OAuth authentication was denied",
            });
            return c.redirect(
                `${frontendUrl}/auth/callback?${params.toString()}`
            );
        }

        if (!code) {
            const params = new URLSearchParams({
                error: "missing_code",
                error_description: "Authorization code was not provided",
            });
            return c.redirect(
                `${frontendUrl}/auth/callback?${params.toString()}`
            );
        }

        const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:4000";
        const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

        const tokens = await exchangeCodeForTokens(provider, code, redirectUri);
        if (!tokens) {
            const params = new URLSearchParams({
                error: "token_exchange_failed",
                error_description:
                    "Failed to complete OAuth authentication. Please try again.",
            });
            return c.redirect(
                `${frontendUrl}/auth/callback?${params.toString()}`
            );
        }

        // Redirect to frontend with tokens
        const params = new URLSearchParams({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
        });

        return c.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    },
};
