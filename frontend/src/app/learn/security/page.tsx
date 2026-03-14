export default function SecurityPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Security &amp; Privacy</h1>
      <p>Vigil's approach to privacy is architectural rather than policy-based. The strongest privacy guarantee isn't a promise in a terms of service document — it's a system that is structurally unable to expose data it doesn't have. Most of the security design in Vigil follows directly from this principle: limit what enters the system in the first place, and the surface area for harm shrinks accordingly.</p>

      <h2>No inbox access</h2>
      <p>Vigil has no connection to your email account. There is no OAuth flow, no permission grant, no "allow Vigil to read your mail." The forwarding setup happens entirely within your email provider, under your control, using standard features that have existed for decades. You decide which emails Vigil sees. If you stop forwarding, Vigil sees nothing. If you set up a filter to only forward emails from certain senders, Vigil only ever sees those.</p>
      <p>This is a fundamentally different model from email apps that request inbox access. Those applications can read everything you've ever received; Vigil can only read what you actively choose to send to it. The privacy guarantee doesn't depend on trusting Vigil's intentions — it depends on the forwarding rules you control in your own account.</p>

      <h2>Email bodies are discarded</h2>
      <p>When an email arrives, the agent reads the body text in memory to produce its analysis. Once analysis is complete, the body is discarded — it is never written to any form of storage. What persists is the agent's own interpretation: a machine-generated summary, extracted facts, thread status updates. A one-way fingerprint of the original body is stored as proof of receipt, but this fingerprint cannot be reversed to reconstruct the content — it only proves the email was received.</p>
      <p>This means that even in the event of a security breach, email bodies are not exposed. They were never there. The worst case for a compromised Vigil database is the exposure of metadata (sender, subject, timestamps) and AI-generated summaries — not the actual content of your emails.</p>

      <h2>What we store</h2>
      <p>Vigil stores email <strong>metadata</strong> (sender address, recipient, subject line, timestamps), AI-generated <strong>analysis</strong> (summaries and classifications produced by the language model — never raw content), <strong>thread state</strong> (which conversations exist, their status, and participant lists), <strong>memories</strong> (the atomic facts the agent decided to retain), and a complete <strong>action log</strong> documenting every decision the agent made, what tools it used, and its reasoning. Account credentials are stored in hashed form — your password is transformed before storage using a one-way function and is never retrievable, even internally.</p>

      <h2>Authentication and access control</h2>
      <p>Your account is protected by a password that is transformed into a cryptographic hash before it is written to the database. The original password is never stored. Sessions are managed through short-lived tokens that expire automatically — if a token is compromised, its useful window is narrow. Your watcher addresses are token-protected: only emails routed through Vigil's email infrastructure can trigger your agents. There is no way to invoke a watcher from the public internet without the correct token embedded in the address.</p>
      <p>The API enforces authentication on every endpoint that accesses user data. Cross-origin requests are restricted to Vigil's own domains — third-party websites cannot make authenticated API calls on a user's behalf without their knowledge.</p>

      <h2>Webhook signatures</h2>
      <p>If you configure a watcher to send webhooks to an external service, every outgoing payload is cryptographically signed with a secret unique to that watcher. You can verify the <code>X-Vigil-Signature</code> header in your receiving application to confirm that the request genuinely came from Vigil and wasn't modified in transit. This protects your webhook endpoints from being spoofed by a third party claiming to be Vigil.</p>
    </div>
  );
}
