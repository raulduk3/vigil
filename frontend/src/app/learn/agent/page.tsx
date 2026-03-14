export default function AgentPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>The Agent</h1>
      <p>Each watcher runs an autonomous AI agent. It reads email, makes decisions, and takes action without human intervention.</p>

      <h2>How the agent thinks</h2>
      <p>On each email, the agent follows an 8-step invocation flow:</p>
      <ol>
        <li>Load watcher configuration (prompt, tools, thresholds)</li>
        <li>Retrieve relevant memories</li>
        <li>Load active thread context</li>
        <li>Group the email into a thread</li>
        <li>Build the prompt with all context</li>
        <li>Call the LLM for analysis and decisions</li>
        <li>Execute any actions (alerts, thread updates, webhooks)</li>
        <li>Log everything with full reasoning</li>
      </ol>

      <h2>Obligation tracking</h2>
      <p>The agent doesn't just react to emails. On scheduled ticks, it proactively checks:</p>
      <ul>
        <li>Is someone waiting on the user?</li>
        <li>Is the user waiting on someone?</li>
        <li>Has a thread gone quiet beyond the silence threshold?</li>
        <li>Are any deadlines approaching without confirmation?</li>
        <li>Was a payment expected but no receipt arrived?</li>
      </ul>

      <h2>Chat control</h2>
      <p>You can talk to your agent through the dashboard. It has full context of your inbox, threads, and memories. You can:</p>
      <ul>
        <li>Ask questions: "What needs my attention?"</li>
        <li>Take actions: "Ignore all emails from LinkedIn"</li>
        <li>Add rules: "Never alert me about receipts"</li>
        <li>Modify behavior: "Be more aggressive about deadlines"</li>
      </ul>

      <h2>Models</h2>
      <p>Choose from 9 models across 3 providers. Switch anytime. Each model has different cost and capability tradeoffs.</p>
    </div>
  );
}
