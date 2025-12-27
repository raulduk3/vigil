/**
 * OAuth Configuration and Types
 *
 * Prepares the system for Google and GitHub OAuth integration.
 * Implements the foundation for OAuth 2.0 / OpenID Connect flows.
 */

// ============================================================================
// Types
// ============================================================================

export type OAuthProvider = "google" | "github";

export interface OAuthConfig {
    provider: OAuthProvider;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
}

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
    id_token?: string; // OpenID Connect
}

export interface OAuthUserInfo {
    provider: OAuthProvider;
    provider_user_id: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
    raw: Record<string, unknown>;
}

export interface OAuthState {
    state: string;
    code_verifier?: string; // PKCE
    redirect_after?: string;
    created_at: number;
}

export interface OAuthAccountLink {
    link_id: string;
    user_id: string;
    provider: OAuthProvider;
    provider_user_id: string;
    email: string;
    access_token_encrypted?: string;
    refresh_token_encrypted?: string;
    token_expires_at?: number;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Provider Configurations
// ============================================================================

export const GOOGLE_OAUTH_CONFIG: Omit<
    OAuthConfig,
    "clientId" | "clientSecret" | "redirectUri"
> = {
    provider: "google",
    scopes: ["openid", "email", "profile"],
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
};

export const GITHUB_OAUTH_CONFIG: Omit<
    OAuthConfig,
    "clientId" | "clientSecret" | "redirectUri"
> = {
    provider: "github",
    scopes: ["read:user", "user:email"],
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
};

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Get OAuth configuration for a provider from environment variables.
 */
export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

    if (provider === "google") {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return null;
        }

        return {
            ...GOOGLE_OAUTH_CONFIG,
            clientId,
            clientSecret,
            redirectUri: `${baseUrl}/api/auth/callback/google`,
        };
    }

    if (provider === "github") {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return null;
        }

        return {
            ...GITHUB_OAUTH_CONFIG,
            clientId,
            clientSecret,
            redirectUri: `${baseUrl}/api/auth/callback/github`,
        };
    }

    return null;
}

/**
 * Check which OAuth providers are configured.
 */
export function getEnabledProviders(): OAuthProvider[] {
    const enabled: OAuthProvider[] = [];

    if (getOAuthConfig("google")) {
        enabled.push("google");
    }

    if (getOAuthConfig("github")) {
        enabled.push("github");
    }

    return enabled;
}

/**
 * Check if a specific provider is enabled.
 */
export function isProviderEnabled(provider: OAuthProvider): boolean {
    return getOAuthConfig(provider) !== null;
}

// ============================================================================
// URL Builders
// ============================================================================

/**
 * Build the OAuth authorization URL.
 */
export function buildAuthorizationUrl(
    config: OAuthConfig,
    state: string,
    codeChallenge?: string
): string {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
    });

    // PKCE support (recommended for public clients)
    if (codeChallenge) {
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
    }

    // Google-specific: prompt for consent
    if (config.provider === "google") {
        params.set("access_type", "offline");
        params.set("prompt", "consent");
    }

    return `${config.authorizationUrl}?${params.toString()}`;
}

// ============================================================================
// PKCE Helpers
// ============================================================================

import { randomBytes, createHash } from "crypto";

/**
 * Generate a PKCE code verifier.
 */
export function generateCodeVerifier(): string {
    return randomBytes(32).toString("base64url");
}

/**
 * Generate a PKCE code challenge from a verifier.
 */
export function generateCodeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate a random state parameter.
 */
export function generateState(): string {
    return randomBytes(16).toString("hex");
}

// ============================================================================
// State Management (In-Memory - resets on server restart for security)
// ============================================================================

const oauthStates = new Map<string, OAuthState>();

// Log that OAuth states are cleared on startup
console.log(`[OAuth] State storage initialized (in-memory, clears on restart)`);

// Log state storage for debugging
const logStateOp = (op: string, state: string, count: number) => {
    console.log(
        `[OAuth State] ${op}: ${state.substring(0, 8)}... (total: ${count})`
    );
};

/**
 * Store OAuth state for verification.
 */
export function storeOAuthState(
    state: string,
    codeVerifier?: string,
    redirectAfter?: string
): void {
    oauthStates.set(state, {
        state,
        code_verifier: codeVerifier,
        redirect_after: redirectAfter,
        created_at: Date.now(),
    });
    logStateOp("STORE", state, oauthStates.size);

    // Cleanup old states (older than 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of oauthStates) {
        if (value.created_at < cutoff) {
            oauthStates.delete(key);
            logStateOp("EXPIRED", key, oauthStates.size);
        }
    }
}

/**
 * Retrieve and consume OAuth state.
 */
export function consumeOAuthState(state: string): OAuthState | null {
    const stored = oauthStates.get(state);
    if (!stored) {
        logStateOp("NOT_FOUND", state, oauthStates.size);
        return null;
    }

    oauthStates.delete(state);
    logStateOp("CONSUMED", state, oauthStates.size);

    // Verify not expired (10 minute window)
    if (Date.now() - stored.created_at > 10 * 60 * 1000) {
        logStateOp("EXPIRED_ON_CONSUME", state, oauthStates.size);
        return null;
    }

    return stored;
}

// ============================================================================
// Token Exchange Helpers
// ============================================================================

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(
    config: OAuthConfig,
    code: string,
    codeVerifier?: string
): Promise<OAuthTokens> {
    const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
    });

    if (codeVerifier) {
        params.set("code_verifier", codeVerifier);
    }

    const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json() as Promise<OAuthTokens>;
}

/**
 * Fetch user info from the provider.
 */
export async function fetchUserInfo(
    config: OAuthConfig,
    accessToken: string
): Promise<OAuthUserInfo> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
    };

    // GitHub requires User-Agent
    if (config.provider === "github") {
        headers["User-Agent"] = "Vigil-App";
    }

    const response = await fetch(config.userInfoUrl, { headers });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch user info: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Normalize user info based on provider
    if (config.provider === "google") {
        return {
            provider: "google",
            provider_user_id: String(data.sub),
            email: String(data.email || ""),
            email_verified: Boolean(data.email_verified ?? false),
            name: data.name ? String(data.name) : undefined,
            picture: data.picture ? String(data.picture) : undefined,
            raw: data,
        };
    }

    if (config.provider === "github") {
        // GitHub may require separate call for email
        let email = data.email ? String(data.email) : "";
        let emailVerified = false;

        if (!email) {
            // Fetch emails from GitHub
            const emailsResponse = await fetch(
                "https://api.github.com/user/emails",
                {
                    headers,
                }
            );

            if (emailsResponse.ok) {
                const emails = (await emailsResponse.json()) as Array<{
                    email: string;
                    primary: boolean;
                    verified: boolean;
                }>;
                const primary = emails.find((e) => e.primary && e.verified);
                if (primary) {
                    email = primary.email;
                    emailVerified = primary.verified;
                }
            }
        }

        return {
            provider: "github",
            provider_user_id: String(data.id),
            email: email,
            email_verified: emailVerified,
            name: data.name
                ? String(data.name)
                : data.login
                  ? String(data.login)
                  : undefined,
            picture: data.avatar_url ? String(data.avatar_url) : undefined,
            raw: data,
        };
    }

    throw new Error(`Unknown provider: ${config.provider}`);
}
