/**
 * API Router
 *
 * Main router that mounts all API routes.
 */

import { Hono } from "hono";
import { requireAuth } from "../auth/middleware";

// Import handlers
import { healthHandler } from "./handlers/health";
import { authHandlers } from "./handlers/auth";
import { watcherHandlers } from "./handlers/watchers";
import { threadHandlers } from "./handlers/threads";
import { ingestionHandlers } from "./handlers/ingestion";
import { billingHandlers } from "./handlers/billing";

export function createRouter(): Hono {
    const api = new Hono();

    // Public routes
    api.get("/health", healthHandler);

    // Auth routes (public)
    api.post("/auth/login", authHandlers.login);
    api.post("/auth/register", authHandlers.register);
    api.post("/auth/refresh", authHandlers.refresh);
    api.get("/auth/oauth/providers", authHandlers.oauthProviders);
    api.get("/auth/oauth/:provider", authHandlers.oauthStart);
    api.get("/auth/oauth/:provider/callback", authHandlers.oauthCallback);

    // Ingestion webhook (uses token auth, not JWT)
    api.post("/ingestion/cloudflare-email", ingestionHandlers.cloudflareEmail);

    // Billing webhook (uses Stripe signature)
    api.post("/billing/webhook", billingHandlers.stripeWebhook);

    // Protected routes
    const protected_ = new Hono();
    protected_.use("*", requireAuth);

    // Auth (protected)
    protected_.get("/auth/me", authHandlers.me);

    // Watchers
    protected_.get("/watchers", watcherHandlers.list);
    protected_.post("/watchers", watcherHandlers.create);
    protected_.get("/watchers/:id", watcherHandlers.get);
    protected_.patch("/watchers/:id", watcherHandlers.update);
    protected_.delete("/watchers/:id", watcherHandlers.delete_);
    protected_.patch("/watchers/:id/policy", watcherHandlers.updatePolicy);
    protected_.post("/watchers/:id/activate", watcherHandlers.activate);
    protected_.post("/watchers/:id/pause", watcherHandlers.pause);
    protected_.post("/watchers/:id/resume", watcherHandlers.resume);

    // Threads
    protected_.get("/watchers/:watcherId/threads", threadHandlers.list);
    protected_.get(
        "/watchers/:watcherId/threads/:threadId",
        threadHandlers.get
    );
    protected_.post(
        "/watchers/:watcherId/threads/:threadId/close",
        threadHandlers.close
    );

    // Billing
    protected_.get("/billing/subscription", billingHandlers.getSubscription);
    protected_.get("/billing/usage", billingHandlers.getUsage);
    protected_.get("/billing/config", billingHandlers.getConfig);
    protected_.post("/billing/checkout", billingHandlers.createCheckout);
    protected_.post("/billing/portal", billingHandlers.createPortal);
    protected_.post("/billing/cancel", billingHandlers.cancelSubscription);
    protected_.post("/billing/resume", billingHandlers.resumeSubscription);
    protected_.get("/billing/invoices", billingHandlers.getInvoices);

    // Mount protected routes
    api.route("/", protected_);

    return api;
}
