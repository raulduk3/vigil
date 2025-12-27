/**
 * Stripe Integration
 *
 * Handles Stripe checkout, billing portal, and webhook events.
 * Uses the official Stripe SDK for all operations.
 */

import Stripe from "stripe";
import { type SubscriptionPlan, type StripeSubscriptionStatus } from "./types";
import {
    updateAccountPlan,
    getAccountByStripeCustomerId,
    isStripeEventProcessed,
    markStripeEventProcessed,
    setStripeCustomerId,
    getAccountPlan,
    getSubscription,
} from "./subscription";
import { queryOne } from "@/db/client";

// ============================================================================
// Configuration
// ============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Initialize Stripe client
const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2025-12-15.clover",
          typescript: true,
      })
    : null;

// Price ID to plan mapping
const PRICE_TO_PLAN: Record<string, SubscriptionPlan> = {
    [process.env.STRIPE_STARTER_PRICE_ID || ""]: "starter",
    [process.env.STRIPE_PRO_PRICE_ID || ""]: "pro",
    [process.env.STRIPE_ENTERPRISE_PRICE_ID || ""]: "enterprise",
};

// Plan to price ID mapping
const PLAN_TO_PRICE: Record<SubscriptionPlan, string | null> = {
    free: null,
    starter: process.env.STRIPE_STARTER_PRICE_ID || null,
    pro: process.env.STRIPE_PRO_PRICE_ID || null,
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || null,
};

// ============================================================================
// Types
// ============================================================================

export interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: Record<string, unknown>;
    };
    created: number;
}

export interface WebhookResult {
    success: boolean;
    message: string;
    event_id?: string;
}

export interface CreateCheckoutParams {
    accountId: string;
    userEmail: string;
    userName?: string;
    plan: SubscriptionPlan;
    successUrl: string;
    cancelUrl: string;
}

export interface CheckoutResult {
    success: boolean;
    checkout_url?: string;
    session_id?: string;
    error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStripe(): Stripe {
    if (!stripe) {
        throw new Error("Stripe not configured. Set STRIPE_SECRET_KEY.");
    }
    return stripe;
}

/**
 * Get or create a Stripe customer for an account.
 * Stores rich metadata for invoices.
 */
async function getOrCreateCustomer(
    accountId: string,
    email: string,
    name?: string
): Promise<string> {
    // Check if we already have a customer ID
    const existing = await queryOne<{ stripe_customer_id: string | null }>(
        `SELECT stripe_customer_id FROM accounts WHERE account_id = $1`,
        [accountId]
    );

    if (existing?.stripe_customer_id) {
        // Update customer metadata if needed
        const s = getStripe();
        await s.customers.update(existing.stripe_customer_id, {
            email,
            name: name || undefined,
            metadata: {
                vigil_account_id: accountId,
                updated_at: new Date().toISOString(),
            },
        });
        return existing.stripe_customer_id;
    }

    // Create new customer with metadata
    const s = getStripe();
    const customer = await s.customers.create({
        email,
        name: name || undefined,
        metadata: {
            vigil_account_id: accountId,
            created_at: new Date().toISOString(),
        },
    });

    // Store customer ID in our database
    await setStripeCustomerId(accountId, customer.id);

    return customer.id;
}

// ============================================================================
// Checkout Session
// ============================================================================

/**
 * Create a Stripe checkout session for subscription.
 * Pre-fills customer info and stores metadata.
 */
export async function createCheckoutSession(
    params: CreateCheckoutParams
): Promise<CheckoutResult> {
    const { accountId, userEmail, userName, plan, successUrl, cancelUrl } =
        params;

    console.log("[Stripe] Creating checkout session:", {
        accountId,
        userEmail,
        plan,
        successUrl: successUrl.substring(0, 50) + "...",
    });

    const priceId = PLAN_TO_PRICE[plan];
    if (!priceId) {
        console.error("[Stripe] No price ID for plan:", plan);
        return {
            success: false,
            error: `No price ID configured for plan: ${plan}`,
        };
    }

    console.log("[Stripe] Using price ID:", priceId);

    try {
        const s = getStripe();

        // Get or create customer
        console.log("[Stripe] Getting or creating customer...");
        const customerId = await getOrCreateCustomer(
            accountId,
            userEmail,
            userName
        );
        console.log("[Stripe] Customer ID:", customerId);

        // Check if customer already has an active subscription
        const existingSubscriptions = await s.subscriptions.list({
            customer: customerId,
            status: "active",
            limit: 1,
        });

        if (existingSubscriptions.data.length > 0) {
            // Customer already has a subscription, redirect to billing portal instead
            return {
                success: false,
                error: "You already have an active subscription. Use the billing portal to manage it.",
            };
        }

        // Create checkout session
        const session = await s.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: accountId,
            subscription_data: {
                metadata: {
                    vigil_account_id: accountId,
                    plan: plan,
                },
            },
            metadata: {
                vigil_account_id: accountId,
                plan: plan,
            },
            // Enable automatic tax calculation if configured
            // automatic_tax: { enabled: true },
            // Allow promotion codes
            allow_promotion_codes: true,
            // Billing address collection
            billing_address_collection: "auto",
            // Customer update settings
            customer_update: {
                address: "auto",
                name: "auto",
            },
        });

        return {
            success: true,
            checkout_url: session.url || undefined,
            session_id: session.id,
        };
    } catch (error) {
        console.error("[Stripe] Checkout session creation failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to create checkout session";
        console.error("[Stripe] Error message:", errorMessage);
        return {
            success: false,
            error: errorMessage,
        };
    }
}

// ============================================================================
// Billing Portal
// ============================================================================

/**
 * Create a Stripe billing portal session for subscription management.
 */
export async function createBillingPortalSession(
    accountId: string,
    returnUrl: string
): Promise<{ success: boolean; portal_url?: string; error?: string }> {
    try {
        const subscription = await getSubscription(accountId);

        if (!subscription?.stripe_customer_id) {
            return {
                success: false,
                error: "No billing account found. Please subscribe to a plan first.",
            };
        }

        const s = getStripe();
        const session = await s.billingPortal.sessions.create({
            customer: subscription.stripe_customer_id,
            return_url: returnUrl,
        });

        return {
            success: true,
            portal_url: session.url,
        };
    } catch (error) {
        console.error(
            "[Stripe] Billing portal session creation failed:",
            error
        );
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to create billing portal session",
        };
    }
}

// ============================================================================
// Invoice Management
// ============================================================================

export interface InvoiceData {
    id: string;
    number: string | null;
    status: string | null;
    amount_due: number;
    amount_paid: number;
    currency: string;
    created: number;
    period_start: number;
    period_end: number;
    hosted_invoice_url: string | null;
    invoice_pdf: string | null;
}

/**
 * Get invoices for an account.
 */
export async function getInvoices(
    accountId: string,
    limit: number = 10
): Promise<{ success: boolean; invoices?: InvoiceData[]; error?: string }> {
    try {
        const subscription = await getSubscription(accountId);

        if (!subscription?.stripe_customer_id) {
            return {
                success: true,
                invoices: [], // No customer yet, no invoices
            };
        }

        const s = getStripe();
        const invoices = await s.invoices.list({
            customer: subscription.stripe_customer_id,
            limit,
        });

        return {
            success: true,
            invoices: invoices.data.map((inv) => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                amount_due: inv.amount_due,
                amount_paid: inv.amount_paid,
                currency: inv.currency,
                created: inv.created,
                period_start: inv.period_start,
                period_end: inv.period_end,
                hosted_invoice_url: inv.hosted_invoice_url ?? null,
                invoice_pdf: inv.invoice_pdf ?? null,
            })),
        };
    } catch (error) {
        console.error("[Stripe] Failed to fetch invoices:", error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to fetch invoices",
        };
    }
}

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Cancel a subscription at period end.
 */
export async function cancelSubscription(
    accountId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const subscription = await getSubscription(accountId);

        if (!subscription?.stripe_subscription_id) {
            return {
                success: false,
                error: "No active subscription found",
            };
        }

        const s = getStripe();
        await s.subscriptions.update(subscription.stripe_subscription_id, {
            cancel_at_period_end: true,
        });

        // Update our database
        await updateAccountPlan(accountId, subscription.plan, {
            cancel_at_period_end: true,
        });

        return { success: true };
    } catch (error) {
        console.error("[Stripe] Subscription cancellation failed:", error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to cancel subscription",
        };
    }
}

/**
 * Resume a canceled subscription (before period end).
 */
export async function resumeSubscription(
    accountId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const subscription = await getSubscription(accountId);

        if (!subscription?.stripe_subscription_id) {
            return {
                success: false,
                error: "No subscription found",
            };
        }

        const s = getStripe();
        await s.subscriptions.update(subscription.stripe_subscription_id, {
            cancel_at_period_end: false,
        });

        // Update our database
        await updateAccountPlan(accountId, subscription.plan, {
            cancel_at_period_end: false,
        });

        return { success: true };
    } catch (error) {
        console.error("[Stripe] Subscription resume failed:", error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to resume subscription",
        };
    }
}

/**
 * Change subscription plan (upgrade/downgrade).
 */
export async function changeSubscriptionPlan(
    accountId: string,
    newPlan: SubscriptionPlan
): Promise<{ success: boolean; error?: string }> {
    const newPriceId = PLAN_TO_PRICE[newPlan];

    if (!newPriceId) {
        return {
            success: false,
            error: `Invalid plan: ${newPlan}`,
        };
    }

    try {
        const subscription = await getSubscription(accountId);

        if (!subscription?.stripe_subscription_id) {
            return {
                success: false,
                error: "No active subscription found. Please subscribe first.",
            };
        }

        const s = getStripe();

        // Get current subscription to find subscription item ID
        const stripeSubscription = await s.subscriptions.retrieve(
            subscription.stripe_subscription_id
        );

        const subscriptionItemId = stripeSubscription.items.data[0]?.id;
        if (!subscriptionItemId) {
            return {
                success: false,
                error: "Could not find subscription item",
            };
        }

        // Update subscription with new price
        await s.subscriptions.update(subscription.stripe_subscription_id, {
            items: [
                {
                    id: subscriptionItemId,
                    price: newPriceId,
                },
            ],
            metadata: {
                vigil_account_id: accountId,
                plan: newPlan,
            },
            proration_behavior: "create_prorations",
        });

        return { success: true };
    } catch (error) {
        console.error("[Stripe] Plan change failed:", error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to change plan",
        };
    }
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

/**
 * Verify Stripe webhook signature using the SDK.
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string
): Stripe.Event | null {
    if (!STRIPE_WEBHOOK_SECRET) {
        console.warn(
            "[Stripe] Webhook signature verification skipped (no secret configured)"
        );
        // In development, parse without verification
        try {
            return JSON.parse(payload) as Stripe.Event;
        } catch {
            return null;
        }
    }

    try {
        const s = getStripe();
        return s.webhooks.constructEvent(
            payload,
            signature,
            STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error("[Stripe] Webhook signature verification failed:", error);
        return null;
    }
}

// ============================================================================
// Webhook Event Handlers
// ============================================================================

/**
 * Handle checkout.session.completed event.
 */
async function handleCheckoutCompleted(
    event: Stripe.Event
): Promise<WebhookResult> {
    const session = event.data.object as Stripe.Checkout.Session;

    const accountId =
        session.client_reference_id ||
        (session.metadata?.vigil_account_id as string);
    const customerId = session.customer as string;

    if (!accountId) {
        return {
            success: false,
            message: "No account ID in checkout session",
        };
    }

    // Link Stripe customer to account
    await setStripeCustomerId(accountId, customerId);

    console.log(
        `[Stripe] Checkout completed for account ${accountId}, customer ${customerId}`
    );

    return {
        success: true,
        message: `Checkout completed for account ${accountId}`,
    };
}

/**
 * Handle customer.subscription.created event.
 */
async function handleSubscriptionCreated(
    event: Stripe.Event
): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const accountId =
        (subscription.metadata?.vigil_account_id as string) ||
        (await getAccountByStripeCustomerId(customerId));

    if (!accountId) {
        return {
            success: false,
            message: `No account found for customer ${customerId}`,
        };
    }

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId ? PRICE_TO_PLAN[priceId] : undefined;

    if (!plan) {
        return {
            success: false,
            message: `Unknown price ID: ${priceId}`,
        };
    }

    // Update account with subscription details
    // Get period from the first item (they all share the same period)
    // Cast to access period fields which exist at runtime
    const subData = subscription as unknown as {
        current_period_start?: number;
        current_period_end?: number;
    };
    const firstItem = subscription.items.data[0];
    const periodStart = subData.current_period_start ?? firstItem?.current_period_start;
    const periodEnd = subData.current_period_end ?? firstItem?.current_period_end;

    await updateAccountPlan(accountId, plan, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status as StripeSubscriptionStatus,
        current_period_start: periodStart ? periodStart * 1000 : undefined,
        current_period_end: periodEnd ? periodEnd * 1000 : undefined,
        cancel_at_period_end: subscription.cancel_at_period_end,
    });

    console.log(
        `[Stripe] Subscription created: account=${accountId}, plan=${plan}`
    );

    return {
        success: true,
        message: `Subscription created for account ${accountId}, plan: ${plan}`,
    };
}

/**
 * Handle customer.subscription.updated event.
 */
async function handleSubscriptionUpdated(
    event: Stripe.Event
): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const accountId =
        (subscription.metadata?.vigil_account_id as string) ||
        (await getAccountByStripeCustomerId(customerId));

    if (!accountId) {
        return {
            success: false,
            message: `No account found for customer ${customerId}`,
        };
    }

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId ? PRICE_TO_PLAN[priceId] : undefined;

    if (!plan) {
        return {
            success: false,
            message: `Unknown price ID: ${priceId}`,
        };
    }

    // Update account with new subscription details
    // Cast to access period fields which exist at runtime
    const subData = subscription as unknown as {
        current_period_start?: number;
        current_period_end?: number;
    };
    const firstItem = subscription.items.data[0];
    const periodStart = subData.current_period_start ?? firstItem?.current_period_start;
    const periodEnd = subData.current_period_end ?? firstItem?.current_period_end;

    await updateAccountPlan(accountId, plan, {
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status as StripeSubscriptionStatus,
        current_period_start: periodStart ? periodStart * 1000 : undefined,
        current_period_end: periodEnd ? periodEnd * 1000 : undefined,
        cancel_at_period_end: subscription.cancel_at_period_end,
    });

    console.log(
        `[Stripe] Subscription updated: account=${accountId}, plan=${plan}, status=${subscription.status}`
    );

    return {
        success: true,
        message: `Subscription updated for account ${accountId}`,
    };
}

/**
 * Handle customer.subscription.deleted event.
 */
async function handleSubscriptionDeleted(
    event: Stripe.Event
): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const accountId =
        (subscription.metadata?.vigil_account_id as string) ||
        (await getAccountByStripeCustomerId(customerId));

    if (!accountId) {
        return {
            success: false,
            message: `No account found for customer ${customerId}`,
        };
    }

    // Downgrade to free plan with proper period values
    const now = Date.now();
    const periodEnd = now + 30 * 24 * 60 * 60 * 1000; // 30 days from now
    await updateAccountPlan(accountId, "free", {
        stripe_subscription_id: undefined,
        subscription_status: "canceled",
        cancel_at_period_end: false,
        current_period_start: now,
        current_period_end: periodEnd,
    });

    console.log(`[Stripe] Subscription deleted: account=${accountId}`);

    return {
        success: true,
        message: `Subscription deleted for account ${accountId}, downgraded to free`,
    };
}

/**
 * Handle invoice.paid event.
 */
async function handleInvoicePaid(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;

    const accountId = await getAccountByStripeCustomerId(customerId);

    if (!accountId) {
        return {
            success: false,
            message: `No account found for customer ${customerId}`,
        };
    }

    console.log(
        `[Stripe] Invoice paid: account=${accountId}, amount=${invoice.amount_paid}`
    );

    return {
        success: true,
        message: `Invoice paid for account ${accountId}`,
    };
}

/**
 * Handle invoice.payment_failed event.
 */
async function handlePaymentFailed(
    event: Stripe.Event
): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;

    const accountId = await getAccountByStripeCustomerId(customerId);

    if (!accountId) {
        return {
            success: false,
            message: `No account found for customer ${customerId}`,
        };
    }

    // Update subscription status to past_due
    const currentPlan = await getAccountPlan(accountId);
    await updateAccountPlan(accountId, currentPlan, {
        subscription_status: "past_due",
    });

    console.log(`[Stripe] Payment failed: account=${accountId}`);

    // TODO: Send notification to user about payment failure

    return {
        success: true,
        message: `Payment failed for account ${accountId}`,
    };
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

/**
 * Process a Stripe webhook event.
 * Implements idempotent processing.
 */
export async function handleStripeWebhook(
    payload: string,
    signature: string
): Promise<WebhookResult> {
    // Verify signature and parse event
    const event = verifyWebhookSignature(payload, signature);

    if (!event) {
        return {
            success: false,
            message: "Invalid webhook signature or payload",
        };
    }

    // Check idempotency
    if (await isStripeEventProcessed(event.id)) {
        return {
            success: true,
            message: "Event already processed",
            event_id: event.id,
        };
    }

    // Route to handler
    let result: WebhookResult;

    switch (event.type) {
        case "checkout.session.completed":
            result = await handleCheckoutCompleted(event);
            break;

        case "customer.subscription.created":
            result = await handleSubscriptionCreated(event);
            break;

        case "customer.subscription.updated":
            result = await handleSubscriptionUpdated(event);
            break;

        case "customer.subscription.deleted":
            result = await handleSubscriptionDeleted(event);
            break;

        case "invoice.paid":
            result = await handleInvoicePaid(event);
            break;

        case "invoice.payment_failed":
            result = await handlePaymentFailed(event);
            break;

        default:
            // Acknowledge but don't process unknown events
            result = {
                success: true,
                message: `Unhandled event type: ${event.type}`,
            };
    }

    // Mark event as processed (for idempotency)
    if (result.success) {
        const accountId = await extractAccountId(event);
        await markStripeEventProcessed(
            event.id,
            event.type,
            accountId,
            event.data.object as unknown as Record<string, unknown>
        );
    }

    return {
        ...result,
        event_id: event.id,
    };
}

/**
 * Extract account ID from Stripe event.
 */
async function extractAccountId(event: Stripe.Event): Promise<string | null> {
    const obj = event.data.object as unknown as Record<string, unknown>;

    // Try client_reference_id (checkout sessions)
    if (typeof obj.client_reference_id === "string") {
        return obj.client_reference_id;
    }

    // Try metadata
    if (
        obj.metadata &&
        typeof (obj.metadata as Record<string, string>).vigil_account_id ===
            "string"
    ) {
        return (obj.metadata as Record<string, string>).vigil_account_id ?? null;
    }

    // Try customer lookup
    const customerId = obj.customer as string | undefined;
    if (customerId) {
        const accountId = await getAccountByStripeCustomerId(customerId);
        return accountId ?? null;
    }

    return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Stripe is configured and ready.
 */
export function isStripeConfigured(): boolean {
    return !!stripe;
}

/**
 * Get Stripe publishable key (for frontend).
 */
export function getPublishableKey(): string | null {
    return process.env.STRIPE_PUBLISHABLE_KEY || null;
}
