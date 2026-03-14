/**
 * Billing Handlers — Metered pay-per-use
 */

import type { Context } from "hono";
import {
    createCustomer,
    createCheckoutSession,
    getCustomerPortalUrl,
    verifyWebhookSignature,
    isStripeConfigured,
} from "../../billing/stripe";
import { getUsageSummary } from "../../billing/usage";
import { FREE_TRIAL_EMAILS } from "../../billing/types";
import { queryOne, run } from "../../db/client";
import { logger } from "../../logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://vigil.run";

export const billingHandlers = {
    /** GET /api/billing — billing status + current month cost */
    async getBilling(c: Context) {
        const user = c.get("user");
        const summary = await getUsageSummary(user.account_id);

        return c.json({
            billing: {
                has_payment_method: summary.has_payment_method,
                stripe_configured: isStripeConfigured(),
                trial_emails_used: summary.trial_emails_used,
                trial_emails_remaining: summary.trial_emails_remaining,
                trial_emails_total: FREE_TRIAL_EMAILS,
                current_month_cost: summary.current_month_cost,
                stripe_customer_id: summary.stripe_customer_id,
                stripe_subscription_id: summary.stripe_subscription_id,
            },
        });
    },

    /** POST /api/billing/setup — create customer + Stripe Checkout session */
    async setup(c: Context) {
        if (!isStripeConfigured()) {
            return c.json({ error: "Billing not configured" }, 503);
        }

        const user = c.get("user");

        // Get or create Stripe customer
        let stripeCustomerId = queryOne<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM accounts WHERE id = ?`,
            [user.account_id]
        )?.stripe_customer_id;

        if (!stripeCustomerId) {
            try {
                stripeCustomerId = await createCustomer(user.email);
                run(
                    `UPDATE accounts SET stripe_customer_id = ? WHERE id = ?`,
                    [stripeCustomerId, user.account_id]
                );
                logger.info("Created Stripe customer", { accountId: user.account_id, customerId: stripeCustomerId });
            } catch (err) {
                logger.error("Failed to create Stripe customer", { err });
                return c.json({ error: "Failed to initialize billing" }, 500);
            }
        }

        const successUrl = `${APP_URL}/account/billing?setup=success`;
        const cancelUrl = `${APP_URL}/account/billing?setup=canceled`;

        try {
            const checkoutUrl = await createCheckoutSession(
                stripeCustomerId,
                successUrl,
                cancelUrl
            );
            return c.json({ checkout_url: checkoutUrl });
        } catch (err) {
            logger.error("Failed to create Stripe Checkout session", { err });
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
    },

    /** POST /api/billing/portal — get Stripe billing portal URL */
    async portal(c: Context) {
        if (!isStripeConfigured()) {
            return c.json({ error: "Billing not configured" }, 503);
        }

        const user = c.get("user");
        const account = queryOne<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM accounts WHERE id = ?`,
            [user.account_id]
        );

        if (!account?.stripe_customer_id) {
            return c.json({ error: "No billing account found. Set up billing first." }, 400);
        }

        const returnUrl = `${APP_URL}/account/billing`;

        try {
            const portalUrl = await getCustomerPortalUrl(
                account.stripe_customer_id,
                returnUrl
            );
            return c.json({ portal_url: portalUrl });
        } catch (err) {
            logger.error("Failed to create billing portal session", { err });
            return c.json({ error: "Failed to create portal session" }, 500);
        }
    },

    /** POST /api/billing/webhook — Stripe webhook (public, no auth) */
    async stripeWebhook(c: Context) {
        const signature = c.req.header("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!signature) {
            return c.json({ error: "Missing stripe-signature header" }, 400);
        }

        const payload = await c.req.text();

        // Verify signature if webhook secret is configured
        if (webhookSecret) {
            const valid = await verifyWebhookSignature(payload, signature, webhookSecret);
            if (!valid) {
                logger.warn("Stripe webhook signature verification failed");
                return c.json({ error: "Invalid signature" }, 400);
            }
        }

        let event: { type: string; data: { object: any } };
        try {
            event = JSON.parse(payload);
        } catch {
            return c.json({ error: "Invalid JSON" }, 400);
        }

        logger.info("Stripe webhook received", { type: event.type });

        const obj = event.data.object;

        switch (event.type) {
            case "checkout.session.completed": {
                // User completed checkout — store subscription ID and mark has_payment_method
                const customerId = obj.customer as string;
                const subscriptionId = obj.subscription as string | null;

                if (customerId) {
                    run(
                        `UPDATE accounts
                         SET has_payment_method = TRUE,
                             stripe_subscription_id = COALESCE(?, stripe_subscription_id)
                         WHERE stripe_customer_id = ?`,
                        [subscriptionId ?? null, customerId]
                    );
                    logger.info("Billing activated", { customerId, subscriptionId });
                }
                break;
            }

            case "customer.subscription.updated": {
                const customerId = obj.customer as string;
                const status = obj.status as string;
                const subscriptionId = obj.id as string;

                if (customerId) {
                    const isPaused = status === "past_due" || status === "canceled" || status === "unpaid";
                    run(
                        `UPDATE accounts
                         SET has_payment_method = ?,
                             stripe_subscription_id = ?
                         WHERE stripe_customer_id = ?`,
                        [isPaused ? 0 : 1, subscriptionId, customerId]
                    );
                    logger.info("Subscription updated", { customerId, status });
                }
                break;
            }

            case "customer.subscription.deleted": {
                const customerId = obj.customer as string;
                if (customerId) {
                    run(
                        `UPDATE accounts
                         SET has_payment_method = FALSE, stripe_subscription_id = NULL
                         WHERE stripe_customer_id = ?`,
                        [customerId]
                    );
                    logger.info("Subscription deleted, billing paused", { customerId });
                }
                break;
            }

            case "invoice.payment_failed": {
                const customerId = obj.customer as string;
                logger.warn("Invoice payment failed — account may be suspended soon", { customerId });
                break;
            }

            case "invoice.payment_succeeded": {
                const customerId = obj.customer as string;
                if (customerId) {
                    run(
                        `UPDATE accounts SET has_payment_method = TRUE WHERE stripe_customer_id = ?`,
                        [customerId]
                    );
                }
                break;
            }
        }

        return c.json({ received: true });
    },
};
