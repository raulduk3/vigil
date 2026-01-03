/**
 * OAuth Authentication
 *
 * Google and GitHub OAuth with PKCE support.
 */

import { queryOne, query } from "../db/client";
import { generateTokenPair, storeRefreshToken, type TokenPair } from "./jwt";
import { logger } from "../logger";

// ============================================================================
// Configuration
// ============================================================================

interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
}

function getGoogleConfig(): OAuthConfig {
    return {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
        scopes: ["openid", "email", "profile"],
    };
}

function getGitHubConfig(): OAuthConfig {
    return {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        scopes: ["read:user", "user:email"],
    };
}

// ============================================================================
// Types
// ============================================================================

export type OAuthProvider = "google" | "github";

interface OAuthUserInfo {
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

// ============================================================================
// Authorization URL Generation
// ============================================================================

export function generateAuthUrl(
    provider: OAuthProvider,
    redirectUri: string,
    state: string,
    codeChallenge?: string
): string {
    const config =
        provider === "google" ? getGoogleConfig() : getGitHubConfig();

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
    });

    // PKCE for Google
    if (provider === "google" && codeChallenge) {
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
    }

    return `${config.authUrl}?${params.toString()}`;
}

// ============================================================================
// Token Exchange
// ============================================================================

export async function exchangeCodeForTokens(
    provider: OAuthProvider,
    code: string,
    redirectUri: string,
    codeVerifier?: string
): Promise<TokenPair | null> {
    const config =
        provider === "google" ? getGoogleConfig() : getGitHubConfig();

    // Exchange code for OAuth tokens
    const tokenParams: Record<string, string> = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
    };

    if (provider === "google" && codeVerifier) {
        tokenParams.code_verifier = codeVerifier;
    }

    const tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenResponse.ok) {
        logger.error("OAuth token exchange failed", {
            provider,
            status: tokenResponse.status,
        });
        return null;
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;

    if (!accessToken) {
        logger.error("No access token in OAuth response", { provider });
        return null;
    }

    // Get user info
    const userInfo = await fetchUserInfo(provider, accessToken, config);
    if (!userInfo) {
        return null;
    }

    // Find or create user
    const user = await findOrCreateUser(userInfo.email, provider);
    if (!user) {
        return null;
    }

    // Generate Vigil tokens
    const tokens = generateTokenPair({
        user_id: user.user_id,
        account_id: user.account_id,
        email: user.email,
        role: user.role,
    });

    await storeRefreshToken(user.user_id, tokens.refreshToken);

    return tokens;
}

// ============================================================================
// User Info Fetching
// ============================================================================

async function fetchUserInfo(
    provider: OAuthProvider,
    accessToken: string,
    config: OAuthConfig
): Promise<OAuthUserInfo | null> {
    const response = await fetch(config.userInfoUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        logger.error("Failed to fetch OAuth user info", {
            provider,
            status: response.status,
        });
        return null;
    }

    const data = (await response.json()) as {
        email?: string;
        name?: string;
        picture?: string;
        login?: string;
        avatar_url?: string;
    };

    if (provider === "google") {
        return {
            email: data.email ?? "",
            name: data.name ?? null,
            avatarUrl: data.picture ?? null,
        };
    }

    // GitHub - may need separate email request
    let email: string | null = data.email ?? null;
    if (!email) {
        email = await fetchGitHubEmail(accessToken);
    }

    if (!email) {
        logger.error("No email from GitHub OAuth");
        return null;
    }

    return {
        email: email ?? "",
        name: data.name ?? data.login ?? null,
        avatarUrl: data.avatar_url ?? null,
    };
}

async function fetchGitHubEmail(accessToken: string): Promise<string | null> {
    const response = await fetch("https://api.github.com/user/emails", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        return null;
    }

    const emails = (await response.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified);

    return primary?.email ?? null;
}

// ============================================================================
// User Management
// ============================================================================

interface UserRecord {
    user_id: string;
    account_id: string;
    email: string;
    role: "owner" | "member";
}

async function findOrCreateUser(
    email: string,
    _provider: OAuthProvider
): Promise<UserRecord | null> {
    // Try to find existing user
    const existing = await queryOne<UserRecord>(
        `SELECT u.user_id, u.account_id, u.email, u.role
         FROM users u
         WHERE u.email = $1`,
        [email]
    );

    if (existing) {
        return existing;
    }

    // Create new account and user
    const accountId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    await query(
        `INSERT INTO accounts (account_id, owner_email, plan)
         VALUES ($1, $2, 'free')`,
        [accountId, email]
    );

    await query(
        `INSERT INTO users (user_id, account_id, email, password_hash, role)
         VALUES ($1, $2, $3, '', 'owner')`,
        [userId, accountId, email]
    );

    return {
        user_id: userId,
        account_id: accountId,
        email,
        role: "owner",
    };
}
