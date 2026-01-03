/**
 * Usage Tracking
 *
 * Weekly billing periods for email ingestion limits.
 */

import { queryOne, query } from "../db/client";
import { PLAN_LIMITS, type PlanTier, type AccountUsage } from "./types";

// ============================================================================
// Billing Period
// ============================================================================

/**
 * Get the start of the current weekly billing period (Monday 00:00 UTC).
 */
export function getCurrentPeriodStart(): number {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1; // Days since Monday
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diff);
    monday.setUTCHours(0, 0, 0, 0);
    return monday.getTime();
}

/**
 * Get the end of the current weekly billing period.
 */
export function getCurrentPeriodEnd(): number {
    const start = getCurrentPeriodStart();
    return start + 7 * 24 * 60 * 60 * 1000; // + 7 days
}

// ============================================================================
// Usage Management
// ============================================================================

export async function getOrCreateUsage(
    accountId: string,
    plan: PlanTier
): Promise<AccountUsage> {
    const periodStart = getCurrentPeriodStart();
    const periodEnd = getCurrentPeriodEnd();
    const limits = PLAN_LIMITS[plan];

    // Try to get existing usage record
    const existing = await queryOne<AccountUsage>(
        `SELECT * FROM account_usage
         WHERE account_id = $1 AND period_start = $2`,
        [accountId, periodStart]
    );

    if (existing) {
        return existing;
    }

    // Create new usage record
    await query(
        `INSERT INTO account_usage 
         (account_id, period_start, period_end, emails_processed, emails_limit, watchers_count, watchers_limit)
         VALUES ($1, $2, $3, 0, $4, 0, $5)`,
        [
            accountId,
            periodStart,
            periodEnd,
            limits.emails_per_week,
            limits.max_watchers,
        ]
    );

    return {
        account_id: accountId,
        period_start: periodStart,
        period_end: periodEnd,
        emails_processed: 0,
        emails_limit: limits.emails_per_week,
        watchers_count: 0,
        watchers_limit: limits.max_watchers,
    };
}

export async function incrementEmailCount(accountId: string): Promise<boolean> {
    const periodStart = getCurrentPeriodStart();

    const result = await query(
        `UPDATE account_usage
         SET emails_processed = emails_processed + 1
         WHERE account_id = $1 AND period_start = $2
         AND (emails_limit = -1 OR emails_processed < emails_limit)
         RETURNING emails_processed`,
        [accountId, periodStart]
    );

    return result.rowCount !== null && result.rowCount > 0;
}

export async function canProcessEmail(
    accountId: string,
    plan: PlanTier
): Promise<boolean> {
    const usage = await getOrCreateUsage(accountId, plan);

    if (usage.emails_limit === -1) {
        return true; // Unlimited
    }

    return usage.emails_processed < usage.emails_limit;
}

export async function canCreateWatcher(
    accountId: string,
    plan: PlanTier
): Promise<boolean> {
    const usage = await getOrCreateUsage(accountId, plan);

    if (usage.watchers_limit === -1) {
        return true; // Unlimited
    }

    return usage.watchers_count < usage.watchers_limit;
}

export async function incrementWatcherCount(accountId: string): Promise<void> {
    const periodStart = getCurrentPeriodStart();

    await query(
        `UPDATE account_usage
         SET watchers_count = watchers_count + 1
         WHERE account_id = $1 AND period_start = $2`,
        [accountId, periodStart]
    );
}
