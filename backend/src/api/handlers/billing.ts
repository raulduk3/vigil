/**
 * Billing Handlers — V2 (MVP Stub)
 *
 * Stripe not active in V2 MVP. Returns safe defaults.
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
        return c.json({ subscription: subscription ?? { plan: "free", status: "free" } });
    },

    async createCheckout(c: Context) {
        const user = c.get("user");
        const body = await c.req.json();
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
            return c.json({ checkout_url: url });
        } catch (error) {
            logger.error("Checkout failed", { error });
            return c.json({ error: "Billing not configured" }, 503);
        }
    },

    async createPortal(c: Context) {
        const user = c.get("user");
        const body = await c.req.json();
        const returnUrl = body.returnUrl || body.return_url;

        if (!returnUrl) return c.json({ error: "Return URL required" }, 400);

        try {
            const url = await createPortalSession(user.account_id, returnUrl);
            return c.json({ portal_url: url });
        } catch (error) {
            logger.error("Portal failed", { error });
            return c.json({ error: "Billing not configured" }, 503);
        }
    },

    async stripeWebhook(c: Context) {
        const signature = c.req.header("stripe-signature");
        if (!signature) return c.json({ error: "Missing signature" }, 400);

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

        const account = queryOne<{ plan: PlanTier }>(
            `SELECT plan FROM accounts WHERE id = ?`,
            [user.account_id]
        );
        const plan = (account?.plan ?? "free") as PlanTier;
        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"];
        const usage = await getOrCreateUsage(user.account_id, plan);

        const watcherCount = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM watchers WHERE account_id = ? AND status != 'deleted'`,
            [user.account_id]
        );

        return c.json({
            usage: {
                current_period: {
                    start: getCurrentPeriodStart(),
                    end: getCurrentPeriodEnd(),
                },
                emails: {
                    processed: usage.emails_processed,
                    limit: limits.emails_per_week,
                    unlimited: limits.emails_per_week === -1,
                },
                watchers: {
                    count: watcherCount?.count ?? 0,
                    limit: limits.max_watchers,
                    unlimited: limits.max_watchers === -1,
                },
            },
        });
    },

    async getConfig(c: Context) {
        return c.json({
            stripe_configured: isStripeConfigured(),
            publishable_key: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
        });
    },

    async cancelSubscription(c: Context) {
        const user = c.get("user");
        try {
            await cancelSubscription(user.account_id);
            return c.json({ success: true });
        } catch (error) {
            return c.json({ error: "Billing not configured" }, 503);
        }
    },

    async resumeSubscription(c: Context) {
        const user = c.get("user");
        try {
            await resumeSubscription(user.account_id);
            return c.json({ success: true });
        } catch (error) {
            return c.json({ error: "Billing not configured" }, 503);
        }
    },

    async getInvoices(c: Context) {
        const user = c.get("user");
        try {
            const invoices = await getInvoices(user.account_id);
            return c.json({ invoices });
        } catch (error) {
            return c.json({ invoices: [] });
        }
    },
};
