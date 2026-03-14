export default function WatchersPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Watchers</h1>
      <p>A watcher is the core concept in Vigil. Think of it as a dedicated AI agent assigned to monitor a specific category of email. You might have one watcher for work, another for finances, another for package deliveries — each running independently with its own memory, instructions, and alert preferences. They don't share knowledge, and they don't interfere with each other.</p>

      <h2>Creating a watcher</h2>
      <p>Creating a watcher takes about a minute. You give it a name, write a prompt describing what it should pay attention to, and choose a reactivity level. Once created, Vigil assigns it a unique forwarding address — something like <code>work-a7f3k9@vigil.run</code>. Anything forwarded to that address goes directly to that watcher's agent.</p>
      <p>The prompt is the most important configuration. It tells the agent what context to bring, what signals matter, and how to interpret the emails it receives. A watcher for job applications might be told to track application status and flag interview requests. A watcher for finances might be told to watch for unexpected charges and flag missed receipts. The more specific your prompt, the more useful the agent becomes over time.</p>

      <h2>What happens when an email arrives</h2>
      <p>The moment an email arrives at your watcher address, the agent wakes up. It doesn't read the email in isolation — it first loads everything it already knows: its accumulated memories, the current state of all active threads, and any rules you've set. It then groups the new email into an existing conversation or starts a new thread, and analyzes the content to understand what's happening: who sent it, what they want, how urgent it seems, and whether it connects to anything the agent already knows.</p>
      <p>After analysis, the agent decides what to do. Most of the time it chooses to track quietly — it files away what it learned and moves on without alerting you. Occasionally something crosses the alert threshold and it sends you a notification. Every decision, including the ones where it chose not to alert, is recorded with the agent's full reasoning. You can open the activity log at any time and read exactly what the agent thought about each email it processed.</p>

      <h2>Configuration</h2>
      <p>Each watcher has a handful of settings worth understanding. The <strong>system prompt</strong> is your primary lever — this is where you describe what matters, what to ignore, and how to handle ambiguous situations. <strong>Reactivity</strong> controls how aggressively the agent alerts you, on a scale from very conservative (only active security threats) to permissive (anything notable). <strong>Memory sensitivity</strong> controls how much the agent retains between emails — a higher setting means it builds a richer picture of people, patterns, and ongoing situations over time.</p>
      <p>The <strong>silence threshold</strong> tells the agent how long a thread can go quiet before flagging the inactivity. This is useful when you're waiting on someone who has stopped responding. The <strong>tick interval</strong> controls how often the agent proactively reviews your threads for stalled situations, even when no new email has arrived. You can also choose which <strong>model</strong> powers the watcher — different models have different cost and capability tradeoffs, and you can switch at any time.</p>

      <h2>Multiple watchers</h2>
      <p>You can run as many watchers as you need, and each is completely self-contained. This separation lets you give very different instructions to different contexts. Your work watcher can be aggressive about deadlines while your personal watcher sits at low reactivity. The agents don't share memory, so a conversation in one watcher has no influence on decisions made in another. Each watcher is billed independently at $0.005 per email processed.</p>
    </div>
  );
}
