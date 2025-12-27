/**
 * Scheduler Worker
 *
 * Implements MR-Scheduler-1: TIME_TICK Generation
 * Implements MR-Scheduler-2: Report Scheduling
 *
 * The scheduler runs as a background task within the control plane,
 * emitting TIME_TICK events to trigger urgency evaluation.
 */

import { randomUUID } from "crypto";
import type { VigilEvent, TimeTickEvent } from "@/events/types";
import { getActiveWatcherIds, appendEvent } from "@/db/event-store";
import { shouldGenerateReport } from "@/scheduler/scheduler";
import type { WatcherPolicy } from "@/events/types";
import { getLogger } from "@/logging";

// ============================================================================
// Types
// ============================================================================

export interface SchedulerWorkerConfig {
    tick_interval_ms: number; // How often to check for tick generation
    max_ticks_per_cycle: number; // Rate limiting
    enabled: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerWorkerConfig = {
    tick_interval_ms: 60000, // 1 minute
    max_ticks_per_cycle: 100,
    enabled: true,
};

interface SchedulerState {
    running: boolean;
    last_tick_time: number;
    ticks_emitted: number;
    errors: number;
    interval_handle: Timer | null;
}

// ============================================================================
// Scheduler Worker
// ============================================================================

const state: SchedulerState = {
    running: false,
    last_tick_time: 0,
    ticks_emitted: 0,
    errors: 0,
    interval_handle: null,
};

/**
 * Start the scheduler worker.
 */
export function startScheduler(
    config: Partial<SchedulerWorkerConfig> = {}
): void {
    const log = getLogger();
    const fullConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };

    if (state.running) {
        log.scheduler.warn("Scheduler already running");
        return;
    }

    if (!fullConfig.enabled) {
        log.scheduler.info("Scheduler disabled by configuration");
        return;
    }

    log.scheduler.info(
        "Scheduler starting",
        {},
        {
            tick_interval_ms: fullConfig.tick_interval_ms,
            max_ticks_per_cycle: fullConfig.max_ticks_per_cycle,
        }
    );

    state.running = true;
    state.interval_handle = setInterval(() => {
        runSchedulerCycle(fullConfig).catch((error) => {
            log.scheduler.error(
                "Scheduler cycle error",
                {},
                {},
                error instanceof Error ? error : new Error(String(error))
            );
            state.errors++;
        });
    }, fullConfig.tick_interval_ms);

    // Run immediately
    runSchedulerCycle(fullConfig).catch((error) => {
        log.scheduler.error(
            "Scheduler initial cycle error",
            {},
            {},
            error instanceof Error ? error : new Error(String(error))
        );
        state.errors++;
    });
}

/**
 * Stop the scheduler worker.
 */
export function stopScheduler(): void {
    const log = getLogger();

    if (!state.running) {
        return;
    }

    log.scheduler.info(
        "Scheduler stopping",
        {},
        {
            ticks_emitted: state.ticks_emitted,
            errors: state.errors,
        }
    );

    if (state.interval_handle) {
        clearInterval(state.interval_handle);
        state.interval_handle = null;
    }

    state.running = false;
}

/**
 * Get scheduler health status.
 */
export function getSchedulerHealth(): {
    status: "healthy" | "degraded" | "unhealthy";
    running: boolean;
    last_tick: number;
    ticks_emitted: number;
    errors: number;
} {
    const now = Date.now();
    const tickAge = now - state.last_tick_time;

    // Consider unhealthy if no tick in 5 minutes
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (!state.running) {
        status = "unhealthy";
    } else if (tickAge > 300000) {
        status = "degraded";
    }

    return {
        status,
        running: state.running,
        last_tick: state.last_tick_time,
        ticks_emitted: state.ticks_emitted,
        errors: state.errors,
    };
}

// ============================================================================
// Scheduler Cycle
// ============================================================================

/**
 * Run a single scheduler cycle.
 * Queries active watchers and emits TIME_TICK events.
 */
async function runSchedulerCycle(config: SchedulerWorkerConfig): Promise<void> {
    const log = getLogger();
    const now = Date.now();

    try {
        // Get active watcher IDs
        const watcherIds = await getActiveWatcherIds();

        if (watcherIds.length === 0) {
            log.scheduler.debug("No active watchers to process");
            return;
        }

        // Rate limit ticks per cycle
        const watchersToProcess = watcherIds.slice(
            0,
            config.max_ticks_per_cycle
        );

        log.scheduler.debug(
            "Processing scheduler cycle",
            {},
            {
                total_watchers: watcherIds.length,
                processing: watchersToProcess.length,
                rate_limited: watcherIds.length > config.max_ticks_per_cycle,
            }
        );

        // Emit TIME_TICK for each watcher
        for (const watcherId of watchersToProcess) {
            await emitTimeTick(watcherId, now);
            state.ticks_emitted++;
        }

        state.last_tick_time = now;

        log.scheduler.debug(
            "Scheduler cycle complete",
            {},
            {
                ticks_emitted: watchersToProcess.length,
                total_ticks: state.ticks_emitted,
            }
        );
    } catch (error) {
        log.scheduler.error(
            "Scheduler cycle failed",
            {},
            {
                cycle_timestamp: now,
            },
            error instanceof Error ? error : new Error(String(error))
        );
        state.errors++;
        throw error;
    }
}

/**
 * Emit a TIME_TICK event for a watcher.
 */
async function emitTimeTick(
    watcherId: string,
    timestamp: number
): Promise<void> {
    const log = getLogger();
    const eventId = randomUUID();

    const event: TimeTickEvent = {
        event_id: eventId,
        timestamp,
        watcher_id: watcherId,
        type: "TIME_TICK",
        tick_timestamp: timestamp,
    };

    await appendEvent(event as VigilEvent);

    log.scheduler.debug(
        "TIME_TICK emitted",
        { watcher_id: watcherId },
        {
            event_id: eventId,
            tick_timestamp: timestamp,
        }
    );
}

// ============================================================================
// Report Scheduling
// ============================================================================

interface ReportScheduleState {
    last_check: number;
    pending_reports: Map<string, number>; // watcher_id -> next_report_time
}

const reportState: ReportScheduleState = {
    last_check: 0,
    pending_reports: new Map(),
};

/**
 * Check and schedule pending reports.
 * Called as part of scheduler cycle.
 */
export async function checkReportSchedules(
    watcherPolicies: Map<string, WatcherPolicy>,
    lastReportTimes: Map<string, number>,
    now: number = Date.now()
): Promise<string[]> {
    const reportsToGenerate: string[] = [];

    for (const [watcherId, policy] of watcherPolicies) {
        const lastReport = lastReportTimes.get(watcherId) ?? null;
        const result = shouldGenerateReport(policy, now, lastReport);
        if (result.shouldGenerate) {
            reportsToGenerate.push(watcherId);
        }
    }

    reportState.last_check = now;
    return reportsToGenerate;
}

// ============================================================================
// Manual Tick Trigger
// ============================================================================

/**
 * Manually trigger a TIME_TICK for a specific watcher.
 * Used for testing or immediate evaluation.
 */
export async function triggerManualTick(watcherId: string): Promise<void> {
    const log = getLogger();
    await emitTimeTick(watcherId, Date.now());
    log.scheduler.info("Manual tick triggered", { watcher_id: watcherId });
}

/**
 * Trigger TIME_TICK for all active watchers immediately.
 * Used for testing or system recovery.
 */
export async function triggerAllTicks(): Promise<number> {
    const log = getLogger();
    const now = Date.now();
    const watcherIds = await getActiveWatcherIds();

    for (const watcherId of watcherIds) {
        await emitTimeTick(watcherId, now);
    }

    log.scheduler.info(
        "Batch ticks triggered",
        {},
        {
            watcher_count: watcherIds.length,
            timestamp: now,
        }
    );
    return watcherIds.length;
}
