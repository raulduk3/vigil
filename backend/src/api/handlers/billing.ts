/**
 * Billing Handlers
 */

import type { Context } from "hono";
import {
    getSubscription,
    createCheckoutSession,
    createPortalSession,
    handleStripeWebhook,
    cancelSubscription,
    resumeSubscription,
    getInvoices,
    isStripeConfigured,
} from "../../billing/stripe";
import {
    getOrCreateUsage,
    getCurrentPeriodStart,
    getCurrentPeriodEnd,
} from "../../billing/usage";
import { PLAN_LIMITS, type PlanTier } from "../../billing/types";
import { queryOne } from "../../db/client";
import { logger } from "../../logger";

export const billingHandlers = {
    async getSubscription(c: Context) {
        const user = c.get("user");

        const subscription = await getSubscription(user.account_id);
        if (!subscription) {
            return c.json({ subscription: { plan: "free", status: "free" } });
        }

        return c.json({ subscription });
    },

    async createCheckout(c: Context) {
        const user = c.get("user");
        const body = await c.req.json();
        // Accept both naming conventions
        const tier = body.tier || body.plan;
        const successUrl = body.successUrl || body.success_url;
        const cancelUrl = body.cancelUrl || body.cancel_url;

        if (!tier || !successUrl || !cancelUrl) {
            return c.json({ error: "Missing required fields" }, 400);
        }

        const validTiers: PlanTier[] = ["starter", "pro", "enterprise"];
        if (!validTiers.includes(tier)) {
            return c.json({ error: "Invalid tier" }, 400);
        }

        try {
            const url = await createCheckoutSession(
                user.account_id,
                user.email,
                tier,
                successUrl,
                cancelUrl
            );

            return c.json({
                checkout_url: url,
                session_id: crypto.randomUUID(),
            });
        } catch (error) {
            logger.error("Failed to create checkout session", { error });
            return c.json({ error: "Failed to create checkout session" }, 500);
        }
    },

    async createPortal(c: Context) {
        const user = c.get("user");
        const body = await c.req.json();
        // Accept both naming conventions
        const returnUrl = body.returnUrl || body.return_url;

        if (!returnUrl) {
            return c.json({ error: "Return URL required" }, 400);
        }

        try {
            const url = await createPortalSession(user.account_id, returnUrl);
            return c.json({ portal_url: url });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            logger.error("Failed to create portal session", {
                error: errorMessage,
                accountId: user.account_id,
            });

            // Check if it's because no Stripe customer exists
            if (errorMessage.includes("No Stripe customer")) {
                return c.json(
                    {
                        error: "No billing history. Subscribe to a plan first to access the billing portal.",
                    },
                    400
                );
            }

            return c.json({ error: "Failed to create portal session" }, 500);
        }
    },

    async stripeWebhook(c: Context) {
        const signature = c.req.header("stripe-signature");
        if (!signature) {
            return c.json({ error: "Missing signature" }, 400);
        }

        try {
            const payload = await c.req.text();
            await handleStripeWebhook(payload, signature);
            return c.json({ received: true });
        } catch (error) {
            logger.error("Stripe webhook failed", { error });
            return c.json({ error: "Webhook processing failed" }, 400);
        }
    },

    async getUsage(c: Context) {
        const user = c.get("user");

        // Get account plan
        const account = await queryOne<{ plan: PlanTier }>(
            "SELECT plan FROM accounts WHERE account_id = $1",
            [user.account_id]
        );
        const plan = account?.plan ?? "free";
        const limits = PLAN_LIMITS[plan];

        // Get or create usage record
        const usage = await getOrCreateUsage(user.account_id, plan);

        // Count watchers
        const watcherCount = await queryOne<{ count: string }>(
            "SELECT COUNT(*) as count FROM watcher_projections WHERE account_id = $1 AND deleted_at IS NULL",
            [user.account_id]
        );
        const watchersCount = parseInt(watcherCount?.count ?? "0", 10);

        const emailsUnlimited = limits.emails_per_week === -1;
        const watchersUnlimited = limits.max_watchers === -1;

        return c.json({
            usage: {
                current_period: {
                    start: getCurrentPeriodStart(),
                    end: getCurrentPeriodEnd(),
                },
                emails: {
                    processed: usage.emails_processed,
                    limit: limits.emails_per_week,
                    remaining: emailsUnlimited
                        ? -1
                        : Math.max(
                              0,
                              limits.emails_per_week - usage.emails_processed
                          ),
                    unlimited: emailsUnlimited,
                },
                watchers: {
                    count: watchersCount,
                    limit: limits.max_watchers,
                    remaining: watchersUnlimited
                        ? -1
                        : Math.max(0, limits.max_watchers - watchersCount),
                    unlimited: watchersUnlimited,
                },
            },
        });
    },

    async getConfig(c: Context) {
        const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
        return c.json({
            stripe_configured: isStripeConfigured(),
            publishable_key: stripeKey || null,
        });
    },

    async cancelSubscription(c: Context) {
        const user = c.get("user");

        try {
            await cancelSubscription(user.account_id);
            return c.json({ success: true });
        } catch (error) {
            logger.error("Failed to cancel subscription", {
                error,
                accountId: user.account_id,
            });
            return c.json({ error: "Failed to cancel subscription" }, 500);
        }
    },

    async resumeSubscription(c: Context) {
        const user = c.get("user");

        try {
            await resumeSubscription(user.account_id);
            return c.json({ success: true });
        } catch (error) {
            logger.error("Failed to resume subscription", {
                error,
                accountId: user.account_id,
            });
            return c.json({ error: "Failed to resume subscription" }, 500);
        }
    },

    async getInvoices(c: Context) {
        const user = c.get("user");

        try {
            const invoices = await getInvoices(user.account_id);
            return c.json({ invoices });
        } catch (error) {
            logger.error("Failed to get invoices", {
                error,
                accountId: user.account_id,
            });
            return c.json({ invoices: [] });
        }
    },
};
