#!/usr/bin/env bun
/**
 * Vigil V2 — End-to-End Test Script
 *
 * Tests the full pipeline:
 *   auth → watcher creation → email ingestion → thread detection → memory
 *
 * Usage:
 *   bun run scripts/test-e2e.ts
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY env var set
 *   - Server running (default: http://localhost:4000)
 *   - Optional: BASE_URL=http://localhost:4000 to override
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api`;

// ============================================================================
// Env check
// ============================================================================

if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌  ANTHROPIC_API_KEY is required");
    process.exit(1);
}

// ============================================================================
// HTTP helpers
// ============================================================================

async function post(path: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function get(path: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

function sep(label?: string) {
    const line = "─".repeat(56);
    if (label) {
        const padded = `  ${label}  `;
        const left = Math.floor((56 - padded.length) / 2);
        const right = 56 - left - padded.length;
        console.log("┌" + "─".repeat(left) + padded + "─".repeat(right) + "┐");
    } else {
        console.log(line);
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log("");
    sep("Vigil V2 — E2E Test");
    console.log(`  Server : ${BASE_URL}`);
    console.log(`  Model  : ${process.env.VIGIL_MODEL ?? "claude-haiku-4-5-20251001"}`);
    console.log("");

    // ── Health check ─────────────────────────────────────────────────────────
    const healthRes = await fetch(`${BASE_URL}/health`).catch(() => null);
    if (!healthRes?.ok) {
        console.error(`❌  Server not reachable at ${BASE_URL}`);
        console.error("    Start the server with: bun run dev");
        process.exit(1);
    }
    console.log("✓  Server is up");

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    console.log("\n[1] Auth — register or login");

    const EMAIL = "test@vigil.run";
    const PASSWORD = "test12345"; // 9 chars — meets 8-char minimum
    let accessToken: string;

    const registerRes = await post("/auth/register", {
        email: EMAIL,
        password: PASSWORD,
        name: "E2E Test User",
    });

    if (registerRes.status === 201) {
        accessToken = registerRes.data.tokens.access_token;
        console.log("  ✓  Registered:", EMAIL);
    } else if (registerRes.status === 409) {
        // Account exists — login instead
        const loginRes = await post("/auth/login", { email: EMAIL, password: PASSWORD });
        if (loginRes.status !== 200) {
            console.error("  ❌  Login failed:", loginRes.data);
            process.exit(1);
        }
        accessToken = loginRes.data.tokens.access_token;
        console.log("  ✓  Logged in (existing account):", EMAIL);
    } else {
        console.error("  ❌  Register failed:", registerRes.data);
        process.exit(1);
    }

    // ── 2. Create watcher ────────────────────────────────────────────────────
    console.log("\n[2] Create watcher (general template)");

    const GENERAL_PROMPT = `You are an email monitoring agent. You watch a stream of forwarded emails and take action when something needs attention.

Your job:
1. Read each email carefully. Extract who sent it, what they want, and whether it requires action.
2. Track conversations. Group related emails into threads. Update thread status as conversations evolve.
3. Remember what matters. Store facts, commitments, deadlines, and patterns as memories. Reference them when processing future emails.
4. Alert when needed. Send an alert when an email requires the user's attention — a decision, a deadline, a request, a problem.
5. Stay quiet when nothing matters. Not every email needs a response. Newsletters, confirmations, receipts, and FYIs should be noted but not alerted on unless they contain something unexpected.

Decision framework for alerting:
- ALERT: someone is waiting for a response, a deadline is approaching, money is involved, something is wrong, access/credentials are shared, a commitment was made
- DON'T ALERT: newsletters, order confirmations (unless wrong), marketing, automated notifications, FYI-only forwards, routine status updates

When you alert, be specific. Say what happened, who needs what, and what the user should do.
When you store memories, be concrete. "Client prefers Tuesday meetings" is useful. "Had a conversation" is not.`;

    const watcherRes = await post(
        "/watchers",
        {
            name: "E2E Test Watcher",
            system_prompt: GENERAL_PROMPT,
            tools: ["send_alert", "update_thread", "ignore_thread"],
            silence_hours: 48,
            tick_interval: 0, // no auto ticks during test
            template_id: "general",
        },
        accessToken
    );

    if (watcherRes.status !== 201) {
        console.error("  ❌  Failed to create watcher:", watcherRes.data);
        process.exit(1);
    }

    const watcher = watcherRes.data.watcher;
    console.log("  ✓  Created watcher:", watcher.name);
    console.log("     ID          :", watcher.id);
    console.log("     Ingest token:", watcher.ingest_token);

    // ── 3. First email ───────────────────────────────────────────────────────
    // Message-ID without angle brackets so the thread detection lookup works
    // (the In-Reply-To header will be cleaned to match the stored value)
    const MSG_ID_1 = `msg-e2e-001-${Date.now()}@layer7systems.com`;

    console.log("\n[3] Ingest email #1");
    console.log("    From      : cory@layer7systems.com");
    console.log("    Subject   : Re: Deployment config - need by Wednesday");
    console.log("    Message-ID:", MSG_ID_1);

    const ingest1 = await post(`/ingest/${watcher.ingest_token}`, {
        from: "cory@layer7systems.com",
        to: "watch@vigil.run",
        subject: "Re: Deployment config - need by Wednesday",
        text: "Hey, following up on the deployment config for staging. Can you send it over by Wednesday? This is the second time I am asking. Thanks, Cory",
        headers: {
            "message-id": MSG_ID_1,
        },
    });

    if (!ingest1.data?.success) {
        console.error("  ❌  Ingestion failed:", ingest1.data);
        process.exit(1);
    }
    console.log("  ✓  Ingested — agent invoked:", ingest1.data.agent_invoked);

    // ── 4. State after email #1 ──────────────────────────────────────────────
    console.log("\n[4] State after email #1");

    const [threadsRes1, actionsRes1, memRes1] = await Promise.all([
        get(`/watchers/${watcher.id}/threads`, accessToken),
        get(`/watchers/${watcher.id}/actions?limit=3`, accessToken),
        get(`/watchers/${watcher.id}/memory`, accessToken),
    ]);

    const threads1: any[] = threadsRes1.data.threads ?? [];
    const actions1: any[] = actionsRes1.data.actions ?? [];
    const memories1: any[] = memRes1.data.memories ?? [];

    if (threads1.length > 0) {
        const t = threads1[0];
        console.log(`  ✓  Thread created: "${t.subject}" [${t.status}] emails=${t.email_count}`);
    } else {
        console.warn("  ⚠  No threads found");
    }

    if (actions1.length > 0) {
        const a = actions1[0];
        console.log(`  ✓  Action logged: trigger=${a.trigger_type} tool=${a.tool ?? "(none)"} result=${a.result}`);
        if (a.decision) {
            try {
                const analysis = JSON.parse(a.decision);
                console.log(`     Analysis: intent="${analysis.intent}" urgency=${analysis.urgency}`);
                if (analysis.summary) console.log(`     Summary : ${analysis.summary}`);
            } catch { /* not JSON */ }
        }
        if (a.memory_delta) {
            console.log("  ✓  Memory stored by agent:");
            a.memory_delta.split("\n").slice(0, 3).forEach((line: string) => {
                if (line.trim()) console.log(`     ${line.trim().slice(0, 90)}`);
            });
        }
    }

    console.log(`  Memories after email #1: ${memories1.length}`);
    memories1.slice(0, 3).forEach((m: any) => {
        console.log(`     [i:${m.importance}] ${m.content.slice(0, 80)}`);
    });

    // ── 5. Second email (same thread via In-Reply-To) ────────────────────────
    const MSG_ID_2 = `msg-e2e-002-${Date.now()}@layer7systems.com`;

    console.log("\n[5] Ingest email #2 (In-Reply-To email #1)");
    console.log("    From       : cory@layer7systems.com");
    console.log("    Subject    : Re: Deployment config - need by Wednesday");
    console.log("    Message-ID :", MSG_ID_2);
    console.log("    In-Reply-To:", MSG_ID_1);

    const ingest2 = await post(`/ingest/${watcher.ingest_token}`, {
        from: "cory@layer7systems.com",
        to: "watch@vigil.run",
        subject: "Re: Deployment config - need by Wednesday",
        text: "Just checking in again. Did you get a chance to send the config? Client is asking about the timeline.",
        headers: {
            "message-id": MSG_ID_2,
            "in-reply-to": MSG_ID_1,
            "references": MSG_ID_1,
        },
    });

    if (!ingest2.data?.success) {
        console.error("  ❌  Ingestion failed:", ingest2.data);
        process.exit(1);
    }
    console.log("  ✓  Ingested — agent invoked:", ingest2.data.agent_invoked);

    // ── 6. Verify: thread grouping + memory accumulation ─────────────────────
    console.log("\n[6] Verify thread grouping + memory accumulation");

    const [threadsRes2, memRes2] = await Promise.all([
        get(`/watchers/${watcher.id}/threads`, accessToken),
        get(`/watchers/${watcher.id}/memory`, accessToken),
    ]);

    const threads2: any[] = threadsRes2.data.threads ?? [];
    const memories2: any[] = memRes2.data.memories ?? [];

    // Thread grouping
    if (threads2.length === 1) {
        const t = threads2[0];
        console.log(`  ✓  PASS  Both emails in 1 thread (email_count=${t.email_count})`);
        if (t.email_count >= 2) {
            console.log("  ✓  PASS  Thread email_count ≥ 2");
        } else {
            console.warn(`  ⚠  WARN  email_count=${t.email_count} (expected ≥2 — thread update may be pending)`);
        }
    } else if (threads2.length > 1) {
        console.warn(`  ⚠  FAIL  Emails split across ${threads2.length} threads — thread detection may need review`);
        threads2.forEach((t: any, i: number) => {
            console.warn(`     Thread ${i + 1}: "${t.subject}" emails=${t.email_count}`);
        });
    } else {
        console.warn("  ⚠  No threads found");
    }

    // Memory accumulation
    console.log(`  Memories: ${memories1.length} → ${memories2.length}`);
    if (memories2.length > memories1.length) {
        console.log("  ✓  PASS  Memory accumulated across both emails");
    } else if (memories2.length > 0) {
        console.log("  ~  Memory present (count unchanged — agent may not have added new chunks)");
    } else {
        console.warn("  ⚠  No memories stored — check agent response + ANTHROPIC_API_KEY");
    }

    memories2.slice(0, 5).forEach((m: any) => {
        console.log(`     [i:${m.importance}] ${m.content.slice(0, 80)}`);
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("");
    sep("Summary");
    console.log(`  Account  : ${EMAIL}`);
    console.log(`  Watcher  : ${watcher.id}`);
    console.log(`  Threads  : ${threads2.length} (expected 1)`);
    console.log(`  Memories : ${memories2.length}`);
    const pass = threads2.length === 1 && (threads2[0]?.email_count ?? 0) >= 2;
    console.log(`  Result   : ${pass ? "✓  PASS" : "⚠  PARTIAL (check warnings above)"}`);
    console.log("");
}

main().catch((err) => {
    console.error("\n❌  Test failed:", err.message ?? err);
    process.exit(1);
});
