/**
 * Vigil Backend Entry Point — V2
 *
 * Agent-based email monitoring.
 * SQLite storage, Anthropic Claude for reasoning.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";

import { createRouter } from "./api/router";
import { initializeDatabase } from "./db/client";
import { logger } from "./logger";
import { invokeAgent } from "./agent/engine";
import { queryMany, queryOne, run } from "./db/client";
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

// Body size limit (2MB max — covers large emails with headroom)
app.use("*", bodyLimit({ maxSize: 2 * 1024 * 1024 }));

// Security headers
app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "1; mode=block");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

app.route("/api", createRouter());

// Mirror ingestion route at top level (Cloudflare worker hits /ingest/:token directly)
import { ingestionHandlers } from "./api/handlers/ingestion";
import { ingestRateLimit } from "./auth/rate-limit";
app.post("/ingest/:token", ingestRateLimit, ingestionHandlers.ingestByToken);

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
        // Billing gate: skip ticks for accounts with exhausted trial and no payment/BYOK
        const account = queryOne<{
            has_payment_method: number;
            trial_emails_used: number;
            openai_api_key_enc: string | null;
            anthropic_api_key_enc: string | null;
            google_api_key_enc: string | null;
        }>(
            `SELECT has_payment_method, trial_emails_used, openai_api_key_enc, anthropic_api_key_enc, google_api_key_enc
             FROM accounts WHERE id = ?`,
            [watcher.account_id]
        );
        const hasBilling = account?.has_payment_method ||
            account?.openai_api_key_enc || account?.anthropic_api_key_enc || account?.google_api_key_enc;
        const trialActive = (account?.trial_emails_used ?? 0) < 50;

        if (!hasBilling && !trialActive) {
            logger.debug("Tick skipped: no billing", { watcherId: watcher.id, accountId: watcher.account_id });
            continue;
        }

        const lastTickMs = watcher.last_tick_at
            ? new Date(watcher.last_tick_at).getTime()
            : 0;
        const msSinceLastTick = now - lastTickMs;
        const intervalMs = watcher.tick_interval * 60 * 1000;

        if (msSinceLastTick >= intervalMs) {
            // Smart tick: skip LLM call if nothing changed since last tick
            const lastTickIso = watcher.last_tick_at ?? "1970-01-01T00:00:00Z";
            const hasNewEmails = queryOne<{ count: number }>(
                `SELECT COUNT(*) as count FROM emails WHERE watcher_id = ? AND created_at > ?`,
                [watcher.id, lastTickIso]
            );
            const hasThreadUpdates = queryOne<{ count: number }>(
                `SELECT COUNT(*) as count FROM threads WHERE watcher_id = ? AND last_activity > ? AND status IN ('active', 'watching')`,
                [watcher.id, lastTickIso]
            );

            const newEmails = hasNewEmails?.count ?? 0;
            const updatedThreads = hasThreadUpdates?.count ?? 0;

            if (newEmails === 0 && updatedThreads === 0) {
                // Nothing changed — update last_tick_at but skip the LLM call
                run(`UPDATE watchers SET last_tick_at = CURRENT_TIMESTAMP WHERE id = ?`, [watcher.id]);
                logger.debug("Smart tick: skipped (no changes)", { watcherId: watcher.id });
                continue;
            }

            logger.debug("Running scheduled tick", { watcherId: watcher.id, newEmails, updatedThreads });
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

function startDigestRunner(): void {
    // Check every hour if any digests need sending
    const DIGEST_CHECK_MS = 60 * 60 * 1000;

    setInterval(async () => {
        try {
            await runDigests();
        } catch (err) {
            logger.error("Digest runner error", { err });
        }
    }, DIGEST_CHECK_MS);

    // Also run once on startup after a short delay (catch missed digests from downtime)
    setTimeout(async () => {
        try {
            await runDigests();
        } catch (err) {
            logger.error("Digest startup check error", { err });
        }
    }, 30_000);

    logger.info("Digest runner started (daily + weekly)");
}

async function runDigests(): Promise<void> {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay(); // 0 = Sunday

    // Digests send at 14:00 UTC (9am CDT / 8am CST)
    if (utcHour !== 14) return;

    const watchers = queryMany<WatcherRow>(
        `SELECT * FROM watchers WHERE status = 'active'`,
        []
    );

    for (const watcher of watchers) {
        const freq = (watcher as any).digest_frequency ?? "weekly";

        // Skip watchers with digests turned off
        if (freq === "off") continue;

        // Weekly: only on Sundays
        if (freq === "weekly" && utcDay !== 0) continue;

        // Check for recent digest to prevent duplicates
        const dedupeHours = freq === "daily" ? 20 : 144; // 20h for daily, 6 days for weekly
        const recentDigest = queryOne<{ id: string }>(
            `SELECT id FROM actions WHERE watcher_id = ? AND trigger_type = 'digest' AND created_at >= datetime('now', '-${dedupeHours} hours')`,
            [watcher.id]
        );
        if (recentDigest) continue;

        const periodDays = freq === "daily" ? 1 : 7;
        logger.info("Sending digest", { watcherId: watcher.id, frequency: freq, periodDays });

        sendDigest(watcher.id, periodDays).catch(
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
    startDigestRunner();

    // Cleanup expired/revoked refresh tokens every hour
    setInterval(() => {
        try {
            run(`DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked = TRUE`);
        } catch (err) {
            logger.error("Refresh token cleanup error", { err });
        }
    }, 60 * 60 * 1000);

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
