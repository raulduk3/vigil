# CLAUDE.md

Development guidance for working with the Vigil codebase.

## Product

Vigil is an AI agent that reads your email so you don't have to. Forward emails to a `@vigil.run` address. The agent reads each one, tracks conversations, builds memory over time, and decides what to do. Most of the time it thinks and remembers. Occasionally it alerts you when something actually needs attention. No inbox access. No email bodies stored. Free and open source — bring your own API key (BYOK).

**Read PRODUCT.md for the canonical product definition.** Everything derives from that.

## Commands

```bash
# Backend
cd backend
bun install
bun run dev              # Dev server (port 3001)
bun run scripts/test-e2e.ts  # E2E test

# Frontend
cd frontend
npm install
npm run dev              # Dev server (port 3000)
npm run build
npm run typecheck
npm run lint

# Cloudflare Worker
cd cloudflare-worker
npx wrangler deploy
```

## Architecture

### Backend (Bun + Hono + SQLite)

Agent-based. Each watcher has its own LLM agent with memory, tools, and configurable behavior.

**Data flow:** Email → Cloudflare Worker → Backend `/ingest/:token` → Agent Engine → Tools (alert, thread update, memory store)

| Module | Purpose |
|--------|---------|
| `agent/engine.ts` | 8-step invocation loop (load → memory → threads → email → prompt → LLM → tools → log) |
| `agent/tools.ts` | Built-in tools: send_alert, update_thread, ignore_thread, webhook |
| `agent/memory.ts` | Per-watcher memory with FTS5 search, BM25 ranking, time decay |
| `agent/prompts.ts` | System + trigger prompt construction |
| `agent/templates/` | Watcher templates (general, extensible) |
| `ingestion/` | Email pipeline orchestration |
| `watcher/` | Thread detection (In-Reply-To, subject normalization) |
| `api/` | Hono REST handlers (auth, watchers, threads, ingestion) |
| `auth/` | JWT with access/refresh tokens |
| `db/` | SQLite via bun:sqlite, schema in schema.sql |

**Tables:** accounts, watchers, threads, emails, actions, channels, memories (+ memories_fts), refresh_tokens

**Two triggers:**
- `email_received` — immediate, on ingest
- `scheduled_tick` — every 5 min, checks silence thresholds

**LLM:** OpenAI API (gpt-4.1-mini default), JSON mode forced. Agent responds with `{actions, memory_append, thread_updates, email_analysis}`.

### Cloudflare Worker

Receives raw MIME from Cloudflare Email Routing. Forwards to backend `/ingest/:token`. Backend parses MIME via `postal-mime`.

### Frontend (Next.js 14)

Display layer. All state from backend API. No business logic.

## Constraints

1. Email bodies are never persisted — processed in memory, only SHA-256 hash stored
2. Agent decides what to remember via `memory_append`
3. Tools are the only way the agent affects the outside world
4. No file > 1000 lines
5. Frontend is read-only display — all mutations go through backend API

## Environment

```bash
# Backend (.env)
PORT=3001
SQLITE_PATH=./data/vigil.db
JWT_SECRET, JWT_REFRESH_SECRET
OPENAI_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL=notifications@vigil.run

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Branch

Main branch is the current codebase.
