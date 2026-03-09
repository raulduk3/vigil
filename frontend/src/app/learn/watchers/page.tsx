export default function WatchersPage() {
  return (
    <article className="prose prose-gray py-12">
      <h1>Watchers</h1>
      <p className="text-lg text-gray-600">
        A watcher is Vigil's core object. Each watcher is an independent AI agent with its own
        prompt, memory, tools, and email address. Create one for work, one for billing, one for
        client communications. Each learns independently.
      </p>

      <h2 id="creating">Creating a watcher</h2>
      <p>
        When you create a watcher, you get a unique email address like <code>work-a7f3k9@vigil.run</code>.
        Set up a forwarding rule in your email client to send relevant emails to this address.
        The watcher's agent processes every email that arrives.
      </p>
      <p>
        You can start from a template (vendor follow-up, client communications, general) or write
        a custom prompt from scratch. Templates provide a starting system prompt and sensible defaults.
      </p>

      <h2 id="configuration">Configuration</h2>
      <p>Each watcher has:</p>
      <ul>
        <li><strong>System prompt</strong> — tells the agent what to watch for, what to ignore, and how to behave</li>
        <li><strong>Tools</strong> — which actions the agent can take (send_alert, update_thread, ignore_thread, webhook)</li>
        <li><strong>Silence threshold</strong> — hours of thread inactivity before the agent flags it (default: 48)</li>
        <li><strong>Tick interval</strong> — how often the agent reviews active threads (default: 60 minutes)</li>
        <li><strong>Alert channels</strong> — where notifications go (email, webhook)</li>
      </ul>

      <h2 id="how-it-works">How the agent works</h2>
      <p>
        When an email arrives, the agent runs an 8-step process: load config, retrieve relevant
        memories, check active threads, analyze the email, build a prompt, call the AI model,
        execute any tool calls, and log everything.
      </p>
      <p>
        The agent also runs on a schedule (the tick interval). During scheduled checks, it reviews
        active threads for silence violations and takes action if needed.
      </p>

      <h2 id="templates">Templates</h2>
      <p>
        Templates give you a head start. Each template includes a system prompt, default tools,
        and recommended thresholds. You can customize everything after creation.
      </p>
      <ul>
        <li><strong>General</strong> — broad monitoring with smart alerting</li>
        <li><strong>Vendor follow-up</strong> — track invoices, payments, and unanswered requests</li>
        <li><strong>Client communications</strong> — monitor project threads and flag cold conversations</li>
        <li><strong>Custom</strong> — blank slate, write your own prompt</li>
      </ul>

      <h2 id="lifecycle">Lifecycle</h2>
      <p>
        Watchers can be <strong>active</strong> (monitoring), <strong>paused</strong> (email accepted but not processed),
        or <strong>deleted</strong> (permanently stopped). Pausing a watcher preserves its memory and threads.
      </p>
    </article>
  );
}
