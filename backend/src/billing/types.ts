/**
 * Billing and Subscription Types
 *
 * Defines subscription tiers, usage limits, and billing-related types.
 * Prepared for Stripe integration.
 */

// ============================================================================
// Subscription Tiers
// ============================================================================

/**
 * Subscription plan tiers.
 *
 * - free: Basic tier, limited emails
 * - starter: Entry paid tier
 * - pro: Professional tier
 * - enterprise: Unlimited, not sold on dashboard (sales-only)
 */
export type SubscriptionPlan = "free" | "starter" | "pro" | "enterprise";

/**
 * Plan limits configuration.
 * All limits are per billing period (weekly).
 */
export interface PlanLimits {
    /** Maximum emails processed per week (-1 for unlimited) */
    emails_per_week: number;
    /** Maximum number of watchers allowed (-1 for unlimited) */
    max_watchers: number;
    /** Maximum notification channels per watcher */
    max_notification_channels: number;
    /** Whether advanced reporting is enabled */
    advanced_reporting: boolean;
    /** Whether webhook notifications are enabled */
    webhook_notifications: boolean;
    /** Whether SMS notifications are enabled */
    sms_notifications: boolean;
    /** Support level */
    support_level: "community" | "email" | "priority" | "dedicated";
}

/**
 * Plan configuration with metadata.
 */
export interface PlanConfig {
    plan: SubscriptionPlan;
    display_name: string;
    description: string;
    limits: PlanLimits;
    /** Stripe price ID for this plan (null for free tier) */
    stripe_price_id: string | null;
    /** Whether this plan is visible on the dashboard */
    visible_on_dashboard: boolean;
    /** Monthly price in cents (USD) */
    price_cents_monthly: number;
}

/**
 * Plan limits by tier.
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
    free: {
        emails_per_week: 50,
        max_watchers: 2,
        max_notification_channels: 2,
        advanced_reporting: false,
        webhook_notifications: false,
        sms_notifications: false,
        support_level: "community",
    },
    starter: {
        emails_per_week: 200,
        max_watchers: 5,
        max_notification_channels: 5,
        advanced_reporting: false,
        webhook_notifications: true,
        sms_notifications: false,
        support_level: "email",
    },
    pro: {
        emails_per_week: 1000,
        max_watchers: 20,
        max_notification_channels: 10,
        advanced_reporting: true,
        webhook_notifications: true,
        sms_notifications: true,
        support_level: "priority",
    },
    enterprise: {
        emails_per_week: -1, // Unlimited
        max_watchers: -1, // Unlimited
        max_notification_channels: -1, // Unlimited
        advanced_reporting: true,
        webhook_notifications: true,
        sms_notifications: true,
        support_level: "dedicated",
    },
};

/**
 * Full plan configurations with metadata.
 */
export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
    free: {
        plan: "free",
        display_name: "Free",
        description: "Get started with basic email monitoring",
        limits: PLAN_LIMITS.free,
        stripe_price_id: null,
        visible_on_dashboard: true,
        price_cents_monthly: 0,
    },
    starter: {
        plan: "starter",
        display_name: "Starter",
        description: "For individuals and small teams",
        limits: PLAN_LIMITS.starter,
        stripe_price_id: process.env.STRIPE_STARTER_PRICE_ID || null,
        visible_on_dashboard: true,
        price_cents_monthly: 999, // $9.99/month
    },
    pro: {
        plan: "pro",
        display_name: "Professional",
        description: "For professionals and growing teams",
        limits: PLAN_LIMITS.pro,
        stripe_price_id: process.env.STRIPE_PRO_PRICE_ID || null,
        visible_on_dashboard: true,
        price_cents_monthly: 2999, // $29.99/month
    },
    enterprise: {
        plan: "enterprise",
        display_name: "Enterprise",
        description: "Unlimited usage for large organizations",
        limits: PLAN_LIMITS.enterprise,
        stripe_price_id: process.env.STRIPE_ENTERPRISE_PRICE_ID || null,
        visible_on_dashboard: false,
        price_cents_monthly: 10000, // $100/month
    },
};

// ============================================================================
// Usage Tracking
// ============================================================================

/**
 * Usage period for tracking (weekly).
 */
export interface UsagePeriod {
    /** Start of the period (Monday 00:00:00 UTC) */
    period_start: number;
    /** End of the period (Sunday 23:59:59 UTC) */
    period_end: number;
}

/**
 * Account usage for a billing period.
 */
export interface AccountUsage {
    account_id: string;
    period_start: number;
    period_end: number;
    emails_processed: number;
    emails_limit: number;
    watchers_count: number;
    watchers_limit: number;
    created_at: number;
    updated_at: number;
}

/**
 * Usage check result.
 */
export interface UsageCheckResult {
    allowed: boolean;
    current_usage: number;
    limit: number;
    remaining: number;
    period_ends_at: number;
    /** If not allowed, the reason */
    denial_reason?: "LIMIT_EXCEEDED" | "ACCOUNT_SUSPENDED" | "PLAN_INACTIVE";
}

// ============================================================================
// Stripe Integration Types
// ============================================================================

/**
 * Stripe subscription status.
 */
export type StripeSubscriptionStatus =
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "trialing"
    | "incomplete"
    | "incomplete_expired";

/**
 * Subscription record stored in database.
 */
export interface Subscription {
    subscription_id: string;
    account_id: string;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    plan: SubscriptionPlan;
    status: StripeSubscriptionStatus | "free";
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
    canceled_at: number | null;
    created_at: number;
    updated_at: number;
}

/**
 * Stripe webhook event payload (simplified).
 */
export interface StripeWebhookPayload {
    id: string;
    type: string;
    data: {
        object: Record<string, unknown>;
    };
    created: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the plan limits for a subscription plan.
 */
export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
    return PLAN_LIMITS[plan];
}

/**
 * Get the full plan configuration.
 */
export function getPlanConfig(plan: SubscriptionPlan): PlanConfig {
    return PLAN_CONFIGS[plan];
}

/**
 * Check if a plan has unlimited emails.
 */
export function hasUnlimitedEmails(plan: SubscriptionPlan): boolean {
    return PLAN_LIMITS[plan].emails_per_week === -1;
}

/**
 * Get the current usage period (Monday to Sunday, UTC).
 */
export function getCurrentUsagePeriod(): UsagePeriod {
    const now = new Date();

    // Get current day of week (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = now.getUTCDay();

    // Calculate days since Monday (Monday = 0)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Calculate Monday 00:00:00 UTC
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
    monday.setUTCHours(0, 0, 0, 0);

    // Calculate Sunday 23:59:59.999 UTC
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    return {
        period_start: monday.getTime(),
        period_end: sunday.getTime(),
    };
}

/**
 * Get the usage period containing a specific timestamp.
 */
export function getUsagePeriodForTimestamp(timestamp: number): UsagePeriod {
    const date = new Date(timestamp);

    // Get current day of week (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = date.getUTCDay();

    // Calculate days since Monday (Monday = 0)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Calculate Monday 00:00:00 UTC
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - daysSinceMonday);
    monday.setUTCHours(0, 0, 0, 0);

    // Calculate Sunday 23:59:59.999 UTC
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    return {
        period_start: monday.getTime(),
        period_end: sunday.getTime(),
    };
}

/**
 * Check if a timestamp is within a usage period.
 */
export function isWithinPeriod(
    timestamp: number,
    period: UsagePeriod
): boolean {
    return timestamp >= period.period_start && timestamp <= period.period_end;
}

/**
 * Validate that a plan string is a valid SubscriptionPlan.
 */
export function isValidPlan(plan: string): plan is SubscriptionPlan {
    return ["free", "starter", "pro", "enterprise"].includes(plan);
}

/**
 * Get plans that can be upgraded to from the current plan.
 */
export function getUpgradeOptions(
    currentPlan: SubscriptionPlan
): SubscriptionPlan[] {
    const planOrder: SubscriptionPlan[] = [
        "free",
        "starter",
        "pro",
        "enterprise",
    ];
    const currentIndex = planOrder.indexOf(currentPlan);

    // Return plans above current, excluding enterprise (sales-only)
    return planOrder
        .slice(currentIndex + 1)
        .filter((plan) => PLAN_CONFIGS[plan].visible_on_dashboard);
}

/**
 * Check if a plan upgrade is valid.
 */
export function isValidUpgrade(
    from: SubscriptionPlan,
    to: SubscriptionPlan
): boolean {
    const planOrder: SubscriptionPlan[] = [
        "free",
        "starter",
        "pro",
        "enterprise",
    ];
    const fromIndex = planOrder.indexOf(from);
    const toIndex = planOrder.indexOf(to);

    return toIndex > fromIndex;
}
