# Vigil Documentation

**Version:** 3.0.0 | **Status:** Commercial Model | **Date:** January 2, 2026

---

## Product Focus

Vigil delivers **one capability: provable silence tracking for email threads**.

The system deterministically:
- Organizes forwarded emails into conversation threads
- Detects actionable requests via bounded LLM extraction
- Tracks silence duration on threads awaiting response
- Emits alerts when silence crosses policy thresholds
- Produces immutable, replayable evidence timelines

The system **never**:
- Owns or infers deadlines
- Creates reminders or tasks
- Infers urgency or importance
- Tells users what to do
- Automates responses

---

## Core Documents

| Document | Purpose |
|----------|---------|
| [SDD.md](SDD.md) | Software Design Document — Requirements (FR-*, MR-*, SEC-*) |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Technical architecture and implementation |

---

## Event Model

### Active Events

| Event | Purpose |
|-------|---------|
| `EMAIL_RECEIVED` | Email ingested |
| `THREAD_EMAIL_ADDED` | Activity on thread |
| `THREAD_OPENED` | Thread created from action request |
| `THREAD_CLOSED` | Thread resolved |
| `ACTION_REQUEST_OBSERVED` | Request detected (opens threads) |
| `CLOSURE_SIGNAL_OBSERVED` | Resolution detected (closes threads) |
| `SILENCE_THRESHOLD_EXCEEDED` | Silence crossed threshold |
| `ALERT_QUEUED` / `ALERT_SENT` | Alert lifecycle |
| `TIME_TICK` | Scheduler tick |
| `WATCHER_*` / `POLICY_UPDATED` | Watcher management |

### Deprecated Events (Backward Compatible)

Legacy events preserved for replay, no runtime behavior:
- `HARD_DEADLINE_EXTRACTED`, `SOFT_DEADLINE_EXTRACTED`, `URGENCY_SIGNAL_EXTRACTED`
- `REMINDER_CREATED`, `REMINDER_EDITED`, `REMINDER_DISMISSED`, etc.

---

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

---

## Policy Model

```typescript
type WatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;
  notification_channels: NotificationChannel[];
};
// NO: deadline fields, urgency fields, reporting cadence
```

---

## Architecture Principles

1. **Events are truth** — All state derived from immutable, append-only events
2. **Deterministic replay** — Same events always produce same state
3. **Bounded LLM** — One question: "Does this contain an actionable request?"
4. **Silence tracking only** — No deadlines, reminders, or urgency inference
5. **Threshold-crossing alerts** — Fire once per transition, not repeatedly
6. **Email bodies not persisted** — Sent to LLM then discarded

---

## Source Code Reference

**Event System:**
- `backend/src/events/index.ts` — Main entry, VigilEvent union
- `backend/src/events/silence-events.ts` — Commercial model events
- `backend/src/events/thread-events.ts` — Thread lifecycle
- `backend/src/events/deprecation.ts` — Deprecated event handling

**Core Runtime:**
- `backend/src/watcher/runtime.ts` — Event replay, state reconstruction
- `backend/src/watcher/silence-tracker.ts` — Silence computation
- `backend/src/watcher/thread-model.ts` — Thread state
- `backend/src/llm/action-request-extractor.ts` — Bounded extraction
- `backend/src/ingestion/orchestrator.ts` — Email pipeline
