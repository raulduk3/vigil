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

async function callApiImpl(
    _prompt: string,
    context: ProviderCallContext,
    options: ProviderOptions
): Promise<ProviderResponse> {
    const model = options?.config?.model ?? "gpt-4.1-mini";
    const vars = context.vars;

    try {
        const { systemPrompt, userPrompt } = buildPrompts(vars);

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

        return { output: stripFences(raw) };
    } catch (err) {
        return { error: String(err) };
    }
}
