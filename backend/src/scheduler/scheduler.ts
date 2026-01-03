/**
 * Background Scheduler
 *
 * Emits TIME_TICK events every 15 minutes for silence tracking.
 * Single leader pattern - only one instance should run scheduler.
 */

import { getEventStore } from "../events/store";
import { replayEvents } from "../watcher/runtime";
import { processTimeTick } from "../watcher/silence-tracker";
import { queryMany } from "../db/client";
import { logger } from "../logger";
import type {
    TimeTickEvent,
    AlertQueuedEvent,
    VigilEvent,
} from "../events/types";

// ============================================================================
// Configuration
// ============================================================================

const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let schedulerInterval: Timer | null = null;

// ============================================================================
// Scheduler
// ============================================================================

export function startScheduler(): void {
    if (schedulerInterval) {
        logger.warn("Scheduler already running");
        return;
    }

    logger.info("Starting scheduler", { intervalMs: TICK_INTERVAL_MS });

    // Run immediately on start
    runTick().catch((err) => logger.error("Tick failed", { error: err }));

    // Then run on interval
    schedulerInterval = setInterval(() => {
        runTick().catch((err) => logger.error("Tick failed", { error: err }));
    }, TICK_INTERVAL_MS);
}

export function stopScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info("Scheduler stopped");
    }
}

// ============================================================================
// Tick Processing
// ============================================================================

async function runTick(): Promise<void> {
    const tickTimestamp = Date.now();
    logger.debug("Running tick", { timestamp: tickTimestamp });

    // Get all active watchers
    const watchers = await queryMany<{ watcher_id: string }>(
        "SELECT watcher_id FROM watcher_projections WHERE status = 'active'"
    );

    const eventStore = getEventStore();
    let totalAlerts = 0;

    for (const { watcher_id } of watchers) {
        try {
            // Load and replay events
            const events = await eventStore.getEventsForWatcher(watcher_id);
            const state = replayEvents(events);

            // Emit TIME_TICK
            const tickEvent: TimeTickEvent = {
                event_id: crypto.randomUUID(),
                timestamp: tickTimestamp,
                watcher_id,
                type: "TIME_TICK",
                tick_timestamp: tickTimestamp,
            };

            // Process tick and get silence alerts
            const result = processTimeTick(state, tickTimestamp);

            // Prepare events to emit
            const eventsToEmit: VigilEvent[] = [
                tickEvent,
                ...result.emittedEvents,
            ];

            // Create ALERT_QUEUED for each SILENCE_THRESHOLD_EXCEEDED
            for (const event of result.emittedEvents) {
                if (
                    event.type === "SILENCE_THRESHOLD_EXCEEDED" &&
                    state.policy
                ) {
                    const alertEvent: AlertQueuedEvent = {
                        event_id: crypto.randomUUID(),
                        timestamp: tickTimestamp,
                        watcher_id,
                        type: "ALERT_QUEUED",
                        alert_id: crypto.randomUUID(),
                        thread_id: event.thread_id,
                        alert_type: "silence_threshold",
                        channels: state.policy.notification_channels,
                    };
                    eventsToEmit.push(alertEvent);
                    totalAlerts++;
                }
            }

            // Persist events
            if (eventsToEmit.length > 0) {
                await eventStore.appendBatch(eventsToEmit);
            }
        } catch (error) {
            logger.error("Failed to process tick for watcher", {
                watcherId: watcher_id,
                error,
            });
        }
    }

    logger.debug("Tick complete", {
        watchersProcessed: watchers.length,
        alertsQueued: totalAlerts,
    });
}

// ============================================================================
// Manual Tick (for testing)
// ============================================================================

export async function triggerManualTick(): Promise<void> {
    await runTick();
}
