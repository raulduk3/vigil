/**
 * Subscription Management Service
 *
 * Manages account subscriptions, plan changes, and billing state.
 * Integrates with Stripe for payment processing.
 */

import { query, queryOne } from "@/db/client";
import {
    type SubscriptionPlan,
    type Subscription,
    type StripeSubscriptionStatus,
    PLAN_CONFIGS,
    isValidPlan,
    isValidUpgrade,
} from "./types";

// ============================================================================
// Subscription Queries
// ============================================================================

/**
 * Get subscription for an account.
 */
export async function getSubscription(
    accountId: string
): Promise<Subscription | null> {
    const now = Date.now();
    const defaultPeriodEnd = now + 30 * 24 * 60 * 60 * 1000;
    const parseTimestamp = (
        value: string | number | null | undefined,
        fallback: number
    ): number => {
        const numeric = typeof value === "number" ? value : Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
    };

    const result = await queryOne<{
        account_id: string;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        plan: string;
        subscription_status: string;
        current_period_start: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        created_at: Date;
        updated_at: Date;
    }>(
        `SELECT account_id, stripe_customer_id, stripe_subscription_id, 
                plan, subscription_status, current_period_start, 
                current_period_end, cancel_at_period_end, created_at, updated_at
            FROM accounts WHERE account_id = $1`,
        [accountId]
    );

    if (!result) {
        return null;
    }

    return {
        subscription_id: accountId, // Use account_id as subscription_id for simplicity
        account_id: result.account_id,
        stripe_subscription_id: result.stripe_subscription_id,
        stripe_customer_id: result.stripe_customer_id,
        plan: (result.plan as SubscriptionPlan) || "free",
        status:
            (result.subscription_status as StripeSubscriptionStatus | "free") ||
            "free",
        current_period_start: parseTimestamp(
            result.current_period_start,
            now
        ),
        current_period_end: parseTimestamp(
            result.current_period_end,
            defaultPeriodEnd
        ),
        cancel_at_period_end: result.cancel_at_period_end || false,
        canceled_at: null,
        created_at: result.created_at.getTime(),
        updated_at: result.updated_at?.getTime() || Date.now(),
    };
}

/**
 * Get account plan.
 */
export async function getAccountPlan(
    accountId: string
): Promise<SubscriptionPlan> {
    const result = await queryOne<{ plan: string }>(
        `SELECT plan FROM accounts WHERE account_id = $1`,
        [accountId]
    );

    if (!result || !isValidPlan(result.plan)) {
        return "free";
    }

    return result.plan;
}

/**
 * Update account plan (internal use, for Stripe webhooks).
 */
export async function updateAccountPlan(
    accountId: string,
    plan: SubscriptionPlan,
    stripeData?: {
        stripe_customer_id?: string;
        stripe_subscription_id?: string;
        subscription_status?: StripeSubscriptionStatus;
        current_period_start?: number;
        current_period_end?: number;
        cancel_at_period_end?: boolean;
    }
): Promise<void> {
    const updates: string[] = ["plan = $2", "updated_at = NOW()"];
    const params: unknown[] = [accountId, plan];
    let paramIndex = 3;

    if (stripeData?.stripe_customer_id !== undefined) {
        updates.push(`stripe_customer_id = $${paramIndex++}`);
        params.push(stripeData.stripe_customer_id);
    }

    if (stripeData?.stripe_subscription_id !== undefined) {
        updates.push(`stripe_subscription_id = $${paramIndex++}`);
        params.push(stripeData.stripe_subscription_id);
    }

    if (stripeData?.subscription_status !== undefined) {
        updates.push(`subscription_status = $${paramIndex++}`);
        params.push(stripeData.subscription_status);
    }

    if (stripeData?.current_period_start !== undefined) {
        updates.push(`current_period_start = $${paramIndex++}`);
        params.push(stripeData.current_period_start);
    }

    if (stripeData?.current_period_end !== undefined) {
        updates.push(`current_period_end = $${paramIndex++}`);
        params.push(stripeData.current_period_end);
    }

    if (stripeData?.cancel_at_period_end !== undefined) {
        updates.push(`cancel_at_period_end = $${paramIndex++}`);
        params.push(stripeData.cancel_at_period_end);
    }

    await query(
        `UPDATE accounts SET ${updates.join(", ")} WHERE account_id = $1`,
        params
    );
}

/**
 * Store Stripe customer ID for an account.
 */
export async function setStripeCustomerId(
    accountId: string,
    stripeCustomerId: string
): Promise<void> {
    await query(
        `UPDATE accounts 
            SET stripe_customer_id = $2, updated_at = NOW() 
            WHERE account_id = $1`,
        [accountId, stripeCustomerId]
    );
}

/**
 * Get account by Stripe customer ID.
 */
export async function getAccountByStripeCustomerId(
    stripeCustomerId: string
): Promise<string | null> {
    const result = await queryOne<{ account_id: string }>(
        `SELECT account_id FROM accounts WHERE stripe_customer_id = $1`,
        [stripeCustomerId]
    );

    return result?.account_id || null;
}

/**
 * Check if a Stripe event has already been processed (for idempotency).
 */
export async function isStripeEventProcessed(
    eventId: string
): Promise<boolean> {
    const result = await queryOne<{ event_id: string }>(
        `SELECT event_id FROM stripe_events WHERE event_id = $1`,
        [eventId]
    );

    return result !== null;
}

/**
 * Mark a Stripe event as processed.
 */
export async function markStripeEventProcessed(
    eventId: string,
    eventType: string,
    accountId: string | null,
    payload: Record<string, unknown>
): Promise<void> {
    await query(
        `INSERT INTO stripe_events (event_id, event_type, account_id, payload, processed_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (event_id) DO NOTHING`,
        [eventId, eventType, accountId, JSON.stringify(payload)]
    );
}

// ============================================================================
// Plan Upgrade/Downgrade Logic
// ============================================================================

/**
 * Result of a plan change request.
 */
export interface PlanChangeResult {
    success: boolean;
    requires_payment: boolean;
    checkout_url?: string;
    error?: string;
}

/**
 * Initiate a plan upgrade.
 * Returns checkout URL if payment is required.
 */
export async function initiatePlanUpgrade(
    accountId: string,
    targetPlan: SubscriptionPlan
): Promise<PlanChangeResult> {
    const currentPlan = await getAccountPlan(accountId);

    // Validate upgrade
    if (!isValidUpgrade(currentPlan, targetPlan)) {
        return {
            success: false,
            requires_payment: false,
            error: `Cannot upgrade from ${currentPlan} to ${targetPlan}`,
        };
    }

    // Enterprise requires sales contact
    if (targetPlan === "enterprise") {
        return {
            success: false,
            requires_payment: false,
            error: "Enterprise plans require contacting sales",
        };
    }

    const targetConfig = PLAN_CONFIGS[targetPlan];

    // If no Stripe price ID configured, allow direct upgrade (dev mode)
    if (!targetConfig.stripe_price_id) {
        const periodStart = Date.now();
        const periodEnd = periodStart + 30 * 24 * 60 * 60 * 1000;
        await updateAccountPlan(accountId, targetPlan, {
            current_period_start: periodStart,
            current_period_end: periodEnd,
            subscription_status: "active",
        });
        return {
            success: true,
            requires_payment: false,
        };
    }

    // Payment required - return indicator for frontend to initiate Stripe checkout
    return {
        success: true,
        requires_payment: true,
        // checkout_url will be generated by the Stripe handler
    };
}

/**
 * Handle plan downgrade (at period end).
 */
export async function initiatePlanDowngrade(
    accountId: string,
    targetPlan: SubscriptionPlan
): Promise<PlanChangeResult> {
    const subscription = await getSubscription(accountId);

    if (!subscription) {
        return {
            success: false,
            requires_payment: false,
            error: "Subscription not found",
        };
    }

    // Can only downgrade to free from paid plans
    if (targetPlan !== "free") {
        return {
            success: false,
            requires_payment: false,
            error: "Can only downgrade to free plan",
        };
    }

    // If already on free, no action needed
    if (subscription.plan === "free") {
        return {
            success: true,
            requires_payment: false,
        };
    }

    // Mark for cancellation at period end via Stripe
    // The actual downgrade happens when Stripe sends the webhook
    return {
        success: true,
        requires_payment: false,
        // Stripe cancellation should be triggered separately
    };
}

// ============================================================================
// Subscription Status Helpers
// ============================================================================

/**
 * Check if subscription is active (can use paid features).
 */
export function isSubscriptionActive(
    status: StripeSubscriptionStatus | "free"
): boolean {
    return status === "active" || status === "trialing" || status === "free";
}

/**
 * Check if subscription needs attention (payment issues).
 */
export function subscriptionNeedsAttention(
    status: StripeSubscriptionStatus | "free"
): boolean {
    return (
        status === "past_due" || status === "unpaid" || status === "incomplete"
    );
}

/**
 * Get effective plan based on subscription status.
 * Returns "free" if subscription is not active.
 */
export async function getEffectivePlan(
    accountId: string
): Promise<SubscriptionPlan> {
    const subscription = await getSubscription(accountId);

    if (!subscription) {
        return "free";
    }

    // If subscription is not active, treat as free
    if (!isSubscriptionActive(subscription.status)) {
        return "free";
    }

    return subscription.plan;
}
