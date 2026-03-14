export default function EmailIngestionPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Email Forwarding</h1>
      <p>Vigil's entire design is built around a single constraint: it never connects to your inbox. There are no passwords to share, no OAuth permissions to grant, no read access to your email account.</p>
      <ul>
        <li>You decide exactly which emails Vigil sees by setting up forwarding rules in your email provider</li>
        <li>You stay in full control — if you want to stop, delete the forwarding rule and Vigil sees nothing more</li>
      </ul>

      <h2>How forwarding works</h2>
      <p>Email forwarding is a standard feature in virtually every email provider. It copies incoming messages to a second address automatically, without touching the original.</p>
      <ul>
        <li>Your inbox continues to work exactly as it always has</li>
        <li>Vigil receives an independent copy to process</li>
        <li>Gmail, Outlook, Apple Mail, and most other providers all support rule-based forwarding without any third-party integration required</li>
      </ul>
      <p>You can be as broad or as targeted as you like — some people forward their entire inbox to a general-purpose watcher, others use filters to forward only emails from specific senders or matching certain keywords.</p>

      <h2>Setting up Gmail forwarding</h2>
      <p>In Gmail, go to Settings, then Forwarding and POP/IMAP. Add your watcher address as a forwarding destination.</p>
      <ul>
        <li>Gmail will send a confirmation email to that address</li>
        <li>Vigil will relay the confirmation link back to your inbox so you can verify the connection</li>
        <li>After verification, you can forward all mail or configure more specific filters through Gmail's built-in filter rules</li>
      </ul>
      <p>One thing worth knowing: Gmail's confirmation flow sends an automated email to your watcher address as part of the setup process. Vigil handles this gracefully and passes the confirmation message back to you so you can complete the verification without any manual workaround.</p>

      <h2>What Vigil sees</h2>
      <p>When a forwarded email arrives, the agent processes the full message. Several things happen automatically:</p>
      <ul>
        <li>The <strong>Fwd: prefix</strong> is stripped so the agent sees the original subject as the sender wrote it</li>
        <li>If an email was forwarded multiple times, the agent works back through the chain to identify the original sender</li>
        <li>Three timestamps are tracked: when the <strong>sender originally sent it</strong>, when your <strong>mail server first received it</strong>, and when <strong>Vigil processed it</strong></li>
      </ul>
      <p>These three timestamps give a complete picture of an email's journey and make it possible to detect delays — for instance, noticing that a message sat in transit for hours before being delivered.</p>

      <h2>Thread detection</h2>
      <p>Emails rarely arrive in isolation — they're usually part of ongoing conversations. Vigil groups related emails into threads automatically, using the same mechanisms that email clients use.</p>
      <ul>
        <li><strong>Header references</strong> — the standard metadata that email programs attach to replies</li>
        <li><strong>Subject line similarity</strong> — a fallback for cases where headers aren't present</li>
      </ul>
      <p>This means a conversation that started three weeks ago will be recognized as the same thread when a new reply arrives today. Thread detection happens before the agent reads the email content — by the time the agent begins its analysis, it already knows whether it's looking at the beginning of a new situation or the latest development in an ongoing one.</p>
    </div>
  );
}
