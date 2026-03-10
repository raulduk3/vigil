/**
 * API Router — V2
 */

import { Hono } from "hono";
import { requireAuth } from "../auth/middleware";

import { healthHandler } from "./handlers/health";
import { authHandlers } from "./handlers/auth";
import { watcherHandlers, templateHandlers } from "./handlers/watchers";
import { threadHandlers } from "./handlers/threads";
import { ingestionHandlers } from "./handlers/ingestion";

export function createRouter(): Hono {
    const api = new Hono();

    // Public routes
    api.get("/health", healthHandler);

    // Auth (public)
    api.post("/auth/login", authHandlers.login);
    api.post("/auth/register", authHandlers.register);
    api.post("/auth/refresh", authHandlers.refresh);
    api.get("/auth/oauth/providers", authHandlers.oauthProviders);
    api.get("/auth/oauth/:provider", authHandlers.oauthStart);
    api.get("/auth/oauth/:provider/callback", authHandlers.oauthCallback);

    // Ingestion endpoints (token auth via path param)
    api.post("/ingest/:token", ingestionHandlers.ingestByToken);
    api.post("/ingestion/cloudflare-email", ingestionHandlers.cloudflareEmail);

    // Templates (public — so the frontend can show them before auth)
    api.get("/templates", templateHandlers.list);

    // Protected routes
    const protected_ = new Hono();
    protected_.use("*", requireAuth);

    // Auth (protected)
    protected_.get("/auth/me", authHandlers.me);

    // Watchers
    protected_.get("/watchers", watcherHandlers.list);
    protected_.post("/watchers", watcherHandlers.create);
    protected_.get("/watchers/:id", watcherHandlers.get);
    protected_.put("/watchers/:id", watcherHandlers.update);
    protected_.patch("/watchers/:id", watcherHandlers.update);
    protected_.delete("/watchers/:id", watcherHandlers.delete_);

    // Watcher agent controls
    protected_.post("/watchers/:id/invoke", watcherHandlers.invoke);
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

    // Threads
    protected_.get("/watchers/:watcherId/threads", threadHandlers.list);
    protected_.get("/watchers/:watcherId/threads/:threadId", threadHandlers.get);
    protected_.put("/watchers/:watcherId/threads/:threadId", threadHandlers.update);
    protected_.patch("/watchers/:watcherId/threads/:threadId", threadHandlers.update);
    protected_.post("/watchers/:watcherId/threads/:threadId/close", threadHandlers.close);
    protected_.delete("/watchers/:watcherId/threads/:threadId", threadHandlers.delete_);

    api.route("/", protected_);

    return api;
}
