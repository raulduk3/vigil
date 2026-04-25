# Vigil System Design

**Version:** 2.0 | **Date:** 2026-03-09

Technical design document covering implementation details, data flows, and operational concerns.

## 1. Runtime Architecture

Single Bun process serving HTTP (Hono), running agent invocations, and executing scheduled ticks. SQLite for all persistence.

```
┌──────────────────────────────────────────────┐
│                 Bun Process                   │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Hono   │  │  Agent   │  │  Tick      │  │
│  │  HTTP   │  │  Engine  │  │  Scheduler │  │
│  │  Server │  │          │  │  (5 min)   │  │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘  │
│       │            │               │          │
│       └────────────┼───────────────┘          │
│                    │                          │
│              ┌─────▼─────┐                    │
│              │  SQLite   │                    │
│              │  (file)   │                    │
│              └───────────┘                    │
└──────────────────────────────────────────────┘
```

No external queue, no Redis, no Postgres. SQLite handles concurrent reads fine and agent invocations are sequential per watcher.

## 2. Email Ingestion Pipeline

### Cloudflare Email Routing → Worker → Backend

```
sender@example.com
    │
    ▼ (user's Gmail forwarding rule)
name-TOKEN@vigil.run
    │
    ▼ (Cloudflare MX records)
Cloudflare Email Routing
    │
    ▼ (catch-all → Worker)
vigil-email-ingest Worker
    │  - reads raw MIME stream
    │  - POSTs to backend as text/plain
    │  - includes X-Cloudflare-Email-From/To headers
    │
    ▼
POST /ingest/{full-local-part}
    │
    ▼ (backend)
1. Extract token from local part ("name-TOKEN" → "TOKEN")
2. Look up watcher by token
3. Parse raw MIME via postal-mime (from, to, subject, body, headers)
4. Fallback to X-Cloudflare headers if MIME parse incomplete
5. Call ingestEmail() → invokeAgent()
```

### DMARC

Not a concern. Cloudflare receives email at the MX level. vigil.run is the destination domain, not a forwarder. DMARC alignment is between the original sender and the forwarding user's email provider.

### Token Extraction

Watcher addresses: `{optional-name}-{token}@vigil.run`

Backend splits on `-` and takes the last segment as the token. This allows human-readable prefixes while keeping tokens unique.

## 3. Agent Engine Detail

### Context Assembly

Before calling the LLM, the engine assembles:

1. **System prompt** — watcher's custom prompt + config (silence hours, tools) + memory + active threads
2. **User prompt** — trigger-specific:
   - `email_received`: email content + thread history (last 5 emails in thread)
   - `scheduled_tick`: active threads with silence durations, threads exceeding threshold

### LLM Call

```
POST https://api.openai.com/v1/chat/completions
Model: gpt-4.1-mini (configurable via VIGIL_MODEL)
response_format: { type: "json_object" }
max_tokens: 1024
```

JSON mode forces structured output. Response parsed into `AgentResponse` with fallback to empty actions on parse failure.

### Tool Execution

Tools execute sequentially. Each tool handler receives params + `WatcherContext` (watcher config, channels, account email).

**send_alert:** Accepts `{subject, body, urgency}` or `{message}` (flexible). Sends via Resend to account email + configured email channels. From: `Vigil <notifications@vigil.run>`. Subject auto-derived from body if model omits it.

**update_thread:** Direct SQLite UPDATE on threads table. Agent passes thread_id, optional status/summary/flags.

**ignore_thread:** Sets thread status to 'ignored' with optional reason.

**webhook:** POST to URL with JSON payload + HMAC-SHA256 signature in `X-Vigil-Signature` header.

### State Persistence

After tool execution:
- Thread updates from `thread_updates` array applied to SQLite
- Email analysis stored on email record
- Memory chunks from `memory_append` split and stored individually
- Action logged with full context (trigger, tool, params, result, cost, duration, memory delta)

## 4. Memory System

### Storage

```sql
CREATE TABLE memories (
  id, watcher_id, content, embedding, importance, last_accessed, obsolete, created_at
);
CREATE VIRTUAL TABLE memories_fts USING fts5(content, content=memories, content_rowid=rowid);
```

FTS5 triggers keep the virtual table in sync automatically on INSERT/UPDATE/DELETE.

### Retrieval Strategy

**< 20 memories:** Load all, ORDER BY importance DESC, created_at DESC.

**≥ 20 memories:** Build FTS5 query from email context:
1. Extract terms from sender address, subject, body (first 200 chars)
2. Remove stopwords, keep terms > 2-3 chars
3. Join with OR for broad matching
4. Rank: `BM25 × importance × time_decay`
   - Time decay: < 7 days = 1.0, < 30 = 0.8, < 90 = 0.6, else 0.4
5. Return top 8

### Write Path

Agent returns `memory_append` (newline-delimited text). Each line > 10 chars becomes a memory chunk with default importance 3. Agent can influence what gets remembered but not importance ratings (future: let agent set importance).

## 5. Thread Detection

### Priority Order

1. **In-Reply-To / References headers** — if email references a known message-id, attach to that thread
2. **Subject normalization** — strip Re:/Fwd:/[tags], lowercase, trim → match against active threads

### New Thread Creation

If no match found, create a new thread with:
- Subject from email
- Participants: [sender]
- Status: active
- email_count: 1

### Thread States

- **active** — conversation in progress
- **watching** — agent monitoring but not actively alerting
- **resolved** — conversation complete
- **ignored** — marked as noise by agent

## 6. Scheduled Ticks

Single `setInterval` every 5 minutes. Each tick:

1. Query all active watchers with `tick_interval > 0`
2. For each watcher, check if `now - last_tick_at >= tick_interval * 60 * 1000`
3. If enough time passed, invoke agent with trigger `scheduled_tick`
4. Agent reviews active threads for silence violations
5. Update `last_tick_at` on watcher

The tick prompt includes threads exceeding the silence threshold with their duration and last activity timestamp.

## 7. Authentication

### JWT Flow

- **Register:** Create account + user, return access token (1hr) + refresh token (24hr)
- **Login:** Validate password, return tokens
- **Refresh:** Validate refresh token, return new access token
- **Protected routes:** `requireAuth` middleware extracts user from JWT, validates account ownership

### Password Storage

bcrypt hash. JWT contains: user_id, account_id, email, role, instance_id.

### Refresh Tokens

Stored in `refresh_tokens` table with hash, expiry, and revocation flag. Token rotation: old refresh token invalidated on use.

## 8. Operational Concerns

### Scaling

SQLite handles the current scale fine. If needed:
- Multiple Bun processes with SQLite WAL mode for concurrent reads
- Agent invocations are independent per watcher (parallelizable)
- Memory retrieval is FTS5 (fast, no external service)

### Monitoring

- Actions table is the primary audit log (cost, duration, token count per invocation)
- Logger outputs structured JSON (winston-compatible)
- Health endpoint: `GET /health`

### Cost Control

- gpt-4.1-mini at ~$0.001/invocation
- max_tokens capped at 1024 per call
- Memory retrieval limited to 8 chunks (bounds context size)
- FTS5 search is free (no embedding API calls needed)

### Failure Modes

| Failure | Behavior |
|---------|----------|
| LLM API down | Action logged as "failed", email still stored |
| Resend API down | send_alert returns success=false, logged in actions |
| Worker → backend unreachable | Worker accepts email silently (no bounce), logs error |
| MIME parse failure | Falls back to X-Cloudflare headers for from/to |
| Agent returns unparseable JSON | Empty actions, email marked processed |

### Backup

SQLite file at `data/vigil.db`. Single file backup. Can snapshot with `sqlite3 .backup` or filesystem copy (with WAL checkpoint first).

## 9. Security

| Concern | Implementation |
|---------|---------------|
| Auth | JWT with refresh rotation |
| Passwords | bcrypt |
| Email privacy | Bodies never stored, SHA-256 hash only |
| Webhook signing | HMAC-SHA256 |
| SQL injection | Parameterized queries only (bun:sqlite) |
| CORS | Configurable origin allowlist |
| Ingest token entropy | 8-12 char alphanumeric |
| Account isolation | All queries scoped to account_id from JWT |
