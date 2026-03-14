export default function ActionsPage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>How the Agent Acts</h1>
      <p>
        Vigil agents don&apos;t just read email. They make decisions and take action. Every email
        that arrives triggers a decision: should I alert the user? Should I track this silently?
        Should I fire a webhook? Should I remember something for later? The agent decides based
        on your prompt, your reactivity level, and the tools you&apos;ve enabled.
      </p>

      <h2>The Decision Flow</h2>
      <p>When an email arrives, the agent goes through this process:</p>
      <ol>
        <li><strong>Read and understand.</strong> The agent reads the full email, identifies the sender, extracts dates, amounts, names, and determines what the sender wants.</li>
        <li><strong>Check memory.</strong> The agent loads relevant memories from previous emails. Has this sender written before? Is there an ongoing conversation? Are there related deadlines?</li>
        <li><strong>Check threads.</strong> The agent looks at active threads. Is this a reply to something already being tracked? Is this a new conversation?</li>
        <li><strong>Decide.</strong> Based on your prompt, reactivity level, and the email content, the agent decides what to do. Most emails get triaged silently. Some trigger actions.</li>
        <li><strong>Act.</strong> The agent uses its enabled tools to take action. Every action is logged with the reasoning behind it.</li>
      </ol>

      <h2>Tools</h2>
      <p>
        Tools are the actions your agent can take. You enable them in your watcher settings.
        The agent decides when to use each tool based on your prompt and the email content.
        You don&apos;t need to write tool logic into your prompt — just describe what you care about,
        and the agent figures out which tool to use.
      </p>

      <h3>Built-in Tools</h3>
      <ul>
        <li>
          <strong>Send Alert</strong> — sends you an email notification when something needs your attention.
          The agent writes a concise summary of what happened and why it matters. Alerts are the most
          visible action and are governed by your reactivity level.
        </li>
        <li>
          <strong>Update Thread</strong> — changes the status of a conversation thread. The agent uses this
          to mark threads as active (needs monitoring), watching (tracking but not urgent), resolved (handled),
          or ignored (noise). Thread status determines whether the agent checks for silence.
        </li>
        <li>
          <strong>Ignore Thread</strong> — marks a thread as noise. The agent stops monitoring it entirely.
          Used for marketing emails, newsletters, and anything that doesn&apos;t need tracking.
        </li>
        <li>
          <strong>Webhook</strong> — sends structured data to any URL you configure. This is how Vigil
          connects to external systems. When the agent decides to fire a webhook, it sends the email
          context, extracted data, and its analysis to your endpoint.
        </li>
      </ul>

      <h3>Custom Tools (coming soon)</h3>
      <p>
        Define your own tools with a name, description, webhook URL, and parameter schema.
        The agent sees custom tools alongside built-in tools and uses them naturally.
        For example, you could create a &quot;Create Jira Ticket&quot; tool that POSTs to your
        Jira webhook whenever the agent identifies a support request.
      </p>

      <h2>Prompts vs Tools</h2>
      <p>
        Your prompt tells the agent <strong>what to care about</strong>. Tools give it
        <strong> the ability to act</strong>. You don&apos;t need to mention tools in your prompt.
      </p>
      <p>For example, if your prompt says:</p>
      <blockquote>&quot;Monitor client emails. Alert me when someone is waiting for a response or when a deadline is approaching.&quot;</blockquote>
      <p>
        The agent automatically knows to use Send Alert when it detects urgency, Update Thread
        to track the conversation, and its memory to remember the deadline. You describe the intent.
        The agent picks the right tool.
      </p>
      <p>
        However, you <em>can</em> add specific instructions to your prompt to fine-tune behavior:
      </p>
      <ul>
        <li>&quot;Never alert me about receipts or payment confirmations&quot;</li>
        <li>&quot;Always mark emails from support@company.com as active&quot;</li>
        <li>&quot;Fire the Slack webhook whenever a client mentions a deadline&quot;</li>
      </ul>
      <p>These override the agent&apos;s default judgment for specific cases.</p>

      <h2>Reactivity</h2>
      <p>
        Reactivity controls how aggressively the agent uses the Send Alert tool. At low reactivity,
        almost nothing triggers an alert. At high reactivity, the agent surfaces more.
        Other tools (thread updates, memory, webhooks) are not affected by reactivity.
      </p>
      <ul>
        <li><strong>Level 1 (Minimum)</strong> — only active security breaches and fraud</li>
        <li><strong>Level 2 (Low)</strong> — security events, money at risk, deadlines within 24 hours</li>
        <li><strong>Level 3 (Balanced)</strong> — financial events, deadlines within 48 hours, direct requests from real people</li>
        <li><strong>Level 4 (High)</strong> — all financial transactions, deadlines within a week, any personal email expecting a response</li>
        <li><strong>Level 5 (Maximum)</strong> — surfaces almost everything including subscribed content</li>
      </ul>

      <h2>Scheduled Reviews</h2>
      <p>
        The agent doesn&apos;t only react to incoming email. On a regular schedule (configured by the tick interval),
        the agent wakes up and proactively reviews all active threads. It checks:
      </p>
      <ul>
        <li>Has any thread gone quiet beyond the silence threshold?</li>
        <li>Are any deadlines in memory approaching?</li>
        <li>Is someone waiting for a response that hasn&apos;t arrived?</li>
        <li>Should any threads be upgraded or downgraded?</li>
      </ul>
      <p>
        This is how Vigil catches things you might miss — not just reacting to what arrives,
        but noticing what <em>didn&apos;t</em> arrive.
      </p>

      <h2>Chat Control</h2>
      <p>
        You can talk to your agent through the dashboard chat. The agent has full context of your
        inbox and can take any action you ask for:
      </p>
      <ul>
        <li>&quot;Ignore all emails from LinkedIn&quot; — ignores existing threads and adds a persistent rule</li>
        <li>&quot;What needs my attention?&quot; — summarizes obligations across all threads</li>
        <li>&quot;Be more aggressive about deadline alerts&quot; — modifies the agent&apos;s behavior permanently</li>
        <li>&quot;Resolve the payment thread&quot; — finds and closes the thread</li>
      </ul>
      <p>
        Chat commands can modify your agent&apos;s prompt, add rules to its memory, and take immediate
        action on threads. It&apos;s the fastest way to control your agent without touching settings.
      </p>

      <h2>Audit Trail</h2>
      <p>
        Every decision the agent makes is logged. You can see exactly what tool was used, why,
        what the agent was thinking, which model processed it, how much it cost, and how long it took.
        The Activity tab in the dashboard shows the full history.
      </p>
    </div>
  );
}
