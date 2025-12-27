/**
 * Usage Tracking Service
 *
 * Tracks email usage per account for billing period enforcement.
 * Implements weekly limits based on subscription tier.
 */

import { query, queryOne } from "@/db/client";
import {
    type SubscriptionPlan,
    type AccountUsage,
    type UsageCheckResult,
    getCurrentUsagePeriod,
    getPlanLimits,
    hasUnlimitedEmails,
} from "./types";

// ============================================================================
// Usage Queries
// ============================================================================

/**
 * Get or create usage record for current period.
 */
export async function getOrCreateUsage(
    accountId: string,
    plan: SubscriptionPlan
): Promise<AccountUsage> {
    const period = getCurrentUsagePeriod();
    const limits = getPlanLimits(plan);

    // Try to get existing record
    const existing = await queryOne<{
        account_id: string;
        period_start: string;
        period_end: string;
        emails_processed: number;
        emails_limit: number;
        watchers_count: number;
        watchers_limit: number;
        created_at: Date;
        updated_at: Date;
    }>(
        `SELECT * FROM account_usage 
         WHERE account_id = $1 
         AND period_start = $2`,
        [accountId, period.period_start]
    );

    if (existing) {
        return {
            account_id: existing.account_id,
            period_start: parseInt(existing.period_start),
            period_end: parseInt(existing.period_end),
            emails_processed: existing.emails_processed,
            emails_limit: existing.emails_limit,
            watchers_count: existing.watchers_count,
            watchers_limit: existing.watchers_limit,
            created_at: existing.created_at.getTime(),
            updated_at: existing.updated_at.getTime(),
        };
    }

    // Create new record for this period
    const now = Date.now();
    await query(
        `INSERT INTO account_usage (
            account_id, period_start, period_end, 
            emails_processed, emails_limit,
            watchers_count, watchers_limit,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (account_id, period_start) DO NOTHING`,
        [
            accountId,
            period.period_start,
            period.period_end,
            0,
            limits.emails_per_week,
            0,
            limits.max_watchers,
        ]
    );

    return {
        account_id: accountId,
        period_start: period.period_start,
        period_end: period.period_end,
        emails_processed: 0,
        emails_limit: limits.emails_per_week,
        watchers_count: 0,
        watchers_limit: limits.max_watchers,
        created_at: now,
        updated_at: now,
    };
}

/**
 * Check if an email can be processed based on usage limits.
 */
export async function checkEmailUsage(
    accountId: string,
    plan: SubscriptionPlan
): Promise<UsageCheckResult> {
    // Enterprise has unlimited
    if (hasUnlimitedEmails(plan)) {
        const period = getCurrentUsagePeriod();
        return {
            allowed: true,
            current_usage: 0,
            limit: -1,
            remaining: -1,
            period_ends_at: period.period_end,
        };
    }

    const usage = await getOrCreateUsage(accountId, plan);
    const remaining = usage.emails_limit - usage.emails_processed;
    const allowed = remaining > 0;

    return {
        allowed,
        current_usage: usage.emails_processed,
        limit: usage.emails_limit,
        remaining: Math.max(0, remaining),
        period_ends_at: usage.period_end,
        denial_reason: allowed ? undefined : "LIMIT_EXCEEDED",
    };
}

/**
 * Increment email usage count for an account.
 * Call this after successfully processing an email.
 */
export async function incrementEmailUsage(
    accountId: string,
    plan: SubscriptionPlan,
    count: number = 1
): Promise<AccountUsage> {
    const period = getCurrentUsagePeriod();
    const limits = getPlanLimits(plan);

    // Upsert and increment
    const result = await queryOne<{
        account_id: string;
        period_start: string;
        period_end: string;
        emails_processed: number;
        emails_limit: number;
        watchers_count: number;
        watchers_limit: number;
        created_at: Date;
        updated_at: Date;
    }>(
        `INSERT INTO account_usage (
            account_id, period_start, period_end, 
            emails_processed, emails_limit,
            watchers_count, watchers_limit,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (account_id, period_start) 
        DO UPDATE SET 
            emails_processed = account_usage.emails_processed + $4,
            updated_at = NOW()
        RETURNING *`,
        [
            accountId,
            period.period_start,
            period.period_end,
            count,
            limits.emails_per_week,
            0,
            limits.max_watchers,
        ]
    );

    if (!result) {
        throw new Error(`Failed to update usage for account ${accountId}`);
    }

    return {
        account_id: result.account_id,
        period_start: parseInt(result.period_start),
        period_end: parseInt(result.period_end),
        emails_processed: result.emails_processed,
        emails_limit: result.emails_limit,
        watchers_count: result.watchers_count,
        watchers_limit: result.watchers_limit,
        created_at: result.created_at.getTime(),
        updated_at: result.updated_at.getTime(),
    };
}

/**
 * Get usage history for an account.
 */
export async function getUsageHistory(
    accountId: string,
    periodCount: number = 12
): Promise<AccountUsage[]> {
    const results = await query<{
        account_id: string;
        period_start: string;
        period_end: string;
        emails_processed: number;
        emails_limit: number;
        watchers_count: number;
        watchers_limit: number;
        created_at: Date;
        updated_at: Date;
    }>(
        `SELECT * FROM account_usage 
         WHERE account_id = $1 
         ORDER BY period_start DESC 
         LIMIT $2`,
        [accountId, periodCount]
    );

    return results.rows.map((row) => ({
        account_id: row.account_id,
        period_start: parseInt(row.period_start),
        period_end: parseInt(row.period_end),
        emails_processed: row.emails_processed,
        emails_limit: row.emails_limit,
        watchers_count: row.watchers_count,
        watchers_limit: row.watchers_limit,
        created_at: row.created_at.getTime(),
        updated_at: row.updated_at.getTime(),
    }));
}

/**
 * Check if account can create a new watcher.
 */
export async function checkWatcherLimit(
    _accountId: string,
    plan: SubscriptionPlan,
    currentWatcherCount: number
): Promise<UsageCheckResult> {
    const limits = getPlanLimits(plan);
    const period = getCurrentUsagePeriod();

    // Unlimited watchers
    if (limits.max_watchers === -1) {
        return {
            allowed: true,
            current_usage: currentWatcherCount,
            limit: -1,
            remaining: -1,
            period_ends_at: period.period_end,
        };
    }

    const remaining = limits.max_watchers - currentWatcherCount;
    const allowed = remaining > 0;

    return {
        allowed,
        current_usage: currentWatcherCount,
        limit: limits.max_watchers,
        remaining: Math.max(0, remaining),
        period_ends_at: period.period_end,
        denial_reason: allowed ? undefined : "LIMIT_EXCEEDED",
    };
}

/**
 * Update watcher count in usage record.
 */
export async function updateWatcherCount(
    accountId: string,
    plan: SubscriptionPlan,
    watcherCount: number
): Promise<void> {
    const period = getCurrentUsagePeriod();
    const limits = getPlanLimits(plan);

    await query(
        `INSERT INTO account_usage (
            account_id, period_start, period_end, 
            emails_processed, emails_limit,
            watchers_count, watchers_limit,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (account_id, period_start) 
        DO UPDATE SET 
            watchers_count = $6,
            updated_at = NOW()`,
        [
            accountId,
            period.period_start,
            period.period_end,
            0,
            limits.emails_per_week,
            watcherCount,
            limits.max_watchers,
        ]
    );
}

/**
 * Reset usage for testing purposes.
 * DO NOT use in production.
 */
export async function resetUsage(accountIdToReset: string): Promise<void> {
    await query(`DELETE FROM account_usage WHERE account_id = $1`, [
        accountIdToReset,
    ]);
}
