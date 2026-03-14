export default function AgentPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>The Agent</h1>
      <p>The agent is what makes Vigil different from a simple filter or notification service. It doesn't match keywords or apply static rules. It reads, understands, and decides — building context over time the way a good human assistant would. Each watcher runs its own independent agent, shaped by the instructions you've written and the memory it has accumulated from past emails.</p>

      <h2>Reading an email</h2>
      <p>When an email arrives, the agent doesn't read it cold. Before looking at the new message, it loads everything relevant it already knows: the memories it has built up over past emails, the current state of all active threads, and any rules you've defined. This full context is what separates the agent from a simple classifier — it can recognize that a message from a vendor is the third in a dispute that started last week, that a payment hasn't arrived when one was expected, or that a deadline mentioned in passing two weeks ago is now tomorrow.</p>
      <p>With that context assembled, the agent reads the email and produces a structured analysis: who sent it, what they're trying to accomplish, how urgent the situation seems, and what it connects to in existing context. This analysis is what gets stored — the email body itself is discarded after the agent has finished reading it. What persists is the agent's interpretation, not the original content.</p>

      <h2>Making decisions</h2>
      <p>After analysis, the agent decides what to do. Your watcher configuration shapes this decision directly. The <strong>system prompt</strong> tells the agent what matters to you. The <strong>reactivity level</strong> sets the threshold above which it will interrupt you with an alert. Given all of that context, the agent picks an action: alert you, silently track the thread, mark it as resolved, or ignore it entirely.</p>
      <p>Every decision is logged with the agent's reasoning — including decisions to do nothing. You can open the activity log for any watcher and read exactly what the agent thought about each email: what it understood, why it made the choice it did, how confident it was, and what it decided to remember. There are no black-box decisions. If an alert surprises you, or if you expected an alert and didn't get one, the log tells you exactly what happened.</p>

      <h2>Proactive monitoring</h2>
      <p>The agent doesn't only run when new email arrives. On a schedule you control, it proactively reviews all your open threads looking for situations that might need attention. It checks whether any threads have gone quiet past your silence threshold, whether deadlines are approaching without confirmation, and whether commitments someone made have gone without follow-up. This scheduled pass is what allows Vigil to catch things that never generate new email — the silence itself becomes a signal worth surfacing.</p>
      <p>For example: if a contractor said they'd send a revised proposal by Friday and it's now Monday with no reply, the agent can flag that — not because a new email arrived, but because the thread has been quiet when it shouldn't be. This kind of proactive pattern-matching is one of the most valuable things the agent does.</p>

      <h2>Talking to your agent</h2>
      <p>You can send messages directly to your agent from the dashboard. It has full access to everything it knows — your threads, your memories, your history — and can answer questions, take actions, or update its own behavior. You can ask it what currently needs your attention, tell it to stop alerting you about emails from a particular sender, or add a rule that changes how it interprets a class of messages. Changes made through chat are applied immediately and persist going forward as part of the agent's memory.</p>
    </div>
  );
}
