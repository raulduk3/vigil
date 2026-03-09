# Vigil Software Design Document

**Version:** 2.0 | **Date:** 2026-03-09 | **Status:** V2 Implemented

## 1. Product

Vigil is an autonomous email oversight agent. Users forward emails to a `@vigil.run` address. An AI agent reads each email, tracks conversations, builds memory, and alerts when something needs attention.

**No inbox access. No email bodies stored. Privacy by architecture.**

### What Vigil Does

- Receive forwarded emails at `*@vigil.run`
- AI agent analyzes each email (summary, intent, urgency, entities)
- Group emails into conversation threads
- Remember context across emails (persistent per-watcher memory)
- Alert users when emails need attention
- Track silence on active threads
- Provide a dashboard for managing watchers and viewing agent activity

### What Vigil Does NOT Do

- Access user inboxes (OAuth, IMAP, etc.)
- Store email body content (only metadata + SHA-256 hash)
- Send emails on behalf of users
- Make decisions without transparency (every action is logged)

## 2. Architecture

### System Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend | Bun + Hono + SQLite | Agent engine, API, auth, data |
| Cloudflare Worker | Cloudflare Workers | Raw MIME email reception + forwarding |
| Frontend | Next.js 14 | Dashboard (display layer only) |
| LLM | OpenAI API (gpt-4.1-mini) | Email analysis + decision making |
| Alerts | Resend | Outbound email delivery |
| DNS/Email | Cloudflare Email Routing | MX records for `@vigil.run` |

### Data Flow

```
User's Gmail forwarding rule
        │
        ▼
Cloudflare Email Routing (MX for vigil.run)
        │
        ▼
Cloudflare Worker (raw MIME → POST /ingest/:token)
        │
        ▼
Backend (postal-mime parsing → token extraction → watcher lookup)
        │
        ▼
Agent Engine (8-step loop: context → prompt → LLM → tools → state)
        │
        ├──▶ send_alert → Resend → User's inbox
        ├──▶ update_thread → SQLite
        ├──▶ store memory → SQLite + FTS5
        └──▶ log action → SQLite (audit trail)
```

## 3. Data Model

### Tables (SQLite)

**accounts** — User accounts with email/password or OAuth authentication.

**watchers** — The core object. Each watcher is an independent agent with its own system prompt, enabled tools, silence threshold, tick interval, and ingest token. One account can have multiple watchers.

**threads** — Conversation groups. Detected via In-Reply-To/References headers or normalized subject matching. Status: active, watching, resolved, ignored.

**emails** — Email metadata only. From, to, subject, received_at, body_hash (SHA-256). No body content stored. Agent's analysis (summary, intent, urgency, entities) stored as JSON.

**actions** — Complete audit log. Every agent invocation records: trigger type, tool called, parameters, result (success/failed), agent reasoning, memory delta, context tokens, cost in USD, duration in ms.

**memories** — Per-watcher persistent memory. Content text with importance rating (1-5). FTS5 virtual table for full-text search with BM25 ranking.

**channels** — Notification destinations per watcher. Type: email or webhook. Destination: email address or URL.

**refresh_tokens** — JWT refresh token storage with expiry and revocation.

### Privacy Model

| Data | Stored | Notes |
|------|--------|-------|
| Email body | Never | Processed in memory, discarded after LLM call |
| Email metadata | Yes | From, to, subject, date, message-id |
| Body hash | Yes | SHA-256 proof of receipt |
| Agent analysis | Yes | Summary, intent, urgency, entities |
| Agent memory | Yes | Agent's own notes, per watcher |
| Thread summaries | Yes | Agent-written, updated per email |

## 4. Agent Engine

### Invocation Triggers

1. **email_received** — Fired immediately when email ingested via `/ingest/:token`
2. **scheduled_tick** — Every 5 minutes, checks active watchers against their tick intervals

### 8-Step Loop

1. Load watcher config from SQLite
2. Retrieve relevant memories (FTS5 if 20+ entries, otherwise all)
3. Load active threads for context (top 20 by last activity)
4. If email trigger: insert email record, detect/create thread, load last 5 thread emails
5. Build prompt: system prompt (config + memory + threads) + trigger-specific user prompt
6. Call OpenAI API (gpt-4.1-mini, JSON response mode)
7. Execute tool calls, persist thread updates, store new memories
8. Log invocation to actions table (trigger, tool, params, result, cost, duration)

### Agent Response

```json
{
  "actions": [
    { "tool": "send_alert", "params": { "subject": "...", "body": "..." }, "reasoning": "..." }
  ],
  "memory_append": "Cory needs deployment config by Wednesday",
  "thread_updates": [
    { "thread_id": "abc", "status": "active", "summary": "..." }
  ],
  "email_analysis": {
    "summary": "Request for deployment configuration",
    "intent": "Needs config file sent by Wednesday",
    "urgency": "high",
    "entities": ["Cory", "Wednesday", "deployment config", "staging"]
  }
}
```

### Tools

| Tool | Description | Delivery |
|------|-------------|----------|
| send_alert | Alert the user about something important | Resend email |
| update_thread | Change thread status or summary | SQLite |
| ignore_thread | Mark a thread as noise | SQLite |
| webhook | POST data to a URL | HTTP with HMAC |

### Memory System

Per-watcher. Agent decides what to remember.

- **Write:** Agent returns `memory_append` → split by newline → stored as individual chunks
- **Read (< 20 entries):** Load all, sort by importance
- **Read (20+ entries):** FTS5 query from email context (sender, subject, body keywords) → BM25 × importance × time_decay → top 8 chunks
- **Pruning:** Drop obsolete + low-importance + never-accessed entries after 90 days

## 5. API

### Authentication

JWT with access tokens (1hr) and refresh tokens (24hr). Email/password registration. OAuth scaffolding for Google and GitHub (not yet wired).

### Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/register | Public | Create account |
| POST | /api/auth/login | Public | Get tokens |
| POST | /api/auth/refresh | Public | Refresh access token |
| GET | /api/templates | Public | List watcher templates |
| POST | /ingest/:token | Token | Cloudflare Worker ingestion |
| POST | /api/ingest/:token | Token | Direct API ingestion |
| GET | /api/watchers | JWT | List watchers |
| POST | /api/watchers | JWT | Create watcher |
| GET | /api/watchers/:id | JWT | Watcher detail |
| PUT | /api/watchers/:id | JWT | Update watcher |
| DELETE | /api/watchers/:id | JWT | Delete watcher |
| POST | /api/watchers/:id/invoke | JWT | Manual agent trigger |
| GET | /api/watchers/:id/memory | JWT | View agent memory |
| GET | /api/watchers/:id/actions | JWT | Action audit log |
| GET | /api/watchers/:wid/threads | JWT | List threads |
| GET | /api/watchers/:wid/threads/:tid | JWT | Thread detail |
| POST | /api/watchers/:wid/threads/:tid/close | JWT | Close thread |

## 6. Frontend

Next.js 14 display layer. No business logic. All state from backend API.

### Pages

- **Dashboard** — watcher overview, recent activity
- **Watchers** — create (template picker), configure (prompt, tools, channels), monitor
- **Threads** — conversation list, detail view with agent summaries
- **Memory** — inspect what the agent remembers
- **Activity** — audit log (tool calls, decisions, costs)
- **Account** — profile, security, billing

### Design Principles

- Reassurance-first: show resolved/stable before alerts
- Transparency: every alert traces to a tool call traces to an agent decision
- Progressive disclosure: summary → detail → raw log
- High data density, minimal chrome

## 7. Deployment

| Component | Target |
|-----------|--------|
| Backend | VPS, fly.io, or DigitalOcean (single Bun process + SQLite file) |
| Frontend | Vercel |
| Worker | Cloudflare Workers (deployed) |
| DNS | Cloudflare (MX for email routing, A/CNAME for api.vigil.run) |

### Requirements

- `api.vigil.run` pointing at backend server
- Cloudflare Worker `VIGIL_API_URL` set to `https://api.vigil.run`
- Persistent volume for `data/vigil.db`
- Environment variables: `OPENAI_API_KEY`, `RESEND_API_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`

## 8. Economics

| Metric | Value |
|--------|-------|
| Cost per agent invocation | ~$0.001 (gpt-4.1-mini) |
| Cost per user/month (200 emails) | ~$0.20 |
| Cost per user/month (1000 emails) | ~$1.00 |
| Target price | $9/mo |
| Gross margin (200 emails/mo) | 97.8% |
| Infrastructure | ~$5/mo (Cloudflare free + VPS) |
| Break-even | 1 paying user |

## 9. Status

### Complete
- [x] Agent engine (8-step loop)
- [x] Tools (send_alert, update_thread, ignore_thread, webhook)
- [x] Memory (FTS5, importance ranking, time decay)
- [x] Thread detection (In-Reply-To, subject normalization)
- [x] SQLite schema (8 tables)
- [x] JWT auth (register, login, refresh)
- [x] Cloudflare Worker (deployed, raw MIME forwarding)
- [x] Backend MIME parsing (postal-mime)
- [x] Resend alert delivery (domain verified)
- [x] E2E test passing
- [x] Documentation aligned to V2

### Remaining
- [ ] Deploy backend publicly
- [ ] Test real email flow through Cloudflare Worker
- [ ] Rebuild frontend for V2 data model
- [ ] Additional watcher templates
- [ ] Stripe billing
- [ ] OAuth providers (Google, GitHub)
- [ ] Memory compaction
- [ ] Rate limiting
