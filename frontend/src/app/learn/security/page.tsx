export default function SecurityPage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>Security & privacy</h1>
      <p className="text-lg text-gray-600">
        Vigil's security model starts with one decision: never store email content.
        Everything else follows from that.
      </p>

      <h2 id="data-handling">What Vigil stores</h2>
      <p>
        Email bodies are processed in memory by the AI model and immediately discarded.
        They are never written to disk, never logged, never cached. Here's exactly what is stored:
      </p>
      <ul>
        <li><strong>Stored:</strong> sender address, recipient address, subject line, date, message ID</li>
        <li><strong>Stored:</strong> SHA-256 hash of the email body (proof of receipt, not content)</li>
        <li><strong>Stored:</strong> agent's analysis (summary, intent, urgency, entities)</li>
        <li><strong>Stored:</strong> agent memories (short factual notes, not email content)</li>
        <li><strong>Stored:</strong> thread summaries and status</li>
        <li><strong>Stored:</strong> action log (what the agent did, why, cost, duration)</li>
        <li><strong>Never stored:</strong> email body text or HTML</li>
        <li><strong>Never stored:</strong> email attachments</li>
      </ul>

      <h2 id="no-inbox">No inbox access</h2>
      <p>
        Vigil does not use OAuth, IMAP, or any protocol that connects to your inbox.
        It only sees emails you explicitly forward. You control the scope entirely through
        your email client's forwarding rules.
      </p>

      <h2 id="authentication">Authentication</h2>
      <ul>
        <li>Passwords hashed with bcrypt</li>
        <li>JWT access tokens (1 hour expiry)</li>
        <li>Refresh tokens (24 hour expiry, stored hashed, rotated on use)</li>
        <li>All API endpoints require authentication except registration and login</li>
        <li>Account isolation: all queries scoped to your account ID from the JWT</li>
      </ul>

      <h2 id="ingestion">Ingestion security</h2>
      <ul>
        <li>Each watcher has a unique ingest token (8-12 character alphanumeric)</li>
        <li>Emails must be addressed to the correct watcher address to be processed</li>
        <li>Invalid tokens return 404 (no watcher enumeration)</li>
        <li>Cloudflare Email Routing handles TLS for inbound email</li>
      </ul>

      <h2 id="webhooks">Webhook security</h2>
      <p>
        Outbound webhooks are signed with HMAC-SHA256. The signature and timestamp are included
        in request headers so you can verify that webhook payloads genuinely come from Vigil.
      </p>

      <h2 id="infrastructure">Infrastructure</h2>
      <ul>
        <li>HTTPS required in production (TLS 1.2+)</li>
        <li>SQLite database (single file, no network exposure)</li>
        <li>Parameterized queries only (no SQL injection surface)</li>
        <li>CORS configured to allow only the frontend origin</li>
        <li>Cloudflare handles DDoS protection and TLS termination</li>
      </ul>

      <h2 id="ai-model">AI model</h2>
      <p>
        Email content is sent to OpenAI's API for analysis. OpenAI's API data usage policy
        states that API inputs are not used to train models. The email content exists briefly
        in OpenAI's processing pipeline and is not retained by either Vigil or OpenAI.
      </p>

      <h2 id="audit">Audit trail</h2>
      <p>
        Every agent invocation is logged with: trigger type, tool called, parameters, result,
        reasoning, token count, cost, and duration. You can inspect the complete history of
        every decision your agent has made.
      </p>
    </article>
  );
}
