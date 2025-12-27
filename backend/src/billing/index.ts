/**
 * Billing Module
 *
 * Exports all billing-related types and functions.
 */

// Types
export {
    type SubscriptionPlan,
    type PlanLimits,
    type PlanConfig,
    type UsagePeriod,
    type AccountUsage,
    type UsageCheckResult,
    type StripeSubscriptionStatus,
    type Subscription,
    PLAN_LIMITS,
    PLAN_CONFIGS,
    getPlanLimits,
    getPlanConfig,
    hasUnlimitedEmails,
    getCurrentUsagePeriod,
    getUsagePeriodForTimestamp,
    isWithinPeriod,
    isValidPlan,
    getUpgradeOptions,
    isValidUpgrade,
} from "./types";

// Usage tracking
export {
    getOrCreateUsage,
    checkEmailUsage,
    incrementEmailUsage,
    getUsageHistory,
    checkWatcherLimit,
    updateWatcherCount,
    resetUsage,
} from "./usage";

// Subscription management
export {
    getSubscription,
    getAccountPlan,
    updateAccountPlan,
    setStripeCustomerId,
    getAccountByStripeCustomerId,
    isStripeEventProcessed,
    markStripeEventProcessed,
    initiatePlanUpgrade,
    initiatePlanDowngrade,
    isSubscriptionActive,
    subscriptionNeedsAttention,
    getEffectivePlan,
    type PlanChangeResult,
} from "./subscription";

// Stripe integration
export {
    handleStripeWebhook,
    createCheckoutSession,
    createBillingPortalSession,
    verifyWebhookSignature,
    cancelSubscription,
    resumeSubscription,
    changeSubscriptionPlan,
    isStripeConfigured,
    getPublishableKey,
    getInvoices,
    type StripeEvent,
    type WebhookResult,
    type CreateCheckoutParams,
    type CheckoutResult,
    type InvoiceData,
} from "./stripe";
