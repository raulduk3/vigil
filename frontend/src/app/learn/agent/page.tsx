export default function AgentPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>The Agent</h1>
      <p>The agent is what makes Vigil different from a simple filter or notification service. It doesn't match keywords or apply static rules — it reads, understands, and decides, building context over time the way a good human assistant would.</p>
      <ul>
        <li>Each watcher runs its own independent agent</li>
        <li>The agent is shaped by the instructions you've written and the memory it has accumulated from past emails</li>
      </ul>

      <h2>Reading an email</h2>
      <p>When an email arrives, the agent doesn't read it cold. Before looking at the new message, it loads everything relevant it already knows:</p>
      <ul>
        <li>The memories it has built up over past emails</li>
        <li>The current state of all active threads</li>
        <li>Any rules you've defined</li>
      </ul>
      <p>This full context is what separates the agent from a simple classifier. It can recognize that a message from a vendor is the third in a dispute that started last week, that a payment hasn't arrived when one was expected, or that a deadline mentioned in passing two weeks ago is now tomorrow.</p>
      <p>With that context assembled, the agent produces a structured analysis: who sent the email, what they're trying to accomplish, how urgent the situation seems, and what it connects to in existing context. The email body is discarded after analysis — what persists is the agent's interpretation, not the original content.</p>

      <h2>Making decisions</h2>
      <p>After analysis, the agent decides what to do. Your watcher configuration shapes this decision directly:</p>
      <ul>
        <li><strong>System prompt</strong> — tells the agent what matters to you</li>
        <li><strong>Reactivity level</strong> — sets the threshold above which it will interrupt you with an alert</li>
      </ul>
      <p>Given all of that context, the agent picks an action: alert you, silently track the thread, mark it as resolved, or ignore it entirely. Every decision is logged with the agent's reasoning — including decisions to do nothing. If an alert surprises you, or if you expected an alert and didn't get one, the log tells you exactly what happened.</p>

      <h2>Proactive monitoring</h2>
      <p>The agent doesn't only run when new email arrives. On a schedule you control, it proactively reviews all your open threads looking for situations that might need attention.</p>
      <ul>
        <li>Threads that have gone quiet past your silence threshold</li>
        <li>Deadlines approaching without confirmation</li>
        <li>Commitments someone made that have gone without follow-up</li>
      </ul>
      <p>This scheduled pass is what allows Vigil to catch things that never generate new email — the silence itself becomes a signal worth surfacing. For example: if a contractor said they'd send a revised proposal by Friday and it's now Monday with no reply, the agent can flag that not because a new email arrived, but because the thread has been quiet when it shouldn't be.</p>

      <h2>Talking to your agent</h2>
      <p>You can send messages directly to your agent from the dashboard. It has full access to everything it knows — your threads, your memories, your history — and can answer questions or take actions.</p>
      <ul>
        <li>Ask it what currently needs your attention</li>
        <li>Tell it to stop alerting you about emails from a particular sender</li>
        <li>Add a rule that changes how it interprets a class of messages</li>
      </ul>
      <p>Changes made through chat are applied immediately and persist going forward as part of the agent's memory.</p>
    </div>
  );
}
