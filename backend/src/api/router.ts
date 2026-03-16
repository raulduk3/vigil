/**
 * API Router — V2
 */

import { Hono } from "hono";
import { requireAuth } from "../auth/middleware";
import { authRateLimit, ingestRateLimit, apiRateLimit, invokeRateLimit, createRateLimit } from "../auth/rate-limit";

import { healthHandler } from "./handlers/health";
import { authHandlers } from "./handlers/auth";
import { watcherHandlers, templateHandlers } from "./handlers/watchers";
import { threadHandlers } from "./handlers/threads";
import { ingestionHandlers } from "./handlers/ingestion";
import { threadActionHandlers } from "./handlers/thread-actions";
import { customToolHandlers } from "./handlers/custom-tools";
import { apiKeyHandlers } from "./handlers/api-keys";
import { accountKeyHandlers } from "./handlers/account-keys";
import { billingHandlers } from "./handlers/billing";
import { forwardingHandlers } from "./handlers/forwarding";
import { skillHandlers } from "./handlers/skills";

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

    // Skills catalog (public — no auth needed for browsing available providers)
    api.get("/skills/catalog", skillHandlers.catalog);

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
    protected_.post("/watchers", createRateLimit, watcherHandlers.create);
    protected_.get("/watchers/:id", watcherHandlers.get);
    protected_.put("/watchers/:id", watcherHandlers.update);
    protected_.patch("/watchers/:id", watcherHandlers.update);
    protected_.delete("/watchers/:id", watcherHandlers.delete_);

    // Watcher agent controls
    protected_.post("/watchers/:id/invoke", invokeRateLimit, watcherHandlers.invoke);
    protected_.post("/watchers/:id/digest", watcherHandlers.digest);
    protected_.post("/watchers/:id/flush", watcherHandlers.flush);
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

    // Skills (per watcher — pre-built provider integrations)
    protected_.get("/watchers/:id/skills", skillHandlers.list);
    protected_.post("/watchers/:id/skills", skillHandlers.create);
    protected_.put("/watchers/:id/skills/:skillId", skillHandlers.update);
    protected_.patch("/watchers/:id/skills/:skillId", skillHandlers.update);
    protected_.delete("/watchers/:id/skills/:skillId", skillHandlers.delete_);
    protected_.post("/watchers/:id/skills/:skillId/test", skillHandlers.test);

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

    // BYOK (Bring Your Own Key) — per-account provider API keys
    protected_.get("/account/keys", accountKeyHandlers.get);
    protected_.put("/account/keys", accountKeyHandlers.put);

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

        const { getUsageSummary } = await import("../billing/usage");

        // Get ALL watchers for this account (including deleted — costs persist)
        const allWatchers = queryMany<{ id: string; name: string; status: string }>(
            `SELECT id, name, status FROM watchers WHERE account_id = ?`,
            [user.account_id]
        );
        const activeWatchers = allWatchers.filter(w => w.status !== 'deleted');
        const allWatcherIds = allWatchers.map(w => w.id);

        if (allWatcherIds.length === 0) {
            // Fall back to account-level usage from getUsageSummary
            const summary = await getUsageSummary(user.account_id);
            return c.json({ usage: {
                total_cost: summary.current_month_cost,
                invocations: 0, alerts: 0, emails_processed: 0,
                current_month: { cost: summary.current_month_cost, invocations: 0 },
                watchers: [],
            }});
        }

        const placeholders = allWatcherIds.map(() => "?").join(",");

        // Total costs across ALL watchers (including deleted)
        const totals = queryOne<{ total_cost: number; invocations: number; alerts: number }>(
            `SELECT 
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COUNT(*) as invocations,
                SUM(CASE WHEN tool = 'send_alert' AND result = 'success' THEN 1 ELSE 0 END) as alerts
             FROM actions WHERE watcher_id IN (${placeholders})`,
            allWatcherIds
        ) ?? { total_cost: 0, invocations: 0, alerts: 0 };

        const emailCount = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM emails WHERE watcher_id IN (${placeholders})`,
            allWatcherIds
        );

        // Per-watcher breakdown (active watchers only for display)
        const perWatcher = activeWatchers.map(w => {
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

        // Current month costs — use account-level tracking as primary source
        const summary = await getUsageSummary(user.account_id);
        const currentMonthCost = summary.current_month_cost;

        // Invocation count still from actions (account-level doesn't track this)
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthInvocations = queryOne<{ invocations: number }>(
            `SELECT COUNT(*) as invocations
             FROM actions WHERE watcher_id IN (${placeholders}) AND created_at >= ?`,
            [...allWatcherIds, monthStart.toISOString()]
        );

        return c.json({
            usage: {
                total_cost: totals.total_cost,
                total_invocations: totals.invocations,
                total_alerts: totals.alerts,
                total_emails: emailCount?.count ?? 0,
                current_month: {
                    cost: currentMonthCost,
                    invocations: monthInvocations?.invocations ?? 0,
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

    // ================================================================
    // Full watcher workspace export (JSON or Markdown)
    // ================================================================
    protected_.get("/watchers/:id/export", async (c) => {
        const user = c.get("user");
        const id = c.req.param("id") ?? "";
        const format = c.req.query("format") ?? "json"; // "json" or "markdown"
        const { queryOne, queryMany } = await import("../db/client");
        const { MODEL_CATALOG } = await import("../agent/engine");

        const watcher = queryOne<any>(
            `SELECT * FROM watchers WHERE id = ? AND account_id = ?`,
            [id, user.account_id]
        );
        if (!watcher) return c.json({ error: "Watcher not found" }, 404);

        // Gather all data
        const threads = queryMany<any>(`SELECT * FROM threads WHERE watcher_id = ? ORDER BY last_activity DESC`, [id]);
        const memories = queryMany<any>(`SELECT * FROM memories WHERE watcher_id = ? ORDER BY created_at DESC`, [id]);
        const actions = queryMany<any>(`SELECT * FROM actions WHERE watcher_id = ? ORDER BY created_at DESC LIMIT 1000`, [id]);
        const emails = queryMany<any>(`SELECT id, from_addr, to_addr, subject, received_at, thread_id, analysis, processed, created_at FROM emails WHERE watcher_id = ? ORDER BY created_at DESC LIMIT 500`, [id]);
        const channels = queryMany<any>(`SELECT * FROM channels WHERE watcher_id = ?`, [id]);
        const customTools = queryMany<any>(`SELECT id, name, description, webhook_url, enabled, execution_count, last_executed_at FROM custom_tools WHERE watcher_id = ?`, [id]);

        // Cost summary
        const costSummary = queryOne<any>(
            `SELECT COUNT(*) as total_actions, ROUND(COALESCE(SUM(cost_usd),0),6) as total_cost,
                    COALESCE(SUM(CASE WHEN input_tokens IS NOT NULL THEN input_tokens ELSE 0 END),0) as total_input_tokens,
                    COALESCE(SUM(CASE WHEN output_tokens IS NOT NULL THEN output_tokens ELSE 0 END),0) as total_output_tokens,
                    COALESCE(SUM(context_tokens),0) as total_context_tokens
             FROM actions WHERE watcher_id = ?`,
            [id]
        );

        const modelBreakdown = queryMany<any>(
            `SELECT model, COUNT(*) as count, ROUND(SUM(cost_usd),6) as cost,
                    SUM(CASE WHEN input_tokens IS NOT NULL THEN input_tokens ELSE 0 END) as input_tokens,
                    SUM(CASE WHEN output_tokens IS NOT NULL THEN output_tokens ELSE 0 END) as output_tokens
             FROM actions WHERE watcher_id = ? AND model IS NOT NULL GROUP BY model ORDER BY cost DESC`,
            [id]
        );

        const data = {
            exported_at: new Date().toISOString(),
            watcher: {
                id: watcher.id,
                name: watcher.name,
                status: watcher.status,
                model: watcher.model,
                system_prompt: watcher.system_prompt,
                tools: JSON.parse(watcher.tools || "[]"),
                reactivity: watcher.reactivity,
                memory_sensitivity: watcher.memory_sensitivity,
                silence_hours: watcher.silence_hours,
                tick_interval: watcher.tick_interval,
                digest_frequency: watcher.digest_frequency,
                created_at: watcher.created_at,
            },
            cost_summary: {
                ...costSummary,
                model_breakdown: modelBreakdown.map((m: any) => ({
                    model: m.model,
                    provider: MODEL_CATALOG[m.model]?.provider ?? "unknown",
                    invocations: m.count,
                    cost_usd: m.cost,
                    input_tokens: m.input_tokens,
                    output_tokens: m.output_tokens,
                    rate_per_1k_input: MODEL_CATALOG[m.model]?.pricing?.input ?? null,
                    rate_per_1k_output: MODEL_CATALOG[m.model]?.pricing?.output ?? null,
                })),
            },
            threads: threads.map((t: any) => ({
                id: t.id, subject: t.subject, status: t.status, summary: t.summary,
                participants: JSON.parse(t.participants || "[]"),
                email_count: t.email_count, first_seen: t.first_seen,
                last_activity: t.last_activity,
            })),
            memories: memories.map((m: any) => ({
                id: m.id, content: m.content, importance: m.importance,
                obsolete: !!m.obsolete, thread_id: m.thread_id, created_at: m.created_at,
            })),
            emails: emails.map((e: any) => ({
                id: e.id, from: e.from_addr, to: e.to_addr, subject: e.subject,
                received_at: e.received_at, thread_id: e.thread_id,
                analysis: e.analysis ? JSON.parse(e.analysis) : null,
                created_at: e.created_at,
            })),
            actions: actions.map((a: any) => ({
                id: a.id, trigger_type: a.trigger_type, tool: a.tool,
                tool_params: a.tool_params ? JSON.parse(a.tool_params) : null,
                result: a.result, error: a.error, reasoning: a.reasoning,
                model: a.model, input_tokens: a.input_tokens, output_tokens: a.output_tokens,
                context_tokens: a.context_tokens, cost_usd: a.cost_usd,
                duration_ms: a.duration_ms,
                analysis: a.decision ? (() => { try { return JSON.parse(a.decision); } catch { return a.decision; } })() : null,
                thread_id: a.thread_id, email_id: a.email_id,
                created_at: a.created_at,
            })),
            channels: channels.map((ch: any) => ({
                id: ch.id, type: ch.type, destination: ch.destination, enabled: !!ch.enabled,
            })),
            custom_tools: customTools,
        };

        if (format === "markdown") {
            const md = buildExportMarkdown(data);
            c.header("Content-Type", "text/markdown; charset=utf-8");
            c.header("Content-Disposition", `attachment; filename="${watcher.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.md"`);
            return c.text(md);
        }

        c.header("Content-Disposition", `attachment; filename="${watcher.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.json"`);
        return c.json(data);
    });

    api.route("/", protected_);

    return api;
}

// ================================================================
// Markdown export builder
// ================================================================
function buildExportMarkdown(data: any): string {
    const w = data.watcher;
    const cs = data.cost_summary;

    let md = `# ${w.name} — Vigil Watcher Export\n\n`;
    md += `Exported: ${data.exported_at}\n\n`;

    // Config
    md += `## Configuration\n\n`;
    md += `| Field | Value |\n|---|---|\n`;
    md += `| Model | ${w.model} |\n`;
    md += `| Status | ${w.status} |\n`;
    md += `| Reactivity | ${w.reactivity}/5 |\n`;
    md += `| Memory Sensitivity | ${w.memory_sensitivity}/5 |\n`;
    md += `| Silence Threshold | ${w.silence_hours}h |\n`;
    md += `| Tick Interval | ${w.tick_interval} min |\n`;
    md += `| Digest | ${w.digest_frequency} |\n`;
    md += `| Tools | ${w.tools.join(", ")} |\n`;
    md += `| Created | ${w.created_at} |\n\n`;

    if (w.system_prompt) {
        md += `### System Prompt\n\n\`\`\`\n${w.system_prompt}\n\`\`\`\n\n`;
    }

    // Cost Summary
    md += `## Cost Summary\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Total Actions | ${cs.total_actions} |\n`;
    md += `| Total Cost | $${Number(cs.total_cost).toFixed(4)} |\n`;
    md += `| Total Input Tokens | ${cs.total_input_tokens?.toLocaleString() ?? cs.total_context_tokens?.toLocaleString()} |\n`;
    md += `| Total Output Tokens | ${cs.total_output_tokens?.toLocaleString() ?? "n/a"} |\n\n`;

    if (cs.model_breakdown?.length > 0) {
        md += `### Cost by Model\n\n`;
        md += `| Model | Provider | Invocations | Cost | Input Tokens | Output Tokens | Rate (in/1K) | Rate (out/1K) |\n`;
        md += `|---|---|---|---|---|---|---|---|\n`;
        for (const m of cs.model_breakdown) {
            md += `| ${m.model} | ${m.provider} | ${m.invocations} | $${Number(m.cost_usd).toFixed(4)} | ${m.input_tokens?.toLocaleString()} | ${m.output_tokens?.toLocaleString()} | $${m.rate_per_1k_input ?? "?"} | $${m.rate_per_1k_output ?? "?"} |\n`;
        }
        md += `\n`;
    }

    // Threads
    md += `## Threads (${data.threads.length})\n\n`;
    for (const t of data.threads) {
        md += `### ${t.subject ?? "(no subject)"}\n`;
        md += `- **Status:** ${t.status} | **Emails:** ${t.email_count} | **Last activity:** ${t.last_activity}\n`;
        if (t.summary) md += `- **Summary:** ${t.summary}\n`;
        if (t.participants?.length) md += `- **Participants:** ${t.participants.join(", ")}\n`;
        md += `\n`;
    }

    // Memories
    md += `## Memories (${data.memories.length})\n\n`;
    for (const m of data.memories) {
        const status = m.obsolete ? "~~obsolete~~" : `importance: ${m.importance}`;
        md += `- [${status}] ${m.content}${m.thread_id ? ` *(thread: ${m.thread_id.slice(0, 8)})*` : ""}\n`;
    }
    md += `\n`;

    // Recent Actions
    md += `## Actions (last ${data.actions.length})\n\n`;
    for (const a of data.actions.slice(0, 100)) {
        const cost = a.cost_usd ? `$${Number(a.cost_usd).toFixed(4)}` : "";
        const tokens = a.input_tokens != null ? `${a.input_tokens}→${a.output_tokens}` : (a.context_tokens ? `${a.context_tokens} tokens` : "");
        const model = a.model ?? "";
        const duration = a.duration_ms ? `${a.duration_ms}ms` : "";

        md += `#### ${a.created_at} — ${a.trigger_type}${a.tool ? ` → ${a.tool}` : ""} [${a.result}]\n`;
        if (model || cost || tokens || duration) {
            md += `> ${[model, tokens, cost, duration].filter(Boolean).join(" · ")}\n`;
        }

        if (a.analysis) {
            const an = a.analysis;
            if (an.summary) md += `- **Summary:** ${an.summary}\n`;
            if (an.intent) md += `- **Intent:** ${an.intent}\n`;
            if (an.urgency) md += `- **Urgency:** ${an.urgency}\n`;
            if (an.entities?.length) md += `- **Entities:** ${an.entities.join(", ")}\n`;
            if (an.reasoning) md += `- **Reasoning:** ${an.reasoning}\n`;
        }

        if (a.tool_params) {
            md += `- **Params:** \`${JSON.stringify(a.tool_params)}\`\n`;
        }
        if (a.reasoning) md += `- **Agent reasoning:** ${a.reasoning}\n`;
        if (a.error) md += `- **Error:** ${a.error}\n`;
        md += `\n`;
    }

    // Emails
    md += `## Emails (${data.emails.length})\n\n`;
    md += `| Date | From | Subject | Thread | Urgency |\n|---|---|---|---|---|\n`;
    for (const e of data.emails) {
        const urgency = e.analysis?.urgency ?? "";
        md += `| ${e.received_at ?? e.created_at} | ${e.from} | ${e.subject} | ${e.thread_id?.slice(0, 8) ?? ""} | ${urgency} |\n`;
    }
    md += `\n`;

    // Channels & Tools
    if (data.channels.length > 0) {
        md += `## Channels\n\n`;
        for (const ch of data.channels) {
            md += `- **${ch.type}**: ${ch.destination} (${ch.enabled ? "enabled" : "disabled"})\n`;
        }
        md += `\n`;
    }
    if (data.custom_tools.length > 0) {
        md += `## Custom Tools\n\n`;
        for (const t of data.custom_tools) {
            md += `- **${t.name}**: ${t.description} → ${t.webhook_url} (${t.enabled ? "enabled" : "disabled"}, ${t.execution_count} runs)\n`;
        }
        md += `\n`;
    }

    md += `---\n*Exported from [vigil.run](https://vigil.run)*\n`;
    return md;
}
