export default function MemoryPage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>Memory system</h1>
      <p className="text-lg text-gray-600">
        Each watcher's agent has persistent memory. It decides what to remember from each email
        and surfaces relevant memories when processing new ones. The agent gets smarter over time.
      </p>

      <h2 id="how-it-works">How memory works</h2>
      <p>
        After processing an email, the agent can append notes to its memory. These are short,
        factual observations: "Cory usually responds within 24 hours," "Monthly invoice from
        vendor is around $2,400," "Client prefers Tuesday meetings."
      </p>
      <p>
        Each memory chunk is stored with an importance rating (1-5) that the agent assigns based
        on how useful it thinks the information will be in the future.
      </p>

      <h2 id="retrieval">Smart retrieval</h2>
      <p>
        When a new email arrives, the agent doesn't load all memories. It searches for relevant ones:
      </p>
      <ul>
        <li><strong>Under 20 memories:</strong> All memories are loaded, sorted by importance</li>
        <li><strong>20+ memories:</strong> Full-text search using the email's sender, subject, and content as the query. Results are ranked by relevance × importance × recency.</li>
      </ul>
      <p>
        This means the agent's context window stays focused. A watcher with hundreds of memories
        only sees the 8 most relevant ones for any given email, not the entire history.
      </p>

      <h2 id="what-it-remembers">What the agent remembers</h2>
      <p>The agent decides what to remember based on its system prompt and the email content. Typical memories include:</p>
      <ul>
        <li>Sender behavior patterns (response times, communication style)</li>
        <li>Recurring topics and their context</li>
        <li>Financial details (invoice amounts, payment schedules)</li>
        <li>Preferences and instructions from you</li>
        <li>Thread outcomes (how conversations resolved)</li>
      </ul>

      <h2 id="viewing">Viewing memory</h2>
      <p>
        You can inspect your watcher's memory at any time through the dashboard. Every memory chunk
        is visible: what was remembered, when, and with what importance rating. You have full
        transparency into what the agent knows.
      </p>

      <h2 id="privacy">Privacy</h2>
      <p>
        Memories are the agent's own notes, not copies of email content. They are short,
        factual observations. The original email body that generated a memory is never stored.
      </p>
    </article>
  );
}
