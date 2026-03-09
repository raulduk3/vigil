export default function ArchitecturePage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>Architecture</h1>
      <p className="text-lg text-gray-600">
        Vigil is built on a simple principle: you forward emails, an agent processes them,
        and the email content is discarded. The privacy model isn't a feature. It's the architecture.
      </p>

      <h2 id="data-flow">Data flow</h2>
      <p>Every email follows the same path:</p>
      <ol>
        <li>You set up a forwarding rule in Gmail or Outlook</li>
        <li>Your email client forwards matching emails to <code>*@vigil.run</code></li>
        <li>Cloudflare Email Routing receives the email via MX records</li>
        <li>A Cloudflare Worker forwards the raw email to the Vigil backend</li>
        <li>The backend parses the email and invokes the watcher's agent</li>
        <li>The agent analyzes the email, updates threads, stores memories, and may send alerts</li>
        <li>The email body is discarded. Only metadata and the agent's analysis remain.</li>
      </ol>

      <h2 id="components">System components</h2>
      <ul>
        <li><strong>Cloudflare Email Routing</strong> — receives all <code>@vigil.run</code> email at the DNS/MX level</li>
        <li><strong>Cloudflare Worker</strong> — forwards raw MIME to the backend. No processing, just transport.</li>
        <li><strong>Backend (Bun + Hono)</strong> — single process. Parses email, runs agent engine, serves API.</li>
        <li><strong>SQLite</strong> — all persistence. Metadata, threads, memories, actions. No email bodies.</li>
        <li><strong>OpenAI API</strong> — GPT-4.1-mini for email analysis and decision-making.</li>
        <li><strong>Resend</strong> — outbound alert delivery from <code>notifications@vigil.run</code>.</li>
        <li><strong>Frontend (Next.js)</strong> — dashboard for managing watchers and viewing agent activity.</li>
      </ul>

      <h2 id="agent-engine">Agent engine</h2>
      <p>
        The agent engine is an 8-step loop that runs on every email and every scheduled tick:
      </p>
      <ol>
        <li>Load watcher configuration</li>
        <li>Retrieve relevant memories (full-text search ranked by relevance)</li>
        <li>Load active threads for context</li>
        <li>If email trigger: parse email, detect/create thread, load thread history</li>
        <li>Build prompt with all context (config + memory + threads + email)</li>
        <li>Call the AI model (JSON response mode)</li>
        <li>Execute tool calls (alerts, thread updates, memory writes)</li>
        <li>Log the complete invocation (trigger, tool, params, result, cost, duration)</li>
      </ol>

      <h2 id="storage">What's stored</h2>
      <p>
        Vigil uses SQLite with 8 tables. Here's what each stores:
      </p>
      <ul>
        <li><strong>accounts</strong> — your email, password hash, plan</li>
        <li><strong>watchers</strong> — agent config (prompt, tools, thresholds, ingest token)</li>
        <li><strong>threads</strong> — conversation groups (status, summary, participants, email count)</li>
        <li><strong>emails</strong> — metadata only: from, to, subject, date, body SHA-256 hash, agent analysis</li>
        <li><strong>actions</strong> — every agent invocation with full audit trail</li>
        <li><strong>memories</strong> — agent notes with importance ratings and full-text search index</li>
        <li><strong>channels</strong> — notification destinations (email addresses, webhook URLs)</li>
        <li><strong>refresh_tokens</strong> — JWT session management</li>
      </ul>

      <h2 id="no-inbox">Why no inbox access</h2>
      <p>
        Most email tools require OAuth or IMAP access to your inbox. This means they can read
        all your email, not just what you want monitored. Vigil's forwarding model inverts this:
        you choose exactly what to share. The agent only sees what you forward.
      </p>
      <p>
        This isn't a limitation. It's the product. Privacy by architecture means you don't have
        to trust Vigil's security practices. The data simply isn't there.
      </p>

      <h2 id="cost">Cost per invocation</h2>
      <p>
        Each agent invocation costs approximately $0.001 (GPT-4.1-mini). A user processing
        200 emails per month costs about $0.20 in AI compute. Memory retrieval uses SQLite
        full-text search (free, no embedding API calls). The economics allow a $9/mo price point
        with 97%+ gross margin.
      </p>
    </article>
  );
}
