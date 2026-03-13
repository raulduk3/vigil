# Vigil V2 — Architecture

**Date:** 2026-03-09
**Status:** Implemented (backend complete, frontend needs rebuild)
**Branch:** `v2-agent-architecture`

## Philosophy

V1 was an event-sourced state machine. Correct, deterministic, over-engineered.
V2 is an agent. It reads email, remembers context, and acts.

## System Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Email       │────▶│  Cloudflare  │────▶│  Backend         │
│  (forwarded) │     │  Worker      │     │  (Hono + Bun)    │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Agent Engine    │
                                          │                  │
                                          │  1. Load context │
                                          │  2. Build prompt │
                                          │  3. Call LLM     │
                                          │  4. Execute tools│
                                          │  5. Save memory  │
                                          │  6. Log action   │
                                          └────────┬────────┘
                                                   │
                              ┌─────────────┬──────┴──────┬──────────┐
                              ▼             ▼             ▼          ▼
                         ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐
                         │ SQLite  │  │ FTS5     │  │ Resend │  │Webhooks│
                         │ (state) │  │ (memory) │  │(alerts)│  │(tools) │
                         └─────────┘  └──────────┘  └────────┘  └────────┘
```

## Email Ingestion Path

1. User creates forwarding rule in Gmail/Outlook → `*@vigil.run`
2. Cloudflare Email Routing catches all `@vigil.run` mail
3. Cloudflare Worker receives raw MIME, forwards to backend
4. Backend parses MIME via `postal-mime`, extracts from/to/subject/body
5. Token extracted from address local part (e.g. `name-9uw05nk7` → `9uw05nk7`)
6. Watcher looked up by token → agent invoked

DMARC: Cloudflare receives at the MX level. vigil.run is the destination, not a forwarder. DMARC checks happen between original sender and user's email provider, not between user and Vigil.

## Data Model (SQLite)

8 tables. See `backend/src/db/schema.sql` for full DDL.

| Table | Purpose |
|-------|---------|
| accounts | Users (email/password, OAuth, plan) |
| watchers | Agent configs (prompt, tools, thresholds, ingest token) |
| threads | Conversation groups (status, summary, participants) |
| emails | Metadata only — body hash, no content stored |
| actions | Audit log (trigger, tool, params, result, cost, duration) |
| memories | Per-watcher agent memory with FTS5 search |
| channels | Notification destinations (email, webhook) |
| refresh_tokens | JWT refresh token store |

**Privacy:** Email bodies are processed in memory, never persisted. Only SHA-256 body hash stored as proof of receipt.

## Agent Engine (engine.ts)

8-step invocation loop, triggered by email receipt or scheduled tick:

1. **Load watcher config** from SQLite
2. **Retrieve memories** — FTS5 ranked retrieval if 20+ memories, otherwise load all
3. **Load active threads** for context
4. **Process email** (if email trigger) — insert record, detect/create thread via In-Reply-To headers or subject normalization, load thread history
5. **Build prompt** — system prompt (watcher config + memory + threads) + trigger-specific user prompt
6. **Call LLM** — OpenAI API, gpt-4.1-mini, JSON response forced
7. **Execute tools** — send_alert, update_thread, ignore_thread, webhook. Persist thread updates, store new memories.
8. **Log invocation** — trigger type, tool called, params, result, cost, duration, memory delta

### Agent Response Schema

```typescript
interface AgentResponse {
  actions: Array<{
    tool: string;         // tool name from available tools
    params: object;       // tool-specific params
    reasoning: string;    // why the agent chose this action
  }>;
  memory_append: string | null;      // newline-delimited chunks to remember
  thread_updates: Array<{
    thread_id: string;
    status?: "active" | "watching" | "resolved" | "ignored";
    summary?: string;
    flags?: Record<string, any>;
  }> | null;
  email_analysis: {
    summary: string;
    intent: string;
    urgency: "low" | "normal" | "high";
    entities: string[];
  } | null;
}
```

## Tools

| Tool | Description | Params |
|------|-------------|--------|
| send_alert | Email alert via Resend | subject, body/message, urgency |
| update_thread | Change thread status/summary | thread_id, status, summary, flags |
| ignore_thread | Mark as noise | thread_id, reason |
| webhook | POST to configured URL (HMAC signed) | url, payload |

Alert delivery: Resend API from `notifications@vigil.run` (domain verified). Destinations: account email + any configured channels.

## Memory System (memory.ts)

Per-watcher persistent memory stored in `memories` table with FTS5 full-text index.

**Write:** Agent returns `memory_append` string → split by newline → each chunk stored with agent-rated importance (1-5).

**Read (under 20 memories):** Load all, sort by importance DESC, created_at DESC.

**Read (20+ memories):** Build FTS5 query from incoming email (sender, subject, body keywords, stopwords removed) → BM25 ranking × importance × time decay → return top 8 chunks.

**FTS5 triggers** keep the virtual table in sync with the memories table automatically.

## Scheduled Ticks

Single interval (every 5 min) checks all active watchers. Each watcher has its own `tick_interval` (minutes). If enough time has passed since `last_tick_at`, the agent is invoked with trigger type `scheduled_tick`. Agent reviews active threads for silence violations.

## Templates

`backend/src/agent/templates/general.ts` — base template with system prompt, default tools, silence hours, tick interval. `createGeneralWatcher()` helper applies overrides.

More templates planned: vendor-followup, client-comms, recruiter-filter, blank.

## API Routes

```
# Public
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/oauth/:provider
GET    /api/auth/oauth/:provider/callback
GET    /api/templates

# Ingestion (token auth)
POST   /ingest/:token                    # Cloudflare Worker (raw MIME)
POST   /api/ingest/:token                # Direct API (JSON)
POST   /api/ingestion/cloudflare-email   # Legacy Cloudflare route

# Protected (JWT)
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

## Unit Economics

Usage-based pricing. See PRODUCT.md for full model.

| Metric | Value |
|--------|-------|
| Price per email processed | $0.005 |
| Cost per invocation (gpt-4.1-mini) | ~$0.001–0.003 |
| Margin per email | 2–5x |
| Free tier | 50 emails/month, 1 watcher |
| Scheduled ticks & digests | Free (not billed) |
| Infrastructure (Cloudflare free + VPS) | ~$20/mo |
| Break-even | 1 paying user |

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun |
| HTTP | Hono |
| Database | SQLite (bun:sqlite) |
| Search | FTS5 |
| LLM | OpenAI API (gpt-4.1-mini) |
| Email parsing | postal-mime |
| Alerts | Resend |
| Auth | JWT (jsonwebtoken) |
| Email ingestion | Cloudflare Email Routing + Worker |
| Frontend | Next.js 14 |
| Deployment | Vercel (frontend), TBD (backend) |

## File Structure

```
vigil.run/
├── backend/
│   └── src/
│       ├── index.ts              # Entry point, Hono app, tick scheduler
│       ├── logger.ts
│       ├── agent/
│       │   ├── engine.ts         # 8-step invocation loop
│       │   ├── tools.ts          # Tool registry + handlers
│       │   ├── memory.ts         # FTS5 retrieval + storage
│       │   ├── prompts.ts        # Prompt construction
│       │   ├── schema.ts         # TypeScript types
│       │   └── templates/        # Watcher templates
│       ├── api/
│       │   ├── router.ts         # Route definitions
│       │   └── handlers/         # Auth, watchers, threads, ingestion
│       ├── auth/                 # JWT + OAuth + middleware
│       ├── db/
│       │   ├── client.ts         # SQLite wrapper
│       │   └── schema.sql        # 8-table schema
│       ├── delivery/             # Resend email templates
│       ├── ingestion/            # Orchestrator
│       └── watcher/              # Thread detection
├── cloudflare-worker/
│   └── src/index.ts              # Raw MIME → backend forwarding
├── frontend/                     # Next.js 14 (needs V2 rebuild)
├── docs/
│   ├── V2_ARCHITECTURE.md        # This file
│   ├── RESEND_INTEGRATION.md
│   └── v1-archive/               # Deprecated V1 docs
├── CLAUDE.md                     # Dev guidance
└── README.md
```

## What's Left

See PRODUCT.md for sequenced roadmap. Summary:

- [ ] Deploy backend publicly (api.vigil.run DNS)
- [ ] End-to-end real email flow test
- [ ] Three-panel frontend redesign (agent chat, inbox, watcher switcher)
- [ ] Usage metering (instrument invocations per account)
- [ ] Stripe metered billing ($0.005/email)
- [ ] Usage dashboard
- [ ] Onboarding flow with forwarding instructions
- [ ] Landing page refresh (reframe: agent intelligence, not alerts)
- [ ] Dark mode
- [ ] Google OAuth
- [ ] Additional watcher templates
- [ ] Memory compaction
