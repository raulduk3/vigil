export default function MemoryPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>Memory System</h1>
      <p>The agent builds persistent memory across emails. Memories survive across invocations and inform future decisions.</p>

      <h2>What gets stored</h2>
      <p>The agent stores facts that will help it process future emails from different threads:</p>
      <ul>
        <li>Upcoming deadlines with specific dates</li>
        <li>Account balances and financial state</li>
        <li>Commitments someone made to the user</li>
        <li>Recurring payment amounts and patterns</li>
        <li>Behavioral rules set by the user ("always ignore X")</li>
      </ul>

      <h2>What doesn't get stored</h2>
      <ul>
        <li>Email bodies (processed and discarded)</li>
        <li>Receipt details (captured in thread summaries)</li>
        <li>One-time confirmations</li>
        <li>Content from ignored threads</li>
        <li>Ephemeral info (weather, promos)</li>
      </ul>

      <h2>Importance levels</h2>
      <ul>
        <li><strong>5</strong> — Hard deadlines, money, contractual obligations, user-defined rules</li>
        <li><strong>4</strong> — Meetings, decisions, schedule changes with dates</li>
        <li><strong>3</strong> — Useful context, names, preferences (default)</li>
        <li><strong>2</strong> — Background info, nice to know</li>
        <li><strong>1</strong> — Rarely stored</li>
      </ul>

      <h2>Memory retrieval</h2>
      <p>When processing an email, the agent loads relevant memories using FTS5 full-text search weighted by importance and recency. Under 20 memories: all loaded. Over 20: semantic retrieval with BM25 ranking.</p>

      <h2>Memory sensitivity</h2>
      <p>Controls how aggressively the agent stores memories (1-5). At level 1, only deadlines and money. At level 5, everything potentially useful.</p>
    </div>
  );
}
