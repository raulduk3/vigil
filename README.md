# Vigil

**An email agent that never sees your inbox.**

Forward emails to Vigil. It watches your threads, remembers context, and alerts you when something needs attention. No OAuth. No inbox access. No email content stored.

## How It Works

1. Create a watcher and get a unique email address (e.g. `your-watcher-abc123@vigil.run`)
2. Set up a forwarding rule in your email client
3. Vigil's AI agent reads each email, tracks conversations, and decides what to do
4. You get alerts when threads need your attention
5. Email content is processed in memory and never stored

## Architecture

```
Email → Cloudflare Email Routing → Worker → Backend → Agent → Resend → You
```

- **Cloudflare Worker** — receives raw MIME email, forwards to backend
- **Backend** — Bun + Hono, SQLite, agent engine with memory and tools
- **Agent** — OpenAI gpt-4.1-mini, JSON mode, per-watcher system prompts
- **Frontend** — Next.js 14 dashboard (watcher management, thread viewer, activity log)
- **Alerts** — Resend API (notifications@vigil.run)

See [CLAUDE.md](CLAUDE.md) for full technical details.

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

## Status

V2 in development. Branch: `v2-agent-architecture`.

Backend: functional (agent loop, tools, memory, MIME parsing, Resend alerts).
Cloudflare Worker: deployed, email routing configured.
Frontend: needs V2 update.

## License

Proprietary. All rights reserved.
