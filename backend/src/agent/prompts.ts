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
  "memory_append": "<markdown notes to add to memory, or null>",
  "thread_updates": [
    {
      "thread_id": "<id>",
      "status": "active|watching|resolved|ignored",
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
- Only use tools from the available tools list
- Only call send_alert when the user genuinely needs to know something
- Keep thread summaries concise and actionable (1-2 sentences)
- Store important patterns and preferences in memory_append
- Email bodies are never persisted — extract what matters now
- For silence alerts: check if last_activity is older than the threshold`;
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
    threadHistory: EmailRow[]
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

From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Received: ${timestamp}

---
${email.body}
---${historySection}

Process this email. Analyze content, update thread state, and take action if warranted.`;
}

export function buildTickTriggerPrompt(
    timestamp: number,
    activeThreads: ThreadRow[],
    silenceHours: number
): string {
    const now = new Date(timestamp).toISOString();

    const overdueThreads = activeThreads.filter((t) => {
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

    return `## Scheduled Check — ${now}

Review active threads for silence violations (threshold: ${silenceHours}h).

Threads exceeding threshold (${overdueThreads.length}):
${threadList}

For each overdue thread, decide: send alert, update status, or take no action.
If a thread has already been alerted recently, do not alert again.`;
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
