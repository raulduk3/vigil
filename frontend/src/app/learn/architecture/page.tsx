export default function ArchitecturePage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Architecture</h1>
      <p>Understanding how Vigil is built helps clarify what it can and cannot do with your data. The system is designed around a single constraint: it must be able to process email intelligently without ever storing the email itself.</p>
      <ul>
        <li>Every architectural decision flows from that requirement</li>
        <li>Privacy is structural, not promised — the system is incapable of exposing data it doesn't have</li>
      </ul>

      <h2>The data flow</h2>
      <p>An email's journey through Vigil follows a clear sequence:</p>
      <ul>
        <li>An email arrives in your inbox and your forwarding rule sends a copy to your watcher address</li>
        <li>Vigil's email routing infrastructure receives the raw message and passes it to the backend processing server</li>
        <li>The backend parses the email, identifies which watcher it belongs to based on the address token, and hands it off to the agent engine</li>
        <li>The agent engine loads context from the database — memories, thread state, watcher configuration — and calls an AI language model to produce analysis and decisions</li>
        <li>Based on those decisions, it may update a thread, store a new memory, fire a webhook, or trigger an alert email</li>
        <li>After all of that, the email body is discarded</li>
      </ul>
      <p>The rest of the processing record is written to storage and the body is gone.</p>

      <h2>What is stored</h2>
      <p>Vigil stores four categories of data per email:</p>
      <ul>
        <li><strong>Metadata</strong> — who sent it, who it was addressed to, the subject line, and three timestamps tracking when it was sent, delivered, and processed</li>
        <li><strong>Analysis</strong> — a machine-generated summary, intent classification, urgency assessment, and key entities mentioned; produced by the AI model, never copied from the raw email</li>
        <li><strong>Thread state</strong> — updated to reflect the new message and current conversation status</li>
        <li><strong>Memories</strong> — any atomic facts the agent decided to retain</li>
      </ul>
      <p>A complete action log entry is also created for every invocation, recording what the agent decided, what tools it used, its reasoning, and what the operation cost in compute time and AI usage. A one-way fingerprint of the email body is stored as proof of receipt — but not the content itself, and not anything that could be reversed to recover it.</p>

      <h2>What is not stored</h2>
      <p>Several things Vigil explicitly never holds:</p>
      <ul>
        <li><strong>Email bodies</strong> — never written to disk, at any point in the pipeline</li>
        <li><strong>Attachments</strong> — not processed or stored</li>
        <li><strong>Inbox credentials</strong> — Vigil never requests OAuth access to your email account and never holds credentials for any external service on your behalf</li>
      </ul>
      <p>The only way data enters the system is through emails you explicitly forward — there is no background sync, no crawling, no polling of any account.</p>

      <h2>How the pieces connect</h2>
      <p>The frontend — what you see in your browser — is a read-only view into the data the backend has accumulated. It displays threads, memories, action logs, and alerts, but contains no business logic and cannot communicate directly with the database.</p>
      <ul>
        <li>All changes go through the backend API</li>
        <li>AI model calls are made entirely server-side</li>
        <li>Your watcher's prompt, your memories, and your email metadata never touch the browser beyond what the UI needs to display them</li>
      </ul>

      <h2>Infrastructure</h2>
      <p>The service runs on a small set of components:</p>
      <ul>
        <li>An <strong>email routing layer</strong> that receives incoming mail and passes it to the processing backend</li>
        <li>A <strong>secure backend server</strong> that runs the agent logic and owns the database</li>
        <li>A <strong>frontend application</strong> served over HTTPS</li>
        <li>A <strong>transactional email service</strong> that delivers alert notifications</li>
      </ul>
      <p>Each watcher address is just an alias — email arrives, gets processed, and the routing infrastructure does not retain a copy. The backend stores only what the agent produced from it.</p>
    </div>
  );
}
