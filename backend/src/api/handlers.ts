/**
 * API HTTP Handlers
 *
 * HTTP request handlers for the Vigil backend API.
 * Implements endpoints for:
 * - Authentication (POST /api/auth/register, login, refresh) - FR-17
 * - Email ingestion (POST /ingest/:token) - FR-5
 * - Health checks (GET /health, GET /api/system/health) - IR-24
 * - Watcher management (CRUD, activate, pause, resume) - FR-1,2,3,4
 * - Thread operations (list, close) - FR-8, FR-9
 * - Event log inspection (FR-14)
 * - Billing and subscription management
 * - Password reset and OAuth
 */

import type { VigilEvent, WatcherPolicy } from "@/events/types";
import type { EventStore } from "@/events/event-store";
import type { WatcherState, ThreadState } from "@/watcher/runtime";
import type { AuthContext } from "@/auth/middleware";
import { getLogger } from "@/logging";
import {
    getSubscription,
    getOrCreateUsage,
    getUsageHistory,
    getEffectivePlan,
    checkWatcherLimit,
    PLAN_CONFIGS,
    handleStripeWebhook,
    createCheckoutSession,
    createBillingPortalSession,
    cancelSubscription,
    resumeSubscription,
    isStripeConfigured,
    getPublishableKey,
    getInvoices,
    getPlanLimits,
    type SubscriptionPlan,
} from "@/billing";
import {
    authRateLimiter,
    passwordResetRateLimiter,
    getClientIp,
    buildRateLimitHeaders,
    isBodyTooLarge,
    MAX_BODY_SIZE,
} from "@/security";
import {
    requestPasswordReset,
    verifyResetToken,
    resetPassword,
} from "@/auth/password-reset";
import {
    getOAuthConfig,
    getEnabledProviders,
    buildAuthorizationUrl,
    generateState,
    generateCodeVerifier,
    generateCodeChallenge,
    storeOAuthState,
    consumeOAuthState,
    exchangeCodeForTokens,
    fetchUserInfo,
    type OAuthProvider,
} from "@/auth/oauth";
import { loginOrCreateFromOAuth } from "@/auth/users";

/**
 * HTTP request representation
 */
export interface HttpRequest {
    method: string;
    path: string;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: string | null;
}

/**
 * HTTP response representation
 */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

/**
 * Handler context with dependencies
 */
export interface HandlerContext {
    eventStore: EventStore;
    getWatcherByToken: (token: string) => Promise<WatcherState | null>;
    getWatcherById: (id: string) => Promise<WatcherState | null>;
    getThreadById: (
        watcherId: string,
        threadId: string
    ) => Promise<ThreadState | null>;
    validateAuth: (
        authHeader: string | undefined
    ) => Promise<AuthContext | null>;
    registerUser: (email: string, password: string) => Promise<AuthResult>;
    loginUser: (email: string, password: string) => Promise<AuthResult>;
    refreshTokens: (refreshToken: string) => Promise<AuthResult>;
    orchestrateIngestion: (
        rawEmail: string,
        watcherId: string,
        ingestToken: string
    ) => Promise<VigilEvent[]>;
}

/**
 * Auth result from user operations
 */
export interface AuthResult {
    success: boolean;
    user?: { user_id: string; account_id: string; email: string; role: string };
    tokens?: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    };
    error?: string;
    errors?: string[];
}

/**
 * Component health status
 */
export interface ComponentHealth {
    status: "healthy" | "degraded" | "unhealthy";
    last_heartbeat: string;
    metrics: Record<string, number>;
}

/**
 * System health response (IR-24)
 */
export interface SystemHealthResponse {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    components: Record<string, ComponentHealth>;
    overall_metrics: {
        events_per_minute: number;
        active_watchers: number;
        open_threads: number;
    };
}

// ============================================================================
// Response Helpers
// ============================================================================

function jsonResponse(status: number, data: unknown): HttpResponse {
    return {
        status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    };
}

function errorResponse(
    status: number,
    error: string,
    details?: string
): HttpResponse {
    return jsonResponse(status, { error, details });
}

async function requireWatcherForAccount(
    context: HandlerContext,
    watcherId: string,
    accountId: string
): Promise<{ watcher?: WatcherState; error?: HttpResponse }> {
    const watcher = await context.getWatcherById(watcherId);
    if (!watcher) {
        return {
            error: errorResponse(404, "NOT_FOUND", "Watcher not found"),
        };
    }

    if (!watcher.account_id || watcher.account_id !== accountId) {
        return {
            error: errorResponse(
                403,
                "FORBIDDEN",
                "Watcher does not belong to this account"
            ),
        };
    }

    return { watcher };
}

// ============================================================================
// Authentication Handlers (FR-17)
// ============================================================================

/**
 * Register new user (POST /api/auth/register)
 * Rate limited to prevent brute force attacks.
 */
export async function handleRegister(
    request: HttpRequest,
    context: HandlerContext
): Promise<HttpResponse> {
    // Rate limiting by IP
    const clientIp = getClientIp(request.headers);
    const rateLimitResult = authRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
        const response = errorResponse(
            429,
            "RATE_LIMITED",
            "Too many requests. Please try again later."
        );
        response.headers = {
            ...response.headers,
            ...buildRateLimitHeaders(rateLimitResult),
        };
        return response;
    }

    // Check body size
    if (isBodyTooLarge(request.body)) {
        return errorResponse(
            413,
            "BODY_TOO_LARGE",
            `Request body exceeds ${MAX_BODY_SIZE} bytes`
        );
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { email?: string; password?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.email || !body.password) {
        return errorResponse(
            400,
            "MISSING_FIELDS",
            "Email and password required"
        );
    }

    const result = await context.registerUser(body.email, body.password);

    if (!result.success) {
        if (result.errors) {
            return jsonResponse(400, {
                error: "VALIDATION_ERROR",
                errors: result.errors,
            });
        }
        return errorResponse(400, "REGISTRATION_FAILED", result.error);
    }

    return jsonResponse(201, {
        user: result.user,
        tokens: result.tokens,
    });
}

/**
 * Login user (POST /api/auth/login)
 * Rate limited to prevent brute force attacks.
 */
export async function handleLogin(
    request: HttpRequest,
    context: HandlerContext
): Promise<HttpResponse> {
    // Rate limiting by IP
    const clientIp = getClientIp(request.headers);
    const rateLimitResult = authRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
        const response = errorResponse(
            429,
            "RATE_LIMITED",
            "Too many login attempts. Please try again later."
        );
        response.headers = {
            ...response.headers,
            ...buildRateLimitHeaders(rateLimitResult),
        };
        return response;
    }

    // Check body size
    if (isBodyTooLarge(request.body)) {
        return errorResponse(
            413,
            "BODY_TOO_LARGE",
            `Request body exceeds ${MAX_BODY_SIZE} bytes`
        );
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { email?: string; password?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.email || !body.password) {
        return errorResponse(
            400,
            "MISSING_FIELDS",
            "Email and password required"
        );
    }

    const result = await context.loginUser(body.email, body.password);

    if (!result.success) {
        return errorResponse(401, "AUTH_FAILED", result.error);
    }

    // Reset rate limit on successful login
    authRateLimiter.reset(clientIp);

    return jsonResponse(200, {
        user: result.user,
        tokens: result.tokens,
    });
}

/**
 * Get current user (GET /api/auth/me)
 * Returns the authenticated user's information.
 */
export async function handleGetCurrentUser(
    auth: AuthContext
): Promise<HttpResponse> {
    return jsonResponse(200, {
        user: {
            user_id: auth.user_id,
            account_id: auth.account_id,
            email: auth.email,
            role: auth.role,
        },
    });
}

/**
 * Refresh tokens (POST /api/auth/refresh)
 * Rate limited but less strict than login.
 */
export async function handleRefreshToken(
    request: HttpRequest,
    context: HandlerContext
): Promise<HttpResponse> {
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { refresh_token?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.refresh_token) {
        return errorResponse(400, "MISSING_TOKEN", "Refresh token required");
    }

    const result = await context.refreshTokens(body.refresh_token);

    if (!result.success) {
        return errorResponse(401, "REFRESH_FAILED", result.error);
    }

    return jsonResponse(200, {
        user: result.user,
        tokens: result.tokens,
    });
}

// ============================================================================
// Password Reset Handlers
// ============================================================================

/**
 * Request password reset (POST /api/auth/password-reset/request)
 * Sends reset email if user exists. Always returns success to prevent enumeration.
 */
export async function handleRequestPasswordReset(
    request: HttpRequest
): Promise<HttpResponse> {
    // Rate limiting by IP (strict)
    const clientIp = getClientIp(request.headers);
    const rateLimitResult = passwordResetRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
        const response = errorResponse(
            429,
            "RATE_LIMITED",
            "Too many password reset requests. Please try again later."
        );
        response.headers = {
            ...response.headers,
            ...buildRateLimitHeaders(rateLimitResult),
        };
        return response;
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { email?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.email) {
        return errorResponse(400, "MISSING_EMAIL", "Email is required");
    }

    // Request reset (this function handles the email lookup internally)
    const result = await requestPasswordReset(body.email);

    // Always return success to prevent email enumeration
    // If user exists, result will contain token and email for sending
    // The actual email sending should be done by a notification worker

    if (result.token && result.email) {
        const log = getLogger();
        log.auth.info(
            "Password reset requested",
            { email: result.email },
            { token_generated: true }
        );
        // TODO: Queue email sending via notification worker
        // For now, log the reset URL (in production, this would send an email)
        const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
        const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
        log.auth.debug(
            "Password reset URL generated",
            {},
            { reset_url: resetUrl }
        );
    }

    return jsonResponse(200, {
        message:
            "If an account with that email exists, you will receive a password reset link.",
    });
}

/**
 * Verify password reset token (GET /api/auth/password-reset/verify)
 */
export async function handleVerifyResetToken(
    request: HttpRequest
): Promise<HttpResponse> {
    const token = request.query["token"];

    if (!token) {
        return errorResponse(400, "MISSING_TOKEN", "Reset token is required");
    }

    const result = await verifyResetToken(token);

    if (!result.valid) {
        return errorResponse(
            400,
            "INVALID_TOKEN",
            result.error || "Invalid or expired token"
        );
    }

    return jsonResponse(200, {
        valid: true,
        email: result.email,
    });
}

/**
 * Reset password with token (POST /api/auth/password-reset/confirm)
 */
export async function handleConfirmPasswordReset(
    request: HttpRequest
): Promise<HttpResponse> {
    // Rate limiting by IP
    const clientIp = getClientIp(request.headers);
    const rateLimitResult = passwordResetRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
        const response = errorResponse(
            429,
            "RATE_LIMITED",
            "Too many requests. Please try again later."
        );
        response.headers = {
            ...response.headers,
            ...buildRateLimitHeaders(rateLimitResult),
        };
        return response;
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { token?: string; password?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.token) {
        return errorResponse(400, "MISSING_TOKEN", "Reset token is required");
    }

    if (!body.password) {
        return errorResponse(
            400,
            "MISSING_PASSWORD",
            "New password is required"
        );
    }

    const result = await resetPassword(body.token, body.password);

    if (!result.success) {
        if (result.errors) {
            return jsonResponse(400, {
                error: "VALIDATION_ERROR",
                errors: result.errors,
            });
        }
        return errorResponse(400, "RESET_FAILED", result.error);
    }

    return jsonResponse(200, {
        message:
            "Password has been reset successfully. Please log in with your new password.",
    });
}

// ============================================================================
// OAuth Handlers
// ============================================================================

/**
 * Get enabled OAuth providers (GET /api/auth/oauth/providers)
 */
export async function handleGetOAuthProviders(): Promise<HttpResponse> {
    const providers = getEnabledProviders();

    return jsonResponse(200, {
        providers: providers.map((p) => ({
            id: p,
            name: p.charAt(0).toUpperCase() + p.slice(1),
            enabled: true,
        })),
    });
}

/**
 * Start OAuth flow (GET /api/auth/oauth/:provider)
 * Redirects to provider's authorization page.
 */
export async function handleOAuthStart(
    request: HttpRequest
): Promise<HttpResponse> {
    const provider = request.params["provider"] as OAuthProvider;

    if (!provider || (provider !== "google" && provider !== "github")) {
        return errorResponse(400, "INVALID_PROVIDER", "Invalid OAuth provider");
    }

    const config = getOAuthConfig(provider);
    if (!config) {
        return errorResponse(
            501,
            "PROVIDER_NOT_CONFIGURED",
            `${provider} OAuth is not configured`
        );
    }

    // Generate state and PKCE
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store state for verification
    const redirectAfter = request.query["redirect"] || "/dashboard";
    storeOAuthState(state, codeVerifier, redirectAfter);

    // Build authorization URL
    const authUrl = buildAuthorizationUrl(config, state, codeChallenge);

    // Return redirect response
    return {
        status: 302,
        headers: {
            Location: authUrl,
            "Cache-Control": "no-store",
        },
        body: "",
    };
}

/**
 * OAuth callback (GET /api/auth/callback/:provider)
 * Handles the OAuth callback from the provider.
 */
export async function handleOAuthCallback(
    request: HttpRequest,
    _context: HandlerContext
): Promise<HttpResponse> {
    const provider = request.params["provider"] as OAuthProvider;
    const code = request.query["code"];
    const state = request.query["state"];
    const error = request.query["error"];

    // Check for error from provider
    if (error) {
        const errorDesc =
            request.query["error_description"] || "Authorization failed";
        return errorResponse(400, "OAUTH_ERROR", errorDesc);
    }

    if (!code || !state) {
        return errorResponse(
            400,
            "MISSING_PARAMS",
            "Missing code or state parameter"
        );
    }

    // Verify and consume state
    const storedState = consumeOAuthState(state);
    if (!storedState) {
        return errorResponse(
            400,
            "INVALID_STATE",
            "Invalid or expired state parameter"
        );
    }

    const config = getOAuthConfig(provider);
    if (!config) {
        return errorResponse(
            501,
            "PROVIDER_NOT_CONFIGURED",
            `${provider} OAuth is not configured`
        );
    }

    try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(
            config,
            code,
            storedState.code_verifier
        );

        // Fetch user info
        const userInfo = await fetchUserInfo(config, tokens.access_token);

        if (!userInfo.email) {
            return errorResponse(
                400,
                "NO_EMAIL",
                "Could not retrieve email from OAuth provider"
            );
        }

        if (!userInfo.email_verified) {
            return errorResponse(
                400,
                "EMAIL_NOT_VERIFIED",
                "Email is not verified with the OAuth provider"
            );
        }

        // Login or create user from OAuth info
        const authResult = await loginOrCreateFromOAuth({
            provider,
            provider_user_id: userInfo.provider_user_id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
        });

        if (!authResult.success || !authResult.tokens) {
            const log = getLogger();
            log.auth.error("OAuth user creation failed", {
                provider,
                email: userInfo.email,
            });
            return errorResponse(
                500,
                "AUTH_FAILED",
                authResult.error || "Failed to create user account"
            );
        }

        const log = getLogger();
        log.auth.info(
            "OAuth login successful",
            {
                provider,
                email: userInfo.email,
                user_id: authResult.user?.user_id,
            },
            { provider_user_id: userInfo.provider_user_id }
        );

        // Redirect to frontend with tokens
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const redirectPath = storedState.redirect_after || "/dashboard";

        // Build redirect URL with tokens in query params
        const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
        redirectUrl.searchParams.set(
            "access_token",
            authResult.tokens.access_token
        );
        redirectUrl.searchParams.set(
            "refresh_token",
            authResult.tokens.refresh_token
        );
        redirectUrl.searchParams.set("redirect", redirectPath);

        return {
            status: 302,
            body: "",
            headers: {
                Location: redirectUrl.toString(),
                "Cache-Control": "no-store",
            },
        };
    } catch (err) {
        const log = getLogger();
        log.auth.error(
            "OAuth callback failed",
            { provider },
            {},
            err instanceof Error ? err : new Error(String(err))
        );
        return errorResponse(
            500,
            "OAUTH_FAILED",
            "Failed to complete OAuth authentication"
        );
    }
}

// ============================================================================
// OAuth Account Links Handlers
// ============================================================================

import {
    getOAuthLinksForUser,
    unlinkOAuthProvider,
    changePassword,
    getAuthMethods,
} from "@/auth/users";

/**
 * Get OAuth links for current user.
 */
export async function handleGetOAuthLinks(
    auth: AuthContext
): Promise<HttpResponse> {
    try {
        const links = await getOAuthLinksForUser(auth.user_id);
        const authMethods = await getAuthMethods(auth.user_id);
        return jsonResponse(200, {
            links,
            has_password: authMethods.has_password,
        });
    } catch {
        return jsonResponse(200, { links: [], has_password: false });
    }
}

/**
 * Unlink OAuth provider from user account.
 */
export async function handleUnlinkOAuthProvider(
    request: HttpRequest,
    auth: AuthContext
): Promise<HttpResponse> {
    const provider = request.params["provider"];
    if (!provider) {
        return errorResponse(400, "MISSING_PROVIDER", "Provider is required");
    }

    const result = await unlinkOAuthProvider(auth.user_id, provider);
    if (!result.success) {
        return errorResponse(
            400,
            "CANNOT_UNLINK",
            result.error || "Cannot remove authentication method"
        );
    }

    return jsonResponse(200, { success: true });
}

/**
 * Change user password.
 */
export async function handleChangePassword(
    request: HttpRequest,
    auth: AuthContext
): Promise<HttpResponse> {
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { current_password?: string; new_password?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    const { current_password, new_password } = body;

    if (!new_password) {
        return errorResponse(400, "MISSING_FIELDS", "New password is required");
    }

    // current_password can be empty for OAuth-only users setting their first password
    const result = await changePassword(
        auth.user_id,
        current_password || "",
        new_password
    );
    if (!result.success) {
        return errorResponse(
            400,
            "PASSWORD_CHANGE_FAILED",
            result.error ||
                result.errors?.join(", ") ||
                "Failed to change password"
        );
    }

    return jsonResponse(200, { success: true });
}

// ============================================================================
// Health Check Handlers (IR-24)
// ============================================================================

/**
 * Simple health check (GET /health)
 * Used by load balancers - no auth required.
 */
export async function handleHealthCheck(): Promise<HttpResponse> {
    return jsonResponse(200, {
        status: "healthy",
        timestamp: new Date().toISOString(),
    });
}

/**
 * Detailed system health (GET /api/system/health)
 * Returns component-level health status (IR-24).
 */
export async function handleSystemHealth(
    componentHealthProviders: Map<string, () => Promise<ComponentHealth>>
): Promise<HttpResponse> {
    const components: Record<string, ComponentHealth> = {};
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    for (const [name, getHealth] of componentHealthProviders) {
        try {
            const health = await getHealth();
            components[name] = health;

            if (health.status === "unhealthy") {
                overallStatus = "unhealthy";
            } else if (
                health.status === "degraded" &&
                overallStatus === "healthy"
            ) {
                overallStatus = "degraded";
            }
        } catch {
            components[name] = {
                status: "unhealthy",
                last_heartbeat: new Date().toISOString(),
                metrics: {},
            };
            overallStatus = "unhealthy";
        }
    }

    const response: SystemHealthResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        components,
        overall_metrics: {
            events_per_minute: 0,
            active_watchers: 0,
            open_threads: 0,
        },
    };

    return jsonResponse(200, response);
}

// ============================================================================
// Rate Limiting
// ============================================================================

const ingestionRateLimits = new Map<
    string,
    { count: number; resetAt: number }
>();
const INGESTION_RATE_LIMIT = 100; // requests per minute per token
const INGESTION_WINDOW_MS = 60 * 1000;

function checkIngestionRateLimit(token: string): boolean {
    const now = Date.now();
    const limit = ingestionRateLimits.get(token);

    if (!limit || now > limit.resetAt) {
        ingestionRateLimits.set(token, {
            count: 1,
            resetAt: now + INGESTION_WINDOW_MS,
        });
        return true;
    }

    if (limit.count >= INGESTION_RATE_LIMIT) {
        return false;
    }

    limit.count++;
    return true;
}

// Cleanup old entries every 5 minutes
setInterval(
    () => {
        const now = Date.now();
        for (const [token, limit] of ingestionRateLimits) {
            if (now > limit.resetAt) {
                ingestionRateLimits.delete(token);
            }
        }
    },
    5 * 60 * 1000
);

// ============================================================================
// Email Ingestion Handler (FR-5)
// ============================================================================

/**
 * Handle email ingestion (POST /ingest/:token)
 * Validates token, parses email, returns acknowledgment.
 */
export async function handleEmailIngestion(
    request: HttpRequest,
    context: HandlerContext
): Promise<HttpResponse> {
    const token = request.params["token"];

    // Validate token exists
    if (!token) {
        return errorResponse(400, "MISSING_TOKEN", "Ingestion token required");
    }

    // Check rate limit
    if (!checkIngestionRateLimit(token)) {
        return errorResponse(
            429,
            "RATE_LIMIT_EXCEEDED",
            "Too many requests. Limit: 100 requests per minute."
        );
    }

    // Look up watcher by token
    const watcher = await context.getWatcherByToken(token);

    if (!watcher) {
        return errorResponse(
            404,
            "INVALID_TOKEN",
            "No watcher found for token"
        );
    }

    // Check watcher status
    if (watcher.status === "deleted") {
        return errorResponse(
            410,
            "WATCHER_DELETED",
            "Watcher has been deleted"
        );
    }

    // Validate request body
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Email body required");
    }

    // Parse email payload. Support two formats for tests and external adapters:
    // 1) JSON: { rawEmail: "..." }
    // 2) Raw RFC822 email string in the body
    let rawEmail: string | null = null;
    try {
        const parsed = JSON.parse(request.body);
        if (parsed && typeof parsed.rawEmail === "string") {
            rawEmail = parsed.rawEmail;
        }
    } catch {
        // Not JSON, fall through and treat body as raw email text
    }

    if (!rawEmail) {
        // Treat the entire request body as raw RFC822 email text
        rawEmail = request.body;
    }

    // Process email through orchestration pipeline
    try {
        // Allow handler context to optionally provide an `orchestrateIngestion` implementation
        const orchestrate = (context as any).orchestrateIngestion
            ? (context as any).orchestrateIngestion.bind(context)
            : async (_raw: string, _watcherId: string, _token: string) => [];

        const events = await orchestrate(
            rawEmail as string,
            watcher.watcher_id,
            token
        );

        return jsonResponse(202, {
            accepted: true,
            watcher_id: watcher.watcher_id,
            events_generated: events.length,
            message: "Email accepted and processed",
        });
    } catch (error) {
        const log = getLogger();
        log.ingestion.error(
            "Error processing email",
            { watcher_id: watcher.watcher_id },
            {},
            error instanceof Error ? error : new Error(String(error))
        );
        return errorResponse(
            500,
            "PROCESSING_ERROR",
            "Failed to process email"
        );
    }
}

// ============================================================================
// Watcher Management Handlers
// ============================================================================

/**
 * List watchers (GET /api/watchers)
 * Returns watchers for authenticated user's account.
 */
export async function handleListWatchers(
    _request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    // Get all events for account and rebuild watcher states
    const events = await context.eventStore.getEventsForAccount(accountId);

    // Group events by watcher
    const watcherEvents = new Map<string, VigilEvent[]>();
    for (const event of events) {
        if (event.watcher_id) {
            const existing = watcherEvents.get(event.watcher_id) || [];
            existing.push(event);
            watcherEvents.set(event.watcher_id, existing);
        }
    }

    // Build watcher summaries
    const watchers = [];
    for (const [watcherId, watcherEvts] of watcherEvents) {
        const createdEvent = watcherEvts.find((e) => e.type === "WATCHER_CREATED");
        if (!createdEvent || createdEvent.type !== "WATCHER_CREATED") {
            continue;
        }

        const watcherState = await context.getWatcherById(watcherId);
        if (!watcherState || watcherState.account_id !== accountId) {
            continue;
        }

        // Skip deleted watchers
        if (watcherState.status === "deleted") {
            continue;
        }

        // Get the latest name (from most recent update or creation)
        const updateEvents = watcherEvts.filter((e) => e.type === "WATCHER_UPDATED");
        let currentName = createdEvent.name;
        for (const ue of updateEvents) {
            if (ue.type === "WATCHER_UPDATED" && ue.name) {
                currentName = ue.name;
            }
        }

        const ingestEmail = `${sanitizeName(currentName)}-${createdEvent.ingest_token}@ingest.email.vigil.run`;

        watchers.push({
            watcher_id: watcherId,
            account_id: accountId,
            name: currentName,
            status: watcherState.status,
            ingest_email: ingestEmail,
            policy: watcherState.policy || {
                silence_threshold_hours: 72,
                reminder_interval_hours: 24,
                max_reminders: 3,
                urgency_keywords: [],
                notification_channels: [],
                allowlist: [],
            },
            created_at: createdEvent.created_at,
        });
    }

    console.log(`[DEBUG] handleListWatchers returning ${watchers.length} watchers for account ${accountId}:`,
        watchers.map(w => ({ id: w.watcher_id, name: w.name, status: w.status })));
    return jsonResponse(200, { watchers });
}

/**
 * Get single watcher (GET /api/watchers/:id)
 */
export async function handleGetWatcher(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;

    // Determine current name and ingest token from events
    // NOTE: name can change via WATCHER_UPDATED; token does not change.
    const events = await context.eventStore.getEventsForWatcher(watcherId);
    const createdEvent = events.find((e) => e.type === "WATCHER_CREATED");
    const updateEvents = events.filter((e) => e.type === "WATCHER_UPDATED");

    let name = createdEvent?.type === "WATCHER_CREATED" ? createdEvent.name : "Unknown";
    for (const ue of updateEvents) {
        if (ue.type === "WATCHER_UPDATED" && ue.name) {
            name = ue.name;
        }
    }

    const ingestToken =
        createdEvent?.type === "WATCHER_CREATED" ? createdEvent.ingest_token : "";
    const createdAt =
        createdEvent?.type === "WATCHER_CREATED"
            ? createdEvent.created_at
            : Date.now();
    const ingestEmail = ingestToken
        ? `${sanitizeName(name)}-${ingestToken}@ingest.email.vigil.run`
        : "";

    return jsonResponse(200, {
        watcher: {
            watcher_id: watcher.watcher_id,
            account_id: watcher.account_id,
            name,
            status: watcher.status,
            ingest_email: ingestEmail,
            ingest_token: ingestToken,
            policy: watcher.policy || {
                silence_threshold_hours: 72,
                reminder_interval_hours: 24,
                max_reminders: 3,
                urgency_keywords: [],
                notification_channels: [],
                allowlist: [],
            },
            created_at: createdAt,
            thread_count: watcher.threads.size,
            open_threads: Array.from(watcher.threads.values()).filter(
                (t) => t.status === "open"
            ).length,
        },
    });
}

/**
 * Create watcher (POST /api/watchers)
 */
export async function handleCreateWatcher(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string,
    userId: string
): Promise<HttpResponse> {
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { name?: string; policy?: Partial<WatcherPolicy> };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.name || body.name.trim().length === 0) {
        return errorResponse(400, "MISSING_NAME", "Watcher name required");
    }

    if (body.name.length > 100) {
        return errorResponse(
            400,
            "NAME_TOO_LONG",
            "Name must be 100 characters or less"
        );
    }

    // Sanitize name: allow alphanumeric, spaces, hyphens, underscores only
    const sanitizedName = body.name.trim().replace(/[^a-zA-Z0-9\s\-_]/g, "");
    if (sanitizedName.length === 0) {
        return errorResponse(
            400,
            "INVALID_NAME",
            "Name must contain at least one alphanumeric character"
        );
    }

    // Check watcher limit based on subscription plan
    // If billing lookup fails (e.g. in unit tests or temporary billing outage),
    // fall back to the conservative "free" plan.
    let plan: SubscriptionPlan = "free";
    try {
        plan = await getEffectivePlan(accountId);
    } catch (err) {
        console.warn(
            `[WARN] getEffectivePlan failed for account ${accountId}; defaulting to free plan`,
            err
        );
    }

    // Count existing non-deleted watchers for this account
    const events = await context.eventStore.getEventsForAccount(accountId);
    const watcherIds = new Set<string>();
    const deletedWatcherIds = new Set<string>();

    for (const event of events) {
        if (event.type === "WATCHER_CREATED" && event.watcher_id) {
            watcherIds.add(event.watcher_id);
        } else if (event.type === "WATCHER_DELETED" && event.watcher_id) {
            deletedWatcherIds.add(event.watcher_id);
        }
    }

    // Active watchers = created - deleted
    const currentWatcherCount = watcherIds.size - deletedWatcherIds.size;

    const limitCheck = await checkWatcherLimit(accountId, plan, currentWatcherCount);
    if (!limitCheck.allowed) {
        return errorResponse(
            403,
            "WATCHER_LIMIT_EXCEEDED",
            `You have reached your watcher limit (${limitCheck.limit}). ` +
            `Upgrade your plan to create more watchers.`
        );
    }

    // Generate unique identifiers
    const watcherId = crypto.randomUUID();
    const ingestToken = generateIngestToken();
    const now = Date.now();

    // Create WATCHER_CREATED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "WATCHER_CREATED",
        account_id: accountId,
        name: sanitizedName,
        ingest_token: ingestToken,
        created_by: userId,
        created_at: now,
    };

    await context.eventStore.append(event);

    // Build the initial policy - use provided values or defaults
    const initialPolicy: WatcherPolicy = {
        allowed_senders: body.policy?.allowed_senders ?? [],
        silence_threshold_hours: body.policy?.silence_threshold_hours ?? 72,
        deadline_warning_hours: body.policy?.deadline_warning_hours ?? 24,
        deadline_critical_hours: body.policy?.deadline_critical_hours ?? 2,
        enable_soft_deadline_reminders: body.policy?.enable_soft_deadline_reminders ?? false,
        enable_urgency_signal_reminders: body.policy?.enable_urgency_signal_reminders ?? false,
        notification_channels: body.policy?.notification_channels ?? [],
        reporting_cadence: body.policy?.reporting_cadence ?? "on_demand",
        reporting_recipients: body.policy?.reporting_recipients ?? [],
        reporting_time: body.policy?.reporting_time,
        reporting_day: body.policy?.reporting_day,
    };

    // If an initial policy was provided, emit POLICY_UPDATED event
    // This allows watchers to be created with a complete configuration
    const policyEvent: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now + 1, // Ensure ordering after WATCHER_CREATED
        watcher_id: watcherId,
        type: "POLICY_UPDATED",
        policy: initialPolicy,
        updated_by: userId,
    };

    await context.eventStore.append(policyEvent);

    const ingestionAddress = `${sanitizeName(sanitizedName)}-${ingestToken}@ingest.email.vigil.run`;

    return jsonResponse(201, {
        watcher: {
            watcher_id: watcherId,
            account_id: accountId,
            name: sanitizedName,
            status: "created",
            ingest_email: ingestionAddress,
            ingest_token: ingestToken,
            policy: initialPolicy,
            created_at: now,
        },
    });
}

/**
 * Update watcher (PATCH /api/watchers/:id)
 * Updates watcher name and other metadata.
 */
export async function handleUpdateWatcher(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { name?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error) {
        return watcherResult.error;
    }

    const watcher = watcherResult.watcher!;

    if (watcher.status === "deleted") {
        return errorResponse(
            409,
            "WATCHER_DELETED",
            "Cannot update deleted watcher"
        );
    }

    // Validate and sanitize name if provided
    let sanitizedName: string | undefined;
    if (body.name !== undefined) {
        if (!body.name || body.name.trim().length === 0) {
            return errorResponse(400, "INVALID_NAME", "Watcher name cannot be empty");
        }

        if (body.name.length > 100) {
            return errorResponse(
                400,
                "NAME_TOO_LONG",
                "Name must be 100 characters or less"
            );
        }

        sanitizedName = body.name.trim().replace(/[^a-zA-Z0-9\s\-_]/g, "");
        if (sanitizedName.length === 0) {
            return errorResponse(
                400,
                "INVALID_NAME",
                "Name must contain at least one alphanumeric character"
            );
        }
    }

    // Create WATCHER_UPDATED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "WATCHER_UPDATED",
        updated_by: userId,
        ...(sanitizedName && { name: sanitizedName }),
    };

    await context.eventStore.append(event);

    // Get updated watcher info
    const events = await context.eventStore.getEventsForWatcher(watcherId);
    const createdEvent = events.find((e) => e.type === "WATCHER_CREATED");
    const updateEvents = events.filter((e) => e.type === "WATCHER_UPDATED");
    
    // Get the latest name (from most recent update or creation)
    let currentName = createdEvent?.type === "WATCHER_CREATED" ? createdEvent.name : "Unknown";
    for (const ue of updateEvents) {
        if (ue.type === "WATCHER_UPDATED" && ue.name) {
            currentName = ue.name;
        }
    }
    
    const ingestToken = createdEvent?.type === "WATCHER_CREATED" ? createdEvent.ingest_token : "";
    const ingestEmail = ingestToken ? `${sanitizeName(currentName)}-${ingestToken}@ingest.email.vigil.run` : "";

    return jsonResponse(200, {
        watcher: {
            watcher_id: watcherId,
            name: currentName,
            status: watcher.status,
            ingest_email: ingestEmail,
            policy: watcher.policy,
        },
    });
}

/**
 * Update watcher policy (PATCH /api/watchers/:id/policy)
 */
export async function handleUpdatePolicy(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let policy: WatcherPolicy;
    try {
        policy = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    // Validate policy structure
    const validationError = validatePolicy(policy);
    if (validationError) {
        return errorResponse(400, "INVALID_POLICY", validationError);
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error) {
        return watcherResult.error;
    }

    // Validate notification channel count against plan limits
    const plan = await getEffectivePlan(accountId);
    const planLimits = getPlanLimits(plan);
    const channelCount = policy.notification_channels.length;
    
    if (planLimits.max_notification_channels !== -1 && 
        channelCount > planLimits.max_notification_channels) {
        return errorResponse(
            400,
            "CHANNEL_LIMIT_EXCEEDED",
            `Plan '${plan}' allows maximum ${planLimits.max_notification_channels} notification channels, but ${channelCount} were provided`
        );
    }

    // Create POLICY_UPDATED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "POLICY_UPDATED",
        policy,
        updated_by: userId,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, { updated: true, policy });
}

/**
 * Delete watcher (DELETE /api/watchers/:id)
 */
export async function handleDeleteWatcher(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error) {
        return watcherResult.error;
    }

    const watcher = watcherResult.watcher!;

    if (watcher.status === "deleted") {
        return errorResponse(409, "ALREADY_DELETED", "Watcher already deleted");
    }

    // Create WATCHER_DELETED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "WATCHER_DELETED",
        deleted_by: userId,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, { deleted: true, watcher_id: watcherId });
}

// ============================================================================
// Watcher Lifecycle Handlers (FR-2, FR-3)
// ============================================================================

/**
 * Activate watcher (POST /api/watchers/:id/activate) - FR-2
 * Enables monitoring for the watcher.
 */
export async function handleActivateWatcher(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;

    if (watcher.status === "deleted") {
        return errorResponse(
            409,
            "WATCHER_DELETED",
            "Cannot activate deleted watcher"
        );
    }

    if (watcher.status === "active") {
        return errorResponse(
            409,
            "ALREADY_ACTIVE",
            "Watcher is already active"
        );
    }

    // Validate policy has required notification channels
    if (!watcher.policy?.notification_channels?.length) {
        return errorResponse(
            400,
            "MISSING_CHANNELS",
            "At least one notification channel required before activation"
        );
    }

    // Validate notification channel count against plan limits
    const plan = await getEffectivePlan(accountId);
    const planLimits = getPlanLimits(plan);
    const channelCount = watcher.policy.notification_channels.length;
    
    if (planLimits.max_notification_channels !== -1 && 
        channelCount > planLimits.max_notification_channels) {
        return errorResponse(
            400,
            "CHANNEL_LIMIT_EXCEEDED",
            `Plan '${plan}' allows maximum ${planLimits.max_notification_channels} notification channels, but watcher has ${channelCount}. Please reduce channels before activation.`
        );
    }

    // Create WATCHER_ACTIVATED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "WATCHER_ACTIVATED",
        activated_by: userId,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        activated: true,
        watcher_id: watcherId,
        status: "active",
    });
}

/**
 * Pause watcher (POST /api/watchers/:id/pause) - FR-3
 * Suspends monitoring without deleting.
 */
export async function handlePauseWatcher(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    let reason: string | undefined;
    if (request.body) {
        try {
            const body = JSON.parse(request.body);
            reason = body.reason;
        } catch {
            // Ignore parse errors for optional body
        }
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;

    if (watcher.status === "deleted") {
        return errorResponse(
            409,
            "WATCHER_DELETED",
            "Cannot pause deleted watcher"
        );
    }

    if (watcher.status === "paused") {
        return errorResponse(
            409,
            "ALREADY_PAUSED",
            "Watcher is already paused"
        );
    }

    // Create WATCHER_PAUSED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "WATCHER_PAUSED",
        paused_by: userId,
        reason,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        paused: true,
        watcher_id: watcherId,
        status: "paused",
    });
}

/**
 * Resume watcher (POST /api/watchers/:id/resume) - FR-3
 * Re-enables monitoring after pause.
 */
export async function handleResumeWatcher(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;

    if (watcher.status === "deleted") {
        return errorResponse(
            409,
            "WATCHER_DELETED",
            "Cannot resume deleted watcher"
        );
    }

    if (watcher.status !== "paused") {
        return errorResponse(409, "NOT_PAUSED", "Watcher is not paused");
    }

    // Create WATCHER_RESUMED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: Date.now(),
        watcher_id: watcherId,
        type: "WATCHER_RESUMED",
        resumed_by: userId,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        resumed: true,
        watcher_id: watcherId,
        status: "active",
    });
}

// ============================================================================
// Thread Handlers (MR-Frontend-1)
// ============================================================================

/**
 * List threads for watcher (GET /api/watchers/:id/threads)
 */
export async function handleListThreads(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;

    // Filter by status if requested
    const statusFilter = request.query["status"];
    let threads = Array.from(watcher.threads.values());

    if (statusFilter === "open") {
        threads = threads.filter((t) => t.status === "open");
    } else if (statusFilter === "closed") {
        threads = threads.filter((t) => t.status === "closed");
    }

    // Map to API response format expected by frontend client
    const response = threads.map((thread) => ({
        thread_id: thread.thread_id,
        watcher_id: watcherId,
        subject: thread.normalized_subject || "",
        status: thread.status,
        urgency:
            (thread.last_urgency_state as
                | "ok"
                | "warning"
                | "critical"
                | "overdue") || "ok",
        first_message_at: thread.opened_at,
        last_activity_at: thread.last_activity_at,
        // deadline may be computed from events; omit if not present
        message_count: thread.message_ids.length,
    }));

    return jsonResponse(200, { threads: response });
}

/**
 * Close thread (POST /api/threads/:id/close) - FR-9
 * Manually closes a thread.
 */
export async function handleCloseThread(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const threadId = request.params["id"];
    const watcherId =
        request.params["watcher_id"] || request.query["watcher_id"];

    if (!threadId) {
        return errorResponse(400, "MISSING_ID", "Thread ID required");
    }

    if (!watcherId) {
        return errorResponse(400, "MISSING_WATCHER_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const thread = watcherResult.watcher.threads.get(threadId);

    if (!thread) {
        return errorResponse(404, "NOT_FOUND", "Thread not found");
    }

    if (thread.status === "closed") {
        return errorResponse(409, "ALREADY_CLOSED", "Thread is already closed");
    }

    let reason: string | undefined;
    if (request.body) {
        try {
            const body = JSON.parse(request.body);
            reason = body.reason;
        } catch {
            // Ignore parse errors for optional body
        }
    }

    const now = Date.now();

    // Create THREAD_CLOSED event
    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "THREAD_CLOSED",
        thread_id: threadId,
        closed_at: now,
        closed_by: "user_action",
        closure_reason: reason || "Manual closure by user",
        closure_event_id: userId, // Reference to who closed it
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        closed: true,
        thread_id: threadId,
        closed_at: now,
    });
}

// ============================================================================
// Reminder Handlers (Portable Semantic Obligations)
// ============================================================================

/**
 * List reminders for a watcher (GET /api/watchers/:id/reminders)
 */
export async function handleListReminders(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const watcher = watcherResult.watcher;
    const reminders = Array.from(watcher.reminders.values());

    // Filter by status if requested
    const statusFilter = request.query["status"];
    const filteredReminders = statusFilter
        ? reminders.filter((r) => r.status === statusFilter)
        : reminders;

    // Filter by thread if requested
    const threadFilter = request.query["thread_id"];
    const threadReminders = threadFilter
        ? filteredReminders.filter((r) => r.thread_id === threadFilter)
        : filteredReminders;

    return jsonResponse(200, {
        reminders: threadReminders.map((r) => ({
            reminder_id: r.reminder_id,
            thread_id: r.thread_id,
            reminder_type: r.reminder_type,
            deadline_utc: r.deadline_utc,
            source_span: r.source_span,
            description: r.description,
            confidence: r.confidence,
            status: r.status,
            created_by: r.created_by,
            created_at: r.created_at,
            merged_into: r.merged_into,
        })),
    });
}

/**
 * Create manual reminder (POST /api/watchers/:id/reminders)
 */
export async function handleCreateReminder(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: {
        thread_id: string;
        reminder_type?: "hard_deadline" | "soft_deadline" | "custom";
        deadline_utc?: number | null;
        description: string;
    };

    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.thread_id) {
        return errorResponse(400, "MISSING_THREAD_ID", "thread_id required");
    }

    if (!body.description) {
        return errorResponse(400, "MISSING_DESCRIPTION", "description required");
    }

    // Verify thread exists
    const thread = watcherResult.watcher.threads.get(body.thread_id);
    if (!thread) {
        return errorResponse(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    const now = Date.now();
    const reminderId = crypto.randomUUID();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "REMINDER_MANUAL_CREATED",
        reminder_id: reminderId,
        thread_id: body.thread_id,
        created_by: userId,
        reminder_type: body.reminder_type || "custom",
        deadline_utc: body.deadline_utc ?? null,
        description: body.description,
        status: "active",
        created_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(201, {
        reminder_id: reminderId,
        thread_id: body.thread_id,
        status: "active",
        created_at: now,
    });
}

/**
 * Edit reminder (PATCH /api/watchers/:watcher_id/reminders/:reminder_id)
 */
export async function handleEditReminder(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const reminderId = request.params["reminder_id"];

    if (!watcherId || !reminderId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID and Reminder ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const reminder = watcherResult.watcher.reminders.get(reminderId);
    if (!reminder) {
        return errorResponse(404, "NOT_FOUND", "Reminder not found");
    }

    if (reminder.status !== "active") {
        return errorResponse(409, "NOT_ACTIVE", "Only active reminders can be edited");
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: {
        deadline_utc?: number | null;
        description?: string;
        reminder_type?: "hard_deadline" | "soft_deadline" | "custom";
    };

    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "REMINDER_EDITED",
        reminder_id: reminderId,
        edited_by: userId,
        changes: body,
        edited_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        reminder_id: reminderId,
        edited: true,
        edited_at: now,
    });
}

/**
 * Dismiss reminder (POST /api/watchers/:watcher_id/reminders/:reminder_id/dismiss)
 */
export async function handleDismissReminder(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const reminderId = request.params["reminder_id"];

    if (!watcherId || !reminderId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID and Reminder ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const reminder = watcherResult.watcher.reminders.get(reminderId);
    if (!reminder) {
        return errorResponse(404, "NOT_FOUND", "Reminder not found");
    }

    if (reminder.status !== "active") {
        return errorResponse(409, "NOT_ACTIVE", "Only active reminders can be dismissed");
    }

    let reason: string | undefined;
    if (request.body) {
        try {
            const body = JSON.parse(request.body);
            reason = body.reason;
        } catch {
            // Optional body
        }
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "REMINDER_DISMISSED",
        reminder_id: reminderId,
        dismissed_by: userId,
        reason,
        dismissed_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        reminder_id: reminderId,
        dismissed: true,
        dismissed_at: now,
    });
}

/**
 * Merge reminders (POST /api/watchers/:watcher_id/reminders/:reminder_id/merge)
 */
export async function handleMergeReminder(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const sourceReminderId = request.params["reminder_id"];

    if (!watcherId || !sourceReminderId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID and Reminder ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body with target_reminder_id required");
    }

    let body: { target_reminder_id: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.target_reminder_id) {
        return errorResponse(400, "MISSING_TARGET", "target_reminder_id required");
    }

    const sourceReminder = watcherResult.watcher.reminders.get(sourceReminderId);
    const targetReminder = watcherResult.watcher.reminders.get(body.target_reminder_id);

    if (!sourceReminder) {
        return errorResponse(404, "SOURCE_NOT_FOUND", "Source reminder not found");
    }
    if (!targetReminder) {
        return errorResponse(404, "TARGET_NOT_FOUND", "Target reminder not found");
    }

    if (sourceReminder.status !== "active") {
        return errorResponse(409, "SOURCE_NOT_ACTIVE", "Source reminder must be active");
    }
    if (targetReminder.status !== "active") {
        return errorResponse(409, "TARGET_NOT_ACTIVE", "Target reminder must be active");
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "REMINDER_MERGED",
        source_reminder_id: sourceReminderId,
        target_reminder_id: body.target_reminder_id,
        merged_by: userId,
        merged_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        source_reminder_id: sourceReminderId,
        target_reminder_id: body.target_reminder_id,
        merged: true,
        merged_at: now,
    });
}

/**
 * Reassign reminder to different thread (POST /api/watchers/:watcher_id/reminders/:reminder_id/reassign)
 */
export async function handleReassignReminder(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const reminderId = request.params["reminder_id"];

    if (!watcherId || !reminderId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID and Reminder ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body with to_thread_id required");
    }

    let body: { to_thread_id: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.to_thread_id) {
        return errorResponse(400, "MISSING_THREAD", "to_thread_id required");
    }

    const reminder = watcherResult.watcher.reminders.get(reminderId);
    if (!reminder) {
        return errorResponse(404, "NOT_FOUND", "Reminder not found");
    }

    if (reminder.status !== "active") {
        return errorResponse(409, "NOT_ACTIVE", "Only active reminders can be reassigned");
    }

    // Verify target thread exists
    const targetThread = watcherResult.watcher.threads.get(body.to_thread_id);
    if (!targetThread) {
        return errorResponse(404, "THREAD_NOT_FOUND", "Target thread not found");
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "REMINDER_REASSIGNED",
        reminder_id: reminderId,
        from_thread_id: reminder.thread_id,
        to_thread_id: body.to_thread_id,
        reassigned_by: userId,
        reassigned_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        reminder_id: reminderId,
        from_thread_id: reminder.thread_id,
        to_thread_id: body.to_thread_id,
        reassigned: true,
        reassigned_at: now,
    });
}

// ============================================================================
// Message-Thread Association Handlers (Soft Association Model)
// ============================================================================

/**
 * Add message to thread (POST /api/watchers/:watcher_id/threads/:thread_id/messages)
 */
export async function handleAddMessageToThread(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const threadId = request.params["thread_id"];

    if (!watcherId || !threadId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID and Thread ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const thread = watcherResult.watcher.threads.get(threadId);
    if (!thread) {
        return errorResponse(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body with message_id required");
    }

    let body: { message_id: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    if (!body.message_id) {
        return errorResponse(400, "MISSING_MESSAGE_ID", "message_id required");
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "MESSAGE_THREAD_ASSOCIATED",
        message_id: body.message_id,
        thread_id: threadId,
        association_status: "active",
        associated_by: userId,
        associated_at: now,
    };

    await context.eventStore.append(event);

    return jsonResponse(201, {
        message_id: body.message_id,
        thread_id: threadId,
        status: "active",
        associated_at: now,
    });
}

/**
 * Remove message from thread (DELETE /api/watchers/:watcher_id/threads/:thread_id/messages/:message_id)
 * This deactivates the association (soft delete), preserving audit trail.
 */
export async function handleRemoveMessageFromThread(
    request: HttpRequest,
    context: HandlerContext,
    userId: string,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["watcher_id"];
    const threadId = request.params["thread_id"];
    const messageId = request.params["message_id"];

    if (!watcherId || !threadId || !messageId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID, Thread ID, and Message ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error || !watcherResult.watcher) {
        return watcherResult.error!;
    }

    const thread = watcherResult.watcher.threads.get(threadId);
    if (!thread) {
        return errorResponse(404, "THREAD_NOT_FOUND", "Thread not found");
    }

    // Verify message is associated with thread
    if (!thread.active_message_ids.includes(messageId)) {
        return errorResponse(404, "MESSAGE_NOT_IN_THREAD", "Message is not actively associated with this thread");
    }

    let reason: string | undefined;
    if (request.body) {
        try {
            const body = JSON.parse(request.body);
            reason = body.reason;
        } catch {
            // Optional body
        }
    }

    const now = Date.now();

    const event: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: watcherId,
        type: "MESSAGE_THREAD_DEACTIVATED",
        message_id: messageId,
        thread_id: threadId,
        deactivated_by: userId,
        deactivated_at: now,
        reason,
    };

    await context.eventStore.append(event);

    return jsonResponse(200, {
        message_id: messageId,
        thread_id: threadId,
        deactivated: true,
        deactivated_at: now,
    });
}

// ============================================================================
// Event Log Handler (FR-14)
// ============================================================================

/**
 * Get event log for watcher (GET /api/watchers/:id/events)
 * Supports pagination and filtering.
 */
export async function handleGetEvents(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error) {
        return watcherResult.error;
    }

    // Query options
    const limit = Math.min(parseInt(request.query["limit"] || "100", 10), 1000);
    const order = (request.query["order"] || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    const beforeParam = request.query["before"];
    const sinceParam = request.query["since"];

    // Build store query using native options for performance
    // Fallback to getEventsForWatcher if getEvents is not available
    let events: VigilEvent[];
    let totalBeforePagination: number | undefined;
    
    if (context.eventStore.getEvents) {
        events = [...await context.eventStore.getEvents({
            watcher_id: watcherId,
            limit,
            order,
            until_timestamp: beforeParam ? parseInt(beforeParam, 10) : undefined,
            since_timestamp: sinceParam ? parseInt(sinceParam, 10) : undefined,
        })];
        // Total is unknown when using native pagination
        totalBeforePagination = undefined;
    } else {
        // Fallback: use basic retrieval and filter manually
        const allEvents = await context.eventStore.getEventsForWatcher(watcherId);
        const filteredEvents = [...allEvents]
            .filter(e => {
                if (beforeParam && e.timestamp > parseInt(beforeParam, 10)) return false;
                if (sinceParam && e.timestamp < parseInt(sinceParam, 10)) return false;
                return true;
            })
            .filter((e: VigilEvent) => e.type !== "TIME_TICK") // Filter out TIME_TICK early
            .sort((a, b) => order === "ASC" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
        
        totalBeforePagination = filteredEvents.length;
        events = filteredEvents.slice(0, limit);
    }

    // Filter out TIME_TICK events (only needed for native getEvents path)
    if (context.eventStore.getEvents) {
        events = events.filter((e: VigilEvent) => e.type !== "TIME_TICK");
    }

    // Filter by type if requested
    const typeFilter = request.query["type"];
    if (typeFilter) {
        events = events.filter((e: VigilEvent) => e.type === typeFilter);
    }

    // Return events with simple has_more heuristic
    return jsonResponse(200, {
        events,
        pagination: {
            total: totalBeforePagination,
            limit,
            has_more: events.length === limit,
        },
    });
}

// ============================================================================
// Per-Watcher Log Handler (IR-22)
// ============================================================================

/**
 * Get human-readable logs for watcher (GET /api/watchers/:id/logs)
 * User-friendly log format per IR-22.
 */
export async function handleGetLogs(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    const watcherId = request.params["id"];

    if (!watcherId) {
        return errorResponse(400, "MISSING_ID", "Watcher ID required");
    }

    const watcherResult = await requireWatcherForAccount(
        context,
        watcherId,
        accountId
    );
    if (watcherResult.error) {
        return watcherResult.error;
    }

    const events = await context.eventStore.getEventsForWatcher(watcherId);

    // Filter by level if requested
    const levelFilter = request.query["level"];

    // Transform events to user-friendly logs
    const logs = events
        .map((event) => eventToLog(event))
        .filter((log) => !levelFilter || log.level === levelFilter);

    // Pagination
    const limit = Math.min(parseInt(request.query["limit"] || "100", 10), 1000);
    const offset = parseInt(request.query["offset"] || "0", 10);

    const paginatedLogs = logs.slice(offset, offset + limit);

    return jsonResponse(200, {
        logs: paginatedLogs,
        pagination: {
            total: logs.length,
            limit,
            offset,
            has_more: offset + limit < logs.length,
        },
    });
}

/**
 * Transform event to user-friendly log entry (IR-22).
 */
function eventToLog(event: VigilEvent): {
    timestamp: string;
    level: string;
    message: string;
    action_by: string;
} {
    const timestamp = new Date(event.timestamp).toISOString();
    let level = "INFO";
    let message = "";
    let actionBy = "automatically";

    switch (event.type) {
        case "MESSAGE_RECEIVED":
            if (event.type === "MESSAGE_RECEIVED") {
                message = `Message received from ${event.sender}`;
            }
            break;
        case "HARD_DEADLINE_OBSERVED":
            if (event.type === "HARD_DEADLINE_OBSERVED") {
                message = `Deadline found: ${event.deadline_text}`;
            }
            break;
        case "SOFT_DEADLINE_SIGNAL_OBSERVED":
            if (event.type === "SOFT_DEADLINE_SIGNAL_OBSERVED") {
                message = `Soft deadline signal: ${event.signal_text}`;
            }
            break;
        case "URGENCY_SIGNAL_OBSERVED":
            if (event.type === "URGENCY_SIGNAL_OBSERVED") {
                message = `Urgency signal detected: ${event.signal_type}`;
            }
            break;
        case "CLOSURE_SIGNAL_OBSERVED":
            if (event.type === "CLOSURE_SIGNAL_OBSERVED") {
                message = `Closure signal: ${event.closure_type}`;
            }
            break;
        case "THREAD_OPENED":
            message = "Thread created for deadline tracking";
            break;
        case "THREAD_CLOSED":
            message = "Thread closed";
            actionBy = (event as any).closed_by || "automatically";
            break;
        case "ALERT_QUEUED":
            level = "WARN";
            message = `Alert queued: ${(event as any).urgency_state}`;
            break;
        case "ALERT_SENT":
            message = `Alert sent via ${(event as any).channel_type}`;
            break;
        case "ALERT_FAILED":
            level = "ERROR";
            message = `Alert delivery failed: ${(event as any).error}`;
            break;
        case "WATCHER_CREATED":
            message = "Watcher created";
            actionBy = "by you";
            break;
        case "WATCHER_ACTIVATED":
            message = "Watcher activated";
            actionBy = "by you";
            break;
        case "WATCHER_PAUSED":
            message = "Watcher paused";
            actionBy = "by you";
            break;
        case "WATCHER_RESUMED":
            message = "Watcher resumed";
            actionBy = "by you";
            break;
        case "WATCHER_DELETED":
            message = "Watcher deleted";
            actionBy = "by you";
            break;
        case "POLICY_UPDATED":
            message = "Policy updated";
            actionBy = "by you";
            break;
        default:
            message = `Event: ${event.type}`;
    }

    return { timestamp, level, message, action_by: actionBy };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate unique ingest token (8 characters, base36).
 */
function generateIngestToken(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 8; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}

/**
 * Sanitize watcher name for email address.
 */
function sanitizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 30);
}

/**
 * Validate policy structure.
 */
function validatePolicy(policy: WatcherPolicy): string | null {
    if (
        typeof policy.silence_threshold_hours !== "number" ||
        policy.silence_threshold_hours < 1
    ) {
        return "silence_threshold_hours must be a positive number";
    }

    if (
        typeof policy.deadline_warning_hours !== "number" ||
        policy.deadline_warning_hours < 1
    ) {
        return "deadline_warning_hours must be a positive number";
    }

    if (
        typeof policy.deadline_critical_hours !== "number" ||
        policy.deadline_critical_hours < 0
    ) {
        return "deadline_critical_hours must be a non-negative number";
    }

    if (policy.deadline_critical_hours >= policy.deadline_warning_hours) {
        return "deadline_critical_hours must be less than deadline_warning_hours";
    }

    if (!Array.isArray(policy.allowed_senders)) {
        return "allowed_senders must be an array";
    }

    if (!Array.isArray(policy.notification_channels)) {
        return "notification_channels must be an array";
    }

    const validCadences = ["daily", "weekly", "monthly", "on_demand"];
    if (!validCadences.includes(policy.reporting_cadence)) {
        return "reporting_cadence must be one of: " + validCadences.join(", ");
    }

    return null;
}

// ============================================================================
// Billing Handlers
// ============================================================================

/**
 * Get subscription details (GET /api/billing/subscription)
 */
async function handleGetSubscription(
    _request: HttpRequest,
    _context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    try {
        const subscription = await getSubscription(accountId);

        if (!subscription) {
            // Return default free subscription
            return jsonResponse(200, {
                subscription: {
                    plan: "free",
                    status: "free",
                    limits: PLAN_CONFIGS.free.limits,
                },
            });
        }

        const config = PLAN_CONFIGS[subscription.plan];

        return jsonResponse(200, {
            subscription: {
                plan: subscription.plan,
                status: subscription.status,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                cancel_at_period_end: subscription.cancel_at_period_end,
                limits: config.limits,
            },
        });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error
                ? error.message
                : "Failed to get subscription"
        );
    }
}

/**
 * Get current usage (GET /api/billing/usage)
 */
async function handleGetUsage(
    request: HttpRequest,
    context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    try {
        const plan = await getEffectivePlan(accountId);
        const usage = await getOrCreateUsage(accountId, plan);

        // Get fresh limits from current plan (in case user upgraded mid-period)
        const planLimits = PLAN_CONFIGS[plan].limits;
        const emailsLimit = planLimits.emails_per_week;
        const watchersLimit = planLimits.max_watchers;

        // Get actual watcher count from events (more accurate than stored count)
        const events = await context.eventStore.getEventsForAccount(accountId);
        const watcherIds = new Set<string>();
        const deletedWatcherIds = new Set<string>();
        for (const event of events) {
            if (event.type === "WATCHER_CREATED" && event.watcher_id) {
                watcherIds.add(event.watcher_id);
            } else if (event.type === "WATCHER_DELETED" && event.watcher_id) {
                deletedWatcherIds.add(event.watcher_id);
            }
        }
        const actualWatcherCount = watcherIds.size - deletedWatcherIds.size;

        // Get history if requested
        const includeHistory = request.query.history === "true";
        let history = null;

        if (includeHistory) {
            const periodCount = parseInt(request.query.periods || "12", 10);
            history = await getUsageHistory(accountId, periodCount);
        }

        return jsonResponse(200, {
            usage: {
                current_period: {
                    start: usage.period_start,
                    end: usage.period_end,
                },
                emails: {
                    processed: usage.emails_processed,
                    limit: emailsLimit,
                    remaining:
                        emailsLimit === -1
                            ? -1
                            : Math.max(0, emailsLimit - usage.emails_processed),
                    unlimited: emailsLimit === -1,
                },
                watchers: {
                    count: actualWatcherCount,
                    limit: watchersLimit,
                    remaining:
                        watchersLimit === -1
                            ? -1
                            : Math.max(0, watchersLimit - actualWatcherCount),
                    unlimited: watchersLimit === -1,
                },
            },
            history: history?.map((h) => ({
                period_start: h.period_start,
                period_end: h.period_end,
                emails_processed: h.emails_processed,
                emails_limit: h.emails_limit,
            })),
        });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to get usage"
        );
    }
}

/**
 * Get available plans (GET /api/billing/plans)
 */
function handleGetPlans(): HttpResponse {
    // Filter to only visible plans
    const plans = Object.values(PLAN_CONFIGS)
        .filter((config) => config.visible_on_dashboard)
        .map((config) => ({
            plan: config.plan,
            display_name: config.display_name,
            description: config.description,
            price_cents_monthly: config.price_cents_monthly,
            limits: {
                emails_per_week: config.limits.emails_per_week,
                max_watchers: config.limits.max_watchers,
                max_notification_channels:
                    config.limits.max_notification_channels,
                advanced_reporting: config.limits.advanced_reporting,
                webhook_notifications: config.limits.webhook_notifications,
                sms_notifications: config.limits.sms_notifications,
                support_level: config.limits.support_level,
            },
        }));

    return jsonResponse(200, { plans });
}

/**
 * Create checkout session for plan upgrade (POST /api/billing/checkout)
 */
async function handleCreateCheckout(
    request: HttpRequest,
    _context: HandlerContext,
    accountId: string,
    userEmail: string
): Promise<HttpResponse> {
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Request body required");
    }

    let body: { plan?: string; success_url?: string; cancel_url?: string };
    try {
        body = JSON.parse(request.body);
    } catch {
        return errorResponse(400, "INVALID_JSON", "Invalid JSON body");
    }

    const { plan, success_url, cancel_url } = body;

    if (!plan) {
        return errorResponse(400, "MISSING_PLAN", "Plan is required");
    }

    if (!success_url || !cancel_url) {
        return errorResponse(
            400,
            "MISSING_URLS",
            "success_url and cancel_url are required"
        );
    }

    // Validate plan - allow enterprise for admin checkout
    const validPlans: SubscriptionPlan[] = ["starter", "pro", "enterprise"];
    if (!validPlans.includes(plan as SubscriptionPlan)) {
        return errorResponse(
            400,
            "INVALID_PLAN",
            `Plan must be one of: ${validPlans.join(", ")}`
        );
    }

    try {
        const result = await createCheckoutSession({
            accountId,
            userEmail,
            plan: plan as SubscriptionPlan,
            successUrl: success_url,
            cancelUrl: cancel_url,
        });

        if (!result.success) {
            return errorResponse(
                400,
                "CHECKOUT_FAILED",
                result.error || "Failed to create checkout"
            );
        }

        return jsonResponse(200, {
            checkout_url: result.checkout_url,
            session_id: result.session_id,
        });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to create checkout"
        );
    }
}

/**
 * Create billing portal session (POST /api/billing/portal)
 */
async function handleCreatePortal(
    request: HttpRequest,
    _context: HandlerContext,
    accountId: string
): Promise<HttpResponse> {
    let returnUrl = "/dashboard/billing";

    if (request.body) {
        try {
            const body = JSON.parse(request.body);
            if (body.return_url) {
                returnUrl = body.return_url;
            }
        } catch {
            // Ignore parse errors, use default
        }
    }

    try {
        const result = await createBillingPortalSession(accountId, returnUrl);

        if (!result.success) {
            return errorResponse(
                400,
                "PORTAL_FAILED",
                result.error || "Failed to create portal"
            );
        }

        return jsonResponse(200, {
            portal_url: result.portal_url,
        });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to create portal"
        );
    }
}

/**
 * Handle Stripe webhook (POST /api/webhooks/stripe)
 */
async function handleStripeWebhookRoute(
    request: HttpRequest
): Promise<HttpResponse> {
    if (!request.body) {
        return errorResponse(400, "MISSING_BODY", "Webhook payload required");
    }

    const signature = request.headers["stripe-signature"] || "";

    try {
        const result = await handleStripeWebhook(request.body, signature);

        if (!result.success) {
            return errorResponse(400, "WEBHOOK_FAILED", result.message);
        }

        return jsonResponse(200, {
            received: true,
            event_id: result.event_id,
            message: result.message,
        });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Webhook processing failed"
        );
    }
}

/**
 * Get Stripe configuration for frontend (GET /api/billing/config)
 */
function handleGetBillingConfig(): HttpResponse {
    return jsonResponse(200, {
        stripe_configured: isStripeConfigured(),
        publishable_key: getPublishableKey(),
    });
}

/**
 * Cancel subscription (POST /api/billing/cancel)
 */
async function handleCancelSubscription(
    accountId: string
): Promise<HttpResponse> {
    try {
        const result = await cancelSubscription(accountId);

        if (!result.success) {
            return errorResponse(
                400,
                "CANCEL_FAILED",
                result.error || "Failed to cancel subscription"
            );
        }

        return jsonResponse(200, { success: true });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error
                ? error.message
                : "Failed to cancel subscription"
        );
    }
}

/**
 * Resume subscription (POST /api/billing/resume)
 */
async function handleResumeSubscription(
    accountId: string
): Promise<HttpResponse> {
    try {
        const result = await resumeSubscription(accountId);

        if (!result.success) {
            return errorResponse(
                400,
                "RESUME_FAILED",
                result.error || "Failed to resume subscription"
            );
        }

        return jsonResponse(200, { success: true });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error
                ? error.message
                : "Failed to resume subscription"
        );
    }
}

/**
 * Get invoices for the authenticated account.
 */
async function handleGetInvoices(accountId: string): Promise<HttpResponse> {
    try {
        const result = await getInvoices(accountId);

        if (!result.success) {
            return errorResponse(
                400,
                "INVOICE_FETCH_FAILED",
                result.error || "Failed to fetch invoices"
            );
        }

        return jsonResponse(200, { invoices: result.invoices });
    } catch (error) {
        return errorResponse(
            500,
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to fetch invoices"
        );
    }
}

/**
 * Route request to appropriate handler.
 */
export async function routeRequest(
    request: HttpRequest,
    context: HandlerContext
): Promise<HttpResponse> {
    const { method, path } = request;

    // Health checks (no auth)
    if (method === "GET" && path === "/health") {
        return handleHealthCheck();
    }

    // Auth routes (no auth required)
    if (method === "POST" && path === "/api/auth/register") {
        return handleRegister(request, context);
    }

    if (method === "POST" && path === "/api/auth/login") {
        return handleLogin(request, context);
    }

    if (method === "POST" && path === "/api/auth/refresh") {
        return handleRefreshToken(request, context);
    }

    // Password reset routes (no auth required)
    if (method === "POST" && path === "/api/auth/password-reset/request") {
        return handleRequestPasswordReset(request);
    }

    if (method === "GET" && path === "/api/auth/password-reset/verify") {
        return handleVerifyResetToken(request);
    }

    if (method === "POST" && path === "/api/auth/password-reset/confirm") {
        return handleConfirmPasswordReset(request);
    }

    // OAuth routes (no auth required)
    if (method === "GET" && path === "/api/auth/oauth/providers") {
        return handleGetOAuthProviders();
    }

    const oauthStartMatch = path.match(/^\/api\/auth\/oauth\/(google|github)$/);
    if (method === "GET" && oauthStartMatch && oauthStartMatch[1]) {
        request.params["provider"] = oauthStartMatch[1];
        return handleOAuthStart(request);
    }

    const oauthCallbackMatch = path.match(
        /^\/api\/auth\/callback\/(google|github)$/
    );
    if (method === "GET" && oauthCallbackMatch && oauthCallbackMatch[1]) {
        request.params["provider"] = oauthCallbackMatch[1];
        return handleOAuthCallback(request, context);
    }

    // Email ingestion (token-based auth)
    const ingestMatch = path.match(/^\/ingest\/([a-z0-9]+)$/);
    if (method === "POST" && ingestMatch && ingestMatch[1]) {
        request.params["token"] = ingestMatch[1];
        return handleEmailIngestion(request, context);
    }

    // Authenticated routes
    const auth = await context.validateAuth(request.headers["authorization"]);
    if (!auth) {
        return errorResponse(
            401,
            "UNAUTHORIZED",
            "Valid authentication required"
        );
    }

    // Get current user (GET /api/auth/me)
    if (method === "GET" && path === "/api/auth/me") {
        return handleGetCurrentUser(auth);
    }

    // Change password (POST /api/auth/change-password)
    if (method === "POST" && path === "/api/auth/change-password") {
        return handleChangePassword(request, auth);
    }

    // Get OAuth links (GET /api/auth/oauth/links)
    if (method === "GET" && path === "/api/auth/oauth/links") {
        return handleGetOAuthLinks(auth);
    }

    // Unlink OAuth provider (DELETE /api/auth/oauth/links/:provider)
    const unlinkMatch = path.match(
        /^\/api\/auth\/oauth\/links\/(google|github)$/
    );
    if (method === "DELETE" && unlinkMatch && unlinkMatch[1]) {
        request.params["provider"] = unlinkMatch[1];
        return handleUnlinkOAuthProvider(request, auth);
    }

    // System health (authenticated)
    if (method === "GET" && path === "/api/system/health") {
        return handleSystemHealth(new Map());
    }

    // Watcher routes
    if (method === "GET" && path === "/api/watchers") {
        return handleListWatchers(request, context, auth.account_id);
    }

    // Create watcher
    if (method === "POST" && path === "/api/watchers") {
        return handleCreateWatcher(
            request,
            context,
            auth.account_id,
            auth.user_id
        );
    }

    const watcherMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)$/);
    if (watcherMatch && watcherMatch[1]) {
        request.params["id"] = watcherMatch[1];
        if (method === "GET") {
            return handleGetWatcher(request, context, auth.account_id);
        }
        if (method === "PATCH") {
            return handleUpdateWatcher(
                request,
                context,
                auth.user_id,
                auth.account_id
            );
        }
        if (method === "DELETE") {
            return handleDeleteWatcher(
                request,
                context,
                auth.user_id,
                auth.account_id
            );
        }
    }

    // Watcher lifecycle routes
    const activateMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/activate$/
    );
    if (method === "POST" && activateMatch && activateMatch[1]) {
        request.params["id"] = activateMatch[1];
        return handleActivateWatcher(
            request,
            context,
            auth.user_id,
            auth.account_id
        );
    }

    const pauseMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/pause$/);
    if (method === "POST" && pauseMatch && pauseMatch[1]) {
        request.params["id"] = pauseMatch[1];
        return handlePauseWatcher(
            request,
            context,
            auth.user_id,
            auth.account_id
        );
    }

    const resumeMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/resume$/);
    if (method === "POST" && resumeMatch && resumeMatch[1]) {
        request.params["id"] = resumeMatch[1];
        return handleResumeWatcher(
            request,
            context,
            auth.user_id,
            auth.account_id
        );
    }

    // Thread routes
    const threadsMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/threads$/);
    if (method === "GET" && threadsMatch && threadsMatch[1]) {
        request.params["id"] = threadsMatch[1];
        return handleListThreads(request, context, auth.account_id);
    }

    // Close thread
    const closeThreadMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/threads\/([a-z0-9-]+)\/close$/
    );
    if (
        method === "POST" &&
        closeThreadMatch &&
        closeThreadMatch[1] &&
        closeThreadMatch[2]
    ) {
        request.params["watcher_id"] = closeThreadMatch[1];
        request.params["id"] = closeThreadMatch[2];
        return handleCloseThread(
            request,
            context,
            auth.user_id,
            auth.account_id
        );
    }

    // Add message to thread (POST /api/watchers/:watcher_id/threads/:thread_id/messages)
    const addMessageMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/threads\/([a-z0-9-]+)\/messages$/
    );
    if (method === "POST" && addMessageMatch && addMessageMatch[1] && addMessageMatch[2]) {
        request.params["watcher_id"] = addMessageMatch[1];
        request.params["thread_id"] = addMessageMatch[2];
        return handleAddMessageToThread(request, context, auth.user_id, auth.account_id);
    }

    // Remove message from thread (DELETE /api/watchers/:watcher_id/threads/:thread_id/messages/:message_id)
    const removeMessageMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/threads\/([a-z0-9-]+)\/messages\/([a-zA-Z0-9._@<>-]+)$/
    );
    if (method === "DELETE" && removeMessageMatch && removeMessageMatch[1] && removeMessageMatch[2] && removeMessageMatch[3]) {
        request.params["watcher_id"] = removeMessageMatch[1];
        request.params["thread_id"] = removeMessageMatch[2];
        request.params["message_id"] = removeMessageMatch[3];
        return handleRemoveMessageFromThread(request, context, auth.user_id, auth.account_id);
    }

    // Reminder routes
    // List reminders (GET /api/watchers/:id/reminders)
    const remindersMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/reminders$/);
    if (method === "GET" && remindersMatch && remindersMatch[1]) {
        request.params["id"] = remindersMatch[1];
        return handleListReminders(request, context, auth.account_id);
    }

    // Create manual reminder (POST /api/watchers/:id/reminders)
    if (method === "POST" && remindersMatch && remindersMatch[1]) {
        request.params["id"] = remindersMatch[1];
        return handleCreateReminder(request, context, auth.user_id, auth.account_id);
    }

    // Edit reminder (PATCH /api/watchers/:watcher_id/reminders/:reminder_id)
    const reminderMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/reminders\/([a-z0-9-]+)$/);
    if (method === "PATCH" && reminderMatch && reminderMatch[1] && reminderMatch[2]) {
        request.params["watcher_id"] = reminderMatch[1];
        request.params["reminder_id"] = reminderMatch[2];
        return handleEditReminder(request, context, auth.user_id, auth.account_id);
    }

    // Dismiss reminder (POST /api/watchers/:watcher_id/reminders/:reminder_id/dismiss)
    const dismissReminderMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/reminders\/([a-z0-9-]+)\/dismiss$/
    );
    if (method === "POST" && dismissReminderMatch && dismissReminderMatch[1] && dismissReminderMatch[2]) {
        request.params["watcher_id"] = dismissReminderMatch[1];
        request.params["reminder_id"] = dismissReminderMatch[2];
        return handleDismissReminder(request, context, auth.user_id, auth.account_id);
    }

    // Merge reminders (POST /api/watchers/:watcher_id/reminders/:reminder_id/merge)
    const mergeReminderMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/reminders\/([a-z0-9-]+)\/merge$/
    );
    if (method === "POST" && mergeReminderMatch && mergeReminderMatch[1] && mergeReminderMatch[2]) {
        request.params["watcher_id"] = mergeReminderMatch[1];
        request.params["reminder_id"] = mergeReminderMatch[2];
        return handleMergeReminder(request, context, auth.user_id, auth.account_id);
    }

    // Reassign reminder (POST /api/watchers/:watcher_id/reminders/:reminder_id/reassign)
    const reassignReminderMatch = path.match(
        /^\/api\/watchers\/([a-z0-9-]+)\/reminders\/([a-z0-9-]+)\/reassign$/
    );
    if (method === "POST" && reassignReminderMatch && reassignReminderMatch[1] && reassignReminderMatch[2]) {
        request.params["watcher_id"] = reassignReminderMatch[1];
        request.params["reminder_id"] = reassignReminderMatch[2];
        return handleReassignReminder(request, context, auth.user_id, auth.account_id);
    }

    // Event routes
    const eventsMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/events$/);
    if (method === "GET" && eventsMatch && eventsMatch[1]) {
        request.params["id"] = eventsMatch[1];
        return handleGetEvents(request, context, auth.account_id);
    }

    // Log routes
    const logsMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/logs$/);
    if (method === "GET" && logsMatch && logsMatch[1]) {
        request.params["id"] = logsMatch[1];
        return handleGetLogs(request, context, auth.account_id);
    }

    // Policy routes
    const policyMatch = path.match(/^\/api\/watchers\/([a-z0-9-]+)\/policy$/);
    if (method === "PATCH" && policyMatch && policyMatch[1]) {
        request.params["id"] = policyMatch[1];
        return handleUpdatePolicy(
            request,
            context,
            auth.user_id,
            auth.account_id
        );
    }

    // Billing routes
    if (method === "GET" && path === "/api/billing/subscription") {
        return handleGetSubscription(request, context, auth.account_id);
    }

    if (method === "GET" && path === "/api/billing/usage") {
        return handleGetUsage(request, context, auth.account_id);
    }

    if (method === "GET" && path === "/api/billing/plans") {
        return handleGetPlans();
    }

    if (method === "GET" && path === "/api/billing/config") {
        return handleGetBillingConfig();
    }

    if (method === "POST" && path === "/api/billing/checkout") {
        return handleCreateCheckout(request, context, auth.account_id, auth.email);
    }

    if (method === "POST" && path === "/api/billing/portal") {
        return handleCreatePortal(request, context, auth.account_id);
    }

    if (method === "POST" && path === "/api/billing/cancel") {
        return handleCancelSubscription(auth.account_id);
    }

    if (method === "POST" && path === "/api/billing/resume") {
        return handleResumeSubscription(auth.account_id);
    }

    if (method === "GET" && path === "/api/billing/invoices") {
        return handleGetInvoices(auth.account_id);
    }

    // Stripe webhook (no auth, verified by signature)
    if (method === "POST" && path === "/api/webhooks/stripe") {
        return handleStripeWebhookRoute(request);
    }

    return errorResponse(404, "NOT_FOUND", "Route not found");
}
