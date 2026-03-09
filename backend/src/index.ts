/**
 * Vigil Backend Entry Point — V2
 *
 * Agent-based email monitoring.
 * SQLite storage, Anthropic Claude for reasoning.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { createRouter } from "./api/router";
import { initializeDatabase } from "./db/client";
import { logger } from "./logger";
import { invokeAgent } from "./agent/engine";
import { queryMany } from "./db/client";
import type { WatcherRow } from "./agent/schema";

const app = new Hono();

const corsOrigins = process.env.CORS_ORIGINS?.split(",") ?? [
    "http://localhost:3000",
];

app.use(
    "*",
    cors({
        origin: corsOrigins,
        credentials: true,
    })
);

app.route("/api", createRouter());

// Mirror ingestion route at top level (Cloudflare worker hits /ingest/:token directly)
import { ingestionHandlers } from "./api/handlers/ingestion";
app.post("/ingest/:token", ingestionHandlers.ingestByToken);

app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// ============================================================================
// Scheduled Ticks
// ============================================================================

function startScheduledTicks(): void {
    // Run every 5 minutes. Each watcher has its own tick_interval check.
    const CHECK_INTERVAL_MS = 5 * 60 * 1000;

    setInterval(async () => {
        try {
            await runScheduledTicks();
        } catch (err) {
            logger.error("Scheduled tick error", { err });
        }
    }, CHECK_INTERVAL_MS);

    logger.info("Scheduled tick runner started", {
        checkIntervalMinutes: 5,
    });
}

async function runScheduledTicks(): Promise<void> {
    const watchers = queryMany<WatcherRow>(
        `SELECT * FROM watchers WHERE status = 'active' AND tick_interval > 0`,
        []
    );

    const now = Date.now();

    for (const watcher of watchers) {
        const lastTickMs = watcher.last_tick_at
            ? new Date(watcher.last_tick_at).getTime()
            : 0;
        const msSinceLastTick = now - lastTickMs;
        const intervalMs = watcher.tick_interval * 60 * 1000;

        if (msSinceLastTick >= intervalMs) {
            logger.debug("Running scheduled tick", { watcherId: watcher.id });
            invokeAgent(watcher.id, { type: "scheduled_tick", timestamp: now }).catch(
                (err) => logger.error("Tick invocation failed", { watcherId: watcher.id, err })
            );
        }
    }
}

// ============================================================================
// Startup
// ============================================================================

async function main() {
    const port = parseInt(process.env.PORT ?? "4000", 10);

    await initializeDatabase();
    logger.info("Database initialized");

    startScheduledTicks();

    logger.info(`Vigil V2 starting on port ${port}`);

    Bun.serve({
        port,
        fetch: app.fetch,
    });
}

main().catch((err) => {
    logger.error("Failed to start server", { error: err });
    process.exit(1);
});

export { app };
