# Vigil System Design Document

**Version:** 3.0.0 | **Date:** January 2, 2026 | **Status:** Commercial Model

---

## Product Focus

Vigil delivers **one capability: provable silence tracking for email threads**.

The system deterministically:
- Organizes forwarded emails into conversation threads
- Detects actionable requests via bounded LLM
- Tracks elapsed time since last thread activity
- Emits alerts when silence crosses policy thresholds
- Produces immutable, replayable evidence timelines

The system **never**:
- Owns or infers deadlines
- Creates reminders or tasks
- Infers urgency or importance
- Tells users what to do
- Automates responses

---

## 1. Architecture Overview

### 1.1 Event-Sourced Foundation

**Events are the sole source of truth.** All state derives from replaying immutable, append-only events.

Guarantees:
- **Determinism**: Same events → same state
- **Auditability**: Complete history of all decisions
- **Explainability**: Any alert reconstructible by replay
- **Debuggability**: Replay is the debugger

### 1.2 Four Subsystems

1. **Ingestion** — Converts email to immutable events
2. **Runtime** — Replays events, emits new events
3. **Extraction** — Bounded LLM for action request detection
4. **Notification** — Alert delivery

### 1.3 Data Flow

```
Email → Cloudflare → Backend → Event Store
                        ↓
                    LLM Extraction
                        ↓
                   Runtime Replay
                        ↓
              SILENCE_THRESHOLD_EXCEEDED
                        ↓
                   Alert Delivery
```

---

## 2. Core Components

### 2.1 Event Store (PostgreSQL)

```sql
CREATE TABLE events (
  event_id UUID PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  watcher_id UUID NOT NULL,
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_watcher_timestamp ON events(watcher_id, timestamp);
```

Constraints:
- Append-only (no updates, no deletes)
- Events totally ordered per watcher
- Replay always possible

### 2.2 Backend Control Plane

**Location:** `backend/src/`

Responsibilities:
- HTTP API (Hono framework)
- Email ingestion orchestration
- LLM extraction coordination
- Event emission
- Watcher runtime invocation

Architecture:
- Stateless HTTP handlers
- Event-sourced state management
- No long-lived mutable state

### 2.3 Watcher Runtime

**Location:** `backend/src/watcher/runtime.ts`

Execution model:
1. Load all events for watcher
2. Replay to reconstruct state
3. Apply business rules
4. Emit new events
5. Exit (stateless)

No background loops. No hidden memory. No autonomous behavior.

### 2.4 Bounded LLM Extraction

**Location:** `backend/src/llm/action-request-extractor.ts`

The LLM answers **one question**: "Does this contain an actionable request?"

```typescript
// Input
{ email_text, from, subject }

// Output
{
  contains_action_request: boolean,
  action_summary: string | null,
  request_type: "confirmation" | "approval" | "response" | "review" | "unknown",
  source_span: string,
  confidence: "high" | "medium" | "low"
}
```

Constraints:
- No deadline extraction
- No urgency inference
- No multiple extractions per email
- Never invoked during replay

### 2.5 Silence Tracker

**Location:** `backend/src/watcher/silence-tracker.ts`

On each TIME_TICK:
```typescript
for (thread of openThreads) {
  const hoursSilent = (now - thread.last_activity_at) / (1000 * 60 * 60);
  
  if (hoursSilent > policy.silence_threshold_hours) {
    if (!thread.silence_threshold_exceeded) {
      emit(SILENCE_THRESHOLD_EXCEEDED);
      queueAlert();
    }
  }
}
```

Fire once per crossing. New activity required before re-alerting.

---

## 3. Thread Model

### 3.1 Thread State

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
```

### 3.2 Thread Lifecycle

- **Open**: When `ACTION_REQUEST_OBSERVED` emitted
- **Update**: On every `THREAD_EMAIL_ADDED`
- **Close**: Via closure signal or manual user action
- **Never auto-close**: Time/silence does not close threads

### 3.3 Thread Grouping

```
1. Check In-Reply-To/References headers (Message-ID chain)
2. Check Conversation-Index (Outlook)
3. Check normalized subject + participant overlap + temporal proximity
4. If no match → create new thread
```

---

## 4. Policy Model

```typescript
type WatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;
  notification_channels: NotificationChannel[];
};

type NotificationChannel = {
  type: "email" | "webhook";
  destination: string;
  enabled: boolean;
};
```

No deadline fields. No urgency fields. No reporting cadence.

---

## 5. Email Ingestion

### 5.1 Cloudflare Email Routing

- Catches all `*@vigil.run`
- Forwards to backend webhook
- No SMTP server to manage

### 5.2 Backend Webhook

```
POST /api/ingestion/cloudflare-email

1. Extract ingest_token from recipient
2. Validate watcher exists
3. Emit EMAIL_RECEIVED (always)
4. Validate sender against allowlist
5. If allowed → invoke LLM extraction
6. If action request → create/update thread
7. Emit THREAD_EMAIL_ADDED
```

### 5.3 Email Body Handling

- Parsed for metadata
- Sent to LLM for extraction
- **Discarded after extraction** (not persisted)
- Only metadata retained

---

## 6. Alert System

### 6.1 Alert Trigger

```typescript
SILENCE_THRESHOLD_EXCEEDED → ALERT_QUEUED → ALERT_SENT
```

### 6.2 Notification Worker

- Polls Event Store for `ALERT_QUEUED`
- Delivers via Resend (email) or HTTP POST (webhook)
- Retry: 3 attempts, exponential backoff
- Emits `ALERT_SENT` or `ALERT_FAILED`

### 6.3 Alert Content

```
Subject: [Vigil Alert] {watcher_name} - Silence Threshold Exceeded

Thread: {thread_id}
Silent for: {hours_silent} hours
Threshold: {threshold_hours} hours
Last activity: {last_activity_at}

View: {dashboard_url}/threads/{thread_id}
```

---

## 7. Authentication & Billing

### 7.1 Authentication

```typescript
// JWT Configuration
ACCESS_TOKEN_EXPIRY = "1h"      // Short-lived access tokens
REFRESH_TOKEN_EXPIRY = "24h"   // Database-tracked refresh tokens
SERVER_INSTANCE_ID             // All tokens invalidated on server restart

// Token Payload
{ user_id, account_id, email, role, iat, exp }
```

- JWT access tokens (1h) + refresh tokens (24h)
- Server instance ID invalidates tokens on restart
- Google/GitHub OAuth with PKCE flow
- Password reset via Resend (24h expiry)

OAuth Scopes:
- **Google**: `openid`, `email`, `profile`
- **GitHub**: `read:user`, `user:email`

### 7.2 Billing

```typescript
// Plan Limits (billing/types.ts)
const PLAN_LIMITS = {
  free:       { emails_per_week: 50,   max_watchers: 2,  max_channels: 2 },
  starter:    { emails_per_week: 200,  max_watchers: 5,  max_channels: 5 },
  pro:        { emails_per_week: 1000, max_watchers: 20, max_channels: 10 },
  enterprise: { emails_per_week: -1,   max_watchers: -1, max_channels: -1 },
};
```

- Stripe integration (checkout + customer portal)
- Weekly usage period enforcement
- Webhook verification via `STRIPE_WEBHOOK_SECRET`
- Usage tracked in `account_usage` table

---

## 8. Infrastructure

### 8.1 Stack

| Component | Technology |
|-----------|------------|
| Backend | TypeScript/Bun, Hono |
| Event Store | PostgreSQL (max 20 connections) |
| LLM | OpenAI API (GPT-4o-mini) |
| Inbound Email | Cloudflare Email Routing |
| Outbound Email | Resend API |
| Frontend | Next.js 14, Tailwind |
| Scheduler | Background TIME_TICK (15 min) |

### 8.2 Database Schema (Projections)

```sql
-- Watcher projection (fast queries, rebuilt from events)
watcher_projections (
  watcher_id UUID PRIMARY KEY,
  account_id UUID,
  name VARCHAR(255),
  ingest_token VARCHAR(20) UNIQUE,  -- e.g., "a7f3k9"
  status VARCHAR(20),               -- created|active|paused|deleted
  policy JSONB,
  created_at BIGINT
);

-- Thread projection
thread_projections (
  thread_id UUID PRIMARY KEY,
  watcher_id UUID,
  status VARCHAR(20),               -- open|closed
  opened_at BIGINT,
  closed_at BIGINT,
  last_activity_at BIGINT,
  message_count INTEGER
);

-- Account usage (weekly billing)
account_usage (
  account_id UUID,
  period_start BIGINT,
  period_end BIGINT,
  emails_processed INTEGER,
  emails_limit INTEGER,
  PRIMARY KEY (account_id, period_start)
);
```

### 8.3 Environment Variables

```bash
# Required
JWT_SECRET=                    # Access token signing
JWT_REFRESH_SECRET=            # Refresh token signing
DATABASE_URL=                  # PostgreSQL connection
OPENAI_API_KEY=                # LLM extraction
RESEND_API_KEY=                # Outbound email

# Stripe (billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Runtime
APP_BASE_URL=                  # Used for OAuth callbacks
FRONTEND_URL=                  # CORS + redirects
CORS_ORIGINS=                  # Comma-separated
```

---

## 9. Deployment

### 9.1 Component Scaling

| Component | Scaling |
|-----------|---------|
| Backend | Horizontal (stateless) |
| Event Store | Vertical + read replicas |
| Notification Worker | Horizontal |
| Scheduler | Single leader |
| Frontend | CDN + horizontal API |

### 9.2 Failure Modes

| Failure | Impact |
|---------|--------|
| Backend down | API fails, ingestion paused |
| Event Store down | System halts |
| LLM unavailable | Ingestion continues, no extraction |
| Resend down | Alerts queue, delivered on recovery |

---

## 10. Security

### 10.1 Principles

- Never access inboxes
- Only allowlisted senders create threads
- Email bodies discarded after extraction
- PII sanitized before storage

### 10.2 Controls

- JWT authentication
- Watcher-level isolation
- Rate limiting
- HMAC-SHA256 webhook signatures

---

## 11. Design Constraints

### DC-1: No Deadlines
Threads do not own deadlines. System tracks silence only.

### DC-2: Bounded LLM
One question only: "Does this contain an actionable request?"

### DC-3: Threshold-Crossing Alerts
Fire once per crossing. No continuous alerting.

### DC-4: No Agent Behavior
No background loops. No retry-until-success. No feedback cycles.

### DC-5: Deterministic Replay
Same events always produce same state. No LLM during replay.

### DC-6: Backward Compatible
Deprecated events preserved. Skipped by new logic.

---

## 12. Source Code Reference

```
backend/src/
├── events/
│   ├── index.ts              # VigilEvent union, type guards
│   ├── silence-events.ts     # Commercial events (active)
│   ├── thread-events.ts      # Thread lifecycle
│   ├── extraction-events.ts  # Legacy (deprecated)
│   ├── reminder-events.ts    # Legacy (deprecated)
│   └── deprecation.ts        # Deprecated event handling
├── watcher/
│   ├── runtime.ts            # Event replay, state reconstruction
│   ├── silence-tracker.ts    # Silence computation
│   └── thread-model.ts       # Thread state
├── llm/
│   └── action-request-extractor.ts  # Bounded extraction
├── ingestion/
│   └── orchestrator.ts       # Email pipeline
├── auth/
│   ├── middleware.ts         # JWT verification
│   ├── jwt.ts                # Token generation
│   └── oauth.ts              # Google/GitHub OAuth
└── billing/
    ├── subscription.ts       # Stripe integration
    └── usage.ts              # Usage tracking
```
