/**
 * Vigil Custom Provider for promptfoo
 *
 * Calls a Bun helper to build Vigil's actual prompts from src/agent/prompts.ts,
 * then sends them to the specified LLM. This avoids Node/Bun module compat issues.
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, unlinkSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Provider = "openai" | "anthropic" | "google";

const MODEL_CATALOG: Record<string, { provider: Provider; apiModel?: string; maxTokens: number }> = {
    "gpt-4.1-nano":    { provider: "openai",    maxTokens: 1024 },
    "gpt-4.1-mini":    { provider: "openai",    maxTokens: 1024 },
    "gpt-4.1":         { provider: "openai",    maxTokens: 2048 },
    "gpt-4o":          { provider: "openai",    maxTokens: 2048 },
    "gpt-4o-mini":     { provider: "openai",    maxTokens: 1024 },
    "claude-haiku-4":  { provider: "anthropic", apiModel: "claude-haiku-4-5-20251001", maxTokens: 1024 },
    "claude-sonnet-4": { provider: "anthropic", apiModel: "claude-sonnet-4-20250514",  maxTokens: 2048 },
    "gemini-2.5-flash":{ provider: "google",    maxTokens: 1024 },
    "gemini-2.5-pro":  { provider: "google",    maxTokens: 2048 },
};

// ---------------------------------------------------------------------------
// LLM callers
// ---------------------------------------------------------------------------

async function callOpenAI(system: string, user: string, model: string, maxTokens: number): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
            model, max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            response_format: { type: "json_object" },
        }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as any;
    return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(system: string, user: string, model: string, maxTokens: number): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
            model, max_tokens: maxTokens, system,
            messages: [{ role: "user", content: user + "\n\nRespond with a single JSON object. No markdown fences." }],
        }),
    });
    if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as any;
    return data.content?.find((c: any) => c.type === "text")?.text ?? "";
}

async function callGoogle(system: string, user: string, model: string, maxTokens: number): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");
    const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: user + "\n\nRespond with a single JSON object. No markdown fences." }] }],
                generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
            }),
        }
    );
    if (!resp.ok) throw new Error(`Google AI ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function stripFences(text: string): string {
    return text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
}

// ---------------------------------------------------------------------------
// Build prompts via Bun subprocess
// ---------------------------------------------------------------------------

function buildPrompts(vars: Record<string, unknown>): { systemPrompt: string; userPrompt: string } {
    const helperPath = resolve(__dirname, "build-prompt.ts");
    const backendDir = resolve(__dirname, "../..");
    const tmpFile = resolve(__dirname, `../.tmp-input-${Date.now()}.json`);
    writeFileSync(tmpFile, JSON.stringify(vars));
    try {
        const result = execSync(`bun run ${helperPath} < ${tmpFile}`, {
            cwd: backendDir,
            encoding: "utf-8",
            timeout: 15000,
        });
        return JSON.parse(result.trim());
    } finally {
        try { unlinkSync(tmpFile); } catch {}
    }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface ProviderCallContext { vars: Record<string, unknown>; }
interface ProviderOptions { config?: { model?: string }; }
interface ProviderResponse { output?: string; error?: string; }

// promptfoo expects either a default export class with callApi() or a module with callApi
export default class VigilProvider {
    config: ProviderOptions["config"];
    constructor(options?: ProviderOptions) {
        this.config = options?.config;
    }
    id() { return `vigil:${this.config?.model ?? "gpt-4.1-mini"}`; }
    async callApi(prompt: string, context: ProviderCallContext): Promise<ProviderResponse> {
        return callApiImpl(prompt, context, { config: this.config });
    }
}

// Mini/nano tier uses classification pipeline + deterministic action mapping
const CLASSIFICATION_TIERS = new Set(["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini"]);

async function callApiImpl(
    _prompt: string,
    context: ProviderCallContext,
    options: ProviderOptions
): Promise<ProviderResponse> {
    const model = options?.config?.model ?? "gpt-4.1-mini";
    const vars = context.vars;
    const useClassification = CLASSIFICATION_TIERS.has(model)
        && (vars.trigger_type === "email_received" || vars.trigger_type === "scheduled_tick");

    try {
        const { systemPrompt, userPrompt } = buildPrompts({
            ...vars,
            use_classification: useClassification,
        });

        const catalog = MODEL_CATALOG[model];
        const provider = catalog?.provider ?? "openai";
        const apiModel = catalog?.apiModel ?? model;
        const maxTokens = catalog?.maxTokens ?? 1024;

        let raw: string;
        switch (provider) {
            case "anthropic":
                raw = await callAnthropic(systemPrompt, userPrompt, apiModel, maxTokens);
                break;
            case "google":
                raw = await callGoogle(systemPrompt, userPrompt, apiModel, maxTokens);
                break;
            default:
                raw = await callOpenAI(systemPrompt, userPrompt, apiModel, maxTokens);
        }

        const cleaned = stripFences(raw);

        if (useClassification) {
            // Parse classification, run through action mapper, return full response
            const classification = JSON.parse(cleaned);
            const mapped = applyActionMapper(classification, vars);
            return { output: JSON.stringify(mapped) };
        }

        return { output: cleaned };
    } catch (err) {
        return { error: String(err) };
    }
}

/**
 * Deterministic action mapper — mirrors backend src/agent/action-mapper.ts logic.
 * Inlined here to avoid Bun/Node module compat issues in the promptfoo provider.
 */
function applyActionMapper(classification: any, vars: Record<string, unknown>): any {
    const analysis = classification.email_analysis;
    const triggerType = vars.trigger_type as string;
    const reactivity = (vars.reactivity as number) ?? 3;
    const threadId = vars.thread_id as string ?? "";
    const actions: any[] = [];

    if (triggerType === "scheduled_tick") {
        // Tick: compute overdue threads from test vars and fire silence alerts
        const activeThreads = (vars.active_threads as any[]) ?? [];
        const silenceHours = (vars.silence_hours as number) ?? 48;
        const tickTs = (vars.tick_timestamp as number) ?? Date.now();

        for (const t of activeThreads) {
            if (t.status !== "active" || !t.last_activity) continue;
            const hoursSilent = (tickTs - new Date(t.last_activity).getTime()) / 3600000;
            if (hoursSilent >= silenceHours) {
                actions.push({
                    tool: "send_alert",
                    params: {
                        thread_id: t.id,
                        message: `This thread has been quiet for ${Math.round(hoursSilent)} hours — have you already handled this? ${t.summary ?? ""}`,
                        urgency: "normal",
                    },
                    reasoning: `Thread "${t.subject ?? "(no subject)"}" silent for ${Math.round(hoursSilent)}h, exceeds threshold of ${silenceHours}h.`,
                });
            }
        }

        // Also alert if the model's tick analysis flagged high urgency (e.g. deadline from memory)
        // and no silence-based alerts were generated for those threads
        if (analysis && (analysis.urgency === "high" || analysis.urgency === "normal")) {
            const alertedThreadIds = new Set(actions.map((a: any) => a.params?.thread_id));
            for (const t of activeThreads) {
                if (t.status !== "active" || alertedThreadIds.has(t.id)) continue;
                actions.push({
                    tool: "send_alert",
                    params: {
                        thread_id: t.id,
                        message: analysis.summary ?? `Thread "${t.subject}" needs attention.`,
                        urgency: analysis.urgency,
                    },
                    reasoning: `Tick analysis flagged urgency=${analysis.urgency}. ${analysis.reasoning ?? ""}`,
                });
            }
        }
    } else if (analysis) {
        // Email: determine alert based on urgency + classification signals
        const { urgency, sender_is_human, needs_response } = analysis;
        let shouldAlert = false;

        if (reactivity <= 1) {
            shouldAlert = urgency === "high";
        } else if (reactivity === 2) {
            shouldAlert = urgency === "high" || (urgency === "normal" && needs_response);
        } else if (reactivity === 3) {
            // Balanced: alert on any normal or high urgency
            shouldAlert = urgency === "high" || urgency === "normal";
        } else if (reactivity === 4) {
            shouldAlert = urgency !== "low";
        } else {
            shouldAlert = true; // reactivity 5: alert on everything
        }

        if (shouldAlert) {
            actions.push({
                tool: "send_alert",
                params: {
                    thread_id: threadId,
                    message: analysis.summary,
                    urgency: urgency,
                },
                reasoning: `Urgency: ${urgency}, sender_is_human: ${sender_is_human ?? "unknown"}, needs_response: ${needs_response ?? "unknown"}.`,
            });
        }
    }

    return {
        actions,
        memory_append: classification.memory_append ?? null,
        memory_obsolete: classification.memory_obsolete ?? null,
        thread_updates: classification.thread_updates ?? null,
        email_analysis: analysis ? {
            summary: analysis.summary,
            intent: analysis.intent,
            urgency: analysis.urgency,
            entities: analysis.entities,
            reasoning: analysis.reasoning,
        } : null,
    };
}
