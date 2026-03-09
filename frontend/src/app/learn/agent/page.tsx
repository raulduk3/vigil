export default function AgentPage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>The agent</h1>
      <p className="text-lg text-gray-600">
        Each watcher runs an AI agent powered by GPT-4.1-mini. The agent reads email, tracks conversations,
        builds memory, and takes action when something needs your attention.
      </p>

      <h2 id="invocation">When the agent runs</h2>
      <p>The agent is invoked in two situations:</p>
      <ul>
        <li><strong>Email received</strong> — immediately when a forwarded email arrives at the watcher's address</li>
        <li><strong>Scheduled tick</strong> — periodically (configurable, default every 60 minutes) to review active threads for silence violations</li>
      </ul>

      <h2 id="analysis">Email analysis</h2>
      <p>For every email, the agent produces a structured analysis:</p>
      <ul>
        <li><strong>Summary</strong> — one-sentence description of what the email is about</li>
        <li><strong>Intent</strong> — what the sender wants or expects</li>
        <li><strong>Urgency</strong> — low, normal, or high based on content and context</li>
        <li><strong>Entities</strong> — names, amounts, dates, and other key details extracted from the email</li>
      </ul>
      <p>
        The analysis is stored. The email body is not.
      </p>

      <h2 id="tools">Tools</h2>
      <p>The agent can take action using tools you enable on the watcher:</p>
      <ul>
        <li><strong>send_alert</strong> — send an email notification to you via Resend. Used when something needs your immediate attention.</li>
        <li><strong>update_thread</strong> — change a thread's status (active, watching, resolved, ignored) or update its summary.</li>
        <li><strong>ignore_thread</strong> — mark a thread as noise so the agent stops tracking it.</li>
        <li><strong>webhook</strong> — POST data to a URL you configure. For integrations with other tools.</li>
      </ul>

      <h2 id="decisions">How it decides</h2>
      <p>
        The agent's behavior is driven by the watcher's system prompt. You can tell it what to watch for,
        what to ignore, and how aggressive to be with alerts. For example:
      </p>
      <ul>
        <li>"Alert me on any email that asks for a response within 24 hours"</li>
        <li>"Ignore newsletters and order confirmations"</li>
        <li>"Track invoices and note payment amounts in memory"</li>
        <li>"Only alert on emails from @important-client.com"</li>
      </ul>
      <p>
        The agent also has access to its memory — context it has built up from previous emails.
        This means it can make decisions based on patterns: "This vendor always follows up within 48 hours,
        so no alert is needed yet."
      </p>

      <h2 id="transparency">Transparency</h2>
      <p>
        Every agent invocation is logged in the actions table. You can see exactly what happened:
        what triggered the agent, what tool it called, what parameters it used, its reasoning,
        how many tokens it consumed, what it cost, and how long it took. Nothing is hidden.
      </p>

      <h2 id="model">Model</h2>
      <p>
        Vigil uses OpenAI's GPT-4.1-mini by default. The model runs in JSON response mode to
        ensure structured, predictable output. Each invocation costs approximately $0.001.
      </p>
    </article>
  );
}
