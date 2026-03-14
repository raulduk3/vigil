export default function EmailIngestionPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Email Forwarding</h1>
      <p>Vigil never connects to your inbox. You control exactly what it sees by setting up email forwarding rules.</p>

      <h2>Setting up Gmail forwarding</h2>
      <ol>
        <li>Go to Gmail Settings → Forwarding and POP/IMAP</li>
        <li>Click "Add a forwarding address"</li>
        <li>Enter your watcher address (e.g., <code>work-a7f3k9@vigil.run</code>)</li>
        <li>Gmail sends a confirmation email. Vigil relays it to your inbox.</li>
        <li>Click the confirmation link in that email</li>
        <li>Choose "Forward a copy" and select your watcher address</li>
      </ol>
      <p>You can also set up filters to only forward specific emails (e.g., from certain senders or with certain labels).</p>

      <h2>What gets processed</h2>
      <p>The agent receives the full email including headers, body, and attachments metadata. It extracts:</p>
      <ul>
        <li>From address (original sender, even for forwarded emails)</li>
        <li>Subject line (Fwd: prefix stripped automatically)</li>
        <li>Body text (processed for analysis, then discarded — never stored)</li>
        <li>Date header (when the sender sent it)</li>
        <li>Received headers (when your mail server accepted it)</li>
        <li>In-Reply-To / References (for thread detection)</li>
      </ul>

      <h2>Three timestamps</h2>
      <p>Each email tracks three separate times:</p>
      <ul>
        <li><strong>Sent</strong> — when the sender sent it (Date header)</li>
        <li><strong>Delivered</strong> — when your mail server received it (Received headers)</li>
        <li><strong>Vigil</strong> — when Vigil processed it</li>
      </ul>

      <h2>Thread detection</h2>
      <p>Emails are grouped into threads using three methods (in priority order):</p>
      <ol>
        <li>In-Reply-To header matching</li>
        <li>References header chain</li>
        <li>Subject line similarity (with generic subjects filtered out)</li>
      </ol>
    </div>
  );
}
