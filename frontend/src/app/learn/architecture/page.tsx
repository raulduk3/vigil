export default function ArchitecturePage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Architecture</h1>
      <p>Vigil is designed around a simple principle: process email without storing it.</p>

      <h2>Data flow</h2>
      <ol>
        <li><strong>Gmail/Outlook</strong> → forwarding rule sends email to <code>*@vigil.run</code></li>
        <li><strong>Cloudflare Email Routing</strong> → MX records route to Cloudflare Worker</li>
        <li><strong>CF Worker</strong> → forwards raw MIME to <code>POST /ingest/:token</code></li>
        <li><strong>API Server</strong> → parses MIME, extracts headers, identifies watcher</li>
        <li><strong>Agent Engine</strong> → loads context, calls LLM, executes actions</li>
        <li><strong>SQLite</strong> → stores metadata, analysis, memories, actions (never email bodies)</li>
        <li><strong>Resend</strong> → delivers alert emails when the agent decides to act</li>
      </ol>

      <h2>What is stored</h2>
      <ul>
        <li>Email metadata: from, to, subject, timestamps, message-id</li>
        <li>SHA-256 body hash (proof of receipt, not the content)</li>
        <li>Agent analysis: summary, intent, urgency, entities</li>
        <li>Thread state: status, summary, participants, email count</li>
        <li>Memories: atomic facts with importance scores</li>
        <li>Actions: tool called, parameters, reasoning, cost, duration</li>
      </ul>

      <h2>What is NOT stored</h2>
      <ul>
        <li>Email bodies — processed in memory, never written to disk</li>
        <li>Attachments — not processed at all</li>
        <li>OAuth tokens — Vigil never connects to your inbox</li>
      </ul>

      <h2>Infrastructure</h2>
      <ul>
        <li><strong>Backend:</strong> Bun + Hono, SQLite, single DigitalOcean droplet</li>
        <li><strong>Frontend:</strong> Next.js on Vercel</li>
        <li><strong>Email:</strong> Cloudflare Email Routing (free)</li>
        <li><strong>Alerts:</strong> Resend API</li>
        <li><strong>DNS:</strong> Cloudflare</li>
      </ul>
    </div>
  );
}
