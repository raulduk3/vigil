# Vigil Backend

Bun + Hono + SQLite backend for Vigil's email oversight agent.

## Quick Start

```bash
bun install
cp .env.example .env    # configure API keys
bun run dev             # http://localhost:3001
```

## Architecture

Agent-based email monitoring. Each watcher has its own LLM agent with persistent memory, configurable tools, and scheduled checks.

### Data Flow

```
Email → Cloudflare Worker → POST /ingest/:token (raw MIME)
                                    │
                            ┌───────▼────────┐
                            │  Agent Engine   │
                            │                 │
                            │  1. Load config │
                            │  2. Get memory  │
                            │  3. Get threads │
                            │  4. Build prompt│
                            │  5. Call LLM    │
                            │  6. Run tools   │
                            │  7. Save state  │
                            │  8. Log action  │
                            └───────┬────────┘
                                    │
                    ┌───────┬───────┼───────┬───────┐
                    ▼       ▼       ▼       ▼       ▼
                 SQLite  Memory  Resend  Webhook  Thread
                 (state) (FTS5) (alert) (POST)   (update)
```

### Database (SQLite)

8 tables. Schema at `src/db/schema.sql`.

| Table | Purpose |
|-------|---------|
| accounts | Users (email/password, OAuth, plan) |
| watchers | Agent configs (prompt, tools, thresholds, ingest token) |
| threads | Conversation groups (status, summary, participants) |
| emails | Metadata only (body hash, no content stored) |
| actions | Audit log (trigger, tool, params, result, cost, duration) |
| memories | Per-watcher agent memory with FTS5 full-text search |
| channels | Notification destinations (email, webhook) |
| refresh_tokens | JWT refresh token storage |

### Agent Engine (`src/agent/engine.ts`)

Invoked on two triggers:
- **email_received** — when an email hits `/ingest/:token`
- **scheduled_tick** — every 5 minutes, checks silence thresholds

The engine loads watcher config, retrieves relevant memories (FTS5 ranked if 20+ entries), builds a prompt with thread context, calls OpenAI (gpt-4.1-mini, JSON mode), executes tool calls, and logs everything.

### Tools (`src/agent/tools.ts`)

| Tool | Description |
|------|-------------|
| send_alert | Email alert via Resend to account owner |
| update_thread | Change thread status or summary |
| ignore_thread | Mark thread as noise |
| webhook | POST to configured URL (HMAC signed) |

### Memory (`src/agent/memory.ts`)

Per-watcher persistent memory in SQLite with FTS5 index.

- Under 20 entries: load all, sort by importance
- 20+ entries: FTS5 query from email context → BM25 × importance × time decay → top 8

Agent decides what to remember via `memory_append` in its JSON response.

### Thread Detection (`src/watcher/thread-detection.ts`)

Groups emails by In-Reply-To/References headers, then falls back to normalized subject matching.

## Source Structure

```
src/
├── index.ts              # Entry, Hono app, tick scheduler
├── logger.ts
├── agent/
│   ├── engine.ts         # 8-step invocation loop
│   ├── tools.ts          # Tool registry + handlers
│   ├── memory.ts         # FTS5 retrieval + storage
│   ├── prompts.ts        # System + trigger prompt construction
│   ├── schema.ts         # TypeScript types
│   └── templates/        # Watcher templates (general.ts)
├── api/
│   ├── router.ts         # All route definitions
│   └── handlers/         # auth, watchers, threads, ingestion, health, billing, events
├── auth/
│   ├── jwt.ts            # Token creation + validation
│   ├── middleware.ts      # requireAuth middleware
│   └── oauth.ts          # OAuth scaffolding
├── db/
│   ├── client.ts         # SQLite wrapper (bun:sqlite)
│   └── schema.sql        # 8-table DDL
├── delivery/
│   └── notifications.ts  # Resend email sending
├── ingestion/
│   └── orchestrator.ts   # Email → agent invocation
└── watcher/
    └── thread-detection.ts
```

## API Routes

### Public
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/templates
```

### Ingestion (token auth)
```
POST   /ingest/:token                    # Cloudflare Worker (raw MIME)
POST   /api/ingest/:token                # Direct API (JSON)
```

### Protected (JWT Bearer)
```
GET    /api/auth/me
GET    /api/watchers
POST   /api/watchers
GET    /api/watchers/:id
PUT    /api/watchers/:id
DELETE /api/watchers/:id
POST   /api/watchers/:id/invoke          # Manual agent trigger
GET    /api/watchers/:id/memory
GET    /api/watchers/:id/actions
GET    /api/watchers/:wid/threads
GET    /api/watchers/:wid/threads/:tid
POST   /api/watchers/:wid/threads/:tid/close
```

## Privacy

Email bodies are processed in memory and never stored. Only SHA-256 body hash kept as proof of receipt. The agent's analysis (summary, intent, entities) is stored, not the original content.

## Environment

```bash
# Required
PORT=3001
SQLITE_PATH=./data/vigil.db
JWT_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<random 32+ chars>
OPENAI_API_KEY=sk-...

# Alerts
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@vigil.run

# Optional
VIGIL_MODEL=gpt-4.1-mini          # default LLM
CORS_ORIGINS=http://localhost:3000  # frontend origin
WEBHOOK_SIGNING_SECRET=<secret>     # HMAC for outbound webhooks
```

## Development

```bash
bun install                       # dependencies
bun run dev                       # watch mode (port 3001)
bun run scripts/test-e2e.ts       # end-to-end test
```

## Deployment

Single binary, single process, SQLite file. Deploy anywhere that runs Bun: VPS, fly.io, DigitalOcean, Docker.

Needs:
- `api.vigil.run` DNS pointing at the server
- Cloudflare Worker's `VIGIL_API_URL` set to `https://api.vigil.run`
- `.env` with production keys
- Persistent volume for `data/vigil.db`
