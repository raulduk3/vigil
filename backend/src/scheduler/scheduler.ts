/**
 * Scheduler Module
 *
 * Generates TIME_TICK events for urgency evaluation
 * and schedules report generation.
 *
 * Per SDD requirements:
 * - MR-Scheduler-1: TIME_TICK generation
 * - MR-Scheduler-2: Report scheduling
 * - FR-15: Report Generation
 */

import type { WatcherPolicy } from "../events/types";

export type SchedulerConfig = {
    /** Interval between TIME_TICK events in milliseconds (default: 15 minutes) */
    tickIntervalMs: number;
    /** Timezone for report scheduling (default: UTC) */
    timezone: string;
};

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    tickIntervalMs: 15 * 60 * 1000, // 15 minutes
    timezone: "UTC",
};

export type TimeTickData = {
    readonly watcher_id: string;
    readonly tick_timestamp: number;
};

export type ReportScheduleResult = {
    readonly shouldGenerate: boolean;
    readonly reason: string;
    readonly nextScheduledTime: number | null;
};

/**
 * Generate TIME_TICK data for active watchers.
 * Per MR-Scheduler-1: TIME_TICK emitted for each active watcher.
 *
 * @param activeWatcherIds - List of active watcher IDs
 * @param tickTimestamp - Current timestamp for the tick
 * @returns Array of TIME_TICK data for each watcher
 */
export function generateTimeTicks(
    activeWatcherIds: readonly string[],
    tickTimestamp: number
): readonly TimeTickData[] {
    return activeWatcherIds.map((watcherId) => ({
        watcher_id: watcherId,
        tick_timestamp: tickTimestamp,
    }));
}

/**
 * Check if a report should be generated based on cadence and timing.
 * Per FR-15: Report Generation scheduling.
 *
 * @param policy - Watcher policy with reporting configuration
 * @param currentTime - Current timestamp
 * @param lastReportTime - Timestamp of last report (null if never)
 * @returns Report schedule result
 */
export function shouldGenerateReport(
    policy: WatcherPolicy,
    currentTime: number,
    lastReportTime: number | null
): ReportScheduleResult {
    if (policy.reporting_cadence === "on_demand") {
        return {
            shouldGenerate: false,
            reason: "Reporting cadence is on_demand",
            nextScheduledTime: null,
        };
    }

    const now = new Date(currentTime);
    const reportingTime = parseReportingTime(policy.reporting_time);

    switch (policy.reporting_cadence) {
        case "daily":
            return checkDailyReport(now, reportingTime, lastReportTime);
        case "weekly":
            return checkWeeklyReport(
                now,
                reportingTime,
                typeof policy.reporting_day === "string" ? policy.reporting_day : "monday",
                lastReportTime
            );
        case "monthly":
            return checkMonthlyReport(
                now,
                reportingTime,
                typeof policy.reporting_day === "number" ? policy.reporting_day : 1,
                lastReportTime
            );
        default:
            return {
                shouldGenerate: false,
                reason: `Unknown cadence: ${policy.reporting_cadence}`,
                nextScheduledTime: null,
            };
    }
}

/**
 * Parse reporting time string (e.g., "09:00:00Z" or "09:00").
 * Returns hours and minutes.
 */
export function parseReportingTime(timeStr: string | undefined): {
    hours: number;
    minutes: number;
} {
    if (!timeStr) {
        return { hours: 9, minutes: 0 }; // Default 9 AM
    }

    const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (match && match[1] && match[2]) {
        return {
            hours: parseInt(match[1], 10),
            minutes: parseInt(match[2], 10),
        };
    }

    return { hours: 9, minutes: 0 };
}

/**
 * Check if daily report should be generated.
 */
function checkDailyReport(
    now: Date,
    reportingTime: { hours: number; minutes: number },
    lastReportTime: number | null
): ReportScheduleResult {
    const todayReportTime = new Date(now);
    todayReportTime.setUTCHours(
        reportingTime.hours,
        reportingTime.minutes,
        0,
        0
    );

    // If we haven't passed today's report time, don't generate
    if (now < todayReportTime) {
        return {
            shouldGenerate: false,
            reason: "Before scheduled report time",
            nextScheduledTime: todayReportTime.getTime(),
        };
    }

    // If no previous report, generate now
    if (lastReportTime === null) {
        return {
            shouldGenerate: true,
            reason: "No previous report",
            nextScheduledTime:
                getNextDailyReportTime(todayReportTime).getTime(),
        };
    }

    // Check if we've already generated today's report
    const lastReport = new Date(lastReportTime);
    const lastReportDate = lastReport.toISOString().split("T")[0];
    const todayDate = now.toISOString().split("T")[0];

    if (lastReportDate === todayDate) {
        return {
            shouldGenerate: false,
            reason: "Report already generated today",
            nextScheduledTime:
                getNextDailyReportTime(todayReportTime).getTime(),
        };
    }

    return {
        shouldGenerate: true,
        reason: "Daily report due",
        nextScheduledTime: getNextDailyReportTime(todayReportTime).getTime(),
    };
}

/**
 * Get next daily report time (tomorrow at report time).
 */
function getNextDailyReportTime(todayReportTime: Date): Date {
    const next = new Date(todayReportTime);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

/**
 * Check if weekly report should be generated.
 */
function checkWeeklyReport(
    now: Date,
    reportingTime: { hours: number; minutes: number },
    reportingDay: string | undefined,
    lastReportTime: number | null
): ReportScheduleResult {
    const targetDay = getDayNumber(reportingDay || "monday");
    const currentDay = now.getUTCDay();

    // Convert to Monday=1, Sunday=7 format
    const normalizedCurrentDay = currentDay === 0 ? 7 : currentDay;

    // Calculate this week's report time
    const daysUntilTarget = (targetDay - normalizedCurrentDay + 7) % 7;
    const thisWeekReportTime = new Date(now);
    thisWeekReportTime.setUTCDate(now.getUTCDate() + daysUntilTarget);
    thisWeekReportTime.setUTCHours(
        reportingTime.hours,
        reportingTime.minutes,
        0,
        0
    );

    // If target day is today, check if we've passed the time
    if (daysUntilTarget === 0) {
        const todayReportTime = new Date(now);
        todayReportTime.setUTCHours(
            reportingTime.hours,
            reportingTime.minutes,
            0,
            0
        );

        if (now < todayReportTime) {
            return {
                shouldGenerate: false,
                reason: "Before scheduled report time",
                nextScheduledTime: todayReportTime.getTime(),
            };
        }

        // Check if already generated this week
        if (lastReportTime !== null) {
            const daysSinceLastReport =
                (now.getTime() - lastReportTime) / (1000 * 60 * 60 * 24);
            if (daysSinceLastReport < 1) {
                return {
                    shouldGenerate: false,
                    reason: "Report already generated today",
                    nextScheduledTime:
                        getNextWeeklyReportTime(thisWeekReportTime).getTime(),
                };
            }
        }

        return {
            shouldGenerate:
                lastReportTime === null ||
                now.getTime() - lastReportTime >= 6 * 24 * 60 * 60 * 1000,
            reason:
                lastReportTime === null
                    ? "No previous report"
                    : "Weekly report due",
            nextScheduledTime:
                getNextWeeklyReportTime(thisWeekReportTime).getTime(),
        };
    }

    return {
        shouldGenerate: false,
        reason: "Not the scheduled day",
        nextScheduledTime: thisWeekReportTime.getTime(),
    };
}

/**
 * Get next weekly report time.
 */
function getNextWeeklyReportTime(thisWeekReportTime: Date): Date {
    const next = new Date(thisWeekReportTime);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
}

/**
 * Check if monthly report should be generated.
 */
function checkMonthlyReport(
    now: Date,
    reportingTime: { hours: number; minutes: number },
    reportingDay: number,
    lastReportTime: number | null
): ReportScheduleResult {
    const currentDay = now.getUTCDate();
    
    // Calculate this month's report time
    const thisMonthReportTime = new Date(now);
    thisMonthReportTime.setUTCDate(Math.min(reportingDay, getDaysInMonth(now)));
    thisMonthReportTime.setUTCHours(reportingTime.hours, reportingTime.minutes, 0, 0);

    // If target day is today, check if we've passed the time
    if (currentDay === Math.min(reportingDay, getDaysInMonth(now))) {
        const todayReportTime = new Date(now);
        todayReportTime.setUTCHours(reportingTime.hours, reportingTime.minutes, 0, 0);

        if (now < todayReportTime) {
            return {
                shouldGenerate: false,
                reason: "Before scheduled report time",
                nextScheduledTime: todayReportTime.getTime(),
            };
        }

        // Check if already generated this month
        if (lastReportTime !== null) {
            const lastReport = new Date(lastReportTime);
            if (lastReport.getUTCMonth() === now.getUTCMonth() && 
                lastReport.getUTCFullYear() === now.getUTCFullYear()) {
                return {
                    shouldGenerate: false,
                    reason: "Report already generated this month",
                    nextScheduledTime: getNextMonthlyReportTime(thisMonthReportTime, reportingDay).getTime(),
                };
            }
        }

        return {
            shouldGenerate: true,
            reason: lastReportTime === null ? "No previous report" : "Monthly report due",
            nextScheduledTime: getNextMonthlyReportTime(thisMonthReportTime, reportingDay).getTime(),
        };
    }

    // Target day is in the future this month or next month
    if (currentDay < reportingDay) {
        return {
            shouldGenerate: false,
            reason: "Not the scheduled day",
            nextScheduledTime: thisMonthReportTime.getTime(),
        };
    }

    // Target day has passed this month
    return {
        shouldGenerate: false,
        reason: "Not the scheduled day",
        nextScheduledTime: getNextMonthlyReportTime(thisMonthReportTime, reportingDay).getTime(),
    };
}

/**
 * Get next monthly report time.
 */
function getNextMonthlyReportTime(thisMonthReportTime: Date, reportingDay: number): Date {
    const next = new Date(thisMonthReportTime);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(reportingDay, getDaysInMonth(next)));
    return next;
}

/**
 * Get number of days in a month.
 */
function getDaysInMonth(date: Date): number {
    return new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getDate();
}

/**
 * Convert day name to number (1=Monday, 7=Sunday).
 */
export function getDayNumber(day: string): number {
    const days: Record<string, number> = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 7,
    };
    return days[day.toLowerCase()] ?? 1;
}

/**
 * Calculate report summary from events.
 * Per FR-15: Report content specification.
 */
export type ReportSummary = {
    readonly threads_opened: number;
    readonly threads_closed: number;
    readonly threads_active: number;
    readonly alerts_sent: number;
    readonly messages_received: number;
};

/**
 * Calculate hours until next TIME_TICK.
 */
export function getNextTickTime(
    config: SchedulerConfig,
    currentTime: number
): number {
    const nextTick =
        Math.ceil(currentTime / config.tickIntervalMs) * config.tickIntervalMs;
    return nextTick;
}

/**
 * Validate scheduler configuration.
 */
export function validateSchedulerConfig(config: SchedulerConfig): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (config.tickIntervalMs < 60000) {
        errors.push("Tick interval must be at least 60 seconds");
    }

    if (config.tickIntervalMs > 24 * 60 * 60 * 1000) {
        errors.push("Tick interval must be less than 24 hours");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
