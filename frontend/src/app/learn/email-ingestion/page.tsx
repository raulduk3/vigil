export default function EmailIngestionPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Email Forwarding</h1>
      <p>Vigil's entire design is built around a single constraint: it never connects to your inbox. There are no passwords to share, no OAuth permissions to grant, no read access to your email account. Instead, you decide exactly which emails Vigil sees by setting up forwarding rules directly in your email provider. You stay in full control at every step — if you want to stop, you delete the forwarding rule and Vigil sees nothing more.</p>

      <h2>How forwarding works</h2>
      <p>Email forwarding is a standard feature in virtually every email provider. It copies incoming messages to a second address automatically, without touching the original. When you set up a rule to forward emails to your Vigil watcher address, your inbox continues to work exactly as it always has — you receive the email normally, and Vigil receives an independent copy to process.</p>
      <p>You can be as broad or as targeted as you like. Some people forward their entire inbox to a general-purpose watcher. Others use filters to forward only emails from specific senders, with specific labels, or matching certain keywords. Gmail, Outlook, Apple Mail, and most other providers all support this kind of rule-based forwarding without any third-party integration required.</p>

      <h2>Setting up Gmail forwarding</h2>
      <p>In Gmail, go to Settings, then Forwarding and POP/IMAP. Add your watcher address as a forwarding destination — Gmail will send a confirmation email to that address, and Vigil will relay the confirmation link back to your inbox so you can verify the connection. After verification, you can forward all mail or configure more specific filters through Gmail's built-in filter rules.</p>
      <p>One thing worth knowing: Gmail's confirmation flow sends an automated email to your watcher address as part of the setup process. Vigil handles this gracefully and passes the confirmation message back to you so you can complete the verification without any manual workaround.</p>

      <h2>What Vigil sees</h2>
      <p>When a forwarded email arrives, the agent processes the full message: the sender's address, the subject line, the body text, the timestamp, and the technical headers used for thread detection. The <strong>Fwd: prefix</strong> is stripped automatically so the agent sees the original subject as the sender wrote it. If an email was forwarded multiple times before reaching Vigil, the agent works back through the forwarding chain to identify the original sender.</p>
      <p>Vigil tracks three separate timestamps for each email: when the <strong>sender originally sent it</strong>, when your <strong>mail server first received it</strong>, and when <strong>Vigil processed it</strong>. These three points give a complete picture of an email's journey and make it possible to detect delays — for instance, noticing that a message sat in transit for hours before being delivered.</p>

      <h2>Thread detection</h2>
      <p>Emails rarely arrive in isolation — they're usually part of ongoing conversations. Vigil groups related emails into threads automatically, using the same mechanisms that email clients use: header references that email programs attach to replies, and subject line similarity as a fallback for cases where headers aren't present. This means a conversation that started three weeks ago will be recognized as the same thread when a new reply arrives today, giving the agent full conversational context without any manual organization on your part.</p>
      <p>Thread detection happens before the agent reads the email content. By the time the agent begins its analysis, it already knows whether it's looking at the beginning of a new situation or the latest development in an ongoing one — and it adjusts its interpretation accordingly.</p>
    </div>
  );
}
