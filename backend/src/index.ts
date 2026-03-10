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
import { pruneMemories } from "./agent/memory";
import { sendDigest } from "./agent/digest";
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

            // Prune obsolete low-importance memories on each tick
            pruneMemories(watcher.id).catch(
                (err) => logger.error("Memory prune failed", { watcherId: watcher.id, err })
            );
        }
    }
}

// ============================================================================
// Weekly Digest
// ============================================================================

function startWeeklyDigest(): void {
    // Check every hour if it's time for a digest (Sunday 9am in watcher's configured timezone, default UTC)
    const DIGEST_CHECK_MS = 60 * 60 * 1000;

    setInterval(async () => {
        try {
            await runWeeklyDigest();
        } catch (err) {
            logger.error("Weekly digest error", { err });
        }
    }, DIGEST_CHECK_MS);

    logger.info("Weekly digest runner started");
}

async function runWeeklyDigest(): Promise<void> {
    const now = new Date();
    // Only run on Sundays between 9:00-9:59 UTC
    if (now.getUTCDay() !== 0 || now.getUTCHours() !== 9) return;

    const watchers = queryMany<WatcherRow>(
        `SELECT * FROM watchers WHERE status = 'active'`,
        []
    );

    for (const watcher of watchers) {
        // Check if we already sent a digest this week (look for digest action in last 6 days)
        const recentDigest = queryOne<{ id: string }>(
            `SELECT id FROM actions WHERE watcher_id = ? AND trigger_type = 'weekly_digest' AND created_at >= datetime('now', '-6 days')`,
            [watcher.id]
        );
        if (recentDigest) continue;

        logger.info("Sending weekly digest", { watcherId: watcher.id });
        sendDigest(watcher.id).catch(
            (err) => logger.error("Digest send failed", { watcherId: watcher.id, err })
        );
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
    startWeeklyDigest();

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
