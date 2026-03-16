# PRODUCT.md — Vigil

The canonical product definition. Everything else derives from this.

## What Vigil Is

An AI agent that reads your email so you don't have to.

You forward emails to Vigil. The agent reads each one, tracks conversations, builds memory over time, and decides what to do. Most of the time, it does nothing visible. It thinks. It remembers. It connects patterns. Occasionally, when something actually needs your attention, it tells you.

Email bodies are processed in memory and discarded. Nothing is stored. Nothing is accessed. No inbox connection. No OAuth. You control exactly what the agent sees through forwarding rules you already know how to set up.

## What Vigil Is Not

Vigil is not an alarm system. The word "alert" should appear sparingly in the product. Most emails result in zero actions and a memory note. The agent's primary job is to read, understand, and remember. Alerts are one tool it has, used when the agent's judgment says something requires human attention.

Vigil is not a SaaS with arbitrary tiers. It's a utility. You pay for what you use.

## Positioning

**Cheap and easy.** So inexpensive that switching away isn't worth the friction. So simple that setup takes two minutes. Transparency over marketing. The product sells itself through cost and clarity.

Comparable energy: OpenClaw, Retell. Tools built by engineers who respect their users' intelligence and wallets.

## Pricing

Cost passthrough. Every LLM call is billed at actual token cost + 5% margin. BYOK users pay nothing.

| | |
|---|---|
| **Model** | Actual token cost + 5% margin |
| **Avg email cost** | ~1.2¢ (GPT-4.1-mini) |
| **Ticks** | Free (absorbed, run on gpt-4.1-nano) |
| **Avg chat cost** | ~0.6¢ (GPT-4.1-mini) |
| **BYOK** | Free (bring your own OpenAI/Anthropic/Google key) |
| **Free tier** | 50 emails to start, no credit card |
| **Billing** | Monthly invoice via Stripe metered billing |

What users actually pay (GPT-4.1-mini, ticks free):

| Usage | Monthly cost |
|---|---|
| Light (100 emails/mo) | ~$1.20 |
| Normal (500 emails/mo) | ~$6 |
| Heavy (2,000 emails/mo) | ~$24 |
| Power (5,000 emails/mo) | ~$60 |
| BYOK (any volume) | $0 |

No tiers. No plans. No flat rates. Scheduled checks and digests are free (absorbed, run on nano). The dashboard shows every API call, its token cost, and the running total. Total transparency.

## Architecture

```
Your Email → Forwarding Rule → Cloudflare MX → Worker → Backend Agent → Memory + Tools
```

- **Cloudflare Worker**: receives raw MIME at the MX level, forwards to backend
- **Backend** (Bun + Hono + SQLite): agent engine, memory, thread detection, tools
- **Agent** (gpt-4.1-mini, JSON mode): 8-step invocation loop per email
- **Memory** (SQLite + FTS5): per-watcher, BM25 ranked retrieval, time decay
- **Delivery** (Resend): alerts from notifications@vigil.run
- **Frontend** (Next.js 14): three-panel application UI

No email bodies stored. SHA-256 hash only. Full audit trail of every agent decision.

## The Agent's Job

For every email received, the agent produces:

1. **Analysis**: summary, sender intent, urgency, entities
2. **Memory**: what to remember (or nothing)
3. **Thread updates**: status changes, summary revisions
4. **Actions**: tools to invoke (usually none)

The typical email: agent reads it, notes a memory chunk ("Sarah confirmed Tuesday delivery"), updates the thread summary, takes no action. The user sees nothing. The agent got smarter.

The exceptional email: agent reads it, recognizes urgency from context ("this vendor's invoice is 5 days overdue, last time they escalated after 7"), sends an alert. The user gets one email from Vigil with clear reasoning.

The ratio of quiet processing to alerts should be roughly 20:1. If the agent is alerting on more than 5% of emails, something is misconfigured.

## UI Design

Three-panel layout inspired by Claude, Retell, and ChatGPT.

### Left Panel — Agent Interface
The active watcher's configuration and chat interface.

**Top section**: watcher name, status, system prompt (editable), model selection, silence threshold, enabled tools. This is where you shape the agent's behavior.

**Bottom section**: conversational interface. Query the agent directly: "What's the status of the Acme thread?" "Summarize what you've seen from billing@vendor.com this month." The agent already supports a `user_query` trigger. This makes the agent feel present, not invisible.

### Center Panel — Inbox
The agent's view of your email threads. Not your inbox. The agent's processed understanding of it.

**Thread list**: grouped by status (needs attention → active → watching → resolved). Each thread shows:
- Subject and participants
- Agent's current summary (not the email content, which was discarded)
- Last activity timestamp
- Status badge
- Email count

**Expanded thread view**: agent's analysis history, memory notes attached to this thread, actions taken, reasoning. This is the transparency layer. You can see exactly what the agent thought about each email.

**Key insight**: most threads will show quiet processing. "Received follow-up, project on track, no action needed." The occasional thread that lights up with an alert stands out by contrast. That contrast is what makes alerts trustworthy.

### Right Panel — Watcher Switcher
List of all watchers with:
- Name and status (active/paused)
- Quick stats: active threads, emails processed this billing period, last activity
- Unread indicator (threads with new activity since last viewed)

Click to switch left and center panels to that watcher's context.

### Design Principles
- Minimal, utilitarian. No gradients, no illustrations, no marketing inside the app.
- Monospace for data (counts, timestamps, email addresses). Sans-serif for everything else.
- The app should feel like a tool, not a product. Think terminal energy with modern typography.
- Dark mode from day one (users who forward 2,000 emails/month live in dark mode).

## Onboarding

The entire onboarding flow:

1. Sign up (email + password, or Google OAuth)
2. Name your watcher (e.g., "Work", "Billing", "Clients")
3. Get a unique forwarding address (e.g., `work-a7f3k9@vigil.run`)
4. Set up forwarding in Gmail/Outlook (inline instructions, 3 steps, with screenshots)
5. Done. First email arrives, agent processes it, user sees it in the inbox panel.

No credit card for free tier. No onboarding wizard. No tooltips. The product is simple enough to not need them.

## Landing Page

The landing page should communicate three things:

1. **What it does** — an AI agent reads your forwarded email, remembers context, and tells you when something matters
2. **What it costs** — half a cent per email, free tier included
3. **How it works** — forward emails, agent processes them, you see the results

Hero copy (draft):

> **Your email has a brain now.**
>
> Forward emails to an AI agent. It reads them, tracks conversations, remembers context, and tells you when something needs your attention. Half a cent per email. No inbox access. No email bodies stored.

The current landing page is good but leans too hard on "alerts" and "notifications." Reframe around the agent's intelligence: reading, thinking, remembering. Alerts are a capability, not the product.

## What's Built

**Backend** (complete):
- 8-step agent invocation loop
- FTS5 memory with BM25 ranking and time decay
- Thread detection (In-Reply-To headers, subject normalization)
- Temporal reasoning
- Alert budgeting (prevents over-alerting)
- Configurable tools (send_alert, update_thread, ignore_thread, webhook)
- Weekly digest generation
- Scheduled tick processing
- User query trigger
- JWT auth with refresh tokens
- Full audit trail (every invocation logged with cost, duration, reasoning)
- Resend email delivery
- Cloudflare Worker deployed and routing

**Frontend** (needs redesign):
- Current: basic dashboard with tables. Functional but not the product.
- Target: three-panel layout described above.

**Not built yet**:
- [ ] Public backend deployment (DNS: api.vigil.run)
- [ ] Real email flow end-to-end test
- [ ] Three-panel frontend redesign
- [ ] Usage metering (count invocations per account per billing period)
- [ ] Stripe metered billing integration
- [ ] Usage dashboard (emails processed, cost, billing period)
- [ ] Onboarding flow with forwarding instructions
- [ ] Dark mode
- [ ] Google OAuth

## Sequence

1. **Deploy backend publicly** — VPS or fly.io, point api.vigil.run DNS
2. **Test real email flow** — forward a real email, confirm Cloudflare → Worker → Backend → Agent → Resend chain works end to end
3. **Frontend redesign** — three-panel layout, inbox view, agent chat, watcher switcher
4. **Usage metering** — instrument invocations, build usage dashboard
5. **Stripe billing** — metered subscription, usage reporting
6. **Onboarding** — sign up flow with inline forwarding setup instructions
7. **Landing page refresh** — reframe around agent intelligence, usage pricing
8. **Dark mode**
9. **Launch**

## Revenue Model

Revenue = 5% of all LLM costs. Guaranteed profitable per-call.

| Users | Avg LLM cost/mo/user | Revenue (5%) | Infra cost | Net |
|---|---|---|---|---|
| 100 | $15 | $75 | $28 | $47 |
| 1,000 | $15 | $750 | $48 | $702 |
| 10,000 | $15 | $7,500 | $250 | $7,250 |

BYOK users cost us only infrastructure (~$0.001/user/mo). They drive adoption and trust.
Paying users generate 5% on every API call with zero risk of negative margin.

Infrastructure cost (Cloudflare free tier + VPS + Resend): ~$28/month until 10K+ users.

## Transparency

Closed source, open book. Publish:
- Architecture documentation (how data flows, what's stored, what's discarded)
- Privacy model (no email bodies, SHA-256 hash, memory is agent-curated summaries)
- Pricing breakdown (your cost per email, our cost per email, margin)
- The white paper (already written)
- Audit trail access (every user can see every agent decision on their data)

Trust through visibility, not through open source.

## Voice

Direct. Technical when it matters, plain when it doesn't. No marketing speak inside the app. The landing page can have personality but the product itself is a tool. Error messages are clear. Empty states are helpful. The agent's reasoning is shown in full, not summarized or hidden.

Comparable: Stripe's dashboard, Linear's interface, Retell's docs. Tools that respect the user.
