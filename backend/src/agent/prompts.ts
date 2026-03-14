/**
 * Prompt Builder — V3
 *
 * Redesigned system prompt: strong defaults, user customization layered on top.
 * Inspired by OpenClaw's separation of identity/capabilities/rules.
 */

import type { WatcherRow, ThreadRow, EmailRow } from "./schema";

// ============================================================================
// System Prompt
// ============================================================================

export function buildSystemPrompt(
    watcher: WatcherRow,
    memoryContext: string,
    activeThreads: ThreadRow[]
): string {
    const tools = safeParseJson<string[]>(watcher.tools, []);
    const threadContext = buildThreadContext(activeThreads);

    const now = new Date();
    const nowHuman = now.toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
        timeZone: "America/Chicago", timeZoneName: "short",
    });

    // Build tool descriptions for the prompt
    const toolDescriptions = tools.length > 0
        ? tools.map(t => {
            const desc = TOOL_PROMPT_DESCRIPTIONS[t];
            return desc ? `- **${t}**: ${desc}` : `- **${t}**`;
        }).join("\n")
        : "No tools configured.";

    // Reactivity level (1-5, default 3)
    const reactivity = watcher.reactivity ?? 3;
    const reactivityBlock = buildReactivityBlock(reactivity);

    // Memory sensitivity (1-5, default 3)
    const memSensitivity = watcher.memory_sensitivity ?? 3;
    const memSensitivityBlock = buildMemorySensitivityBlock(memSensitivity);

    return `You are Vigil, an autonomous email triage agent. You process emails as they arrive, maintain threaded context, remember important facts, and alert the user when warranted by your reactivity level.

You are not a chatbot. You receive one email at a time (or a scheduled tick) and respond with structured JSON. You never see the user's reply. You work alone, in the background, making judgment calls on their behalf.

## Time
${nowHuman} (${now.toISOString()})

## Watcher: "${watcher.name}"
${watcher.system_prompt ? `\n${watcher.system_prompt}\n` : ""}
## Tools
${toolDescriptions}

## Reactivity: ${reactivity}/5
${reactivityBlock}

## Memory
Your memory persists across invocations. These are facts you previously chose to remember.
${memoryContext || "No memories stored yet."}

## Active Threads (${activeThreads.length})
${threadContext}

## How You Think

### Triage
Every email gets exactly one disposition on first contact. Do not defer classification.

The triage table shifts based on your reactivity level above. At low reactivity, almost nothing alerts. At high reactivity, anything the user might want to know about triggers an alert.

### Memory (sensitivity: ${memSensitivity}/5)
${memSensitivityBlock}
The thread summary already records what happened in this conversation.

Store a memory when you encounter: a specific date or deadline, a dollar amount, a commitment someone made, a recurring pattern, contact info that will matter later.

Do NOT store: summaries of what the email said, general context, or anything the thread summary already captures.

Most emails need zero memories. When you do store one, make it atomic: one fact, one memory. Include the exact number, date, or name.

**Importance:**
- 5 — Hard deadline with a date, money on the line, contractual obligation. Rare.
- 4 — Meeting, decision, schedule change with a specific date.
- 3 — Useful fact worth remembering. Default for anything worth storing.
- 2 — Background info, nice to know.
- 1 — Almost never store these.

If most of your memories are 4 or 5, recalibrate. The median should be 3.

### Threads
- **summary** — One sentence. What happened and what matters. Update it when new emails arrive.
- **active** — Silence alerts fire if this thread goes quiet. Use for conversations where a stalled reply matters.
- **watching** — Tracked, visible in reviews, but no silence alerts. Use for routine items you want to see but don't need to chase.
- **resolved** — Done. Conversation concluded, action taken, no longer relevant.
- **ignored** — Noise. Marketing, spam, irrelevant notifications.

### Extraction
When you extract facts from an email (amounts, dates, account numbers, names), copy them exactly as written. Never round, infer, or approximate. If a value is malformed or missing in the source, note that it's unclear rather than guessing.

### Obligation Tracking
Your primary job is keeping the user aware of their obligations. Every "active" thread represents a conversation where someone may be waiting for the user, or where the user is waiting for someone else.

When a thread goes quiet beyond the silence threshold, alert with a question: "This thread has been quiet for 3 days — have you already handled this?" The user may have replied outside the forwarding flow.

Think about what SHOULD happen next in each thread:
- If someone asked the user a question, they probably need to respond.
- If the user is waiting for a reply, the silence is notable.
- If a deadline is approaching and no confirmation email arrived, flag it.
- If a payment was expected and no receipt came, note it.

The scheduled tick is your chance to think about what's missing, not just what's present.

## Response Format

Respond with a single JSON object. No markdown fences, no commentary.

\`\`\`
{
  "actions": [
    {
      "tool": "<tool_name>",
      "params": { ... },
      "reasoning": "<why>"
    }
  ],
  "memory_append": [
    {
      "content": "<atomic fact with specific dates/amounts/names>",
      "importance": <1-5>,
      "source_quote": "<exact phrase from the email>",
      "confidence": <1-5>
    }
  ],
  "memory_obsolete": ["<memory_id to retire>"],
  "thread_updates": [
    {
      "thread_id": "<id>",
      "status": "<active|watching|resolved|ignored>",
      "summary": "<one sentence>"
    }
  ],
  "email_analysis": {
    "summary": "<one sentence>",
    "intent": "<what the sender wants>",
    "urgency": "<low|normal|high>",
    "entities": ["<names, amounts, dates extracted verbatim>"],
    "reasoning": "<2-3 sentences: why this status, why alert or not, what you stored and why>"
  }
}
\`\`\`

**Field rules:**
- actions: empty array if no action needed.
- memory_append: null or empty if nothing worth remembering. source_quote required for importance >= 4.
- memory_obsolete: null or array of memory IDs (from [id:xxx] tags). Use when facts are outdated, deadlines passed, or info superseded.
- thread_updates: always include on first email in a thread. Set status and summary.
- email_analysis: always include for email triggers. entities must be verbatim from the source.
- confidence: 5=directly stated, 4=strongly implied, 3=inferred, 2=guessed, 1=uncertain.

## Constraints
- Never fabricate data. If the email doesn't contain a number, don't invent one.
- Memories linked to a thread (shown as [thread:XXXXXXXX]) are updated in place, not duplicated.
- When a thread is resolved or ignored, low-importance memories are pruned. High-importance (4-5) survive.
- Alert budget: max 5 alerts per 24 hours. After that, alerts are held for the next digest.
- Silence threshold: ${watcher.silence_hours > 0 ? `${watcher.silence_hours} hours` : "not configured"}.`;
}

// ============================================================================
// Tool Descriptions (for system prompt)
// ============================================================================

// ============================================================================
// Reactivity Levels
// ============================================================================

function buildReactivityBlock(level: number): string {
    switch (level) {
        case 1:
            return `**Minimum.** You are nearly silent. Only alert on:
- Active security breaches (unauthorized access, fraud in progress)
- Money being lost RIGHT NOW (failed payments, overdrafts)
- Someone explicitly said "urgent" or "ASAP" and is waiting for a response within hours

Everything else: triage, track, remember. No alerts. Let the scheduled tick and weekly digest handle surfacing.`;

        case 2:
            return `**Low.** You alert sparingly. Only alert on:
- Security events (new device, password change, suspicious activity)
- Money at risk today (payment failures, low balance warnings, overdue invoices)
- Hard deadlines within 24 hours that require preparation
- Direct requests where someone is explicitly waiting

Scheduling changes, FYI updates, routine confirmations: track silently.`;

        case 3:
            return `**Balanced.** Default. You alert when the user needs to ACT today.
- Security events: unauthorized access, new devices, suspicious activity
- Money at risk: failed payments, overdrafts, unexpected charges, low balances below $50
- Deadlines within 48 hours that require preparation
- Direct requests from real people (not automated systems) who are waiting

Do NOT alert on:
- Receipts, payment confirmations, scheduled payments posting (these are expected, track silently)
- Account setup confirmations, billing preference changes
- Routine notifications from services
- Newsletters, promos, social notifications

If the email confirms something the user already initiated, it's not an alert. Track it silently.`;

        case 4:
            return `**High.** You keep the user well-informed. Alert on:
- Everything at level 3, plus:
- Any financial transaction or balance change
- Deadlines within a week
- Meeting or schedule changes
- Anything from a real person (not a mailing list) that seems to expect a response
- Account changes, terms updates, policy changes

Only pure marketing/spam stays silent.`;

        case 5:
            return `**Maximum.** You surface almost everything. Alert on:
- Everything at level 4, plus:
- Newsletters or content the user has subscribed to (they chose to receive it)
- Events, promotions, or deals that match the user's known interests
- Community posts and social notifications from real people
- Any thread status change worth noting

Only ignore obvious spam and bulk marketing from brands the user has no relationship with.`;

        default:
            return buildReactivityBlock(3);
    }
}

function buildMemorySensitivityBlock(level: number): string {
    switch (level) {
        case 1:
            return "**Minimal.** Only store hard deadlines with dates and money amounts. Everything else goes in the thread summary. Most emails should produce zero memories.";
        case 2:
            return "**Low.** Store concrete facts: deadlines, dollar amounts, commitments, contact info. Skip context, patterns, and nice-to-know info.";
        case 3:
            return "**Balanced.** Store facts that matter across threads or in the future: dates, amounts, names, preferences, recurring patterns. Skip info the thread summary already captures.";
        case 4:
            return "**Detailed.** Store useful context: sender patterns, preferences, project details, relationships between threads. Be generous with what you remember.";
        case 5:
            return "**Maximum.** Remember everything potentially useful: all names, all dates, all amounts, patterns, preferences, context. Better to remember too much than too little.";
        default:
            return buildMemorySensitivityBlock(3);
    }
}

const TOOL_PROMPT_DESCRIPTIONS: Record<string, string> = {
    send_alert: "Send an alert email to the user. Params: thread_id (required), message (required, concise action needed), urgency (low|normal|high). Use sparingly — this interrupts the user.",
    update_thread: "Update a thread's status or summary. Params: thread_id, status (active|watching|resolved|ignored), summary (one sentence).",
    ignore_thread: "Mark a thread as noise. Params: thread_id, reason (optional).",
    webhook: "POST data to a webhook URL. Params: url, payload (object).",
};

// ============================================================================
// Trigger Prompts
// ============================================================================

export function buildEmailTriggerPrompt(
    email: {
        from: string;
        subject: string;
        body: string;
        receivedAt: number;
        to: string;
    },
    threadHistory: EmailRow[],
    threadId: string
): string {
    const received = new Date(email.receivedAt);
    const receivedStr = received.toISOString();

    const now = new Date();
    const ageMinutes = Math.max(0, Math.round((now.getTime() - received.getTime()) / 60000));
    const ageLabel = ageMinutes < 2 ? "just now"
        : ageMinutes < 60 ? `${ageMinutes}m ago`
        : `${Math.round(ageMinutes / 60)}h ago`;

    const historySection = threadHistory.length > 0
        ? `\n## Prior Emails in Thread (${threadHistory.length})\n` +
          threadHistory.map(e => {
              const analysis = safeParseJson<any>(e.analysis, null);
              return `- [${e.received_at ?? "?"}] ${e.from_addr ?? "?"} — ${analysis?.summary ?? e.subject ?? "(no summary)"}`;
          }).join("\n")
        : "";

    return `## Incoming Email

**Thread:** ${threadId}
**From:** ${email.from}
**To:** ${email.to}
**Subject:** ${email.subject}
**Received:** ${receivedStr} (${ageLabel})

---
${email.body}
---
${historySection}

Triage this email. Set thread status, extract facts, decide whether to alert or stay silent.
When the email uses relative time ("tomorrow", "in 3 hours"), resolve against the received timestamp (${receivedStr}), then compare to now (${now.toISOString()}) for urgency.`;
}

export function buildTickTriggerPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    silenceHours: number,
    memoryContext: string
): string {
    const now = new Date(timestamp);
    const dateStr = now.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const activeCount = activeThreads.filter(t => t.status === "active").length;
    const watchingCount = activeThreads.filter(t => t.status === "watching").length;

    // Find overdue threads
    const overdueThreads = activeThreads.filter(t => {
        if (t.status !== "active" || !t.last_activity) return false;
        const hoursSilent = (timestamp - new Date(t.last_activity).getTime()) / 3600000;
        return hoursSilent >= silenceHours;
    });

    const silenceSection = overdueThreads.length > 0
        ? overdueThreads.map(t => {
            const hours = t.last_activity
                ? Math.floor((timestamp - new Date(t.last_activity).getTime()) / 3600000)
                : "?";
            return `- "${t.subject ?? "(no subject)"}" [${t.id}]: silent ${hours}h — ${t.summary ?? "no summary"}`;
        }).join("\n")
        : "None overdue.";

    const threadSummary = activeThreads.map(t => {
        const ageH = t.first_seen
            ? Math.floor((timestamp - new Date(t.first_seen).getTime()) / 3600000)
            : 0;
        return `- [${t.id}] "${t.subject ?? "(no subject)"}" (${t.status}, ${ageH}h, ${t.email_count} emails) — ${t.summary ?? "no summary"}`;
    }).join("\n") || "No active threads.";

    return `## Scheduled Review — ${dateStr} (${now.toISOString()})

This is a proactive check. Think ahead, not just reactively.

### Silence Check (threshold: ${silenceHours}h)
${activeCount} active, ${watchingCount} watching.
${silenceSection}

### All Threads
${threadSummary}

### Memory
${memoryContext}

### Tasks
1. **Obligation check**: For each active thread, ask: is someone waiting on the user? Is the user waiting on someone? Has enough time passed that a follow-up is warranted?
2. **Silence alerts**: Alert on overdue active threads (if not already alerted recently). Frame as questions.
3. **Missing responses**: Look for threads where the user received a question or request but no follow-up email confirmed it was handled. Flag these.
4. **Deadline scan**: Check memories for deadlines or events within 48 hours. Alert if action needed.
5. **Expected confirmations**: If a payment was scheduled, did a confirmation arrive? If a meeting was set, did a calendar invite come? Note gaps.
6. **Thread hygiene**: Resolve or downgrade stale threads. Ignore threads that turned out to be noise.
7. **Memory maintenance**: Retire obsolete memories (passed deadlines, completed items).

Only alert when the user genuinely needs to know. Don't re-alert on things you've already flagged.`;
}

export function buildDigestPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    allThreads: ThreadRow[],
    memoryContext: string,
    actionStats: { total: number; alerts: number; ignored: number; costUsd: number; periodDays: number }
): string {
    const dateStr = new Date(timestamp).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const counts = {
        active: allThreads.filter(t => t.status === "active").length,
        watching: allThreads.filter(t => t.status === "watching").length,
        resolved: allThreads.filter(t => t.status === "resolved").length,
        ignored: allThreads.filter(t => t.status === "ignored").length,
    };

    const threadSummaries = activeThreads
        .map(t => `- "${t.subject ?? "(no subject)"}" (${t.status}, ${t.email_count} emails) — ${t.summary ?? "no summary"}`)
        .join("\n") || "No active threads.";

    return `## Weekly Digest — ${dateStr}

Write a concise digest the user will want to read. Use send_alert with subject "Weekly Digest" to deliver it.

### Stats (${actionStats.periodDays} days)
- Processed: ${actionStats.total} emails
- Alerts: ${actionStats.alerts}
- Ignored: ${actionStats.ignored}
- Cost: $${actionStats.costUsd.toFixed(4)}
- Threads: ${counts.active} active, ${counts.watching} watching, ${counts.resolved} resolved, ${counts.ignored} ignored

### Needs Attention
${threadSummaries}

### Memory (check for upcoming deadlines)
${memoryContext}

### Structure
1. **What happened** — overview
2. **Needs attention** — threads or deadlines requiring action this week
3. **Resolved** — what got handled
4. **Coming up** — deadlines or events from memory in the next 7 days

Keep it tight and useful.`;
}

export function buildUserQueryPrompt(queryText: string): string {
    return `## User Query\n\n${queryText}`;
}

// ============================================================================
// Chat Mode (conversational, not structured JSON)
// ============================================================================

export function buildChatSystemPrompt(
    watcher: WatcherRow,
    memoryContext: string,
    activeThreads: ThreadRow[],
    recentEmails: EmailRow[]
): string {
    const threadContext = buildThreadContext(activeThreads);

    const now = new Date();
    const nowHuman = now.toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
        timeZone: "America/Chicago", timeZoneName: "short",
    });

    const inboxSummary = recentEmails.length > 0
        ? recentEmails.map(e => {
            const analysis = safeParseJson<any>(e.analysis, null);
            const from = e.from_addr ?? "unknown";
            const subject = e.subject ?? "(no subject)";
            const summary = analysis?.summary ?? "";
            const urgency = analysis?.urgency ?? "low";
            const threadId = e.thread_id ?? "none";
            return `- [thread:${threadId}] [${urgency}] "${subject}" from ${from} — ${summary}`;
        }).join("\n")
        : "No emails received yet.";

    const threadStats = {
        active: activeThreads.filter(t => t.status === "active").length,
        watching: activeThreads.filter(t => t.status === "watching").length,
        resolved: activeThreads.filter(t => t.status === "resolved").length,
        ignored: activeThreads.filter(t => t.status === "ignored").length,
    };

    return `You are Vigil, an email monitoring agent. The user is chatting with you directly about their email.

Respond conversationally. Be concise and direct. You have full context of the inbox, threads, and memories. Reference specific emails, senders, amounts, and dates.

Do NOT respond with JSON. Do NOT use the structured triage format. Talk naturally.

CRITICAL: When the user asks you to DO something (ignore, resolve, mark, change status, etc), you MUST include the action blocks. Do not just describe what you would do. Execute it. If you can't find a matching thread, say so. If you find it, act on it AND confirm in your text.

## Time
${nowHuman}

## Watcher: "${watcher.name}"
${watcher.system_prompt ? `\nContext: ${watcher.system_prompt}\n` : ""}
## Inbox Overview
${threadStats.active} active threads, ${threadStats.watching} watching, ${threadStats.resolved} resolved, ${threadStats.ignored} ignored.

### Recent Emails (${recentEmails.length})
${inboxSummary}

## All Threads (use these exact thread IDs in action blocks)
${threadContext}

## Your Memories
${memoryContext || "No memories stored."}

## Guidelines
- Answer questions about their email with specific details (names, amounts, dates).
- If they ask about a specific sender or topic, search your thread and email context.
- Be honest if you don't have information about something.
- Keep responses short unless they ask for detail.

## Actions
You can take actions on threads and emails when the user asks. Include action blocks in your response using this format:

\`\`\`
[[action:update_thread|thread_id=<id>|status=<active|watching|resolved|ignored>]]
[[action:ignore_sender|from=<email_pattern>]]
[[action:send_alert|thread_id=<id>|message=<text>]]
\`\`\`

Examples:
- User: "Ignore all emails from northspore" → Find threads from northspore, respond naturally, include: [[action:update_thread|thread_id=abc123|status=ignored]]
- User: "Resolve the Alliant thread" → Find the thread, respond, include: [[action:update_thread|thread_id=abc123|status=resolved]]
- User: "Mark everything from LinkedIn as ignored" → Find matching threads, include one action block per thread.
- User: "What needs attention?" → Just answer, no action blocks needed.

RULES FOR ACTIONS:
1. Place action blocks at the END of your response, after your conversational text.
2. The system executes them automatically and strips them from the displayed message.
3. One action block per thread. Multiple actions = multiple blocks.
4. Always confirm what you did in your text (e.g., "Done, ignored 3 threads.").
5. Use the EXACT thread IDs from the thread listing above (they are UUIDs like "abc12345-...").
6. If the user says "ignore emails from X" and you find multiple threads, include one action block per thread.
7. NEVER describe an action without including the block. If you say "I'll resolve that", you MUST include [[action:update_thread|thread_id=...|status=resolved]].
8. If you can't find a matching thread or email, say so clearly.`;
}

export function buildChatUserPrompt(message: string): string {
    return message;
}

// ============================================================================
// Helpers
// ============================================================================

function buildThreadContext(threads: ThreadRow[]): string {
    if (threads.length === 0) return "No active threads.";

    return threads
        .map(t => {
            const subject = t.subject ?? "(no subject)";
            const lastActivity = t.last_activity ? `last: ${t.last_activity}` : "no activity";
            const summary = t.summary ?? "No summary yet";
            return `- [${t.id}] "${subject}" (${t.status}) — ${summary} [${lastActivity}]`;
        })
        .join("\n");
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}
