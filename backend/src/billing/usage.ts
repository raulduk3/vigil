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
 * Also increments account-level usage tracking (survives watcher deletion).
 * Silently skips Stripe if not configured or account has no payment method.
 */
export async function reportInvocationCost(
    accountId: string,
    costUsd: number
): Promise<void> {
    if (costUsd <= 0) return;

    // Always update account-level usage (independent of Stripe)
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"
    run(
        `UPDATE accounts SET
            usage_month_cost = CASE WHEN usage_month = ? THEN usage_month_cost + ? ELSE ? END,
            usage_month = ?
         WHERE id = ?`,
        [currentMonth, costUsd, costUsd, currentMonth, accountId]
    );

    if (!isStripeConfigured()) return;

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
        openai_api_key_enc: string | null;
        anthropic_api_key_enc: string | null;
        google_api_key_enc: string | null;
    }>(
        `SELECT has_payment_method, trial_emails_used, openai_api_key_enc, anthropic_api_key_enc, google_api_key_enc FROM accounts WHERE id = ?`,
        [accountId]
    );

    if (!account) return false;
    if (account.has_payment_method) return true;
    // BYOK users bypass trial — they pay their own API costs
    if (account.openai_api_key_enc || account.anthropic_api_key_enc || account.google_api_key_enc) return true;
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
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

    const account = queryOne<{
        has_payment_method: number;
        trial_emails_used: number;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        usage_month: string | null;
        usage_month_cost: number | null;
    }>(
        `SELECT has_payment_method, trial_emails_used, stripe_customer_id, stripe_subscription_id,
                usage_month, usage_month_cost
         FROM accounts WHERE id = ?`,
        [accountId]
    );

    // Account-level usage is the source of truth (survives watcher deletion/flush).
    // If the account month matches, use it. Otherwise it's a new month = $0.
    let currentMonthCost = 0;
    if (account?.usage_month === currentMonth && account?.usage_month_cost) {
        currentMonthCost = account.usage_month_cost;
    }

    // Fallback: if account-level tracking hasn't kicked in yet (pre-migration data),
    // derive from actions table across ALL watchers (including deleted ones).
    if (currentMonthCost === 0) {
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);

        // Query ALL watchers for this account, including deleted ones
        const watchers = queryMany<{ id: string }>(
            `SELECT id FROM watchers WHERE account_id = ?`,
            [accountId]
        );

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
