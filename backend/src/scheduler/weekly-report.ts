/**
 * Weekly Report Scheduler
 *
 * Sends weekly thread health reports every Monday at 9:00 AM.
 * Reports include open threads, closed threads, and silence alerts.
 */

import { getEventStore } from "../events/store";
import { replayEvents, getOpenThreads } from "../watcher/runtime";
import { queryMany } from "../db/client";
import { sendWeeklyReportEmail } from "../delivery/notifications";
import type { WeeklyReportData, ThreadSummary } from "../delivery/templates";
import { computeSilenceDuration } from "../watcher/silence-tracker";
import { logger } from "../logger";

// ============================================================================
// Configuration
// ============================================================================

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
const REPORT_DAY = 1; // Monday (0 = Sunday, 1 = Monday, etc.)
const REPORT_HOUR = 9; // 9 AM

let schedulerInterval: Timer | null = null;
let lastReportWeek: number | null = null;

// ============================================================================
// Scheduler Lifecycle
// ============================================================================

export function startWeeklyReportScheduler(): void {
    if (schedulerInterval) {
        logger.warn("Weekly report scheduler already running");
        return;
    }

    logger.info("Starting weekly report scheduler", {
        checkIntervalMs: CHECK_INTERVAL_MS,
        reportDay: REPORT_DAY,
        reportHour: REPORT_HOUR,
    });

    // Check immediately
    checkAndSendReports().catch((err) =>
        logger.error("Weekly report check failed", { error: err })
    );

    // Then check on interval
    schedulerInterval = setInterval(() => {
        checkAndSendReports().catch((err) =>
            logger.error("Weekly report check failed", { error: err })
        );
    }, CHECK_INTERVAL_MS);
}

export function stopWeeklyReportScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info("Weekly report scheduler stopped");
    }
}

// ============================================================================
// Report Logic
// ============================================================================

function getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor(diff / oneWeek);
}

async function checkAndSendReports(): Promise<void> {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    // Check if it's time to send reports (Monday at 9 AM)
    if (currentDay !== REPORT_DAY || currentHour !== REPORT_HOUR) {
        return;
    }

    // Avoid sending duplicate reports in the same week
    if (lastReportWeek === currentWeek) {
        return;
    }

    logger.info("Sending weekly reports");
    lastReportWeek = currentWeek;

    await sendAllWeeklyReports();
}

async function sendAllWeeklyReports(): Promise<void> {
    // Get all active watchers with email notification channels
    const watchers = await queryMany<{
        watcher_id: string;
        name: string;
        account_id: string;
        policy: {
            notification_channels: Array<{
                type: string;
                destination: string;
                enabled: boolean;
            }>;
        };
    }>(
        `SELECT watcher_id, name, account_id, policy
         FROM watcher_projections
         WHERE status = 'active' AND deleted_at IS NULL`
    );

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const watcher of watchers) {
        try {
            // Find email channels for weekly reports
            const emailChannels =
                watcher.policy?.notification_channels?.filter(
                    (c) => c.type === "email" && c.enabled
                ) ?? [];

            if (emailChannels.length === 0) {
                continue;
            }

            // Build report data
            const reportData = await buildReportData(
                watcher.watcher_id,
                watcher.name,
                oneWeekAgo,
                now
            );

            // Send to each email channel
            for (const channel of emailChannels) {
                const success = await sendWeeklyReportEmail(
                    channel.destination,
                    reportData
                );

                if (success) {
                    logger.info("Weekly report sent", {
                        watcherId: watcher.watcher_id,
                        destination: channel.destination,
                    });
                } else {
                    logger.error("Failed to send weekly report", {
                        watcherId: watcher.watcher_id,
                        destination: channel.destination,
                    });
                }
            }
        } catch (error) {
            logger.error("Failed to generate weekly report", {
                watcherId: watcher.watcher_id,
                error,
            });
        }
    }
}

async function buildReportData(
    watcherId: string,
    watcherName: string,
    periodStart: number,
    periodEnd: number
): Promise<WeeklyReportData> {
    const eventStore = getEventStore();
    const events = await eventStore.getEventsForWatcher(watcherId);
    const state = replayEvents(events);

    // Count events in the period
    const periodEvents = events.filter(
        (e) => e.timestamp >= periodStart && e.timestamp <= periodEnd
    );

    const emailsProcessed = periodEvents.filter(
        (e) => e.type === "EMAIL_RECEIVED"
    ).length;

    const silenceAlerts = periodEvents.filter(
        (e) => e.type === "SILENCE_THRESHOLD_EXCEEDED"
    ).length;

    const threadsClosedThisWeek = periodEvents.filter(
        (e) => e.type === "THREAD_CLOSED"
    ).length;

    // Get open threads
    const openThreads = getOpenThreads(state);
    const openThreadSummaries: ThreadSummary[] = openThreads.map((thread) => ({
        threadId: thread.thread_id,
        subject: thread.normalized_subject || "(no subject)",
        originalSender: thread.original_sender,
        status: "open" as const,
        hoursSilent: computeSilenceDuration(thread.last_activity_at, periodEnd),
        messageCount: thread.message_ids.length,
        openedAt: thread.opened_at,
    }));

    // Sort by silence (most silent first)
    openThreadSummaries.sort((a, b) => b.hoursSilent - a.hoursSilent);

    // Get recently closed threads
    const closedThreads = Array.from(state.threads.values())
        .filter(
            (t) =>
                t.status === "closed" &&
                t.closed_at &&
                t.closed_at >= periodStart
        )
        .map((thread) => ({
            threadId: thread.thread_id,
            subject: thread.normalized_subject || "(no subject)",
            originalSender: thread.original_sender,
            status: "closed" as const,
            hoursSilent: 0,
            messageCount: thread.message_ids.length,
            openedAt: thread.opened_at,
            closedAt: thread.closed_at ?? undefined,
        }));

    const dashboardUrl = `${process.env.FRONTEND_URL ?? "https://app.vigil.run"}/watchers/${watcherId}`;

    return {
        watcherName,
        watcherId,
        periodStart,
        periodEnd,
        stats: {
            totalThreads: state.threads.size,
            openThreads: openThreads.length,
            closedThreads: threadsClosedThisWeek,
            silenceAlertsTriggered: silenceAlerts,
            emailsProcessed,
        },
        openThreads: openThreadSummaries.slice(0, 10), // Top 10
        recentlyClosed: closedThreads.slice(0, 5), // Top 5
        dashboardUrl,
    };
}

// ============================================================================
// Manual Trigger (for testing)
// ============================================================================

export async function triggerWeeklyReports(): Promise<void> {
    await sendAllWeeklyReports();
}
