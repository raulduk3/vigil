# Vigil

**Your email has a brain now.**

Forward emails to an AI agent. It reads them, tracks conversations, remembers context, and tells you when something needs your attention. Half a cent per email. No inbox access. No email bodies stored.

Most of the time the agent thinks and remembers. It connects patterns across conversations, tracks who sends what and when, and builds a growing understanding of your email. Alerts are the exception, not the rule. When the agent does interrupt you, it's because something actually matters.

## How It Works

1. Create a watcher and get a unique email address (e.g. `work-a7f3k9@vigil.run`)
2. Set up a forwarding rule in Gmail or Outlook (3 steps, 2 minutes)
3. The agent reads each email, analyzes it, remembers what matters, tracks conversations
4. When something needs your attention, it tells you. Otherwise, it stays quiet.
5. Email content is processed in memory and never stored

## Architecture

```
Email → Cloudflare Email Routing → Worker → Backend → Agent → Resend → You
```

- **Cloudflare Worker** — receives raw MIME email, forwards to backend
- **Backend** — Bun + Hono, SQLite, agent engine with memory and tools
- **Agent** — OpenAI gpt-4.1-mini, JSON mode, per-watcher system prompts
- **Frontend** — Next.js 14, three-panel layout (agent interface, inbox, watcher switcher)
- **Delivery** — Resend API (notifications@vigil.run)

See [PRODUCT.md](PRODUCT.md) for the product definition and [CLAUDE.md](CLAUDE.md) for technical details.

## Development

```bash
# Backend
cd backend
bun install
cp .env.example .env
bun run src/index.ts

# Frontend
cd frontend
npm install
npm run dev

# E2E test
cd backend
bun run scripts/test-e2e.ts
```

## Project Structure

```
vigil.run/
├── backend/              # Bun + Hono API server
│   ├── src/
│   │   ├── agent/        # Engine, tools, memory, prompts, templates
│   │   ├── api/          # Routes + handlers
│   │   ├── auth/         # JWT + OAuth
│   │   ├── db/           # SQLite client + schema
│   │   ├── ingestion/    # Email pipeline
│   │   └── watcher/      # Thread detection
│   └── scripts/          # E2E tests
├── frontend/             # Next.js 14 dashboard
├── cloudflare-worker/    # Email ingestion worker
└── docs/                 # Architecture docs
```

## Pricing

Usage-based. $0.005 per email processed. Free tier: 50 emails/month, 1 watcher, no credit card.

No tiers. No plans. One price, one meter.

## Status

V2 in development. Branch: `v2-agent-architecture`.

Backend: complete (agent loop, tools, memory, MIME parsing, Resend alerts, audit trail).
Cloudflare Worker: deployed, email routing configured.
Frontend: redesign in progress (three-panel layout).
Billing: not yet built (Stripe metered).

## License

Proprietary. All rights reserved.
