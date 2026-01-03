/**
 * Authentication Middleware
 *
 * JWT verification for protected routes.
 */

import type { Context, Next } from "hono";
import { verifyAccessToken, type TokenPayload } from "./jwt";

// Extend Hono context with user info
declare module "hono" {
    interface ContextVariableMap {
        user: TokenPayload;
    }
}

/**
 * Middleware that requires valid JWT authentication.
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
