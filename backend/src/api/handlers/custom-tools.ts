/**
 * Custom Tools Handler
 *
 * CRUD for per-watcher custom tools (webhook-backed agent tools).
 */

import type { Context } from "hono";
import { queryMany, queryOne, run } from "../../db/client";
import { logger } from "../../logger";

interface CustomToolRow {
    id: string;
    watcher_id: string;
    name: string;
    description: string;
    webhook_url: string;
    headers: string;
    parameter_schema: string;
    enabled: boolean | number;
    execution_count: number;
    last_executed_at: string | null;
    created_at: string;
}

function formatTool(row: CustomToolRow) {
    return {
        id: row.id,
        watcher_id: row.watcher_id,
        name: row.name,
        description: row.description,
        webhook_url: row.webhook_url,
        headers: safeParseJson(row.headers, {}),
        parameter_schema: safeParseJson(row.parameter_schema, {}),
        enabled: Boolean(row.enabled),
        execution_count: row.execution_count,
        last_executed_at: row.last_executed_at,
        created_at: row.created_at,
    };
}

function safeParseJson<T>(val: string | null | undefined, fallback: T): T {
    if (!val) return fallback;
    try { return JSON.parse(val) as T; } catch { return fallback; }
}

async function verifyWatcherOwnership(watcherId: string, accountId: string): Promise<boolean> {
    const watcher = queryOne<{ id: string }>(
        `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
        [watcherId, accountId]
    );
    return !!watcher;
}

export const customToolHandlers = {
    async list(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const tools = queryMany<CustomToolRow>(
            `SELECT * FROM custom_tools WHERE watcher_id = ? ORDER BY created_at ASC`,
            [watcherId]
        );

        return c.json({ tools: tools.map(formatTool) });
    },

    async create(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const body = await c.req.json().catch(() => ({}));
        const { name, description, webhook_url, headers, parameter_schema } = body;

        if (!name || !description || !webhook_url) {
            return c.json({ error: "name, description, and webhook_url are required" }, 400);
        }

        const id = crypto.randomUUID();
        run(
            `INSERT INTO custom_tools (id, watcher_id, name, description, webhook_url, headers, parameter_schema, enabled, execution_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, 0, CURRENT_TIMESTAMP)`,
            [
                id, watcherId, name.trim(), description.trim(), webhook_url.trim(),
                JSON.stringify(headers ?? {}),
                JSON.stringify(parameter_schema ?? {}),
            ]
        );

        const tool = queryOne<CustomToolRow>(`SELECT * FROM custom_tools WHERE id = ?`, [id]);
        return c.json({ tool: formatTool(tool!) }, 201);
    },

    async update(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const toolId = c.req.param("toolId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const tool = queryOne<CustomToolRow>(
            `SELECT * FROM custom_tools WHERE id = ? AND watcher_id = ?`,
            [toolId, watcherId]
        );
        if (!tool) return c.json({ error: "Tool not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        const { name, description, webhook_url, headers, parameter_schema, enabled } = body;

        const sets: string[] = [];
        const vals: any[] = [];

        if (name !== undefined) { sets.push("name = ?"); vals.push(name.trim()); }
        if (description !== undefined) { sets.push("description = ?"); vals.push(description.trim()); }
        if (webhook_url !== undefined) { sets.push("webhook_url = ?"); vals.push(webhook_url.trim()); }
        if (headers !== undefined) { sets.push("headers = ?"); vals.push(JSON.stringify(headers)); }
        if (parameter_schema !== undefined) { sets.push("parameter_schema = ?"); vals.push(JSON.stringify(parameter_schema)); }
        if (enabled !== undefined) { sets.push("enabled = ?"); vals.push(enabled ? 1 : 0); }

        if (sets.length === 0) return c.json({ error: "Nothing to update" }, 400);

        vals.push(toolId);
        run(`UPDATE custom_tools SET ${sets.join(", ")} WHERE id = ?`, vals);

        const updated = queryOne<CustomToolRow>(`SELECT * FROM custom_tools WHERE id = ?`, [toolId]);
        return c.json({ tool: formatTool(updated!) });
    },

    async delete_(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const toolId = c.req.param("toolId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const tool = queryOne<{ id: string }>(
            `SELECT id FROM custom_tools WHERE id = ? AND watcher_id = ?`,
            [toolId, watcherId]
        );
        if (!tool) return c.json({ error: "Tool not found" }, 404);

        run(`DELETE FROM custom_tools WHERE id = ?`, [toolId]);
        return c.json({ deleted: true });
    },

    async test(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const toolId = c.req.param("toolId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const tool = queryOne<CustomToolRow>(
            `SELECT * FROM custom_tools WHERE id = ? AND watcher_id = ?`,
            [toolId, watcherId]
        );
        if (!tool) return c.json({ error: "Tool not found" }, 404);

        const watcher = queryOne<{ name: string }>(
            `SELECT name FROM watchers WHERE id = ?`,
            [watcherId]
        );

        const samplePayload = {
            event: "tool_execution",
            tool: tool.name,
            test: true,
            watcher: { id: watcherId, name: watcher?.name ?? "unknown" },
            thread: { id: "test-thread-id", subject: "Test email subject", status: "active" },
            email: { from: "sender@example.com", subject: "Test email subject", received_at: new Date().toISOString() },
            params: { message: "This is a test invocation from Vigil" },
            timestamp: new Date().toISOString(),
        };

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...safeParseJson<Record<string, string>>(tool.headers, {}),
        };

        try {
            const resp = await fetch(tool.webhook_url, {
                method: "POST",
                headers,
                body: JSON.stringify(samplePayload),
                signal: AbortSignal.timeout(10000),
            });

            const responseBody = await resp.text().catch(() => "");
            logger.info("Custom tool test fired", { toolId, status: resp.status });

            return c.json({
                success: resp.ok,
                status: resp.status,
                response_body: responseBody.slice(0, 500),
            });
        } catch (err) {
            logger.error("Custom tool test failed", { toolId, err });
            return c.json({ success: false, error: String(err) }, 200);
        }
    },
};
