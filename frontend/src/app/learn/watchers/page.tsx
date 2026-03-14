export default function WatchersPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Watchers</h1>
      <p>A watcher is an AI agent that monitors a stream of forwarded emails. Each watcher has its own prompt, memory, tools, and configuration.</p>

      <h2>Creating a watcher</h2>
      <p>Give it a name, write a prompt describing what to watch for, set the reactivity level, and choose a model. You get a unique forwarding address like <code>work-a7f3k9@vigil.run</code>.</p>

      <h2>How it works</h2>
      <p>When an email arrives at your watcher address, the agent:</p>
      <ol>
        <li>Loads its memory and active threads</li>
        <li>Groups the email into an existing thread or creates a new one</li>
        <li>Analyzes the content: summary, intent, urgency, key entities</li>
        <li>Decides what to do: alert, track silently, ignore, or fire a webhook</li>
        <li>Stores relevant facts in memory for future reference</li>
        <li>Logs every decision with full reasoning</li>
      </ol>

      <h2>Configuration</h2>
      <ul>
        <li><strong>System prompt</strong> — tell the agent what to care about</li>
        <li><strong>Reactivity (1-5)</strong> — how aggressively it alerts you</li>
        <li><strong>Memory sensitivity (1-5)</strong> — how much it remembers</li>
        <li><strong>Silence threshold</strong> — how long before flagging quiet threads</li>
        <li><strong>Tick interval</strong> — how often it proactively reviews threads</li>
        <li><strong>Model</strong> — choose from 9 models across OpenAI, Anthropic, and Google</li>
        <li><strong>Tools</strong> — enable send_alert, update_thread, ignore_thread, webhook</li>
      </ul>

      <h2>Reactivity levels</h2>
      <p>Reactivity controls the alert threshold:</p>
      <ul>
        <li><strong>1 Minimum</strong> — only active security breaches and fraud</li>
        <li><strong>2 Low</strong> — security + money at risk + deadlines within 24h</li>
        <li><strong>3 Balanced</strong> — financial events, 48h deadlines, direct requests from people</li>
        <li><strong>4 High</strong> — all transactions, weekly deadlines, any personal email</li>
        <li><strong>5 Maximum</strong> — surfaces almost everything including subscribed content</li>
      </ul>
    </div>
  );
}
