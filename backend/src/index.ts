/**
 * Vigil Backend Entry Point
 *
 * Event-sourced silence tracking for email threads.
 * Single capability: provable silence tracking.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { createRouter } from "./api/router";
import { initializeDatabase } from "./db/client";
import { startScheduler } from "./scheduler/scheduler";
import { startAlertWorker } from "./delivery/worker";
import { startWeeklyReportScheduler } from "./scheduler/weekly-report";
import { logger } from "./logger";

const app = new Hono();

// CORS configuration
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

// Mount API routes
app.route("/api", createRouter());

// Health check (outside /api for load balancer)
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Start server
async function main() {
    const port = parseInt(process.env.PORT ?? "4000", 10);

    // Initialize database connection
    await initializeDatabase();
    logger.info("Database initialized");

    // Start background scheduler (TIME_TICK for silence tracking)
    startScheduler();
    logger.info("Silence scheduler started");

    // Start alert delivery worker
    startAlertWorker();
    logger.info("Alert delivery worker started");

    // Start weekly report scheduler
    startWeeklyReportScheduler();
    logger.info("Weekly report scheduler started");

    logger.info(`Vigil backend starting on port ${port}`);

    Bun.serve({
        port,
        fetch: app.fetch,
    });
}

main().catch((err) => {
    logger.error("Failed to start server", { error: err });
    process.exit(1);
});

// Export for testing (not as default to avoid bun --hot auto-serve conflict)
export { app };
