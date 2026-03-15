/**
 * Skills Registry
 *
 * Maps provider names to executor functions and exposes SKILL_CATALOG
 * (metadata for each provider: name, description, configSchema fields).
 */

import * as slack from "./providers/slack";
import * as discord from "./providers/discord";
import * as twilio from "./providers/twilio";
import * as notion from "./providers/notion";
import * as pagerduty from "./providers/pagerduty";
import * as http from "./providers/http";

export interface SkillResult {
    ok: boolean;
    message: string;
}

export interface ConfigSchemaField {
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
}

export interface SkillCatalogEntry {
    provider: string;
    name: string;
    description: string;
    configSchema: { fields: ConfigSchemaField[] };
    /** Example params to use in test invocations */
    testParams: Record<string, unknown>;
}

type Executor = (config: any, params: any) => Promise<SkillResult>;

const PROVIDERS: Record<string, { execute: Executor; configSchema: { fields: ConfigSchemaField[] } }> = {
    slack,
    discord,
    twilio,
    notion,
    pagerduty,
    http,
};

export const SKILL_CATALOG: SkillCatalogEntry[] = [
    {
        provider: "slack",
        name: "Slack",
        description: "Send a message to a Slack channel via Incoming Webhook.",
        configSchema: slack.configSchema,
        testParams: { text: "🔔 Vigil test message from Skills" },
    },
    {
        provider: "discord",
        name: "Discord",
        description: "Send a message to a Discord channel via Webhook.",
        configSchema: discord.configSchema,
        testParams: { content: "🔔 Vigil test message from Skills" },
    },
    {
        provider: "twilio",
        name: "Twilio SMS",
        description: "Send an SMS via Twilio.",
        configSchema: twilio.configSchema,
        testParams: { body: "Vigil test SMS from Skills" },
    },
    {
        provider: "notion",
        name: "Notion",
        description: "Append a new page to a Notion database.",
        configSchema: notion.configSchema,
        testParams: { title: "Vigil Test Entry", content: "This is a test entry created by Vigil Skills." },
    },
    {
        provider: "pagerduty",
        name: "PagerDuty",
        description: "Trigger a PagerDuty incident via Events API v2.",
        configSchema: pagerduty.configSchema,
        testParams: { summary: "Vigil test incident", severity: "info" },
    },
    {
        provider: "http",
        name: "HTTP Webhook",
        description: "Send an HTTP request to any URL (generic webhook).",
        configSchema: http.configSchema,
        testParams: { body: { source: "vigil", event: "test" } },
    },
];

/**
 * Execute a skill by provider name with decrypted config and agent-supplied params.
 */
export async function executeSkill(
    provider: string,
    config: unknown,
    params: unknown
): Promise<SkillResult> {
    const p = PROVIDERS[provider];
    if (!p) {
        return { ok: false, message: `Unknown skill provider: ${provider}` };
    }
    try {
        return await p.execute(config, params);
    } catch (err) {
        return { ok: false, message: `Skill execution error: ${String(err)}` };
    }
}
