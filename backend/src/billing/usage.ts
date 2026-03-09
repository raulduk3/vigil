/**
 * Usage Tracking — V2 (MVP Stub)
 *
 * Usage limits not enforced in V2 MVP.
 * Stripe/billing to be added post-validation.
 */

import type { PlanTier } from "./types";

export type { PlanTier };

export interface AccountUsage {
    account_id: string;
    period_start: number;
    period_end: number;
    emails_processed: number;
    emails_limit: number;
    watchers_count: number;
    watchers_limit: number;
}

export async function getOrCreateUsage(
    accountId: string,
    _plan: PlanTier = "free"
): Promise<AccountUsage> {
    return {
        account_id: accountId,
        period_start: getCurrentPeriodStart(),
        period_end: getCurrentPeriodEnd(),
        emails_processed: 0,
        emails_limit: -1,
        watchers_count: 0,
        watchers_limit: -1,
    };
}

export async function canProcessEmail(
    _accountId: string,
    _plan: PlanTier = "free"
): Promise<boolean> {
    return true;
}

export async function canCreateWatcher(
    _accountId: string,
    _plan: PlanTier = "free"
): Promise<boolean> {
    return true;
}

export async function incrementEmailCount(_accountId: string): Promise<boolean> {
    return true;
}

export async function incrementWatcherCount(_accountId: string): Promise<void> {}

export function getCurrentPeriodStart(): number {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diff);
    monday.setUTCHours(0, 0, 0, 0);
    return monday.getTime();
}

export function getCurrentPeriodEnd(): number {
    return getCurrentPeriodStart() + 7 * 24 * 60 * 60 * 1000;
}
