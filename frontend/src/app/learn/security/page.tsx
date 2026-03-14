export default function SecurityPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Security &amp; Privacy</h1>
      <p>Vigil's approach to privacy is architectural rather than policy-based. The strongest privacy guarantee isn't a promise in a terms of service document — it's a system that is structurally unable to expose data it doesn't have.</p>
      <ul>
        <li>Limit what enters the system in the first place</li>
        <li>The surface area for harm shrinks accordingly</li>
      </ul>

      <h2>No inbox access</h2>
      <p>Vigil has no connection to your email account. There is no OAuth flow, no permission grant, no "allow Vigil to read your mail."</p>
      <ul>
        <li>The forwarding setup happens entirely within your email provider, under your control</li>
        <li>You decide which emails Vigil sees — if you stop forwarding, Vigil sees nothing</li>
        <li>If you set up a filter to only forward emails from certain senders, Vigil only ever sees those</li>
      </ul>
      <p>This is a fundamentally different model from email apps that request inbox access. Those applications can read everything you've ever received. Vigil can only read what you actively choose to send to it — the privacy guarantee depends on the forwarding rules you control in your own account, not on trusting Vigil's intentions.</p>

      <h2>Email bodies are discarded</h2>
      <p>When an email arrives, the agent reads the body text in memory to produce its analysis. Once analysis is complete, the body is discarded — it is never written to any form of storage.</p>
      <ul>
        <li>What persists is the agent's own interpretation: a machine-generated summary, extracted facts, thread status updates</li>
        <li>A one-way fingerprint of the original body is stored as proof of receipt, but cannot be reversed to reconstruct the content</li>
      </ul>
      <p>This means that even in the event of a security breach, email bodies are not exposed — they were never there. The worst case for a compromised Vigil database is the exposure of metadata (sender, subject, timestamps) and AI-generated summaries, not the actual content of your emails.</p>

      <h2>What we store</h2>
      <p>Five categories of data are stored per account:</p>
      <ul>
        <li><strong>Metadata</strong> — sender address, recipient, subject line, timestamps</li>
        <li><strong>Analysis</strong> — summaries and classifications produced by the language model, never raw content</li>
        <li><strong>Thread state</strong> — which conversations exist, their status, and participant lists</li>
        <li><strong>Memories</strong> — the atomic facts the agent decided to retain</li>
        <li><strong>Action log</strong> — every decision the agent made, what tools it used, and its reasoning</li>
      </ul>
      <p>Account credentials are stored in hashed form — your password is transformed before storage using a one-way function and is never retrievable, even internally.</p>

      <h2>Authentication and access control</h2>
      <p>Your account is protected by several layers of access control:</p>
      <ul>
        <li>Passwords are transformed into a cryptographic hash before being written to the database — the original is never stored</li>
        <li>Sessions are managed through short-lived tokens that expire automatically; if a token is compromised, its useful window is narrow</li>
        <li>Watcher addresses are token-protected — only emails routed through Vigil's email infrastructure can trigger your agents; there is no way to invoke a watcher from the public internet without the correct token</li>
        <li>The API enforces authentication on every endpoint that accesses user data</li>
        <li>Cross-origin requests are restricted to Vigil's own domains — third-party websites cannot make authenticated API calls on a user's behalf without their knowledge</li>
      </ul>

      <h2>Webhook signatures</h2>
      <p>If you configure a watcher to send webhooks to an external service, every outgoing payload is cryptographically signed.</p>
      <ul>
        <li>Each watcher has a unique signing secret</li>
        <li>Verify the <code>X-Vigil-Signature</code> header in your receiving application to confirm the request genuinely came from Vigil</li>
        <li>This protects your webhook endpoints from being spoofed by a third party claiming to be Vigil</li>
      </ul>
    </div>
  );
}
