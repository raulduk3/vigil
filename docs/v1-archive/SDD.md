# Vigil Software Design Document (SDD)

**Version:** 3.0.0 | **Date:** January 2, 2026 | **Status:** Commercial Model

---

## Product Focus

Vigil delivers **one capability: provable silence tracking for email threads**.

### What Vigil Does

- Organize forwarded emails into conversation threads
- Detect actionable requests via bounded LLM extraction
- Track elapsed time since last thread activity
- Emit `SILENCE_THRESHOLD_EXCEEDED` when policy limits crossed
- Produce immutable, replayable evidence timelines

### What Vigil Does NOT Do

- ❌ Own or infer deadlines
- ❌ Create reminders or tasks
- ❌ Infer urgency or importance
- ❌ Tell users what to do
- ❌ Automate responses

---

## 1. System Overview

### 1.1 System Boundaries

**In Scope:**
- Accept email forwarded to unique ingestion addresses
- Detect actionable requests via bounded LLM
- Track threads and silence duration
- Emit alerts on threshold crossings
- Provide audit trail via immutable event log

**Out of Scope:**
- Inbox access or scanning
- Automated email replies
- Deadline management
- Reminder/task creation
- Urgency inference

### 1.2 External Actors

1. **Human Users** — Configure watchers, view state, close threads
2. **Email Senders** — Send email to watcher ingestion addresses
3. **Cloudflare Email Routing** — Routes inbound email to webhook
4. **OpenAI API** — Bounded extraction (action requests only)

### 1.3 Core Primitives

#### Watcher

Isolated monitoring scope with unique ingestion address.

```typescript
type Watcher = {
  watcher_id: string;          // UUID
  account_id: string;          // Parent account
  ingest_token: string;        // Routing token
  ingestion_address: string;   // <name>-<token>@vigil.run
  name: string;                // Human label
  status: "created" | "active" | "paused" | "deleted";
  policy: WatcherPolicy;
  created_at: number;
  deleted_at: number | null;
};
```

#### Thread

Tracked communication context (not obligation).

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

#### WatcherPolicy

```typescript
type WatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;
  notification_channels: NotificationChannel[];
};
// NO: deadline fields, urgency fields, reporting cadence
```

---

## 2. Event Model

### 2.1 Active Events

| Event | Purpose |
|-------|---------|
| `EMAIL_RECEIVED` | Baseline email observation |
| `THREAD_EMAIL_ADDED` | Activity tracking |
| `THREAD_OPENED` | Thread created from action request |
| `THREAD_CLOSED` | Thread resolved |
| `ACTION_REQUEST_OBSERVED` | Request detected (opens threads) |
| `CLOSURE_SIGNAL_OBSERVED` | Resolution detected (closes threads) |
| `SILENCE_THRESHOLD_EXCEEDED` | Silence crossed threshold |
| `ALERT_QUEUED` | Alert ready for delivery |
| `ALERT_SENT` | Alert delivered |
| `TIME_TICK` | Scheduler tick |
| `WATCHER_CREATED` | Watcher created |
| `WATCHER_ACTIVATED` | Watcher activated |
| `WATCHER_PAUSED` | Watcher paused |
| `WATCHER_RESUMED` | Watcher resumed |
| `WATCHER_DELETED` | Watcher deleted |
| `POLICY_UPDATED` | Policy changed |

### 2.2 Deprecated Events (Backward Compatible)

Preserved for replay, no runtime behavior:

| Event | Status |
|-------|--------|
| `HARD_DEADLINE_EXTRACTED` | Deprecated |
| `SOFT_DEADLINE_EXTRACTED` | Deprecated |
| `URGENCY_SIGNAL_EXTRACTED` | Deprecated |
| `REMINDER_CREATED` | Deprecated |
| `REMINDER_EDITED` | Deprecated |
| `REMINDER_DISMISSED` | Deprecated |
| `REMINDER_MERGED` | Deprecated |
| `REMINDER_REASSIGNED` | Deprecated |
| `REMINDER_EVALUATED` | Deprecated |

### 2.3 Event Structure

```typescript
type BaseEvent = {
  event_id: string;     // UUID
  timestamp: number;    // Unix ms
  watcher_id: string;   // Owner watcher
  type: string;         // Event type
};
```

---

## 3. Feature Requirements

### FR-1: Watcher Management

**FR-1.1: Watcher Creation**
- Generate unique `watcher_id` (UUID) and `ingest_token`
- Construct ingestion address: `<name>-<token>@vigil.run`
- Emit `WATCHER_CREATED` event
- Initial status: `created`

**FR-1.2: Watcher Activation**
- Validate at least one notification channel enabled
- Emit `WATCHER_ACTIVATED` event
- Status transitions to `active`

**FR-1.3: Watcher Pause/Resume**
- Pause: Emit `WATCHER_PAUSED`, status → `paused`
- Resume: Emit `WATCHER_RESUMED`, status → `active`
- Paused watchers: EMAIL_RECEIVED emitted, no extraction/alerts

**FR-1.4: Watcher Deletion**
- Emit `WATCHER_DELETED`, status → `deleted` (terminal)
- All historical data preserved

### FR-2: Email Ingestion

- Cloudflare routes `*@vigil.run` to backend webhook
- Extract `ingest_token` from recipient address
- Validate sender against `allowed_senders`
- Emit `EMAIL_RECEIVED` event (always)
- If sender allowed → invoke bounded extraction

**EMAIL_RECEIVED Fields:**
```typescript
{
  event_id, timestamp, watcher_id,
  message_id, from, subject,
  received_at, headers,
  sender_allowed: boolean
}
```

### FR-3: Bounded LLM Extraction

The LLM answers **one question only**: "Does this contain an actionable request?"

**Input:**
```typescript
{
  email_text: string,
  from: string,
  subject: string
}
```

**Output:**
```typescript
{
  contains_action_request: boolean,
  action_summary: string | null,
  request_type: "confirmation" | "approval" | "response" | "review" | "unknown",
  source_span: string,  // verbatim quote
  confidence: "high" | "medium" | "low"
}
```

**If action request detected:**
- Emit `ACTION_REQUEST_OBSERVED` event
- Event must include `source_span` that exists in original email
- Ungrounded outputs (hallucinated text) discarded

**LLM Constraints:**
- No deadline extraction
- No urgency inference
- No multiple extractions per email
- Never invoked during replay

### FR-4: Thread Management

**FR-4.1: Thread Opening**
- Thread opens when `ACTION_REQUEST_OBSERVED` emitted
- Apply thread grouping algorithm (Message-ID chain, Conversation-Index, subject+participants)
- If no match → emit `THREAD_OPENED`
- If match → associate with existing thread

**FR-4.2: Activity Tracking**
- Every email associated with thread → emit `THREAD_EMAIL_ADDED`
- Updates `last_activity_at` for silence tracking

**FR-4.3: Thread Closure**
- Closure signal detected → emit `THREAD_CLOSED` with `closed_by: signal_observed`
- Manual user action → emit `THREAD_CLOSED` with `closed_by: user_action`
- Closure is terminal: threads never reopen

**Thread Grouping Algorithm:**
1. Check In-Reply-To/References headers
2. Check Conversation-Index (Outlook)
3. Check normalized subject + participant overlap + temporal proximity
4. If no match → new thread

### FR-5: Silence Tracking

**Silence Duration Computation:**
```typescript
function computeSilenceDuration(lastActivityAt: number, currentTime: number): number {
  const diffMs = currentTime - lastActivityAt;
  return Math.max(0, diffMs / (1000 * 60 * 60)); // hours
}
```

**Threshold Crossing Detection:**
```typescript
type ThresholdCrossing = {
  crossed: boolean;
  direction: "exceeded" | "recovered";
  threshold_hours: number;
  silence_hours: number;
};
```

Only detects NEW crossings:
- If `previousSilence < threshold` and `currentSilence >= threshold` → exceeded
- If already above threshold → no event (already alerted)

**On TIME_TICK (every 15 minutes):**
1. Compute `hours_since_activity` for each open thread
2. If `hours_since_activity > silence_threshold_hours`:
   - Emit `SILENCE_THRESHOLD_EXCEEDED` (once per crossing)
   - Queue alert

**SILENCE_THRESHOLD_EXCEEDED Fields:**
```typescript
{
  event_id, timestamp, watcher_id, thread_id,
  hours_silent: number,
  threshold_hours: number,
  last_activity_at: number
}
```

**Alert Rules:**
- Fire once per threshold crossing
- Thread must have new activity before alerting again
- Closed threads never trigger alerts

### FR-6: Closure Detection

- LLM detects resolution language ("completed", "resolved", "done")
- Emit `CLOSURE_SIGNAL_OBSERVED` event
- Runtime closes associated thread

**CLOSURE_SIGNAL_OBSERVED Fields:**
```typescript
{
  event_id, timestamp, watcher_id, thread_id,
  message_id, closure_type, source_span
}
```

### FR-7: Alert Delivery

- `ALERT_QUEUED` triggers notification worker
- Delivery via configured channels (email/webhook)
- Retry: 3 attempts, exponential backoff
- Emit `ALERT_SENT` or `ALERT_FAILED`

---

## 4. Infrastructure Requirements

### IR-1: Event Store
- PostgreSQL append-only tables
- Events never modified or deleted
- Full replay capability

### IR-2: Backend
- TypeScript/Bun with Hono
- Stateless HTTP API
- Event-sourced state management

### IR-3: LLM Integration
- OpenAI API (GPT-4o-mini)
- Single extraction per email
- Graceful degradation if unavailable

### IR-4: Email Services
- Inbound: Cloudflare Email Routing
- Outbound: Resend API

### IR-5: Frontend
- Next.js 14
- No business logic
- State from backend API only

---

## 5. Security Requirements

### SEC-1: Authentication
- JWT access tokens (1h expiry)
- Refresh tokens (24h, database-tracked)
- Server restart invalidates all tokens
- Google/GitHub OAuth with PKCE

### SEC-2: Authorization
- Watcher-level isolation
- Users access only their account's watchers

### SEC-3: Email Body Handling
- Email bodies sent to LLM then discarded
- Only metadata persisted
- PII sanitization before storage

### SEC-4: Webhook Security
- HMAC-SHA256 signatures
- Rate limiting

### SEC-5: Billing Enforcement
```typescript
// Plan Limits
const PLAN_LIMITS = {
  free:       { emails_per_week: 50,   max_watchers: 2,  max_channels: 2 },
  starter:    { emails_per_week: 200,  max_watchers: 5,  max_channels: 5 },
  pro:        { emails_per_week: 1000, max_watchers: 20, max_channels: 10 },
  enterprise: { emails_per_week: -1,   max_watchers: -1, max_channels: -1 },
};
```
- Weekly usage period reset
- Hard limit enforcement on email ingestion
- Account-level watcher count validation

---

## 6. Data Consistency Requirements

### CONS-1: Event Ordering
- Events for single watcher totally ordered by timestamp
- Timestamp + event_id for tie-breaking

### CONS-2: Deterministic Replay
- Same events always produce same state
- No external calls during replay
- No LLM invocation during replay

### CONS-3: Idempotence
- Alerts fire once per threshold crossing
- No duplicate events for same transition

### CONS-4: Backward Compatibility
- Deprecated events preserved in store
- Deprecated events skipped by new logic
- Historical replay continues to work

---

## 7. Design Constraints

### DC-1: Thread Model
- Threads represent communication context only
- Threads do NOT own deadlines
- Threads never auto-close from time/silence

### DC-2: Bounded LLM
- One question only: "Does this contain an actionable request?"
- No deadline extraction
- No urgency inference
- Output frozen into events

### DC-3: Silence Tracking Only
- Track `hours_since_activity` vs `silence_threshold_hours`
- Alert on threshold crossing (once)
- No reminder system
- No urgency levels

### DC-4: Alert Behavior
- Fire once per threshold transition
- No continuous alerting
- New activity required before re-alerting

### DC-5: No Agent Behavior
- No background reasoning loops
- No retry-until-success logic
- No feedback cycles
- No autonomous decisions

---

## 8. Runtime Logic

### On EMAIL_RECEIVED:
1. Emit baseline event
2. Validate sender against allowlist
3. If allowed → invoke bounded extraction
4. If `ACTION_REQUEST_OBSERVED` → create/attach thread
5. Emit `THREAD_EMAIL_ADDED`

### On THREAD_EMAIL_ADDED:
1. Update `last_activity_at`

### On TIME_TICK:
1. Load all events for watcher
2. Replay to reconstruct state
3. For each open thread:
   - Compute `hours_since_activity`
   - If threshold crossed → emit `SILENCE_THRESHOLD_EXCEEDED`
   - Queue alert (once per crossing)
4. Exit (stateless)

### On CLOSURE_SIGNAL_OBSERVED:
1. Find associated thread
2. Emit `THREAD_CLOSED`

---

## 9. Test Requirements

### Unit Tests (70%)
- Event replay determinism
- Thread creation from action requests
- Silence threshold computation
- Thread grouping algorithm
- Policy validation

### Integration Tests (25%)
- Event store append/retrieve
- Ingestion → extraction → thread creation
- Alert delivery via Resend/webhook

### E2E Tests (5%)
- Email → silence threshold → alert delivery
- Manual thread closure
- Policy update → behavior change

### Required Test Coverage
- Replay determinism: same events → same state
- Action request detection: LLM output → thread creation
- Silence tracking: TIME_TICK → threshold crossing → alert
- Alert transitions: fire once per crossing, not repeatedly
- Backward compatibility: deprecated events skipped

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **Watcher** | Isolated monitoring scope with unique ingestion address |
| **Thread** | Tracked conversation context |
| **Action Request** | Explicit request expecting response |
| **Silence** | Time since last thread activity |
| **Threshold Crossing** | Silence duration exceeds policy limit |
| **Event** | Immutable, append-only record |
| **Replay** | Reconstruct state by processing events in order |
| **Bounded LLM** | Single question extraction, no inference |
