/**
 * API Router — V2
 */

import { Hono } from "hono";
import { requireAuth } from "../auth/middleware";
import { authRateLimit, ingestRateLimit, apiRateLimit } from "../auth/rate-limit";

import { healthHandler } from "./handlers/health";
import { authHandlers } from "./handlers/auth";
import { watcherHandlers, templateHandlers } from "./handlers/watchers";
import { threadHandlers } from "./handlers/threads";
import { ingestionHandlers } from "./handlers/ingestion";
import { threadActionHandlers } from "./handlers/thread-actions";
import { customToolHandlers } from "./handlers/custom-tools";
import { apiKeyHandlers } from "./handlers/api-keys";
import { billingHandlers } from "./handlers/billing";
import { forwardingHandlers } from "./handlers/forwarding";

export function createRouter(): Hono {
    const api = new Hono();

    // Public routes
    api.get("/health", healthHandler);

    // Auth (public, rate-limited)
    api.post("/auth/login", authRateLimit, authHandlers.login);
    api.post("/auth/register", authRateLimit, authHandlers.register);
    api.post("/auth/refresh", authRateLimit, authHandlers.refresh);
    api.get("/auth/oauth/providers", authHandlers.oauthProviders);
    api.get("/auth/oauth/:provider", authHandlers.oauthStart);
    api.get("/auth/oauth/:provider/callback", authHandlers.oauthCallback);

    // Ingestion endpoints (token auth via path param, rate-limited)
    api.post("/ingest/:token", ingestRateLimit, ingestionHandlers.ingestByToken);
    api.post("/ingestion/cloudflare-email", ingestRateLimit, ingestionHandlers.cloudflareEmail);

    // Thread actions (public — one-click from alert emails, HMAC-signed)
    api.get("/threads/:token/action", threadActionHandlers.handleAction);

    // Templates (public — so the frontend can show them before auth)
    api.get("/templates", templateHandlers.list);

    // Stripe webhook (public — Stripe signs it, no JWT)
    api.post("/billing/webhook", billingHandlers.stripeWebhook);

    // Protected routes
    const protected_ = new Hono();
    protected_.use("*", apiRateLimit);
    protected_.use("*", requireAuth);

    // Auth (protected)
    protected_.get("/auth/me", authHandlers.me);
    protected_.post("/auth/change-password", authHandlers.changePassword);
    protected_.post("/auth/delete-account", authHandlers.deleteAccount);
    protected_.get("/auth/connections", authHandlers.getConnections);

    // Watchers
    protected_.get("/watchers", watcherHandlers.list);
    protected_.post("/watchers", watcherHandlers.create);
    protected_.get("/watchers/:id", watcherHandlers.get);
    protected_.put("/watchers/:id", watcherHandlers.update);
    protected_.patch("/watchers/:id", watcherHandlers.update);
    protected_.delete("/watchers/:id", watcherHandlers.delete_);

    // Watcher agent controls
    protected_.post("/watchers/:id/invoke", watcherHandlers.invoke);
    protected_.post("/watchers/:id/digest", watcherHandlers.digest);
    protected_.get("/watchers/:id/memory", watcherHandlers.getMemory);
    protected_.get("/watchers/:id/actions", watcherHandlers.getActions);

    // Channels (alert destinations)
    protected_.get("/watchers/:id/channels", watcherHandlers.getChannels);
    protected_.post("/watchers/:id/channels", watcherHandlers.createChannel);
    protected_.put("/watchers/:id/channels/:channelId", watcherHandlers.updateChannel);
    protected_.delete("/watchers/:id/channels/:channelId", watcherHandlers.deleteChannel);

    // Memory CRUD
    protected_.post("/watchers/:id/memory", watcherHandlers.createMemory);
    protected_.put("/watchers/:id/memory/:memoryId", watcherHandlers.updateMemory);
    protected_.patch("/watchers/:id/memory/:memoryId", watcherHandlers.updateMemory);
    protected_.delete("/watchers/:id/memory/:memoryId", watcherHandlers.deleteMemory);

    // Custom tools (per watcher)
    protected_.get("/watchers/:id/tools", customToolHandlers.list);
    protected_.post("/watchers/:id/tools", customToolHandlers.create);
    protected_.put("/watchers/:id/tools/:toolId", customToolHandlers.update);
    protected_.patch("/watchers/:id/tools/:toolId", customToolHandlers.update);
    protected_.delete("/watchers/:id/tools/:toolId", customToolHandlers.delete_);
    protected_.post("/watchers/:id/tools/:toolId/test", customToolHandlers.test);

    // API keys (per account)
    protected_.get("/keys", apiKeyHandlers.list);
    protected_.post("/keys", apiKeyHandlers.create);
    protected_.delete("/keys/:id", apiKeyHandlers.delete_);

    // Threads
    protected_.get("/watchers/:watcherId/threads", threadHandlers.list);
    protected_.get("/watchers/:watcherId/threads/:threadId", threadHandlers.get);
    protected_.put("/watchers/:watcherId/threads/:threadId", threadHandlers.update);
    protected_.patch("/watchers/:watcherId/threads/:threadId", threadHandlers.update);
    protected_.post("/watchers/:watcherId/threads/:threadId/close", threadHandlers.close);
    protected_.delete("/watchers/:watcherId/threads/:threadId", threadHandlers.delete_);

    // Forwarding (Chrome extension)
    protected_.get("/forwarding/confirm-code/:watcherId", forwardingHandlers.confirmCode);
    protected_.get("/forwarding/status/:watcherId", forwardingHandlers.status);

    // Billing
    protected_.get("/billing", billingHandlers.getBilling);
    protected_.post("/billing/setup", billingHandlers.setup);
    protected_.post("/billing/portal", billingHandlers.portal);

    // Usage/billing endpoint
    protected_.get("/usage", async (c) => {
        const user = c.get("user");
        const { queryOne, queryMany } = await import("../db/client");

        // Get all watchers for this account
        const watchers = queryMany<{ id: string; name: string }>(
            `SELECT id, name FROM watchers WHERE account_id = ? AND status != 'deleted'`,
            [user.account_id]
        );
        const watcherIds = watchers.map(w => w.id);

        if (watcherIds.length === 0) {
            return c.json({ usage: { total_cost: 0, invocations: 0, alerts: 0, emails_processed: 0, watchers: [] } });
        }

        const placeholders = watcherIds.map(() => "?").join(",");

        // Total costs across all watchers
        const totals = queryOne<{ total_cost: number; invocations: number; alerts: number }>(
            `SELECT 
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COUNT(*) as invocations,
                SUM(CASE WHEN tool = 'send_alert' AND result = 'success' THEN 1 ELSE 0 END) as alerts
             FROM actions WHERE watcher_id IN (${placeholders})`,
            watcherIds
        ) ?? { total_cost: 0, invocations: 0, alerts: 0 };

        const emailCount = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM emails WHERE watcher_id IN (${placeholders})`,
            watcherIds
        );

        // Per-watcher breakdown
        const perWatcher = watchers.map(w => {
            const stats = queryOne<{ cost: number; invocations: number; alerts: number; emails: number }>(
                `SELECT 
                    COALESCE(SUM(a.cost_usd), 0) as cost,
                    COUNT(a.id) as invocations,
                    SUM(CASE WHEN a.tool = 'send_alert' AND a.result = 'success' THEN 1 ELSE 0 END) as alerts,
                    (SELECT COUNT(*) FROM emails e WHERE e.watcher_id = ?) as emails
                 FROM actions a WHERE a.watcher_id = ?`,
                [w.id, w.id]
            );
            return {
                watcher_id: w.id,
                watcher_name: w.name,
                cost: stats?.cost ?? 0,
                invocations: stats?.invocations ?? 0,
                alerts: stats?.alerts ?? 0,
                emails: stats?.emails ?? 0,
            };
        });

        // Current month costs
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthCosts = queryOne<{ cost: number; invocations: number }>(
            `SELECT COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as invocations
             FROM actions WHERE watcher_id IN (${placeholders}) AND created_at >= ?`,
            [...watcherIds, monthStart.toISOString()]
        );

        return c.json({
            usage: {
                total_cost: totals.total_cost,
                total_invocations: totals.invocations,
                total_alerts: totals.alerts,
                total_emails: emailCount?.count ?? 0,
                current_month: {
                    cost: monthCosts?.cost ?? 0,
                    invocations: monthCosts?.invocations ?? 0,
                },
                watchers: perWatcher,
            },
        });
    });

    // Models catalog (public, no auth needed for listing)
    protected_.get("/models", async (c) => {
        const { MODEL_CATALOG } = await import("../agent/engine");
        const models = Object.entries(MODEL_CATALOG).map(([id, m]) => ({
            id,
            label: m.label,
            provider: m.provider,
            tier: m.tier,
            pricing: m.pricing,
        }));
        return c.json({ models });
    });

    api.route("/", protected_);

    return api;
}
