#!/usr/bin/env bun
/**
 * Bun helper — builds Vigil prompts from JSON input on stdin.
 * Called by vigil-provider.ts via child_process.
 *
 * Input (JSON on stdin):
 *   { trigger_type, email_from, email_to, email_subject, email_body,
 *     email_received_at, thread_id, thread_history, memory_context,
 *     active_threads, reactivity, memory_sensitivity, silence_hours, ... }
 *
 * Output (JSON on stdout):
 *   { systemPrompt: string, userPrompt: string }
 */

import {
    buildSystemPrompt,
    buildEmailTriggerPrompt,
    buildTickTriggerPrompt,
    buildDigestPrompt,
    buildUserQueryPrompt,
} from "../../src/agent/prompts";

import type { WatcherRow, ThreadRow, EmailRow } from "../../src/agent/schema";

const input = JSON.parse(await Bun.stdin.text());

const watcher: WatcherRow = {
    id: "test-watcher-001",
    account_id: "test-account-001",
    name: "Vigil Test Watcher",
    ingest_token: "test-token",
    system_prompt: input.system_prompt ?? "",
    tools: JSON.stringify(["send_alert", "update_thread", "ignore_thread"]),
    silence_hours: input.silence_hours ?? 48,
    tick_interval: 300,
    model: null,
    status: "active",
    template_id: null,
    last_tick_at: null,
    reactivity: input.reactivity ?? 3,
    memory_sensitivity: input.memory_sensitivity ?? 3,
    digest_frequency: "weekly",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
} as unknown as WatcherRow;

const memoryContext = input.memory_context ?? "No memories stored yet.";
const activeThreads: ThreadRow[] = input.active_threads ?? [];

const systemPrompt = buildSystemPrompt(watcher, memoryContext, activeThreads);

let userPrompt: string;
const triggerType = input.trigger_type ?? "email_received";

switch (triggerType) {
    case "email_received": {
        userPrompt = buildEmailTriggerPrompt(
            {
                from: input.email_from ?? "unknown@example.com",
                subject: input.email_subject ?? "(no subject)",
                body: input.email_body ?? "",
                receivedAt: input.email_received_at ?? Date.now(),
                to: input.email_to ?? "user@vigil.run",
            },
            input.thread_history ?? [],
            input.thread_id ?? "thread-test-001"
        );
        break;
    }
    case "scheduled_tick": {
        userPrompt = buildTickTriggerPrompt(
            input.tick_timestamp ?? Date.now(),
            activeThreads,
            input.silence_hours ?? 48,
            memoryContext
        );
        break;
    }
    case "weekly_digest": {
        userPrompt = buildDigestPrompt(
            input.tick_timestamp ?? Date.now(),
            activeThreads,
            input.all_threads ?? [],
            memoryContext,
            { total: 42, alerts: 5, ignored: 20, costUsd: 0.0214, periodDays: 7 }
        );
        break;
    }
    case "user_query": {
        userPrompt = buildUserQueryPrompt(input.query ?? "What needs attention?");
        break;
    }
    default:
        userPrompt = `## User Message\n\n${input.message ?? "(empty)"}`;
}

console.log(JSON.stringify({ systemPrompt, userPrompt }));
