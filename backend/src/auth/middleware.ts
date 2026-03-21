/**
 * Authentication Middleware
 *
 * Supports JWT and API key (vk_...) auth.
 */

import type { Context, Next } from "hono";
import { verifyAccessToken, type TokenPayload } from "./jwt";
import { lookupApiKey } from "../api/handlers/api-keys";

// Extend Hono context with user info
declare module "hono" {
    interface ContextVariableMap {
        user: TokenPayload;
    }
}

/**
 * Middleware that requires valid JWT or API key authentication.
 */
export async function requireAuth(
    c: Context,
    next: Next
): Promise<Response | void> {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.slice(7);

    // API key auth: vk_ prefix
    if (token.startsWith("vk_")) {
        const account = await lookupApiKey(token);
        if (!account) {
            return c.json({ error: "Invalid API key" }, 401);
        }
        c.set("user", {
            user_id: account.account_id,
            account_id: account.account_id,
            email: account.email,
            role: "user",
            instance_id: "",
        } as unknown as TokenPayload);
        await next();
        return;
    }

    // JWT auth
    const payload = verifyAccessToken(token);
    if (!payload) {
        return c.json({ error: "Invalid or expired token" }, 401);
    }

    c.set("user", payload);
    await next();
}

/**
 * Optional auth - sets user if valid token present, continues otherwise.
 */
export async function optionalAuth(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const payload = verifyAccessToken(token);
        if (payload) {
            c.set("user", payload);
        }
    }

    await next();
}
