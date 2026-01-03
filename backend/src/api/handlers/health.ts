/**
 * Health Check Handler
 */

import type { Context } from "hono";

export async function healthHandler(c: Context) {
    return c.json({
        status: "ok",
        timestamp: Date.now(),
        version: "3.0.0",
    });
}
