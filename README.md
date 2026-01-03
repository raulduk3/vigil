# Vigil

**Provable Silence Tracking for Email Threads**

---

## What is Vigil?

Vigil is a **deterministic, event-sourced system** that tracks silence in email conversations. Forward emails to a dedicated address; Vigil detects actionable requests, organizes messages into threads, and alerts you when silence exceeds configured thresholds.

### Core Capability

Vigil delivers **one and only one product capability: provable silence tracking**.

- **Thread organization** — Group forwarded emails into conversations
- **Action request detection** — LLM answers ONE question: "Does this contain an actionable request?"
- **Silence tracking** — Monitor time since last thread activity
- **Threshold alerts** — Emit alerts when silence crosses policy limits
- **Evidence timelines** — Immutable, replayable audit trail

### What Vigil Does NOT Do

- ❌ Own or infer deadlines
- ❌ Create reminders or tasks
- ❌ Infer urgency or importance
- ❌ Tell you what to do
- ❌ Automate responses
- ❌ Access your inbox

**Humans retain full responsibility. Vigil only tracks silence.**

---

## How It Works

1. **Forward emails** to your watcher address (e.g., `finance-a7f3k9@vigil.run`)
2. **Vigil detects action requests** via bounded LLM extraction
3. **Threads open** when action requests are detected
4. **Silence is tracked** — time since last activity on each thread
5. **Alerts fire** when silence exceeds your threshold (e.g., 72 hours)
6. **Threads close** via closure signal detection or manual action

---

## Architecture

### Event-Sourced

Events are the **sole source of truth**. All state is derived by replaying immutable, append-only events. Same events always produce same state.

### Active Event Types

| Event | Purpose |
|-------|---------|
| `EMAIL_RECEIVED` | Email ingested |
| `THREAD_EMAIL_ADDED` | Activity on thread |
| `THREAD_OPENED` | Thread created from action request |
| `THREAD_CLOSED` | Thread resolved |
| `ACTION_REQUEST_OBSERVED` | Explicit request detected |
| `CLOSURE_SIGNAL_OBSERVED` | Resolution language detected |
| `SILENCE_THRESHOLD_EXCEEDED` | Silence crossed policy limit |
| `ALERT_QUEUED` / `ALERT_SENT` | Alert lifecycle |
| `TIME_TICK` | Scheduler tick (15 min) |
| `WATCHER_*` / `POLICY_UPDATED` | Watcher management |

### Deprecated Events (Backward Compatible)

Legacy events remain replayable but produce no runtime behavior:
- `HARD_DEADLINE_EXTRACTED`, `SOFT_DEADLINE_EXTRACTED`, `URGENCY_SIGNAL_EXTRACTED`
- `REMINDER_*` events

### Bounded LLM Extraction

The LLM answers **one question only**: "Does this contain an actionable request?"

```typescript
{
  contains_action_request: boolean,
  action_summary: string | null,
  request_type: "confirmation" | "approval" | "response" | "review" | "unknown",
  source_span: string  // verbatim quote
}
```

No deadline extraction. No urgency inference. No multiple extractions per email.

### Thread Model

Threads represent **communication context only**—not obligations.

```typescript
type ThreadState = {
  thread_id: string;
  watcher_id: string;
  status: "open" | "closed";
  opened_at: number;
  closed_at: number | null;
  last_activity_at: number;
  last_action_request_event_id: string | null;
  message_ids: string[];
  participants: string[];
};
// NO: deadline_utc, urgency_level, reminder_ids
```

- **Open** when `ACTION_REQUEST_OBSERVED` is emitted
- **Update activity** on every `THREAD_EMAIL_ADDED`
- **Close** only via closure signal or explicit user action
- **Never auto-close** from time or silence

### Policy Model

```typescript
type WatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;
  notification_channels: NotificationChannel[];
};
// NO: deadline fields, urgency fields, reporting cadence
```

### Silence Tracking

On each `TIME_TICK`:
1. Compute `hours_since_activity` for each open thread
2. If threshold crossed → emit `SILENCE_THRESHOLD_EXCEEDED`
3. Queue alert (fires **once per transition**, not repeatedly)

---

## Repository Structure

```
vigil/
├── backend/           # TypeScript/Bun control plane
│   └── src/
│       ├── events/    # Event types (modular)
│       ├── watcher/   # Runtime, silence tracker, thread model
│       ├── llm/       # Action request extraction
│       ├── ingestion/ # Email pipeline
│       ├── auth/      # JWT + OAuth
│       └── billing/   # Stripe integration
├── frontend/          # Next.js 14 dashboard
│   └── src/
│       ├── app/       # Pages (auth, dashboard, watchers)
│       ├── components/
│       └── lib/       # API client, auth
└── docs/              # Specifications
```

---

## Development

### Backend

```bash
cd backend
cp .env.example .env
# Configure: JWT_SECRET, PostgreSQL, OPENAI_API_KEY
bun install
bun test              # Run all tests
bun run dev           # Development mode
bun run check         # Typecheck + lint + test
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Configure: NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev           # http://localhost:3000
```

---

## Infrastructure

| Component | Technology |
|-----------|------------|
| Backend | TypeScript/Bun, Hono |
| Event Store | PostgreSQL (append-only) |
| LLM | OpenAI API (GPT-4o-mini) |
| Inbound Email | Cloudflare Email Routing |
| Outbound Email | Resend API |
| Frontend | Next.js 14, Tailwind |
| Auth | JWT + Google/GitHub OAuth |
| Billing | Stripe (4 tiers) |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/SDD.md](docs/SDD.md) | Software Design Document (requirements) |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Technical architecture |
| [backend/README.md](backend/README.md) | Backend details |
| [frontend/README.md](frontend/README.md) | Frontend details |

---

## Design Principles

1. **Events are truth** — All state derived from immutable events
2. **Replay is the debugger** — Same events → same state
3. **Bounded LLM** — One question only, frozen into events
4. **Silence tracking only** — No deadlines, no reminders, no urgency
5. **Threshold-crossing alerts** — Fire once per transition
6. **Human responsibility** — System observes, humans decide

---

## License

Proprietary. All rights reserved.
