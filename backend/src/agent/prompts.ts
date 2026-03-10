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

    return `You are an autonomous email monitoring agent.

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
    { "content": "<what to remember>", "importance": 1-5 }
  ],
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
    "entities": ["<names, amounts, dates, etc>"]
  }
}

## Rules
- actions can be an empty array if no action is needed
- thread_updates and email_analysis can be null if not applicable
- memory_append can be null or an empty array. Each memory needs an importance score:
  - 5: Critical — deadlines, money amounts, action items, commitments
  - 4: High — meeting details, key decisions, contact preferences
  - 3: Medium — general context, routine observations
  - 2: Low — minor details, FYI items
  - 1: Trivial — noise, marketing content, auto-generated content (usually don't store these)
- Only use tools from the available tools list
- Only call send_alert when the user genuinely needs to know something
- Keep thread summaries concise and actionable (1-2 sentences)
- Be selective about what to store in memory — don't store routine/obvious information
- Email bodies are never persisted — extract what matters now
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

    return `## New Email Received

Thread ID: ${threadId}
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Received: ${timestamp}

---
${email.body}
---${historySection}

Process this email. Analyze content, update thread state, and take action if warranted.
Use the Thread ID above when calling tools like update_thread, ignore_thread, etc.`;
}

export function buildTickTriggerPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    silenceHours: number
): string {
    const now = new Date(timestamp).toISOString();

    // Only "active" threads get silence-checked. "watching" threads are monitored but excluded from silence alerts.
    const overdueThreads = activeThreads.filter((t) => {
        if (t.status !== "active") return false;
        if (!t.last_activity) return false;
        const lastActivity = new Date(t.last_activity).getTime();
        const hoursSilent = (timestamp - lastActivity) / (1000 * 60 * 60);
        return hoursSilent >= silenceHours;
    });

    const threadList =
        overdueThreads.length > 0
            ? overdueThreads
                  .map((t) => {
                      const lastActivity = t.last_activity
                          ? new Date(t.last_activity).toISOString()
                          : "unknown";
                      const hoursSilent = t.last_activity
                          ? Math.floor(
                                (timestamp -
                                    new Date(t.last_activity).getTime()) /
                                    (1000 * 60 * 60)
                            )
                          : "?";
                      return `- Thread "${t.subject ?? "(no subject)"}" (${t.id}): silent for ${hoursSilent}h, last activity ${lastActivity}, summary: ${t.summary ?? "none"}`;
                  })
                  .join("\n")
            : "No threads currently exceed the silence threshold.";

    const watchingCount = activeThreads.filter((t) => t.status === "watching").length;

    return `## Scheduled Check — ${now}

Review active threads for silence violations (threshold: ${silenceHours}h).
Note: only "active" threads are checked for silence. ${watchingCount} "watching" thread(s) are excluded.

Threads exceeding threshold (${overdueThreads.length}):
${threadList}

For each overdue thread, decide: send alert, update status, or take no action.
If a thread has already been alerted recently, do not alert again.
Consider downgrading resolved conversations to "watching" or "resolved" to reduce noise.`;
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
