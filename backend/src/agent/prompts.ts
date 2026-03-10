/**
 * Prompt Builder — V2 Core Product
 *
 * Constructs system prompt from watcher config + memory + thread context.
 * Also builds trigger-specific user prompts.
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
    const toolList = tools.length > 0 ? tools.join(", ") : "none";

    const silenceNote =
        watcher.silence_hours > 0
            ? `Alert when a thread has been silent for more than ${watcher.silence_hours} hours.`
            : "No silence threshold configured.";

    const threadContext = buildThreadContext(activeThreads);

    const now = new Date();
    const nowHuman = now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });

    return `You are an autonomous email monitoring agent.

## Current Time
${nowHuman} (${now.toISOString()})

## Your Watcher: "${watcher.name}"

${watcher.system_prompt}

## Configuration
- Silence threshold: ${watcher.silence_hours}h (${silenceNote})
- Available tools: ${toolList}
- Status: ${watcher.status}

## Your Memory
${memoryContext}

## Active Threads (${activeThreads.length})
${threadContext}

## Response Instructions

You must respond with a valid JSON object. No markdown fences, no commentary — raw JSON only.

Schema:
{
  "actions": [
    {
      "tool": "<tool_name from available tools>",
      "params": { ... },
      "reasoning": "<why you are taking this action>"
    }
  ],
  "memory_append": [
    {
      "content": "<what to remember — must include specific dates, names, amounts>",
      "importance": 1-5,
      "source_quote": "<exact quote from the email that this memory is based on>",
      "confidence": 1-5
    }
  ],
  "memory_obsolete": ["<memory_id to mark as obsolete — use when info is outdated, superseded, or no longer relevant>"],
  "thread_updates": [
    {
      "thread_id": "<id>",
      "status": "active (tracked + silence alerts) | watching (tracked, no silence alerts) | resolved (closed, handled) | ignored (closed, noise)",
      "summary": "<concise updated summary>"
    }
  ],
  "email_analysis": {
    "summary": "<one sentence summary>",
    "intent": "<what the sender wants>",
    "urgency": "low|normal|high",
    "entities": ["<names, amounts, dates, etc>"],
    "reasoning": "<2-3 sentences explaining your decisions: why you chose this thread status, why you did or did not alert, what you stored in memory and why>"
  }
}

## Rules
- actions can be an empty array if no action is needed
- thread_updates and email_analysis can be null if not applicable
- memory_obsolete can be null or an array of memory IDs (from the [id:xxx] tags in Your Memory). Use it to retire outdated info: deadlines that passed, facts that changed, completed tasks, superseded details.
- memory_append: ONLY store facts that outlive the current thread. The thread summary already captures what happened. Memory is for cross-thread knowledge: specific dates, dollar amounts, deadlines, commitments, contact info, recurring patterns.
  - DO NOT store: summaries of what the email said (that's what thread summaries are for), general context, or information already in the thread summary.
  - DO store: "Contract renewal deadline: March 30, 2026" or "Cory's rate: $47.85/hr" or "Always CC legal on vendor contracts."
  - Most emails need ZERO memories. Only store when there's a concrete fact worth remembering for future emails or ticks.
  - Memories are linked to the current thread. If you see a memory tagged with the same thread (shown as [thread:XXXXXXXX] in Your Memory), that memory will be UPDATED with your new content, not duplicated. So if a date changes, just store the corrected fact and it will replace the old one for this thread.
  - When a thread is resolved or ignored, its low-importance memories are automatically pruned. High-importance memories (4-5) survive because they contain facts that matter beyond the thread (deadlines, money, commitments).
  - importance (1-5): 5=deadlines/money/commitments, 4=meetings/decisions, 3=context, 2=FYI, 1=noise (rarely store)
  - source_quote: the EXACT phrase from the email this memory is based on. Required for importance >= 4.
  - confidence (1-5): 5=directly stated, 4=strongly implied, 3=inferred, 2=guessed, 1=uncertain.
- Only use tools from the available tools list
- send_alert is an INTERRUPTION. Only use it when the user needs to act TODAY or will lose something if they don't see this RIGHT NOW. Examples that warrant an alert:
  - Security: unauthorized access, fraud, account lockout
  - Money at risk: margin calls, payment failures, overdue invoices
  - Deadline within 48 hours that requires preparation
  - Someone is waiting on the user and explicitly said it's urgent
  Examples that do NOT warrant an alert:
  - Scheduling changes (exam moved, meeting rescheduled) — store memory, update thread
  - FYI information, even if important — store memory, update thread
  - Deadlines more than 48 hours away — the scheduled tick will catch these
  - Contract discussions, proposals, non-urgent requests — track as active thread
  The scheduled tick system exists specifically to surface approaching deadlines. Trust it. Don't front-load alerts on things that aren't time-critical today.
- For silence alerts: frame as questions, not statements. The user may have replied directly without forwarding their reply. Say "This thread has been quiet for 3 days — have you already handled this?" not "Vendor hasn't replied in 3 days."
- Keep thread summaries concise and actionable (1-2 sentences)
- Be extremely selective about memory. Most emails need zero memories. The thread summary captures the conversation. Memory is for facts that matter ACROSS threads or for future ticks: dates, amounts, deadlines, commitments.
- When you do store a memory, make it atomic: one fact per memory. "Contract renewal: March 30, 2026. Action: sign and return." Not a paragraph.
- Email bodies are never persisted — the thread summary is the record of what happened.
- For silence alerts: only "active" threads are checked. "watching" threads are visible but won't trigger silence alerts.
- Use "watching" for threads you want to track but that don't need silence monitoring (routine billing, newsletters you kept, low-priority FYIs)
- Use "active" for threads where a stalled conversation matters (work requests, deadlines, pending responses)
- IMPORTANT: Always set thread status on the first email. Don't leave everything as "active" by default. Triage immediately:
  - Marketing, newsletters, order confirmations → "ignored" (with ignore_thread tool) or "watching"
  - Routine bills with auto-pay, FYI notifications → "watching"
  - Work emails needing response, deadlines, money matters → "active"
  - Spam, unsolicited → "ignored"`;
}

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
    const timestamp = new Date(email.receivedAt).toISOString();
    const historySection =
        threadHistory.length > 0
            ? `\n\n## Thread History (${threadHistory.length} prior emails)\n` +
              threadHistory
                  .map((e) => {
                      const analysis = safeParseJson<any>(e.analysis, null);
                      return `- [${e.received_at ?? "unknown"}] From: ${e.from_addr ?? "unknown"} — ${analysis?.summary ?? e.subject ?? "(no summary)"}`;
                  })
                  .join("\n")
            : "";

    const now = new Date();
    const received = new Date(email.receivedAt);
    const ageMinutes = Math.max(0, Math.round((now.getTime() - received.getTime()) / 60000));
    const ageLabel = ageMinutes < 2 ? "just now" : ageMinutes < 60 ? `${ageMinutes} minutes ago` : `${Math.round(ageMinutes / 60)} hours ago`;

    const nowStr = now.toISOString();
    const nowHuman = now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });

    return `## New Email Received

Current time: ${nowHuman} (${nowStr})
Email received: ${timestamp} (${ageLabel})

Thread ID: ${threadId}
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}

---
${email.body}
---${historySection}

## Temporal Reasoning
When the email uses relative time references ("in 3 hours", "by end of day", "tomorrow", "next week"), resolve them against the email's received timestamp (${timestamp}), NOT the current time. For example, if the email was received at 1pm and says "in 3 hours", the deadline is 4pm on that same day. Then compare that resolved deadline to the current time (${nowStr}) to determine urgency.

Process this email. Analyze content, update thread state, and take action if warranted.
Use the Thread ID above when calling tools like update_thread, ignore_thread, etc.`;
}

export function buildTickTriggerPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    silenceHours: number,
    memoryContext: string
): string {
    const now = new Date(timestamp).toISOString();
    const dateStr = new Date(timestamp).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Silence check: only "active" threads
    const overdueThreads = activeThreads.filter((t) => {
        if (t.status !== "active") return false;
        if (!t.last_activity) return false;
        const lastActivity = new Date(t.last_activity).getTime();
        const hoursSilent = (timestamp - lastActivity) / (1000 * 60 * 60);
        return hoursSilent >= silenceHours;
    });

    const silenceSection = overdueThreads.length > 0
        ? overdueThreads.map((t) => {
            const hoursSilent = t.last_activity
                ? Math.floor((timestamp - new Date(t.last_activity).getTime()) / (1000 * 60 * 60))
                : "?";
            return `- Thread "${t.subject ?? "(no subject)"}" (${t.id}): silent for ${hoursSilent}h — ${t.summary ?? "no summary"}`;
        }).join("\n")
        : "No threads currently exceed the silence threshold.";

    const watchingThreads = activeThreads.filter((t) => t.status === "watching");
    const activeCount = activeThreads.filter((t) => t.status === "active").length;

    // Thread summaries for full review
    const allThreadSummary = activeThreads.map((t) => {
        const age = t.first_seen ? Math.floor((timestamp - new Date(t.first_seen).getTime()) / (1000 * 60 * 60)) : 0;
        return `- [${t.id}] "${t.subject ?? "(no subject)"}" (${t.status}, ${age}h old, ${t.email_count} emails) — ${t.summary ?? "no summary"}`;
    }).join("\n");

    return `## Proactive Review — ${dateStr} (${now})

You are doing a scheduled review. This is your chance to think proactively, not just react to emails.

### 1. Silence Check (threshold: ${silenceHours}h)
${activeCount} active thread(s), ${watchingThreads.length} watching.
${silenceSection}

### 2. All Active Threads
${allThreadSummary || "No active threads."}

### 3. Your Memories
Review your memories for time-sensitive items: approaching deadlines, pending payments, scheduled events, promises made, follow-ups needed. The current date/time is ${dateStr}.
${memoryContext}

### Your Tasks
1. **Silence alerts**: Alert on overdue active threads if not already alerted recently.
2. **Proactive alerts**: Scan your memories for deadlines or events approaching within the next 48 hours. Alert the user if they need to act soon.
3. **Thread cleanup**: Resolve or downgrade threads that are done. Ignore threads that turned out to be noise.
4. **Memory maintenance**: Mark obsolete memories (passed deadlines, completed tasks, outdated info). Store new observations.
5. **Status review**: Should any "active" threads be downgraded to "watching"? Should any "watching" threads be escalated to "active"?

Only alert when the user genuinely needs to know something. Don't re-alert on things you've already flagged.`;
}

export function buildDigestPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    allThreads: ThreadRow[],
    memoryContext: string,
    actionStats: { total: number; alerts: number; ignored: number; costUsd: number; periodDays: number }
): string {
    const dateStr = new Date(timestamp).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const statusCounts = {
        active: allThreads.filter((t) => t.status === "active").length,
        watching: allThreads.filter((t) => t.status === "watching").length,
        resolved: allThreads.filter((t) => t.status === "resolved").length,
        ignored: allThreads.filter((t) => t.status === "ignored").length,
    };

    const threadSummaries = activeThreads.map((t) => {
        return `- "${t.subject ?? "(no subject)"}" (${t.status}, ${t.email_count} emails) — ${t.summary ?? "no summary"}`;
    }).join("\n") || "No active threads.";

    return `## Weekly Digest — ${dateStr}

Generate a concise weekly email digest for the user. This should be a helpful summary they actually want to read.

### Stats (last ${actionStats.periodDays} days)
- Emails processed: ${actionStats.total}
- Alerts sent: ${actionStats.alerts}
- Threads ignored: ${actionStats.ignored}
- AI cost: $${actionStats.costUsd.toFixed(4)}
- Threads: ${statusCounts.active} active, ${statusCounts.watching} watching, ${statusCounts.resolved} resolved, ${statusCounts.ignored} ignored

### Active Threads Needing Attention
${threadSummaries}

### Your Memories (check for upcoming deadlines)
${memoryContext}

### Instructions
Compose the digest as the "message" parameter in a send_alert call. Format it as a readable summary with sections:
1. **What happened** — brief overview of email activity
2. **Needs attention** — threads or deadlines that need action this week
3. **Resolved** — things that got handled
4. **Coming up** — deadlines or events from your memories in the next 7 days

Keep it concise and actionable. This is a weekly email the user should look forward to, not dread.
Use send_alert with subject "Weekly Digest" to deliver it.`;
}

export function buildUserQueryPrompt(queryText: string): string {
    return `## User Query\n\n${queryText}`;
}

// ============================================================================
// Helpers
// ============================================================================

function buildThreadContext(threads: ThreadRow[]): string {
    if (threads.length === 0) return "No active threads.";

    return threads
        .map((t) => {
            const subject = t.subject ?? "(no subject)";
            const lastActivity = t.last_activity
                ? `last activity: ${t.last_activity}`
                : "no activity recorded";
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
