import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { notFound } from 'next/navigation';

const posts: Record<string, { title: string; date: string; tag: string; content: string }> = {
  'why-vigil-exists': {
    title: 'Why Vigil Exists',
    date: 'March 14, 2026',
    tag: 'company',
    content: `
<p>Email is the last unautomated channel in most people's work lives. You have project management tools for tasks, CRMs for relationships, calendars for scheduling. But email — where half your obligations actually live — is still managed by manually reading every message and hoping you don't forget anything.</p>

<p>Google added Gemini to Gmail. Microsoft added Copilot to Outlook. Both help you <em>read</em> email faster. Summarize threads. Draft replies. Smart search. They're optimizing inbox throughput. But they don't solve the actual problem: <strong>tracking what you owe people and what they owe you.</strong></p>

<h2>The Gap</h2>
<p>Think about what happens when an email arrives. You read it. You think "I should respond to this by Friday." Then you close it and move on. Maybe you remember. Maybe you don't. Maybe the sender follows up a week later, annoyed. Maybe they don't, and the opportunity quietly dies.</p>

<p>That gap — between reading an email and tracking the obligation it creates — is what Vigil fills.</p>

<h2>Why Forwarding</h2>
<p>We could have built another Gmail plugin that asks for OAuth access. It would be easier to onboard. But it would also mean asking you to trust us with your entire inbox. Every email you've ever received. Every draft. Every contact.</p>

<p>Vigil works through email forwarding because <strong>privacy should be architectural, not a policy checkbox.</strong> You choose exactly what Vigil sees. We process each email and discard the body. We can't access your inbox because we physically don't have the connection.</p>

<p>This isn't a limitation. It's the point.</p>

<h2>What Makes This Different</h2>
<p>Vigil isn't an email client. It's an autonomous agent. It reads email, remembers context across conversations, tracks who's waiting on whom, notices when threads go quiet, and alerts you when something needs action. It does this 24/7 without you opening your inbox.</p>

<p>And because it's an agent with an API, developers can give any AI system email awareness. Your CRM agent can check for client obligations. Your support bot can monitor ticket emails. Your personal assistant can tell you what needs attention today.</p>

<p>That's why Vigil exists. Not to make email faster. To make sure nothing falls through.</p>

<p><a href="/auth/register">Start watching →</a></p>
`,
  },
  'no-inbox-access': {
    title: 'Why We Never Touch Your Inbox',
    date: 'March 14, 2026',
    tag: 'privacy',
    content: `
<p>Every email tool you've used probably asked for this: "Allow access to your Gmail account." One click and a third party can read every email you've ever received, every draft you've written, every contact you have. Most people click "Allow" without thinking.</p>

<p>Vigil never asks for this. Not because we're lazy. Because <strong>we designed the system so that inbox access is impossible.</strong></p>

<h2>How It Works</h2>
<p>You set up a forwarding rule in Gmail or Outlook. Emails that match your criteria get forwarded to your Vigil watcher address (something like <code>work-a7f3k9@vigil.run</code>). Vigil receives the forwarded copy, processes it, and discards the body.</p>

<p>There is no OAuth token. No API connection. No stored credentials. Vigil literally cannot access your inbox because no such connection exists.</p>

<h2>Why This Matters</h2>
<p>When you grant OAuth access to an email tool, you're trusting that company with everything. Their security becomes your security. Their data practices become your data practices. One breach at their end exposes your entire email history.</p>

<p>With Vigil, a breach of our systems exposes: email metadata (sender, subject, timestamps), the agent's AI-generated summaries, and your stored memories. Not your emails. Not your inbox. Not your contacts.</p>

<h2>What We Store vs What We Discard</h2>
<ul>
<li><strong>Stored:</strong> sender address, subject line, timestamps, AI-generated analysis, thread state, agent memories, action logs</li>
<li><strong>Discarded:</strong> email body (processed in memory, never written to disk), attachments (not processed at all)</li>
</ul>

<p>A cryptographic hash of each email body is stored as proof-of-receipt. This hash cannot be reversed to recover the original content.</p>

<p>Read our full <a href="/privacy">Privacy & Data policy</a> for every detail.</p>
`,
  },
  'email-agents-vs-email-clients': {
    title: 'Email Agents vs Email Clients',
    date: 'March 14, 2026',
    tag: 'product',
    content: `
<p>There are two fundamentally different approaches to making email better. Most companies are building one. Vigil is building the other.</p>

<h2>Email Clients</h2>
<p>Superhuman ($30/month), Shortwave, Spark, and Notion Mail are email clients. They replace or enhance Gmail/Outlook. They help you <em>read and respond to email faster.</em> AI summarizes threads. Smart sorting puts important stuff first. Keyboard shortcuts save seconds per email.</p>

<p>They're good at what they do. But they require you to be in the inbox, reading, deciding, acting. The AI assists. You drive.</p>

<h2>Email Agents</h2>
<p>Vigil is an email agent. It reads email <em>for you.</em> It makes decisions autonomously: is this important? Does someone need a response? Is a deadline approaching? Should I alert the user or track this silently?</p>

<p>You don't need to be in the inbox. The agent works 24/7 in the background. When something needs your attention, it reaches out. When nothing does, it stays quiet.</p>

<h2>The Key Differences</h2>
<ul>
<li><strong>Clients</strong> need inbox access. <strong>Agents</strong> work through forwarding.</li>
<li><strong>Clients</strong> help you process email. <strong>Agents</strong> process email for you.</li>
<li><strong>Clients</strong> are reactive (you open, you read). <strong>Agents</strong> are proactive (they watch, they alert).</li>
<li><strong>Clients</strong> are for humans. <strong>Agents</strong> have an API that other systems can query.</li>
</ul>

<p>Email clients optimize your time in the inbox. Email agents eliminate the need to be in the inbox at all.</p>

<p>Both have a place. But if you're tired of email managing you instead of the other way around, an agent is what you want.</p>

<p><a href="/learn/agent">Learn how the agent works →</a></p>
`,
  },
  'obligation-tracking': {
    title: 'What is Email Obligation Tracking?',
    date: 'March 14, 2026',
    tag: 'product',
    content: `
<p>Every email thread carries implicit obligations. Someone asked you a question — they're waiting for an answer. You requested a quote — you're waiting for a response. A payment was scheduled — a confirmation should arrive. A deadline was mentioned — something needs to happen by then.</p>

<p>These obligations are invisible. No email client surfaces them. No calendar captures them (unless you manually create events). They exist only in the space between emails, in the silence between messages.</p>

<h2>What Vigil Tracks</h2>
<p>The Vigil agent monitors every thread for obligation signals:</p>
<ul>
<li><strong>Someone waiting on you:</strong> a direct question, a request for action, a deadline assigned to you</li>
<li><strong>You waiting on someone:</strong> you asked a question, requested a document, expected a confirmation</li>
<li><strong>Silence:</strong> a thread that should have gotten a reply but didn't. The agent notices when conversations go quiet beyond a configurable threshold.</li>
<li><strong>Missing confirmations:</strong> a payment was scheduled but no receipt arrived. A meeting was proposed but no calendar invite followed.</li>
<li><strong>Approaching deadlines:</strong> dates mentioned in emails that are getting closer without associated activity.</li>
</ul>

<h2>How It Works</h2>
<p>The agent runs on a schedule (the "tick interval"). Every few minutes, it wakes up and reviews all active threads. It checks its memory for deadlines. It looks for gaps — things that should have happened but didn't.</p>

<p>This is fundamentally different from email filtering or AI summarization. Those tools tell you what arrived. Vigil tells you <strong>what's missing.</strong></p>

<h2>Why This Doesn't Exist Elsewhere</h2>
<p>Building obligation tracking requires persistent memory across emails, thread state management, temporal reasoning (is this deadline approaching?), and proactive alerting. Email clients don't have this because they're designed around the inbox view, not the obligation view.</p>

<p>Vigil is built from the ground up around the question: <em>what do I owe people, and what do they owe me?</em></p>

<p><a href="/learn/actions">Learn how the agent acts →</a></p>
`,
  },
  'vigil-for-developers': {
    title: 'Vigil for Developers: Email Awareness for Any Agent',
    date: 'March 14, 2026',
    tag: 'developers',
    content: `
<p>If you're building an AI agent — a personal assistant, a support bot, an automation system — at some point you'll want it to understand email. And you'll discover that email is a nightmare to work with programmatically.</p>

<p>OAuth flows. IMAP connections. MIME parsing. Thread detection. Rate limits. Token refresh. And your user has to trust your app with their entire inbox.</p>

<h2>Vigil as Infrastructure</h2>
<p>Vigil handles all of this. Your agent connects to Vigil's API with a single API key. It can:</p>
<ul>
<li>List all email threads with AI-generated summaries</li>
<li>Check what obligations the user has right now</li>
<li>Take actions: ignore threads, resolve conversations, add behavioral rules</li>
<li>Access the agent's memory: deadlines, amounts, commitments it's tracked</li>
<li>Fire custom tools: webhooks to Slack, Jira, Notion, anything with an API</li>
</ul>

<h2>The Sub-Agent Pattern</h2>
<p>Think of Vigil as a dedicated email sub-agent. Your parent agent (OpenClaw, LangChain, CrewAI, or your own system) doesn't need to understand email infrastructure. It just asks Vigil: "What needs attention?" And Vigil answers with structured data.</p>

<p>The setup is three commands:</p>
<pre><code>curl -s https://vigil.run/SKILL.md -o ~/.openclaw/skills/vigil/SKILL.md
curl -s https://vigil.run/vigil.sh -o ~/.openclaw/skills/vigil/scripts/vigil.sh
chmod +x ~/.openclaw/skills/vigil/scripts/vigil.sh</code></pre>

<p>Point your agent at <code>vigil.run/agent-setup.md</code> and it can self-configure.</p>

<h2>Custom Tools</h2>
<p>Define webhook-based tools that the Vigil agent can fire. When it reads an email that matches your criteria, it POSTs structured data to your endpoint. Your system receives clean, extracted data — not raw MIME — and acts on it.</p>

<p>Email in. Structured action out. Connected to anything.</p>

<p><a href="/learn/integrations">Full integration guide →</a></p>
`,
  },
  'the-650-billion-email-problem': {
    title: 'The $650 Billion Email Problem Nobody Is Actually Solving',
    date: 'March 15, 2026',
    tag: 'industry',
    content: `
<p>New research puts a number on what most of us already feel: email is costing the US economy an estimated $650 billion per year in lost productivity. The average knowledge worker spends 28% of their week, roughly 13 hours, reading, writing, and managing email. Every interruption takes 23 minutes to recover from. Multiply that across 121 daily messages and you get a workforce that's perpetually distracted.</p>

<p>The usual response is "get better at email." Batch your checks. Unsubscribe from newsletters. Use keyboard shortcuts. These are band-aids on a structural problem. You can optimize your inbox routine all you want, but the obligations hiding inside those emails don't disappear because you read them faster.</p>

<h2>The Tools Are Solving the Wrong Problem</h2>
<p>AI email tools have exploded in 2026. They summarize threads, draft replies, sort by priority, and auto-categorize. Some users report 30 to 50% reductions in time spent composing and sorting. That's real progress.</p>

<p>But here's what none of them do: track what you owe people and what they owe you.</p>

<p>A client asked for a revised proposal by Thursday. A vendor said they'd send pricing "early next week." Your accountant needs a document before they can file. These obligations live <em>between</em> emails, in the silence after a message is sent. No summarizer catches them. No smart sort surfaces them. They exist only in your memory, and memory is unreliable.</p>

<h2>What Falls Through</h2>
<p>Think about the last time someone followed up with "just checking in on this." That follow-up exists because an obligation went untracked. You read the original email. You meant to respond. Life happened. Now the relationship is slightly strained, the deal slightly cooled, the project slightly delayed.</p>

<p>For freelancers and small teams, these dropped threads aren't minor. A forgotten invoice follow-up is lost revenue. A missed client request is a lost contract. A delayed response to a partner is a missed opportunity. The $650 billion figure isn't abstract. It's made up of millions of small failures, each one a thread that went quiet when it shouldn't have.</p>

<h2>Watching Instead of Reading</h2>
<p>Vigil approaches email differently. It doesn't help you read faster. It watches your email 24/7 and tracks the obligations that emerge from every conversation. Who's waiting on you. Who you're waiting on. What deadlines are approaching. Which threads have gone suspiciously quiet.</p>

<p>It works through email forwarding, not inbox access. You choose what it sees. It processes each email, extracts the obligations, and discards the body. When something needs your attention, it alerts you. When nothing does, it stays silent.</p>

<p>The result is simple: you stop being the tracking system. You stop holding deadlines in your head. You stop wondering if you forgot to reply to someone important. The agent handles the vigilance. You handle the work.</p>

<h2>The Real Fix</h2>
<p>The $650 billion problem won't be solved by faster email clients or smarter sorting algorithms. It'll be solved when we stop asking humans to be the memory layer for their own communications. That's what computers are good at. Let them do it.</p>

<p><a href="https://vigil.run">Start watching your email with Vigil →</a></p>
`,
  },
  'your-ai-agent-cant-read-email': {
    title: 'Your AI Agent Can\u2019t Read Email. That\u2019s a Problem.',
    date: 'March 16, 2026',
    tag: 'industry',
    content: `
<p>Seventy-nine percent of organizations are now running AI agents in production, according to PwC's latest enterprise survey. Agents that write code, manage calendars, draft contracts, route support tickets, forecast revenue. The agentic era isn't approaching. It arrived while everyone was still debating whether it would.</p>

<p>But here's a blind spot that almost nobody talks about: most of these agents can't read email.</p>

<h2>The Missing Sense</h2>
<p>Your AI assistant can search the web, query databases, write documents, and call APIs. Ask it what's in your inbox and it goes silent. Email is the one channel where obligations, deadlines, approvals, and commitments actually live, and it's the one channel agents can't touch without a mess of OAuth tokens, IMAP connections, MIME parsing, and permission scopes that give them access to everything you've ever written.</p>

<p>Most businesses solve this by not solving it. The agent handles Slack, Notion, and Jira. Email stays manual. Someone still opens Gmail every morning, reads 50 messages, and tries to remember which ones matter.</p>

<h2>Multi-Agent Systems Need Specialization</h2>
<p>The industry is moving fast toward multi-agent orchestration: systems where specialized agents collaborate on complex work. One agent handles code review. Another manages customer support. Another tracks project timelines. They communicate through standardized protocols like MCP, sharing context without stepping on each other.</p>

<p>This pattern works because each agent does one thing well. But it falls apart at email because nobody has a clean way to give an agent email awareness without handing it the keys to your entire inbox.</p>

<h2>A Different Architecture</h2>
<p>Vigil was built specifically for this problem. It's an autonomous email agent that works through forwarding, not inbox access. You set a rule in Gmail or Outlook. Matching emails get forwarded to your Vigil watcher address. The agent processes each one, extracts obligations and deadlines, builds persistent memory across threads, and discards the email body.</p>

<p>No OAuth. No stored credentials. No connection to your inbox that could be breached.</p>

<p>For developers building multi-agent systems, Vigil acts as the email sub-agent. Your parent agent, whether it's built on LangChain, CrewAI, or your own framework, just asks Vigil: "What obligations does this user have right now?" It gets back structured data. Clean. Queryable. No email infrastructure required.</p>

<h2>What This Looks Like in Practice</h2>
<p>A freelancer sets up Vigil to watch client emails. The agent notices a proposal request came in Tuesday with a Thursday deadline. Wednesday afternoon, no draft has been sent. Vigil alerts. The freelancer delivers on time instead of apologizing on Friday.</p>

<p>A small agency connects Vigil to their project management agent. When a client emails about scope changes, the email agent extracts the request and passes it to the project agent, which updates the timeline and notifies the team. Nobody manually triaged that email.</p>

<p>An ops team uses Vigil's webhook tools to route invoice confirmations directly into their accounting system. Email in, structured data out, zero human handling for routine financial correspondence.</p>

<h2>The Gap Is Closing</h2>
<p>AI agents are eating every workflow they can reach. Email has been the holdout because the infrastructure didn't exist to give agents email awareness without compromising privacy. That's no longer true.</p>

<p>If you're building autonomous systems and email is still a manual gap, or if you're just tired of being your own obligation tracker, Vigil is the piece that's been missing.</p>

<p><a href="https://vigil.run">Give your agent email awareness →</a></p>
`,
  },
  'microsoft-copilot-email-agents-and-what-they-miss': {
    title: 'Microsoft Is Building Email Agents. They\u2019re Missing the Point.',
    date: 'March 17, 2026',
    tag: 'industry',
    content: `
<p>Microsoft just rolled out autonomous email triage in Copilot for Outlook. You can now tell Copilot to flag, archive, categorize, and draft responses to emails using natural language. It reads your entire inbox, cross-references your calendar and SharePoint files, and proposes next steps. It's impressive engineering. It's also exactly the wrong architecture for most people who need email help.</p>

<h2>The Enterprise Play</h2>
<p>Copilot's email agents are built for large organizations. They require Microsoft 365 licenses (starting at $30/user/month for Copilot access), Copilot Studio for customization, and IT teams to define triggers, knowledge sources, and business logic. The agents live inside the Microsoft ecosystem: they need full OAuth access to your inbox, calendar, OneDrive, and SharePoint to function.</p>

<p>For a 500-person company with a security team and an IT department, this makes sense. For a freelancer juggling three clients? For a two-person agency managing project emails? It's like hiring a full catering company to make your morning coffee.</p>

<h2>The Access Problem Nobody Mentions</h2>
<p>To do any of this, Copilot needs to see everything. Every email you've ever received. Every draft. Every attachment. Every calendar entry. That's the deal with OAuth-based email tools: they work by having complete access, and you trust Microsoft's infrastructure to keep it safe.</p>

<p>Microsoft's infrastructure is good. But "trust us, we're big" is a policy decision, not an architectural one. When the next breach hits (and breaches always hit), the blast radius is your entire digital life.</p>

<p>There's a simpler question most people should ask: does the tool that watches my email actually need to see all of it?</p>

<h2>What Freelancers and Small Teams Actually Need</h2>
<p>If you're not running enterprise workflows through SharePoint, you don't need an enterprise email agent. You need something that answers three questions:</p>
<ul>
<li>Who's waiting on me right now?</li>
<li>What did I forget to follow up on?</li>
<li>What deadlines are approaching that I haven't acted on?</li>
</ul>

<p>That's obligation tracking. It doesn't require reading your entire inbox. It requires watching the threads that matter and remembering what happened in them over time.</p>

<h2>A Different Model</h2>
<p>Vigil works through email forwarding. You set a rule in Gmail or Outlook: forward client emails, or project threads, or everything from certain senders. Vigil receives those forwarded copies, extracts obligations and deadlines, builds memory across conversations, and discards the email body. It physically cannot access your inbox because no such connection exists.</p>

<p>When a thread goes quiet and someone's waiting on you, Vigil alerts you. When a deadline mentioned three emails ago is two days away, Vigil catches it. When everything is fine, it stays silent.</p>

<p>It costs about a penny per email processed. No monthly subscription required. Bring your own API key and it's free.</p>

<h2>The Right Tool for the Right Scale</h2>
<p>Microsoft building autonomous email agents validates the entire category. Email has been the last manual channel in knowledge work, and the biggest players are finally treating it as an automation problem rather than a UI problem. That's good for everyone.</p>

<p>But "autonomous email agent" doesn't have to mean "hand over your entire inbox to a platform that costs $30/month per seat." For the millions of independent workers, small teams, and privacy-conscious professionals who just need to stop dropping threads, there's a lighter path.</p>

<p><a href="https://vigil.run">Try Vigil free with your own API key →</a></p>
`,
  },
  'pay-per-use': {
    title: 'Why Pay-Per-Use Beats Subscriptions for Email Tools',
    date: 'March 14, 2026',
    tag: 'pricing',
    content: `
<p>Superhuman costs $30/month. You pay the same whether you process 10 emails or 10,000. For a power user, that's a deal. For everyone else, it's a tax on having an email address.</p>

<p>Vigil charges the actual LLM token cost plus a 5% margin. Bring your own API key and it's completely free. Here's what that looks like:</p>

<h2>The Math</h2>
<ul>
<li><strong>Light</strong> (100 emails/mo + hourly checks): ~$11/month</li>
<li><strong>Normal</strong> (500 emails/mo + hourly checks): ~$16/month</li>
<li><strong>Heavy</strong> (2,000 emails/mo + hourly checks): ~$34/month</li>
<li><strong>BYOK</strong> (any volume, your own API key): $0/month</li>
</ul>

<p>Each email costs about 1.2¢ to process on GPT-4.1 (default model). Scheduled checks cost about 0.07¢ each on GPT-4.1 Nano. We add 5% on top. That's it. Your dashboard shows every call and its exact cost.</p>

<h2>Why This Is More Honest</h2>
<p>Subscription pricing hides the real cost. A $30/month email tool needs you to use it a lot to feel worth it. If you go on vacation for a week, you're paying for nothing. If you have a slow month, same price.</p>

<p>Cost passthrough aligns our incentives with yours. We make 5% when the agent does work. If it sits idle, you pay nothing. If you bring your own key, we make nothing and that's fine — adoption matters more than margin.</p>

<h2>No Tiers, No Limits</h2>
<p>There are no artificial limits. Unlimited watchers. Unlimited memory. Unlimited threads. Unlimited API access. You pay for compute (the AI model processing each email) plus 5%. Nothing else is gated. Bring your own API key and even the compute is on you.</p>

<p>We think this is how software should be priced. You pay for what you use. You see exactly what each email costs. No surprises.</p>

<p><a href="/pricing">See full pricing →</a></p>
`,
  },
};

export function generateStaticParams() {
  return Object.keys(posts).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts[slug];
  if (!post) return {};
  return {
    title: post.title,
    description: post.content.replace(/<[^>]*>/g, '').slice(0, 155).trim() + '…',
    alternates: { canonical: `https://vigil.run/blog/${slug}` },
    openGraph: {
      title: `${post.title} | Vigil`,
      description: post.content.replace(/<[^>]*>/g, '').slice(0, 155).trim() + '…',
      url: `https://vigil.run/blog/${slug}`,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts[slug];
  if (!post) notFound();

  const tagColors: Record<string, string> = {
    company: 'badge-neutral', privacy: 'badge-ok', product: 'badge-warning',
    developers: 'badge-created', pricing: 'badge-neutral',
  };

  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <Link href="/blog" className="text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6 inline-block">
            ← Back to blog
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <span className={`badge badge-sm ${tagColors[post.tag] || 'badge-neutral'}`}>{post.tag}</span>
            <span className="text-sm text-gray-400">{post.date}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-8">
            {post.title}
          </h1>

          <div className="prose" dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
