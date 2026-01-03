/**
 * Billing Types and Plan Limits
 *
 * Commercial model: 4 tiers with weekly usage limits.
 */

// ============================================================================
// Plan Types
// ============================================================================

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface PlanLimits {
    emails_per_week: number; // -1 = unlimited
    max_watchers: number; // -1 = unlimited
    max_notification_channels: number; // -1 = unlimited
    features: {
        webhooks: boolean;
        sms: boolean;
        api_access: boolean;
        priority_support: boolean;
    };
}

// ============================================================================
// Plan Configuration
// ============================================================================

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    free: {
        emails_per_week: 50,
        max_watchers: 2,
        max_notification_channels: 2,
        features: {
            webhooks: false,
            sms: false,
            api_access: false,
            priority_support: false,
        },
    },
    starter: {
        emails_per_week: 200,
        max_watchers: 5,
        max_notification_channels: 5,
        features: {
            webhooks: true,
            sms: false,
            api_access: true,
            priority_support: false,
        },
    },
    pro: {
        emails_per_week: 1000,
        max_watchers: 20,
        max_notification_channels: 10,
        features: {
            webhooks: true,
            sms: true,
            api_access: true,
            priority_support: false,
        },
    },
    enterprise: {
        emails_per_week: -1,
        max_watchers: -1,
        max_notification_channels: -1,
        features: {
            webhooks: true,
            sms: true,
            api_access: true,
            priority_support: true,
        },
    },
};

// ============================================================================
// Usage Types
// ============================================================================

export interface AccountUsage {
    account_id: string;
    period_start: number;
    period_end: number;
    emails_processed: number;
    emails_limit: number;
    watchers_count: number;
    watchers_limit: number;
}

// ============================================================================
// Helpers
// ============================================================================

export function getPlanLimits(tier: PlanTier): PlanLimits {
    return PLAN_LIMITS[tier];
}

export function isWithinLimit(current: number, limit: number): boolean {
    if (limit === -1) return true; // Unlimited
    return current < limit;
}
