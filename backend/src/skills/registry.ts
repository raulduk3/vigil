/**
 * Skills Registry
 */

import * as slack from "./providers/slack";
import * as discord from "./providers/discord";
import * as twilio from "./providers/twilio";
import * as notion from "./providers/notion";
import * as pagerduty from "./providers/pagerduty";
import * as http from "./providers/http";
import * as linear from "./providers/linear";
import * as jira from "./providers/jira";
import * as email_forward from "./providers/email_forward";
import * as telegram from "./providers/telegram";
import * as github from "./providers/github";
import * as airtable from "./providers/airtable";
import * as google_sheets from "./providers/google_sheets";

export interface SkillResult { ok: boolean; message: string; }
export interface ConfigSchemaField { name: string; label: string; type: string; required: boolean; placeholder?: string; description?: string; }
export interface SkillCatalogEntry { provider: string; name: string; description: string; configSchema: { fields: ConfigSchemaField[] }; testParams: Record<string, unknown>; }

type Executor = (config: any, params: any) => Promise<SkillResult>;
const PROVIDERS: Record<string, { execute: Executor; configSchema: { fields: ConfigSchemaField[] } }> = {
    slack, discord, twilio, notion, pagerduty, http,
    linear, jira, email_forward, telegram, github, airtable, google_sheets,
};

export const SKILL_CATALOG: SkillCatalogEntry[] = [
    // Communication
    { provider: "twilio", name: "Twilio SMS", description: "Text alerts to any phone number. The agent sends SMS when something needs immediate attention.", configSchema: twilio.configSchema, testParams: { body: "Vigil test SMS" } },
    { provider: "slack", name: "Slack", description: "Post to a Slack channel. The agent sends messages when emails match your criteria.", configSchema: slack.configSchema, testParams: { text: "Vigil test message" } },
    { provider: "discord", name: "Discord", description: "Post to a Discord channel via webhook.", configSchema: discord.configSchema, testParams: { content: "Vigil test message" } },
    { provider: "telegram", name: "Telegram", description: "Send messages to a Telegram chat or channel via bot.", configSchema: telegram.configSchema, testParams: { text: "Vigil test message" } },
    { provider: "email_forward", name: "Email Forward", description: "Forward alert summaries to another email address via Resend.", configSchema: email_forward.configSchema, testParams: { subject: "Vigil Test", body: "Test alert from Vigil Skills." } },

    // Project Management
    { provider: "linear", name: "Linear", description: "Create issues in Linear when the agent detects actionable tasks in email.", configSchema: linear.configSchema, testParams: { title: "Vigil test issue", description: "Created by Vigil skill test." } },
    { provider: "jira", name: "Jira", description: "Create Jira issues from email-detected tasks and obligations.", configSchema: jira.configSchema, testParams: { summary: "Vigil test issue", description: "Created by Vigil skill test." } },
    { provider: "github", name: "GitHub Issues", description: "Create GitHub issues when the agent finds bugs or tasks in email.", configSchema: github.configSchema, testParams: { title: "Vigil test issue", body: "Created by Vigil skill test." } },

    // Data and Docs
    { provider: "notion", name: "Notion", description: "Create pages in a Notion database. Log email insights, track obligations.", configSchema: notion.configSchema, testParams: { title: "Vigil Test Entry", content: "Test entry from Vigil." } },
    { provider: "airtable", name: "Airtable", description: "Append records to an Airtable base. Track email data in structured tables.", configSchema: airtable.configSchema, testParams: { fields: { Name: "Vigil Test", Status: "Test" } } },
    { provider: "google_sheets", name: "Google Sheets", description: "Append rows to a Google Sheet. Log email events, invoices, contacts.", configSchema: google_sheets.configSchema, testParams: { values: ["Vigil test", new Date().toISOString(), "test row"] } },

    // Ops
    { provider: "pagerduty", name: "PagerDuty", description: "Trigger incidents for critical email alerts. On-call escalation.", configSchema: pagerduty.configSchema, testParams: { summary: "Vigil test incident", severity: "info" } },
    { provider: "http", name: "HTTP Webhook", description: "POST JSON to any URL. Connect Vigil to Zapier, Make, n8n, or your own API.", configSchema: http.configSchema, testParams: { body: { source: "vigil", event: "test" } } },
];

export async function executeSkill(provider: string, config: unknown, params: unknown): Promise<SkillResult> {
    const p = PROVIDERS[provider];
    if (!p) return { ok: false, message: `Unknown skill provider: ${provider}` };
    try { return await p.execute(config, params); }
    catch (err) { return { ok: false, message: `Skill error: ${String(err)}` }; }
}
