export default function EmailIngestionPage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>Email forwarding</h1>
      <p className="text-lg text-gray-600">
        Vigil never connects to your inbox. You control exactly what it sees by setting up
        forwarding rules in your email client. Only forwarded emails reach Vigil.
      </p>

      <h2 id="setup">Setting up forwarding</h2>
      <p>
        Each watcher has a unique address like <code>work-a7f3k9@vigil.run</code>. In Gmail or Outlook,
        create a filter that forwards matching emails to this address.
      </p>
      <p>
        <strong>Gmail example:</strong> Settings → Filters → Create filter → From: vendor@example.com →
        Forward to: work-a7f3k9@vigil.run
      </p>
      <p>
        You can forward all email from certain senders, emails with specific subjects, emails to certain
        addresses, or any combination your email client supports.
      </p>

      <h2 id="what-happens">What happens when an email arrives</h2>
      <ol>
        <li>Your email client forwards the message to <code>*@vigil.run</code></li>
        <li>Cloudflare Email Routing receives the email at the DNS/MX level</li>
        <li>A Cloudflare Worker forwards the raw email to the Vigil backend</li>
        <li>The backend parses the email (sender, subject, headers, body)</li>
        <li>The agent analyzes the email, updates threads, and decides whether to alert you</li>
        <li>The email body is discarded. Only metadata and the agent's analysis are stored.</li>
      </ol>

      <h2 id="threading">Thread detection</h2>
      <p>
        Vigil groups related emails into threads automatically using two methods:
      </p>
      <ul>
        <li><strong>Header-based:</strong> In-Reply-To and References headers link replies to their parent emails</li>
        <li><strong>Subject-based:</strong> If headers don't match, emails with the same normalized subject (stripping Re:, Fwd:, [tags]) are grouped together</li>
      </ul>
      <p>
        When the agent processes a threaded email, it sees the last 5 messages in the conversation
        for context.
      </p>

      <h2 id="dmarc">DMARC and deliverability</h2>
      <p>
        Cloudflare receives email at the MX level. Vigil's domain is the destination, not a forwarder.
        DMARC checks happen between the original sender and your email provider, not between you and Vigil.
        This avoids the DMARC alignment problems that plague traditional forwarding setups.
      </p>

      <h2 id="privacy">What's stored</h2>
      <p>
        Email bodies are processed in memory and <strong>never stored</strong>. What Vigil keeps:
      </p>
      <ul>
        <li>Sender address (from)</li>
        <li>Recipient address (to)</li>
        <li>Subject line</li>
        <li>Date and message ID</li>
        <li>SHA-256 hash of the body (proof of receipt, not content)</li>
        <li>Agent's analysis (summary, intent, urgency, entities)</li>
      </ul>
    </article>
  );
}
