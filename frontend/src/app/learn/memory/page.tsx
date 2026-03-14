export default function MemoryPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Memory System</h1>
      <p>One of the most important things Vigil's agent does is remember. Not every email, and not blindly — the agent actively decides what's worth retaining based on whether it could affect how future emails are understood.</p>
      <ul>
        <li>A recurring pattern that's suddenly broken</li>
        <li>A deadline that keeps getting pushed</li>
        <li>A commitment that was made and never followed up on</li>
      </ul>
      <p>This accumulated knowledge is what allows the agent to catch things a stateless system would miss entirely.</p>

      <h2>How memory works</h2>
      <p>After processing each email, the agent asks itself whether it learned anything worth keeping. This is a deliberate choice, not an automatic transcript. Rather than storing summaries of emails, the agent stores <strong>atomic facts</strong> — small, specific pieces of information that stand on their own.</p>
      <ul>
        <li>"Rent payment expected on the 1st of each month"</li>
        <li>"Alice is the primary contact at Acme Corp"</li>
        <li>"User asked to never alert on promotional emails from this sender"</li>
      </ul>
      <p>These are things that remain true across many future emails and could change how those emails are interpreted.</p>
      <p>Each memory is tagged with an <strong>importance level</strong>. The most critical memories are hard deadlines, financial obligations, and explicit rules you've set. Lower importance memories hold background context that might occasionally be useful but isn't essential. This weighting shapes how memories are retrieved — critical context is never crowded out by noise.</p>

      <h2>What gets stored and what doesn't</h2>
      <p>The agent stores durable facts that genuinely help interpret future emails:</p>
      <ul>
        <li>Upcoming deadlines with specific dates</li>
        <li>Account balances and financial patterns</li>
        <li>Commitments people have made to you</li>
        <li>Recurring payment amounts that should arrive on schedule</li>
        <li>Behavioral rules you've defined</li>
      </ul>
      <p>Email bodies are never stored. The content of each email is read, analyzed, and then discarded once the agent has finished processing it. What persists is the agent's own interpretation — a summary, extracted facts, thread status updates. This isn't just a privacy measure; it's by design. The goal is a system that understands your inbox, not one that archives it.</p>

      <h2>Memory retrieval</h2>
      <p>When the agent processes a new email, it searches its stored memories for anything relevant to the current context. With a small memory store, it loads everything. As the store grows, it uses a relevance ranking system to surface the most useful facts first:</p>
      <ul>
        <li>The <strong>importance score</strong> assigned when the memory was created</li>
        <li>How <strong>recently</strong> it was recorded</li>
      </ul>
      <p>Older, lower-importance memories fade naturally in priority as newer information accumulates. Memories that become obsolete — a deadline that has passed, a rule you've since changed — can be marked as such and are excluded from retrieval, keeping the agent's active context clean.</p>

      <h2>Memory sensitivity</h2>
      <p>The <strong>memory sensitivity</strong> setting on each watcher controls how aggressively the agent stores new memories:</p>
      <ul>
        <li><strong>Low</strong> — only critical information like hard deadlines and financial data</li>
        <li><strong>Medium</strong> — meaningful context without filling memory with trivia (most users find this works well)</li>
        <li><strong>High</strong> — a much broader range: names, preferences, recurring patterns, and useful background color</li>
      </ul>
      <p>You can adjust this at any time and the change takes effect on the next email the watcher processes.</p>
    </div>
  );
}
