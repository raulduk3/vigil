export default function WatchersPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Watchers</h1>
      <p>A watcher is the core concept in Vigil. Think of it as a dedicated AI agent assigned to monitor a specific category of email — each running independently with its own memory, instructions, and alert preferences.</p>
      <ul>
        <li>You might have one watcher for work, another for finances, another for package deliveries</li>
        <li>Watchers don't share knowledge and don't interfere with each other</li>
        <li>Each is completely self-contained, billed at actual AI cost + 5%</li>
      </ul>

      <h2>Creating a watcher</h2>
      <p>Creating a watcher takes about a minute. You give it a name, write a prompt describing what it should pay attention to, and choose a reactivity level. Once created, Vigil assigns it a unique forwarding address — something like <code>work-a7f3k9@vigil.run</code>.</p>
      <p>The prompt is the most important configuration. Some examples of what you might write:</p>
      <ul>
        <li>A <strong>job applications watcher</strong> might be told to track application status and flag interview requests</li>
        <li>A <strong>finances watcher</strong> might be told to watch for unexpected charges and flag missed receipts</li>
      </ul>
      <p>The more specific your prompt, the more useful the agent becomes over time.</p>

      <h2>What happens when an email arrives</h2>
      <p>The moment an email arrives at your watcher address, the agent wakes up. It doesn't read the email in isolation — it first loads everything it already knows.</p>
      <ul>
        <li>Accumulated memories from past emails</li>
        <li>Current state of all active threads</li>
        <li>Any rules you've set</li>
      </ul>
      <p>It then groups the new email into an existing conversation or starts a new thread, analyzes the content, and decides what to do. Most of the time it tracks quietly. Occasionally something crosses the alert threshold and it sends you a notification. Every decision — including the ones where it chose not to alert — is recorded with the agent's full reasoning.</p>

      <h2>Configuration</h2>
      <p>Each watcher has a handful of settings worth understanding:</p>
      <ul>
        <li><strong>System prompt</strong> — your primary lever; describe what matters, what to ignore, and how to handle ambiguous situations</li>
        <li><strong>Reactivity</strong> — controls how aggressively the agent alerts you, from very conservative (only active security threats) to permissive (anything notable)</li>
        <li><strong>Memory sensitivity</strong> — controls how much the agent retains between emails; higher means a richer picture of people, patterns, and situations</li>
        <li><strong>Silence threshold</strong> — how long a thread can go quiet before flagging the inactivity; useful when you're waiting on someone who has stopped responding</li>
        <li><strong>Tick interval</strong> — how often the agent proactively reviews your threads for stalled situations, even when no new email has arrived</li>
        <li><strong>Model</strong> — different models have different cost and capability tradeoffs; you can switch at any time</li>
      </ul>

      <h2>Multiple watchers</h2>
      <p>You can run as many watchers as you need, and this separation lets you give very different instructions to different contexts.</p>
      <ul>
        <li>Your work watcher can be aggressive about deadlines while your personal watcher sits at low reactivity</li>
        <li>A conversation in one watcher has no influence on decisions made in another</li>
        <li>Each watcher is billed independently at actual AI cost + 5%</li>
      </ul>
    </div>
  );
}
