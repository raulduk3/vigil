/**
 * Stripe Integration
 *
 * Subscription management and webhook handling.
 */

import Stripe from "stripe";
import { queryOne, query } from "../db/client";
import type { PlanTier } from "./types";
import { logger } from "../logger";

// ============================================================================
// Client
// ============================================================================

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
    if (!stripeClient) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error("STRIPE_SECRET_KEY environment variable required");
        }
        stripeClient = new Stripe(secretKey);
    }
    return stripeClient;
}

// ============================================================================
// Price IDs
// ============================================================================

function getPriceId(tier: PlanTier): string | null {
    switch (tier) {
        case "starter":
            return process.env.STRIPE_STARTER_PRICE_ID ?? null;
        case "pro":
            return process.env.STRIPE_PRO_PRICE_ID ?? null;
        case "enterprise":
            return process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null;
        default:
            return null;
    }
}

// ============================================================================
// Customer Management
// ============================================================================

export async function getOrCreateCustomer(
    accountId: string,
    email: string
): Promise<string> {
    // Check if customer exists
    const account = await queryOne<{ stripe_customer_id: string | null }>(
        "SELECT stripe_customer_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (account?.stripe_customer_id) {
        return account.stripe_customer_id;
    }

    // Create new customer
    const stripe = getStripe();
    const customer = await stripe.customers.create({
        email,
        metadata: { account_id: accountId },
    });

    await query(
        "UPDATE accounts SET stripe_customer_id = $1 WHERE account_id = $2",
        [customer.id, accountId]
    );

    return customer.id;
}

// ============================================================================
// Checkout Session
// ============================================================================

export async function createCheckoutSession(
    accountId: string,
    email: string,
    tier: PlanTier,
    successUrl: string,
    cancelUrl: string
): Promise<string> {
    const priceId = getPriceId(tier);
    if (!priceId) {
        throw new Error(`No price ID configured for tier: ${tier}`);
    }

    const customerId = await getOrCreateCustomer(accountId, email);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { account_id: accountId, tier },
    });

    return session.url ?? "";
}

// ============================================================================
// Customer Portal
// ============================================================================

export async function createPortalSession(
    accountId: string,
    returnUrl: string
): Promise<string> {
    const account = await queryOne<{ stripe_customer_id: string | null }>(
        "SELECT stripe_customer_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (!account?.stripe_customer_id) {
        throw new Error("No Stripe customer for account");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
        customer: account.stripe_customer_id,
        return_url: returnUrl,
    });

    return session.url;
}

// ============================================================================
// Subscription Management
// ============================================================================

export async function getSubscription(
    accountId: string
): Promise<{ tier: PlanTier; status: string } | null> {
    const account = await queryOne<{
        plan: PlanTier;
        stripe_subscription_id: string | null;
    }>(
        "SELECT plan, stripe_subscription_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (!account) {
        return null;
    }

    return {
        tier: account.plan,
        status: account.stripe_subscription_id ? "active" : "free",
    };
}

export async function updateAccountPlan(
    accountId: string,
    tier: PlanTier,
    subscriptionId: string | null
): Promise<void> {
    await query(
        `UPDATE accounts 
         SET plan = $1, stripe_subscription_id = $2, updated_at = NOW()
         WHERE account_id = $3`,
        [tier, subscriptionId, accountId]
    );
}

// ============================================================================
// Webhook Handling
// ============================================================================

export async function handleStripeWebhook(
    payload: string,
    signature: string
): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
    );

    logger.info("Processing Stripe webhook", { type: event.type });

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const accountId = session.metadata?.account_id;
            const tier = session.metadata?.tier as PlanTier;
            const subscriptionId = session.subscription as string;

            if (accountId && tier) {
                await updateAccountPlan(accountId, tier, subscriptionId);
            }
            break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            const account = await queryOne<{ account_id: string }>(
                "SELECT account_id FROM accounts WHERE stripe_customer_id = $1",
                [customerId]
            );

            if (account) {
                const isActive = subscription.status === "active";
                await updateAccountPlan(
                    account.account_id,
                    isActive ? "starter" : "free", // Simplified tier detection
                    isActive ? subscription.id : null
                );
            }
            break;
        }
    }
}

// ============================================================================
// Subscription Cancellation & Resume
// ============================================================================

export async function cancelSubscription(accountId: string): Promise<boolean> {
    const account = await queryOne<{ stripe_subscription_id: string | null }>(
        "SELECT stripe_subscription_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (!account?.stripe_subscription_id) {
        throw new Error("No active subscription");
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(account.stripe_subscription_id, {
        cancel_at_period_end: true,
    });

    return true;
}

export async function resumeSubscription(accountId: string): Promise<boolean> {
    const account = await queryOne<{ stripe_subscription_id: string | null }>(
        "SELECT stripe_subscription_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (!account?.stripe_subscription_id) {
        throw new Error("No subscription to resume");
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(account.stripe_subscription_id, {
        cancel_at_period_end: false,
    });

    return true;
}

// ============================================================================
// Invoices
// ============================================================================

export async function getInvoices(accountId: string): Promise<
    Array<{
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
    }>
> {
    const account = await queryOne<{ stripe_customer_id: string | null }>(
        "SELECT stripe_customer_id FROM accounts WHERE account_id = $1",
        [accountId]
    );

    if (!account?.stripe_customer_id) {
        return [];
    }

    const stripe = getStripe();
    const invoices = await stripe.invoices.list({
        customer: account.stripe_customer_id,
        limit: 24,
    });

    return invoices.data.map((inv) => ({
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
    }));
}

// ============================================================================
// Check if Stripe is configured
// ============================================================================

export function isStripeConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
}
