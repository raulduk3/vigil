export default function MemoryPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Memory System</h1>
      <p>One of the most important things Vigil's agent does is remember. Not every email, and not blindly — the agent actively decides what's worth retaining based on whether it could affect how future emails are understood. Over time, this accumulated knowledge is what allows the agent to catch things a stateless system would miss entirely: a recurring pattern that's suddenly broken, a deadline that keeps getting pushed, a commitment that was made and never followed up on.</p>

      <h2>How memory works</h2>
      <p>After processing each email, the agent asks itself whether it learned anything worth keeping. This is a deliberate choice, not an automatic transcript. Rather than storing summaries of emails, the agent stores <strong>atomic facts</strong> — small, specific pieces of information that stand on their own. A fact might be "rent payment expected on the 1st of each month" or "Alice is the primary contact at Acme Corp" or "user asked to never alert on promotional emails from this sender." These are things that remain true across many future emails and could change how those emails are interpreted.</p>
      <p>Each memory is tagged with an <strong>importance level</strong>. The most critical memories are hard deadlines, financial obligations, and explicit rules you've set. Lower importance memories hold background context that might occasionally be useful but isn't essential. This weighting shapes how memories are retrieved — when the agent processes a new email, it loads the most relevant and important memories first, ensuring that critical context is never crowded out by noise.</p>

      <h2>What gets stored and what doesn't</h2>
      <p>The agent stores durable facts: upcoming deadlines with specific dates, account balances and financial patterns, commitments people have made to you, recurring payment amounts that should arrive on schedule, and behavioral rules you've defined. These are things that genuinely help interpret future emails from different threads and different senders.</p>
      <p>Email bodies are never stored. The content of each email is read, analyzed, and then discarded once the agent has finished processing it. What persists is the agent's own interpretation — a summary, extracted facts, thread status updates. This means there is no way to recover the original text of an email from Vigil's memory. The body is gone; only what the agent learned from it remains. This isn't just a privacy measure — it's by design. The goal is a system that understands your inbox, not one that archives it.</p>

      <h2>Memory retrieval</h2>
      <p>When the agent processes a new email, it searches its stored memories for anything relevant to the current context. With a small memory store, it loads everything. As the store grows, it uses a relevance ranking system to surface the most useful facts first — weighing both the importance score assigned when the memory was created and how recently it was recorded. Older, lower-importance memories fade naturally in priority as newer information accumulates.</p>
      <p>Memories that become obsolete — for example, a deadline that has passed or a rule that you've since changed — can be marked as such. Obsolete memories are excluded from retrieval, keeping the agent's active context clean and relevant rather than cluttered with outdated facts.</p>

      <h2>Memory sensitivity</h2>
      <p>The <strong>memory sensitivity</strong> setting on each watcher controls how aggressively the agent stores new memories. At the lowest setting, only critical information like hard deadlines and financial data is retained. At the highest, the agent stores a much broader range of context — names, preferences, recurring patterns, and useful background color. Most users find a middle setting works well: the agent builds up meaningful context without filling its memory with trivia. You can adjust this at any time and the change takes effect on the next email the watcher processes.</p>
    </div>
  );
}
