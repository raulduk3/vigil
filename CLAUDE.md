# CLAUDE.md

Development guidance for Claude Code when working with the Vigil codebase.

## Product Focus

Vigil delivers **one capability: provable silence tracking for email threads**.

**What We Do:**
- Organize forwarded emails into threads
- Detect actionable requests (LLM answers ONE question)
- Track silence duration on open threads
- Emit `SILENCE_THRESHOLD_EXCEEDED` when policy limits crossed
- Produce immutable, replayable evidence timelines

**What We Do NOT Do:**
- ❌ Own or infer deadlines
- ❌ Create reminders or tasks
- ❌ Infer urgency or importance
- ❌ Tell users what to do
- ❌ Automate responses

## Commands

```bash
cd backend
bun install              # Install dependencies
bun test                 # Run all tests
bun test test/watcher/   # Run tests in directory
bun run dev              # Watch mode
bun run check            # Typecheck + lint + test
```

## Architecture

### Event-Sourced

Events are the **only source of truth**. All state derives from replaying immutable events. If behavior cannot be explained by replay, it is wrong.

### Key Modules (backend/src/)

| Module | Purpose |
|--------|---------|
| `events/` | Event types (modular), store, validation |
| `watcher/` | Runtime, silence tracker, thread model |
| `llm/` | Bounded action request extraction |
| `ingestion/` | Email pipeline orchestration |
| `auth/` | JWT + OAuth |
| `billing/` | Stripe integration |

### Active Events

| Event | Purpose |
|-------|---------|
| `EMAIL_RECEIVED` | Baseline email observation |
| `THREAD_EMAIL_ADDED` | Activity tracking |
| `THREAD_OPENED` / `THREAD_CLOSED` | Thread lifecycle |
| `ACTION_REQUEST_OBSERVED` | Request detected (opens threads) |
| `CLOSURE_SIGNAL_OBSERVED` | Resolution detected (closes threads) |
| `SILENCE_THRESHOLD_EXCEEDED` | Threshold crossed |
| `ALERT_QUEUED` / `ALERT_SENT` | Alert lifecycle |
| `TIME_TICK` | Scheduler tick |
| `WATCHER_*` / `POLICY_UPDATED` | Watcher management |

### Deprecated Events

Preserved for replay, no runtime behavior:
- `HARD_DEADLINE_EXTRACTED`, `SOFT_DEADLINE_EXTRACTED`, `URGENCY_SIGNAL_EXTRACTED`
- All `REMINDER_*` events

## Constraints

1. **No file > 1000 lines** — Prefer < 400 lines, split by responsibility
2. **Bounded LLM** — One question: "Does this contain an actionable request?"
3. **No deadlines** — Threads do not own deadlines
4. **No reminders** — No reminder creation or lifecycle
5. **No urgency inference** — No urgency levels or escalation
6. **Threshold-crossing alerts only** — Fire once per transition
7. **Email bodies not persisted** — Sent to LLM then discarded

## Thread Model

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

- Open on `ACTION_REQUEST_OBSERVED`
- Update activity on `THREAD_EMAIL_ADDED`
- Close via closure signal or user action
- Never auto-close from time/silence

## Policy Model

```typescript
type WatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;
  notification_channels: NotificationChannel[];
};
// NO: deadline fields, urgency fields, reporting cadence
```

## Runtime Logic

**On EMAIL_RECEIVED:**
1. Emit baseline events
2. Run bounded extraction
3. If `ACTION_REQUEST_OBSERVED` → create/attach thread

**On TIME_TICK:**
1. Compute silence for open threads
2. If threshold crossed → emit `SILENCE_THRESHOLD_EXCEEDED`
3. Queue alert (once per transition)

## Test-Driven Development

Required test coverage:
- Event replay determinism
- Thread creation from action requests
- Silence threshold crossings
- Alert emission on transitions only
- Backward compatibility with deprecated events

## Environment

```bash
# Required
JWT_SECRET, JWT_REFRESH_SECRET
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
OPENAI_API_KEY

# Optional
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
GOOGLE_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_ID
RESEND_API_KEY
```

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/SDD.md` | Requirements (FR-*, MR-*, SEC-*) |
| `docs/SYSTEM_DESIGN.md` | Technical architecture |
