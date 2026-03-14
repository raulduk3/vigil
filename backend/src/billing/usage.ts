/**
 * Usage Tracking — Metered billing
 *
 * Tracks per-account usage, enforces the free trial cap,
 * and reports costs to Stripe meter.
 */

import { queryOne, queryMany, run } from "../db/client";
import { reportUsage, isStripeConfigured } from "./stripe";
import { FREE_TRIAL_EMAILS } from "./types";
import { logger } from "../logger";

/**
 * Report an invocation cost to the Stripe meter.
 * Silently skips if Stripe is not configured or account has no payment method.
 */
export async function reportInvocationCost(
    accountId: string,
    costUsd: number
): Promise<void> {
    if (!isStripeConfigured() || costUsd <= 0) return;

    const account = queryOne<{
        stripe_customer_id: string | null;
        has_payment_method: number;
    }>(
        `SELECT stripe_customer_id, has_payment_method FROM accounts WHERE id = ?`,
        [accountId]
    );

    if (!account?.stripe_customer_id || !account.has_payment_method) return;

    const costCents = costUsd * 100;
    try {
        await reportUsage(account.stripe_customer_id, costCents);
        logger.info("Reported usage to Stripe", { accountId, costUsd, costCents, customerId: account.stripe_customer_id });
    } catch (err) {
        logger.error("Failed to report usage to Stripe", { accountId, costUsd, err: String(err) });
    }
}

/**
 * Check if an account can process another email.
 * Returns false only if: no payment method AND trial exhausted.
 */
export async function canProcessEmail(accountId: string): Promise<boolean> {
    const account = queryOne<{
        has_payment_method: number;
        trial_emails_used: number;
    }>(
        `SELECT has_payment_method, trial_emails_used FROM accounts WHERE id = ?`,
        [accountId]
    );

    if (!account) return false;
    if (account.has_payment_method) return true;
    return account.trial_emails_used < FREE_TRIAL_EMAILS;
}

/** Increment trial email counter for free accounts. */
export function incrementTrialUsage(accountId: string): void {
    run(
        `UPDATE accounts SET trial_emails_used = trial_emails_used + 1 WHERE id = ?`,
        [accountId]
    );
}

/** Get billing + usage summary for an account. */
export async function getUsageSummary(accountId: string): Promise<{
    current_month_cost: number;
    trial_emails_used: number;
    trial_emails_remaining: number;
    has_payment_method: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
}> {
    const account = queryOne<{
        has_payment_method: number;
        trial_emails_used: number;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
    }>(
        `SELECT has_payment_method, trial_emails_used, stripe_customer_id, stripe_subscription_id
         FROM accounts WHERE id = ?`,
        [accountId]
    );

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const watchers = queryMany<{ id: string }>(
        `SELECT id FROM watchers WHERE account_id = ? AND status != 'deleted'`,
        [accountId]
    );

    let currentMonthCost = 0;
    if (watchers.length > 0) {
        const placeholders = watchers.map(() => "?").join(",");
        const watcherIds = watchers.map((w) => w.id);
        const costResult = queryOne<{ cost: number }>(
            `SELECT COALESCE(SUM(cost_usd), 0) as cost FROM actions
             WHERE watcher_id IN (${placeholders}) AND created_at >= ?`,
            [...watcherIds, monthStart.toISOString()]
        );
        currentMonthCost = costResult?.cost ?? 0;
    }

    const trialUsed = account?.trial_emails_used ?? 0;
    return {
        current_month_cost: currentMonthCost,
        trial_emails_used: trialUsed,
        trial_emails_remaining: Math.max(0, FREE_TRIAL_EMAILS - trialUsed),
        has_payment_method: !!account?.has_payment_method,
        stripe_customer_id: account?.stripe_customer_id ?? null,
        stripe_subscription_id: account?.stripe_subscription_id ?? null,
    };
}
