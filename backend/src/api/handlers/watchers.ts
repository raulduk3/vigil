/**
 * Watcher Handlers — V2
 *
 * CRUD for watchers. Uses SQLite watchers table directly.
 */

import type { Context } from "hono";
import { queryOne, queryMany, run } from "../../db/client";
import type { WatcherRow } from "../../agent/schema";

// ============================================================================
// Handlers
// ============================================================================

export const watcherHandlers = {
    async list(c: Context) {
        const user = c.get("user");

        const watchers = queryMany<WatcherRow>(
            `SELECT * FROM watchers
             WHERE account_id = ? AND status != 'deleted'
             ORDER BY created_at DESC`,
            [user.account_id]
        );

        return c.json({ watchers: watchers.map(formatWatcher) });
    },

    async get(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";

        const watcher = queryOne<WatcherRow>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );

        if (!watcher) return c.json({ error: "Watcher not found" }, 404);
        return c.json({ watcher: formatWatcher(watcher) });
    },

    async create(c: Context) {
        const user = c.get("user");
        const body = await c.req.json();

        const {
            name,
            system_prompt,
            tools = ["send_alert"],
            silence_hours = 48,
            tick_interval = 60,
            model = "gpt-4.1-mini",
            template_id,
        } = body;

        if (!name) return c.json({ error: "name required" }, 400);
        if (!system_prompt)
            return c.json({ error: "system_prompt required" }, 400);

        // Validate model
        const allowedModels = ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"];
        const selectedModel = allowedModels.includes(model) ? model : "gpt-4.1-mini";

        const id = crypto.randomUUID();
        const ingestToken = generateIngestToken();

        run(
            `INSERT INTO watchers
             (id, account_id, name, ingest_token, system_prompt, tools, silence_hours, tick_interval, model, status, template_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                id,
                user.account_id,
                name,
                ingestToken,
                system_prompt,
                JSON.stringify(tools),
                silence_hours,
                tick_interval,
                selectedModel,
                template_id ?? null,
            ]
        );

        const watcher = queryOne<WatcherRow>(`SELECT * FROM watchers WHERE id = ?`, [id]);
        return c.json({ watcher: formatWatcher(watcher!) }, 201);
    },

    async update(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";
        const body = await c.req.json();

        const watcher = queryOne<WatcherRow>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const updates: string[] = [];
        const vals: any[] = [];

        const allowed = [
            "name",
            "system_prompt",
            "tools",
            "silence_hours",
            "tick_interval",
            "model",
            "status",
            "reactivity",
        ] as const;

        for (const key of allowed) {
            if (body[key] !== undefined) {
                updates.push(`${key} = ?`);
                vals.push(
                    key === "tools" ? JSON.stringify(body[key]) : body[key]
                );
            }
        }

        if (updates.length === 0) return c.json({ error: "Nothing to update" }, 400);

        updates.push("updated_at = CURRENT_TIMESTAMP");
        vals.push(id);

        run(
            `UPDATE watchers SET ${updates.join(", ")} WHERE id = ?`,
            vals
        );

        const updated = queryOne<WatcherRow>(`SELECT * FROM watchers WHERE id = ?`, [id]);
        return c.json({ watcher: formatWatcher(updated!) });
    },

    async delete_(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";

        const watcher = queryOne<WatcherRow>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ?`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        run(
            `UPDATE watchers SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id]
        );

        return c.json({ deleted: true, id });
    },

    async invoke(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";
        const body = await c.req.json().catch(() => ({}));

        const watcher = queryOne<WatcherRow>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const { invokeAgent } = await import("../../agent/engine");

        // Chat mode: body.message triggers conversational response
        // Query mode: body.query triggers structured JSON response
        if (body.message) {
            const response = await invokeAgent(id, {
                type: "user_chat",
                message: body.message,
            });
            const chatResponse = (response as any)?.chat_response ?? "No response.";
            return c.json({ watcher_id: id, message: chatResponse });
        }

        const response = await invokeAgent(id, {
            type: "user_query",
            query: body.query ?? "Manual invocation — review active threads.",
        });

        return c.json({ invoked: true, watcher_id: id, response });
    },

    async digest(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";

        const watcher = queryOne<WatcherRow>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const { sendDigest } = await import("../../agent/digest");
        const sent = await sendDigest(id);

        return c.json({ digest_sent: sent, watcher_id: id });
    },

    async getMemory(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const memories = queryMany(
            `SELECT id, content, importance, last_accessed, created_at
             FROM memories WHERE watcher_id = ? AND obsolete = FALSE
             ORDER BY importance DESC, created_at DESC`,
            [id]
        );

        return c.json({ memories });
    },

    async updateMemory(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const memoryId = c.req.param("memoryId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const memory = queryOne(
            `SELECT * FROM memories WHERE id = ? AND watcher_id = ?`,
            [memoryId, watcherId]
        );
        if (!memory) return c.json({ error: "Memory not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        const sets: string[] = [];
        const vals: any[] = [];

        if (body.content !== undefined) {
            sets.push("content = ?");
            vals.push(body.content.trim());
        }
        if (body.importance !== undefined) {
            sets.push("importance = ?");
            vals.push(Math.max(1, Math.min(5, body.importance)));
        }
        if (body.obsolete !== undefined) {
            sets.push("obsolete = ?");
            vals.push(body.obsolete ? 1 : 0);
        }

        if (sets.length === 0) return c.json({ error: "Nothing to update" }, 400);

        vals.push(memoryId);
        run(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`, vals);

        const updated = queryOne(
            `SELECT id, content, importance, obsolete, last_accessed, created_at FROM memories WHERE id = ?`,
            [memoryId]
        );
        return c.json({ memory: updated });
    },

    async deleteMemory(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const memoryId = c.req.param("memoryId") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const memory = queryOne(
            `SELECT id FROM memories WHERE id = ? AND watcher_id = ?`,
            [memoryId, watcherId]
        );
        if (!memory) return c.json({ error: "Memory not found" }, 404);

        run(`DELETE FROM memories WHERE id = ?`, [memoryId]);
        return c.json({ deleted: true, memory_id: memoryId });
    },

    async createMemory(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [watcherId, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        if (!body.content?.trim()) return c.json({ error: "content is required" }, 400);

        const id = crypto.randomUUID();
        const importance = Math.max(1, Math.min(5, body.importance ?? 3));

        run(
            `INSERT INTO memories (id, watcher_id, content, importance, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, watcherId, body.content.trim(), importance]
        );

        const created = queryOne(
            `SELECT id, content, importance, obsolete, last_accessed, created_at FROM memories WHERE id = ?`,
            [id]
        );
        return c.json({ memory: created }, 201);
    },

    // Channels (alert destinations)
    async getChannels(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const watcher = queryOne(`SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`, [watcherId, user.account_id]);
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const channels = queryMany(`SELECT * FROM channels WHERE watcher_id = ?`, [watcherId]);
        return c.json({ channels });
    },

    async createChannel(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const watcher = queryOne(`SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`, [watcherId, user.account_id]);
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        if (!body.type || !body.destination) return c.json({ error: "type and destination required" }, 400);
        if (!['email', 'webhook'].includes(body.type)) return c.json({ error: "type must be email or webhook" }, 400);

        const id = crypto.randomUUID();
        run(`INSERT INTO channels (id, watcher_id, type, destination, enabled) VALUES (?, ?, ?, ?, TRUE)`,
            [id, watcherId, body.type, body.destination]);

        const channel = queryOne(`SELECT * FROM channels WHERE id = ?`, [id]);
        return c.json({ channel }, 201);
    },

    async updateChannel(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const channelId = c.req.param("channelId") ?? "";
        const watcher = queryOne(`SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`, [watcherId, user.account_id]);
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const channel = queryOne(`SELECT * FROM channels WHERE id = ? AND watcher_id = ?`, [channelId, watcherId]);
        if (!channel) return c.json({ error: "Channel not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        const sets: string[] = [];
        const vals: any[] = [];
        if (body.destination !== undefined) { sets.push("destination = ?"); vals.push(body.destination); }
        if (body.enabled !== undefined) { sets.push("enabled = ?"); vals.push(body.enabled ? 1 : 0); }
        if (sets.length === 0) return c.json({ error: "Nothing to update" }, 400);

        vals.push(channelId);
        run(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`, vals);
        const updated = queryOne(`SELECT * FROM channels WHERE id = ?`, [channelId]);
        return c.json({ channel: updated });
    },

    async deleteChannel(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id") ?? "";
        const channelId = c.req.param("channelId") ?? "";
        const watcher = queryOne(`SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`, [watcherId, user.account_id]);
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const channel = queryOne(`SELECT id FROM channels WHERE id = ? AND watcher_id = ?`, [channelId, watcherId]);
        if (!channel) return c.json({ error: "Channel not found" }, 404);

        run(`DELETE FROM channels WHERE id = ?`, [channelId]);
        return c.json({ deleted: true });
    },

    async getActions(c: Context) {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";
        const limit = parseInt(c.req.query("limit") ?? "50", 10);
        const threadId = c.req.query("thread_id") ?? null;

        const watcher = queryOne(
            `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        const actions = threadId
            ? queryMany(
                `SELECT * FROM actions WHERE watcher_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT ?`,
                [id, threadId, limit]
            )
            : queryMany(
                `SELECT * FROM actions WHERE watcher_id = ? ORDER BY created_at DESC LIMIT ?`,
                [id, limit]
            );

        return c.json({ actions });
    },
};

// ============================================================================
// Templates
// ============================================================================

export const templateHandlers = {
    list(c: Context) {
        return c.json({ templates: TEMPLATES });
    },
};

// ============================================================================
// Helpers
// ============================================================================

function generateIngestToken(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 8; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20);
}

function formatWatcher(row: WatcherRow) {
    let tools: string[] = [];
    try {
        tools = JSON.parse(row.tools);
    } catch {}

    return {
        id: row.id,
        name: row.name,
        ingest_token: row.ingest_token,
        ingestion_address: `${slugify(row.name)}-${row.ingest_token}@vigil.run`,
        system_prompt: row.system_prompt,
        tools,
        silence_hours: row.silence_hours,
        tick_interval: row.tick_interval,
        model: row.model ?? "gpt-4.1-mini",
        status: row.status,
        reactivity: row.reactivity ?? 3,
        template_id: row.template_id,
        last_tick_at: row.last_tick_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

const TEMPLATES = [
    {
        id: "vendor-followup",
        name: "Vendor Follow-up",
        description: "Watch vendor/supplier emails. Alert when requests go unanswered.",
        system_prompt: `You monitor vendor communications. Track invoices, POs, and requests.
Alert the user when a vendor asks for something and hasn't received a response.
Note payment amounts and due dates when you see them.`,
        tools: ["send_alert", "update_thread", "ignore_thread"],
        silence_hours: 48,
        tick_interval: 60,
    },
    {
        id: "client-comms",
        name: "Client Communications",
        description: "Track client threads. Flag cold conversations.",
        system_prompt: `You monitor client communications. Track project discussions and requests.
Alert when a client thread goes cold or when action items surface.
Summarize long threads concisely.`,
        tools: ["send_alert", "update_thread", "ignore_thread", "webhook"],
        silence_hours: 72,
        tick_interval: 120,
    },
    {
        id: "recruiter-filter",
        name: "Recruiter Filter",
        description: "Filter recruiter emails. Only surface relevant opportunities.",
        system_prompt: `You filter recruiter/hiring emails. Most are noise.
Only alert the user for roles that match their criteria (they'll tell you in preferences).
Ignore mass outreach and generic pitches.`,
        tools: ["send_alert", "ignore_thread"],
        silence_hours: 0,
        tick_interval: 0,
    },
    {
        id: "blank",
        name: "Custom Watcher",
        description: "Start from scratch. Define your own prompt and tools.",
        system_prompt: `You are an email monitoring agent. The user will configure your behavior.`,
        tools: ["send_alert", "update_thread", "ignore_thread"],
        silence_hours: 48,
        tick_interval: 60,
    },
];
