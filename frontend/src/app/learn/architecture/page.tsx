export default function ArchitecturePage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Architecture</h1>
      <p>Understanding how Vigil is built helps clarify what it can and cannot do with your data. The system is designed around a single constraint: it must be able to process email intelligently without ever storing the email itself. Every architectural decision flows from that requirement. The result is a system where privacy is structural, not promised.</p>

      <h2>The data flow</h2>
      <p>An email arrives in your inbox and your forwarding rule sends a copy to your watcher address at vigil.run. Vigil's email routing infrastructure receives the raw message and passes it to the backend processing server, which parses the email, identifies which watcher it belongs to based on the address token, and hands it off to the agent engine.</p>
      <p>The agent engine is where the intelligence lives. It loads context from the database — memories, thread state, watcher configuration — combines that with the incoming email, and calls an AI language model to produce analysis and decisions. Based on those decisions, it may update a thread, store a new memory, fire a webhook, or trigger an alert email. After all of that, the email body is discarded. The rest of the processing record is written to storage and the body is gone.</p>

      <h2>What is stored</h2>
      <p>Vigil stores the <strong>metadata</strong> of each email: who sent it, who it was addressed to, the subject line, and the three timestamps tracking when it was sent, delivered, and processed by Vigil. It stores a one-way fingerprint of the email body — cryptographic proof that the email was received, but not the content itself and not anything that could be reversed to recover it.</p>
      <p>The agent's <strong>analysis</strong> is stored: a machine-generated summary, intent classification, urgency assessment, and a list of key entities mentioned — produced by the AI model, never copied from the raw email. <strong>Thread state</strong> is updated to reflect the new message. Any <strong>memories</strong> the agent decided to retain are written. And a complete <strong>action log</strong> entry is created for every invocation, recording what the agent decided, what tools it used, its reasoning, and what the operation cost in compute time and AI usage.</p>

      <h2>What is not stored</h2>
      <p>Email bodies are never written to disk, at any point in the pipeline. Attachments are not processed or stored. Vigil never requests OAuth access to your email account and never holds credentials for any external service on your behalf. The only way data enters the system is through emails you explicitly forward — there is no background sync, no crawling, no polling of any account.</p>

      <h2>How the pieces connect</h2>
      <p>The frontend — what you see in your browser — is a read-only view into the data the backend has accumulated. It displays threads, memories, action logs, and alerts, but contains no business logic and cannot communicate directly with the database. All changes go through the backend API. AI model calls are made entirely server-side; your watcher's prompt, your memories, and your email metadata never touch the browser beyond what the UI needs to display them.</p>

      <h2>Infrastructure</h2>
      <p>The service runs on a small set of components: an email routing layer that receives incoming mail and passes it to the processing backend, a secure backend server that runs the agent logic and owns the database, a frontend application served over HTTPS, and a transactional email service that delivers alert notifications. Each watcher address is just an alias — email arrives, gets processed, and the routing infrastructure does not retain a copy. The backend stores only what the agent produced from it.</p>
    </div>
  );
}
