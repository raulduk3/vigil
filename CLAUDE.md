# CLAUDE.md

Development guidance for Claude Code when working with the Vigil codebase.

## Product

Vigil is an email oversight agent. Forward emails to Vigil. It reads them, tracks conversations, remembers context, and alerts you when something needs attention. No inbox access. No email bodies stored.

## Commands

```bash
# Backend
cd backend
bun install
bun run src/index.ts          # Start server (port 3001)
bun run scripts/test-e2e.ts   # End-to-end test

# Frontend
cd frontend
npm install
npm run dev                    # Dev server (port 3000)
npm run build                  # Production build
```

## Architecture

### V2 (Current — branch: v2-agent-architecture)

Single-process Bun + Hono server with SQLite. LLM agent processes each email and decides what to do.

**Stack:** Bun, Hono, SQLite, OpenAI (gpt-4.1-mini), Resend, Cloudflare Workers, Next.js 14

### Data Flow

```
Email sender → *@vigil.run
  → Cloudflare Email Routing → Worker (raw MIME)
  → POST /ingest/:token (backend parses with postal-mime)
  → Agent engine (8-step loop)
  → Tools: send_alert, update_thread, ignore_thread, webhook
  → Resend → User's inbox
```

### Key Modules (backend/src/)

| Module | Purpose |
|--------|---------|
| `agent/engine.ts` | 8-step agent invocation loop |
| `agent/tools.ts` | Tool registry (send_alert, update_thread, ignore_thread, webhook) |
| `agent/memory.ts` | Per-watcher memory with FTS5 retrieval |
| `agent/prompts.ts` | System + trigger prompt construction |
| `agent/templates/` | Watcher templates (general, etc.) |
| `ingestion/` | Email pipeline orchestration |
| `watcher/` | Thread detection (In-Reply-To, subject normalization) |
| `api/` | Hono routes + handlers (auth, watchers, threads, ingestion) |
| `auth/` | JWT + OAuth scaffolding |
| `db/` | SQLite client + schema |
| `delivery/` | Notification templates |
| `billing/` | Stripe stubs (not wired) |

### Database (SQLite)

| Table | Purpose |
|-------|---------|
| `accounts` | Users (email/password, OAuth) |
| `watchers` | Core object: system prompt, ingest token, tools, thresholds |
| `threads` | Conversation threads (status, participants, summary) |
| `emails` | Ingested emails (metadata only, body hash, analysis JSON) |
| `actions` | Audit log (trigger, tool, params, result, cost, duration) |
| `memories` | Per-watcher memory with FTS5 full-text search |
| `channels` | Notification destinations (email, webhook) |
| `refresh_tokens` | JWT refresh tokens |

### Agent Loop (engine.ts)

1. Load watcher config
2. Retrieve memories (FTS5 ranked if 20+, else all)
3. Load active threads
4. If email: insert record, detect/create thread, load history
5. Build prompt (system + watcher config + memory + threads)
6. Call OpenAI (JSON mode)
7. Execute tools, persist state, store memories
8. Log invocation

### Triggers

- **email_received** — immediate, on ingest
- **scheduled_tick** — every 5 min, checks silence thresholds

### Tools

- **send_alert** — email via Resend to account owner
- **update_thread** — change status/summary
- **ignore_thread** — mark as noise
- **webhook** — POST with HMAC signature

## Constraints

1. **Email bodies never stored** — processed in memory, only hash persisted
2. **Agent decides everything** — alert/ignore/remember decisions are LLM-driven
3. **No file > 1000 lines** — prefer < 400
4. **Frontend is display-only** — no business logic, all state from backend API

## Environment

```bash
# Required
OPENAI_API_KEY          # LLM for agent
JWT_SECRET              # Auth
JWT_REFRESH_SECRET      # Auth

# Required for alerts
RESEND_API_KEY          # Email delivery
RESEND_FROM_EMAIL       # e.g. notifications@vigil.run

# Optional
VIGIL_MODEL             # Override LLM model (default: gpt-4.1-mini)
PORT                    # Server port (default: 3001)
CORS_ORIGINS            # Comma-separated origins
SQLITE_PATH             # Database file (default: ./data/vigil.db)
WEBHOOK_SIGNING_SECRET  # HMAC key for webhooks
```

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/V2_ARCHITECTURE.md` | Technical architecture |
| `docs/SDD.md` | Original requirements (V1, partially outdated) |
