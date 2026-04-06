# CLAUDE.md

Development guidance for working with the Vigil codebase.

## Product

Vigil is an open source, self-hosted AI email triage agent. BYOK-first: users bring their own API keys from OpenAI, Anthropic, or Google. Multi-model, multi-provider. Forward emails to a Vigil address. The agent reads each one, tracks conversations, builds memory, and decides what to do. No inbox access. No email bodies stored.

**Read PRODUCT.md for the canonical product definition.** Everything derives from that.

## Commands

```bash
# Backend
cd backend
bun install
bun run dev              # Dev server (port 4000)
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

# Docker
docker compose up
```

## Architecture

### Backend (Bun + Hono + SQLite)

Agent-based. Each watcher has its own LLM agent with memory, tools, and configurable behavior. BYOK keys encrypted with AES-256-GCM.

**Data flow:** Email → Cloudflare Worker → Backend `/ingest/:token` → Agent Engine → Tools (alert, thread update, memory store)

| Module | Purpose |
|--------|---------|
| `agent/engine.ts` | 8-step invocation loop, model catalog, LLM dispatch |
| `agent/tools.ts` | Built-in tools: send_alert, update_thread, ignore_thread, webhook |
| `agent/memory.ts` | Per-watcher memory with FTS5 search, BM25 ranking, time decay |
| `agent/prompts.ts` | System + trigger prompt construction |
| `agent/action-mapper.ts` | Deterministic action mapping for mini/nano classification pipeline |
| `agent/templates/` | Watcher templates (general, extensible) |
| `ingestion/` | Email pipeline orchestration |
| `watcher/` | Thread detection (In-Reply-To, subject normalization) |
| `api/` | Hono REST handlers (auth, watchers, threads, ingestion, BYOK keys) |
| `auth/` | JWT with access/refresh tokens |
| `db/` | SQLite via bun:sqlite, schema in schema.sql |
| `llm/` | Provider dispatch (OpenAI, Anthropic, Google) |

**Tables:** accounts, watchers, threads, emails, actions, channels, memories (+ memories_fts), refresh_tokens, account_keys

**Two triggers:**
- `email_received` — immediate, on ingest
- `scheduled_tick` — every 5 min, checks silence thresholds

**LLM:** Multi-provider (OpenAI, Anthropic, Google). JSON mode forced. Agent responds with `{actions, memory_append, thread_updates, email_analysis}`. Mini/nano models use classification pipeline with deterministic action mapping. Standard/pro models use full agent prompt.

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
PORT=4000
HOST=0.0.0.0
DB_PATH=./data/vigil.db
JWT_SECRET, JWT_REFRESH_SECRET
ENCRYPTION_KEY                    # AES-256-GCM for BYOK keys
RESEND_API_KEY
RESEND_FROM_EMAIL=notifications@vigil.run
VIGIL_MODEL=gpt-4.1-mini         # Default model, overridable per watcher

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Branch

Main branch is the current codebase.
