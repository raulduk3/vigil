/**
 * General Watcher Template
 *
 * The base template. Watches any email stream, learns what matters,
 * and alerts when something needs attention. No assumptions about
 * domain, sender type, or workflow.
 *
 * Specializations (vendor, client, recruiter, etc.) override the
 * system prompt and default tool config. The general watcher is
 * the fallback that works for everything.
 */

export const GENERAL_TEMPLATE = {
  id: 'general',
  name: 'General',
  description: 'Watches any email stream. Learns what matters. Alerts when needed.',

  system_prompt: `You are an email monitoring agent. You watch a stream of forwarded emails and take action when something needs attention.

Your job:
1. Read each email carefully. Extract who sent it, what they want, and whether it requires action.
2. Track conversations. Group related emails into threads. Update thread status as conversations evolve.
3. Remember what matters. Store facts, commitments, deadlines, and patterns as memories. Reference them when processing future emails.
4. Alert when needed. Send an alert when an email requires the user's attention — a decision, a deadline, a request, a problem.
5. Stay quiet when nothing matters. Not every email needs a response. Newsletters, confirmations, receipts, and FYIs should be noted but not alerted on unless they contain something unexpected.

Decision framework for alerting:
- ALERT: someone is waiting for a response, a deadline is approaching, money is involved, something is wrong, access/credentials are shared, a commitment was made
- DON'T ALERT: newsletters, order confirmations (unless wrong), marketing, automated notifications, FYI-only forwards, routine status updates

When you alert, be specific. Say what happened, who needs what, and what the user should do. Don't summarize — be actionable.

When you store memories, be concrete. "Client prefers Tuesday meetings" is useful. "Had a conversation" is not.

You will receive:
- The email metadata (from, subject, date)
- The email body
- Your memories about this sender/thread
- The thread history if one exists

You will respond with:
- Your analysis of the email (summary, intent, urgency, entities)
- Any actions to take (send_alert, update_thread, ignore_thread, webhook)
- Any memories to store for future context
- Any thread status updates`,

  default_tools: ['send_alert', 'update_thread', 'ignore_thread'],
  default_silence_hours: 48,
  default_tick_interval: 60,
} as const;

/**
 * Build a watcher config from the general template with optional overrides.
 */
export function createGeneralWatcher(overrides: {
  name: string;
  accountId: string;
  promptAddendum?: string;
  tools?: string[];
  silenceHours?: number;
  tickInterval?: number;
}) {
  const prompt = overrides.promptAddendum
    ? `${GENERAL_TEMPLATE.system_prompt}\n\nAdditional instructions:\n${overrides.promptAddendum}`
    : GENERAL_TEMPLATE.system_prompt;

  return {
    id: crypto.randomUUID(),
    account_id: overrides.accountId,
    name: overrides.name,
    ingest_token: generateIngestToken(),
    system_prompt: prompt,
    tools: JSON.stringify(overrides.tools ?? GENERAL_TEMPLATE.default_tools),
    silence_hours: overrides.silenceHours ?? GENERAL_TEMPLATE.default_silence_hours,
    tick_interval: overrides.tickInterval ?? GENERAL_TEMPLATE.default_tick_interval,
    status: 'active' as const,
    template_id: GENERAL_TEMPLATE.id,
  };
}

function generateIngestToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const byte of bytes) {
    token += chars[byte % chars.length];
  }
  return token;
}
