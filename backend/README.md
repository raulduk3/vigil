# Backend - Vigil Control Plane

**TypeScript/Bun Backend Service**

Backend control plane for Vigil vigilance system. This is the **authoritative decision-making component** that orchestrates all system behavior through event-sourced architecture.

## Commercial Model: Provable Silence Tracking

Vigil delivers **one and only one product capability: provable silence tracking for email threads**.

### What We Deliver

- **Thread Organization**: Group inbound emails into conversation threads
- **Action Request Detection**: LLM answers ONE question: "Does this contain an actionable request?"
- **Silence Tracking**: Monitor elapsed time since last thread activity
- **Threshold Crossing Events**: Emit immutable `SILENCE_THRESHOLD_EXCEEDED` when policy limits crossed
- **Evidence Timelines**: Replayable, immutable audit trail

### What We Do NOT Do

- ❌ Own or infer deadlines 
- ❌ Create reminders or tasks 
- ❌ Infer urgency or importance 
- ❌ Tell users what to do
- ❌ Automate responses

## Key Design Principles

1. **Bounded LLM Extraction** — LLM answers ONE question only: "Does this contain an actionable request?"
2. **Silence Tracking, Not Deadline Management** — Track time since last activity, not owned deadlines
3. **Threshold-Crossing Alerts Only** — Alerts emit on transitions, not continuously
4. **Deterministic Replay** — Same events always produce same state
5. **Backward Compatible Replay** — Historical events preserved, deprecated events skipped for new logic

## SDD Traceability

The [Software Design Document (SDD)](../docs/SDD.md) is the **authoritative source of truth** for all system requirements. This backend service implements the following requirements:

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| Event Store | MR-EventStore-1, MR-EventStore-2, MR-EventStore-3 |
| Watcher Runtime | MR-WatcherRuntime-1, MR-WatcherRuntime-2, MR-WatcherRuntime-3, MR-WatcherRuntime-4, MR-WatcherRuntime-5, MR-WatcherRuntime-6 |
| Backend Ingestion | MR-BackendIngestion-1, MR-BackendIngestion-2, MR-BackendIngestion-3, MR-BackendIngestion-4 |
| LLM Orchestration | FR-6, FR-6b, FR-6c, FR-7 (Closure Detection), FR-8 (Thread Creation) |
| Notification Worker | MR-NotificationWorker-1, MR-NotificationWorker-2, MR-NotificationWorker-3, FR-12 (Alert Delivery) |
| Scheduler | MR-Scheduler-1, MR-Scheduler-2 |
| API Endpoints | FR-2, FR-3, FR-4, FR-5, FR-6, FR-6b, FR-6c, FR-9, FR-15 |
| Event Sourcing | FR-16, CONS-1, CONS-2, CONS-3, CONS-4, CONS-5, CONS-6, CONS-7, CONS-8 |
| Security | SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-6, SEC-7, SEC-8 |
| User & Account Management | FR-17 (Access Control), SEC-1, SEC-2 |

See [SDD Section 5: Implementation Coverage Table](../docs/SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Silence Tracking Pipeline

The backend orchestrates the complete silence tracking flow:

### Commercial Extraction Flow

```
1. Email arrives at ingestion endpoint
2. EMAIL_RECEIVED event emitted (baseline fact)
3. LLM answers ONE question: "Does this contain an actionable request?"
4. If yes → ACTION_REQUEST_OBSERVED event
5. Thread opened/updated (THREAD_OPENED or THREAD_EMAIL_ADDED)
6. If resolution language detected → CLOSURE_SIGNAL_OBSERVED event
7. Scheduler emits TIME_TICK events
8. Silence tracker computes hours_since_last_activity
9. When threshold crossed → SILENCE_THRESHOLD_EXCEEDED event
10. Alert queued for delivery
```

### Action Request Detection (Bounded LLM)

```typescript
// Single-question extraction
{
  contains_action_request: true | false,
  action_summary: string | null,        // Brief description if found
  confidence: "high" | "medium" | "low"
}

// NO: deadline_utc, urgency_level, source_span
// NO: multiple extractions per email
// NO: deadline/urgency inference
```

### Silence Events (Active)

```typescript
// Explicit request for response detected
ACTION_REQUEST_OBSERVED: {
  event_id, watcher_id, message_id,
  action_summary: string,
  confidence: "high" | "medium" | "low",
  timestamp
}

// Resolution language detected
CLOSURE_SIGNAL_OBSERVED: {
  event_id, watcher_id, message_id, thread_id,
  closure_summary: string,
  timestamp
}

// Silence crossed policy threshold (immutable evidence)
SILENCE_THRESHOLD_EXCEEDED: {
  event_id, watcher_id, thread_id,
  hours_silent: number,
  threshold_hours: number,
  last_activity_at: number,
  timestamp
}
```

### Deprecated Events (Backward Compatible)

Legacy events are preserved in the event store for audit replay but no longer trigger new behavior:

```typescript
// DEPRECATED - No longer emitted
HARD_DEADLINE_EXTRACTED    // Replaced by ACTION_REQUEST_OBSERVED
SOFT_DEADLINE_EXTRACTED    // Deprecated entirely
URGENCY_SIGNAL_EXTRACTED   // Deprecated entirely
REMINDER_CREATED           // Deprecated - silence tracking only
REMINDER_DISMISSED         // Deprecated
REMINDER_EDITED            // Deprecated
REMINDER_MERGED            // Deprecated
REMINDER_REASSIGNED        // Deprecated
REMINDER_MANUAL_CREATED    // Deprecated
REMINDER_EVALUATED         // Deprecated
```

### Simplified Thread State (Commercial Model)

```typescript
type SimplifiedThreadState = {
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

// REMOVED from commercial model:
// - deadline_utc
// - urgency_level
// - reminder_ids
```

### Simplified Policy (Commercial Model)

```typescript
type SimplifiedWatcherPolicy = {
  allowed_senders: string[];
  silence_threshold_hours: number;          // Default: 72 (range: 1-720)
  notification_channels: NotificationChannel[];
};

// REMOVED from commercial model:
// - deadline_warning_hours
// - deadline_critical_hours
// - enable_soft_deadline_reminders
// - enable_urgency_signal_reminders
```

---

## Silence Duration Monitoring

Core feature: tracking how long threads have been silent (awaiting response).

### Tracked Metrics

| Metric | How Computed |
|--------|--------------|
| `hours_since_activity` | `(now - last_activity_at) / (1000 * 60 * 60)` |
| `silence_status` | `hours_since_activity >= silence_threshold_hours` |
| `threshold_crossed` | Transition from `silent=false` to `silent=true` |

### Silence Threshold Events

```typescript
// Emitted ONCE when silence threshold is first crossed
SILENCE_THRESHOLD_EXCEEDED: {
  thread_id, watcher_id,
  hours_silent: 74,
  threshold_hours: 72,
  last_activity_at: 1735336800000
}

// NOT emitted again until thread has new activity
// and crosses threshold again
```

### API Endpoints for Silence Metrics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/threads/:id/status` | GET | Thread silence status and duration |
| `/api/watchers/:id/threads` | GET | All threads with silence status |
| `/api/watchers/:id/silent` | GET | Only threads exceeding silence threshold |

---

## Implementation Coverage Contribution

This component contributes **~60%** of overall project implementation. The backend is the authoritative decision-making component.

### Coverage by Category

| Category | Backend Owns | Total in SDD | Coverage |
|----------|--------------|--------------|----------|
| Feature Requirements (FR) | 16 of 20 | 20 | 80% |
| Module Requirements (MR) | 17 of 26 | 26 | 65% |
| Security Requirements (SEC) | 8 of 8 | 8 | 100% |
| Data Consistency (CONS) | 8 of 8 | 8 | 100% |
| Infrastructure (IR) | 10 of 24 | 24 | 42% |

### Critical Path Requirements (Backend-Owned)

The backend owns the entire critical path from email ingestion to alert delivery:

```
FR-5 (Ingestion) → FR-6/6b/6c (Extraction) → FR-8 (Thread Creation)
       ↓                    ↓                         ↓
MR-BackendIngestion    MR-LLMService*          MR-WatcherRuntime
       ↓                    ↓                         ↓
           → FR-10 (Urgency) → FR-11 (Alert Queue) → FR-12 (Delivery)
                   ↓                   ↓                    ↓
           MR-WatcherRuntime     MR-WatcherRuntime    MR-NotificationWorker
```

*Backend orchestrates LLM Service calls; LLM Service implements extraction logic.

### Requirements NOT Owned by Backend

| Requirement | Owner | Reason |
|-------------|-------|--------|
| MR-Frontend-1,2,3 | Frontend | UI display logic |
| MR-LLMService-1,2,3,4,5 | LLM Service | Extraction inference |

**Email Services (Managed - No Code Required):**
- **Inbound:** Cloudflare Email Routing (catch-all → webhook)
- **Outbound:** Resend API (alerts, reports)

---

## User & Account Management

The backend is the **authoritative source** for user authentication and account management. All user data is stored in the backend database and managed through events.

### Data Model

**Account (Multi-Tenant Container):**
```typescript
type Account = {
  account_id: string;       // UUID, immutable
  owner_email: string;      // Primary owner email
  created_at: number;       // Unix timestamp
  plan: SubscriptionPlan;   // Subscription tier (see Billing section)
  stripe_customer_id?: string;  // Stripe customer ID (for paid plans)
};
```

**User (Individual Identity):**
```typescript
type User = {
  user_id: string;          // UUID, immutable
  account_id: string;       // Parent account (FK)
  email: string;            // Unique login identifier
  password_hash: string;    // bcrypt hash (cost factor 12+)
  role: "owner" | "member"; // Account role
  created_at: number;
};
```

---

## Billing & Subscriptions

The backend manages subscription tiers, usage tracking, and Stripe integration for billing.

### Subscription Tiers

| Tier | Emails/Week | Watchers | Price | Notes |
|------|-------------|----------|-------|-------|
| **Free** | 50 | 2 | $0 | Default for new accounts |
| **Starter** | 200 | 5 | $9.99/mo | Entry paid tier |
| **Pro** | 1,000 | 20 | $29.99/mo | Full features |
| **Enterprise** | Unlimited | Unlimited | Custom | Sales-only |

### Feature Comparison

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Webhook Notifications | ❌ | ✅ | ✅ | ✅ |
| SMS Notifications | ❌ | ❌ | ✅ | ✅ |
| Advanced Reporting | ❌ | ❌ | ✅ | ✅ |
| Support Level | Community | Email | Priority | Dedicated |

### Usage Tracking

Usage is tracked per **billing period** (Monday 00:00 UTC to Sunday 23:59 UTC):

- **Email Usage**: Counted when a message is successfully ingested
- **Watcher Count**: Number of active (non-deleted) watchers
- Usage resets weekly on Monday 00:00 UTC

### Billing API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/billing/subscription` | GET | Get current subscription details |
| `/api/billing/usage` | GET | Get current period usage |
| `/api/billing/plans` | GET | List available plans |
| `/api/billing/checkout` | POST | Create Stripe checkout session |
| `/api/billing/portal` | POST | Create Stripe billing portal session |
| `/api/webhooks/stripe` | POST | Handle Stripe webhook events |

### Stripe Integration

Set environment variables to enable Stripe:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (create in Stripe Dashboard)
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...  # Optional
```

### Email Limit Enforcement

When an account exceeds its weekly email limit:

1. Ingestion returns `EMAIL_LIMIT_EXCEEDED` error
2. Email is not processed (no events created)
3. Response includes:
   - Current usage count
   - Limit for plan
   - Period end date (when limit resets)

### Authentication Flow

```
1. Registration (POST /api/auth/register)
   └─→ Creates ACCOUNT_CREATED event
   └─→ Creates USER_CREATED event (role: owner)
   └─→ Returns JWT access token + refresh token

2. Login (POST /api/auth/login)
   └─→ Validates email + password against stored hash
   └─→ Returns JWT access token (24hr expiry) + refresh token
   └─→ JWT contains: { user_id, account_id, role, exp }

3. Token Refresh (POST /api/auth/refresh)
   └─→ Validates refresh token
   └─→ Returns new access token

4. Password Reset (POST /api/auth/password-reset/request)
   └─→ Generates secure reset token
   └─→ Sends reset email (if user exists)
   └─→ Token expires after 1 hour

5. OAuth (GET /api/auth/oauth/:provider)
   └─→ Redirects to Google/GitHub for authentication
   └─→ Callback creates/links account
   └─→ Returns JWT tokens

6. All Protected Endpoints
   └─→ Require Authorization: Bearer {token}
   └─→ Backend extracts user_id, account_id from JWT
   └─→ Validates watcher.account_id === user.account_id
```

### Password Reset Flow

```
1. Request Reset (POST /api/auth/password-reset/request)
   └─→ User submits email
   └─→ Generates secure 64-character token
   └─→ Stores hashed token with 1-hour expiry
   └─→ Returns success (always, to prevent enumeration)

2. Verify Token (GET /api/auth/password-reset/verify?token=...)
   └─→ Validates token exists and not expired
   └─→ Returns email for confirmation

3. Confirm Reset (POST /api/auth/password-reset/confirm)
   └─→ Validates token and new password
   └─→ Updates password hash
   └─→ Invalidates all refresh tokens
   └─→ Returns success
```

### OAuth Integration

OAuth is prepared for Google and GitHub providers. Set environment variables:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Application base URL (for callbacks)
APP_BASE_URL=https://your-domain.com
```

**OAuth Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/oauth/providers` | GET | List enabled OAuth providers |
| `/api/auth/oauth/google` | GET | Start Google OAuth flow |
| `/api/auth/oauth/github` | GET | Start GitHub OAuth flow |
| `/api/auth/callback/:provider` | GET | OAuth callback handler |

### Storage Implementation

**Users Table (PostgreSQL):**
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(account_id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(60) NOT NULL,  -- bcrypt
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account ON users(account_id);
```

**Accounts Table (PostgreSQL):**
```sql
CREATE TABLE accounts (
  account_id UUID PRIMARY KEY,
  owner_email VARCHAR(255) NOT NULL,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Security Requirements (SEC-1 through SEC-8)

| Requirement | Implementation |
|-------------|----------------|
| SEC-1: Token Expiry | JWT expires after 24 hours; refresh required |
| SEC-2: Password Storage | bcrypt with cost factor ≥ 12 |
| SEC-3: Ingest Token Entropy | 8-12 char base36 (41+ bits entropy) |
| SEC-4: SQL Injection | Parameterized queries only |
| SEC-5: PII Protection | Email bodies discarded after extraction |
| SEC-6: HTTPS | TLS 1.2+ required in production |
| SEC-7: Rate Limiting | 1000 req/min per account, 5 req/15min for auth |
| SEC-8: Token Scope | JWTs scoped to account_id |

### Rate Limiting

Rate limiting is implemented for security-sensitive endpoints:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/register` | 5 requests | 15 minutes |
| `/api/auth/login` | 5 requests | 15 minutes |
| `/api/auth/password-reset/*` | 3 requests | 1 hour |
| `/ingest/:token` | 100 requests | 1 minute |
| API endpoints (general) | 1000 requests | 1 minute |

Rate limit headers are returned on 429 responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until retry is allowed

### Webhook Security

Outbound webhooks are signed with HMAC-SHA256 for verification:

```
X-Vigil-Signature: sha256=<hex_signature>
X-Vigil-Timestamp: <unix_timestamp>
```

**Verification Algorithm:**
1. Concatenate: `{timestamp}.{payload}`
2. Compute: `HMAC-SHA256(message, secret)`
3. Compare signature with constant-time comparison
4. Reject if timestamp > 5 minutes old

Set `WEBHOOK_SIGNING_SECRET` environment variable for production.

### Input Validation

All API endpoints validate input:

- **UUID parameters**: Must be valid UUID v4 format
- **Webhook URLs**: Must be HTTPS, no internal/private IPs
- **Email addresses**: RFC 5322 compliant format
- **Policy fields**: Deep validation of all nested objects
- **Request body**: Maximum 10MB size limit

### Event-Sourced User Actions

All user actions that modify state emit events:

```typescript
// Account creation
ACCOUNT_CREATED: { account_id, owner_email, created_at }

// User creation  
USER_CREATED: { user_id, account_id, email, role, created_at }

// Watcher operations include user attribution
WATCHER_CREATED: { ..., created_by: user_id }
WATCHER_PAUSED: { ..., paused_by: user_id, reason? }
WATCHER_RESUMED: { ..., resumed_by: user_id }
POLICY_UPDATED: { ..., updated_by: user_id }
THREAD_CLOSED: { ..., closed_by: "user_action", closure_event_id }
```

---

## Working with Agents

This section guides AI agents implementing discrete features within the backend.

### Before Starting Any Feature

1. **Identify the SDD requirement(s)** the feature implements
2. **Check the Implementation Coverage Table** in [SDD Section 5](../docs/SDD.md#implementation-coverage-table)
3. **Understand upstream/downstream dependencies** in the requirement chain
4. **Review existing types** in `src/events/types.ts`
5. **Check existing tests** in `test/` for patterns

### Feature Implementation Checklist

```
□ Identify SDD requirement (FR-X, MR-X, etc.)
□ Review acceptance criteria in SDD
□ Check if event types exist in types.ts
□ Implement feature code in src/
□ Write unit tests in test/ (match src/ structure)
□ Run `bun run check` (typecheck, lint, format, test)
□ Update Implementation Coverage Table if status changed
```

### Discrete Feature Examples

| Feature | SDD Requirement | Files to Modify | Dependencies |
|---------|-----------------|-----------------|---------------|
| Add watcher creation API | FR-1 | `src/backend/api/watchers.ts` | MR-EventStore-1 |
| Implement sender validation | FR-18, MR-BackendIngestion-2 | `src/backend/ingestion/validate.ts` | FR-5 |
| Add urgency evaluation | FR-10, MR-WatcherRuntime-3 | `src/watcher/runtime.ts` | FR-8, FR-6 |
| Implement alert queuing | FR-11, MR-WatcherRuntime-4 | `src/watcher/runtime.ts` | FR-10 |
| Add notification delivery | FR-12, MR-NotificationWorker-1 | `src/backend/worker/notify.ts` | FR-11 |

### Event Types Reference

Event types are defined in modular files under `src/events/`. The system organizes events by responsibility:

**Active Event Categories:**

| Module | Events | Purpose |
|--------|--------|---------|
| `silence-events.ts` | `ACTION_REQUEST_OBSERVED`, `CLOSURE_SIGNAL_OBSERVED`, `SILENCE_THRESHOLD_EXCEEDED` | Commercial model |
| `thread-events.ts` | `THREAD_OPENED`, `THREAD_EMAIL_ADDED`, `THREAD_CLOSED`, `THREAD_REOPENED` | Thread lifecycle |
| `alert-events.ts` | `ALERT_QUEUED`, `ALERT_SENT`, `ALERT_FAILED` | Alert delivery |
| `scheduler-events.ts` | `TIME_TICK`, `REPORT_GENERATED` | Scheduler |
| `control-plane-events.ts` | `ACCOUNT_CREATED`, `USER_CREATED`, `WATCHER_CREATED`, etc. | Control plane |
| `ingestion-events.ts` | `EMAIL_RECEIVED`, `EMAIL_REJECTED` | Email ingestion |

**Deprecated Event Categories (Backward Compatible):**

| Module | Events | Status |
|--------|--------|--------|
| `extraction-events.ts` | `HARD_DEADLINE_EXTRACTED`, `SOFT_DEADLINE_EXTRACTED`, `URGENCY_SIGNAL_EXTRACTED`, `CLOSURE_SIGNAL_EXTRACTED` | Deprecated |
| `reminder-events.ts` | `REMINDER_CREATED`, `REMINDER_DISMISSED`, `REMINDER_EDITED`, etc. | Deprecated |

**Event Module Structure:**
```
src/events/
├── index.ts              # Main entry point, VigilEvent union, type guards
├── types.ts              # Re-export for backward compatibility
├── base-types.ts         # BaseEvent, PIIType, UrgencyLevel
├── silence-events.ts     # Commercial model (ACTIVE)
├── thread-events.ts      # Thread lifecycle
├── alert-events.ts       # Alert delivery
├── scheduler-events.ts   # TIME_TICK, reports
├── control-plane-events.ts # Account/Watcher management
├── ingestion-events.ts   # Email ingestion
├── policy-types.ts       # WatcherPolicy, NotificationChannel
├── extraction-events.ts  # Legacy extraction (DEPRECATED)
├── reminder-events.ts    # Reminder events (DEPRECATED)
├── attribution-events.ts # Signal attribution
└── deprecation.ts        # Deprecated event handling
```

### Testing Patterns

```typescript
// Unit test pattern for silence tracking
import { describe, test, expect } from "bun:test";
import { SilenceTracker } from "../src/watcher/silence-tracker";

describe("Silence Tracking", () => {
  test("emits SILENCE_THRESHOLD_EXCEEDED on first crossing", () => {
    const tracker = new SilenceTracker();
    const thread = {
      thread_id: "thr_1",
      last_activity_at: Date.now() - (73 * 60 * 60 * 1000), // 73 hours ago
      status: "open"
    };
    const policy = { silence_threshold_hours: 72 };
    
    const event = tracker.evaluate(thread, policy, Date.now());
    
    expect(event?.type).toBe("SILENCE_THRESHOLD_EXCEEDED");
    expect(event?.hours_silent).toBeGreaterThan(72);
  });
  
  test("does NOT emit again until activity resets silence", () => {
    const tracker = new SilenceTracker();
    // After threshold exceeded, no new event until thread has new activity
    // and crosses threshold again
  });
});
```

## Architecture

The backend is the **only component** that:
- Creates and validates events
- Persists events to immutable event store
- Invokes watcher runtime for state reconstruction
- Orchestrates bounded LLM extraction (action requests only)
- Tracks silence duration on open threads
- Dispatches notifications via worker

**Core Principle:** Events are the sole source of truth. All state is derived by replaying events.

## Key Design Constraints

**Bounded LLM Extraction:** LLM answers ONE question only: "Does this contain an actionable request?" No deadline inference, no urgency levels, no complex extraction.

**Silence Tracking, Not Deadline Management:** Threads track `last_activity_at` and emit `SILENCE_THRESHOLD_EXCEEDED` when policy threshold crossed. No owned deadlines.

**Threshold-Crossing Alerts:** Alerts emit ONCE on state transition. No continuous alerting. Thread must have new activity before alerting again.

**Deprecated Event Handling:** Historical events (reminders, deadlines) preserved for audit replay but no longer trigger new behavior.

**Message Non-Persistence:** The system does NOT store full email body content. Only metadata is retained; bodies are discarded after LLM extraction.

**Idempotence per Watcher:** Replay idempotence is enforced at watcher scope. Same events always produce same state.

**Component Health Centralization:** All component health signals centralize to backend via `/internal/health/report`. Backend exposes `GET /api/system/health`.

## Implementation Status

**Overall:** 1672+ tests passing. Core silence tracking pipeline implemented and functional.

### Fully Implemented 

#### Event Types & Storage
- **Event types** (`src/events/`) - Modular event definitions across 12 files
- **Commercial events** (`src/events/silence-events.ts`) - ACTION_REQUEST_OBSERVED, CLOSURE_SIGNAL_OBSERVED, SILENCE_THRESHOLD_EXCEEDED
- **Event store** (`src/events/event-store.ts`) - PostgreSQL append-only storage with deduplication
- **Thread detection** (`src/watcher/thread-detection.ts`) - Message-ID chaining, Conversation-Index, subject+participants matching
- **Traceability** (`src/events/traceability.ts`) - Audit trail and causal chain tracking
- **Deprecation handling** (`src/events/deprecation.ts`) - Backward compatible replay of legacy events

#### Silence Tracking (Commercial Model)
- **Silence tracker** (`src/watcher/silence-tracker.ts`) - Silence duration computation, threshold crossing detection
- **Thread model** (`src/watcher/thread-model.ts`) - Simplified commercial thread state (no deadlines)
- **Action request extractor** (`src/llm/action-request-extractor.ts`) - Bounded LLM extraction (one question only)

#### Watcher Runtime & Core Logic
- **Event replay** (`src/watcher/runtime.ts`) - State reconstruction from events
- **Alert queuing** (`src/watcher/alert-queue.ts`) - State transition detection
- **Scheduler** (`src/scheduler/scheduler.ts`) - TIME_TICK generation, report scheduling

#### Email Ingestion Pipeline
- **Email parsing** (`src/ingestion/orchestrator.ts`) - RFC 5322 compliant with header extraction
- **Sender validation** (`src/ingestion/validator.ts`) - Allowlist checking, subject normalization
- **Message deduplication** - By Message-ID with duplicate tracking

#### Notification & Delivery
- **Alert formatting** (`src/worker/notification.ts`) - Email, webhook, SMS generation
- **Delivery infrastructure** (`src/worker/notification-worker.ts`) - Retry logic with exponential backoff
- **Channel routing** (`src/worker/worker.ts`) - Multi-channel delivery

#### Authentication & Accounts
- **Password hashing** (`src/auth/password.ts`) - bcrypt cost factor 12
- **JWT tokens** (`src/auth/jwt.ts`) - Token creation, validation, refresh
- **User management** (`src/auth/users.ts`) - User CRUD operations
- **Auth middleware** (`src/auth/middleware.ts`) - Protected endpoints

### Deprecated (Backward Compatible)

- **Deadline extraction** - `HARD_DEADLINE_EXTRACTED`, `SOFT_DEADLINE_EXTRACTED` preserved for replay
- **Urgency signals** - `URGENCY_SIGNAL_EXTRACTED` preserved for replay
- **Reminder system** - All `REMINDER_*` events preserved for replay

## Structure

```
backend/
├── src/
│   ├── index.ts            # Entry point, server initialization
│   ├── api/                # HTTP handlers and routes
│   │   └── handlers.ts     # Request handlers (watcher CRUD, ingestion, billing)
│   ├── auth/               # Authentication & authorization
│   │   ├── jwt.ts          # JWT token creation/validation
│   │   ├── password.ts     # Password hashing (bcrypt)
│   │   ├── users.ts        # User CRUD
│   │   └── middleware.ts   # Auth middleware
│   ├── billing/            # Subscription & usage management
│   │   ├── index.ts        # Module exports
│   │   ├── types.ts        # Plan limits, subscription types
│   │   ├── usage.ts        # Usage tracking per billing period
│   │   ├── subscription.ts # Plan management, Stripe integration
│   │   └── stripe.ts       # Stripe webhook handlers
│   ├── events/             # Event types and persistence (MODULAR)
│   │   ├── index.ts        # Main entry point, VigilEvent union
│   │   ├── types.ts        # Re-export for backward compatibility
│   │   ├── base-types.ts   # BaseEvent, PIIType, UrgencyLevel
│   │   ├── silence-events.ts  # Commercial model (ACTIVE)
│   │   ├── thread-events.ts   # Thread lifecycle
│   │   ├── alert-events.ts    # Alert delivery
│   │   ├── scheduler-events.ts # TIME_TICK, reports
│   │   ├── control-plane-events.ts # Account/Watcher management
│   │   ├── ingestion-events.ts    # Email ingestion
│   │   ├── policy-types.ts        # WatcherPolicy, NotificationChannel
│   │   ├── extraction-events.ts   # Legacy extraction (DEPRECATED)
│   │   ├── reminder-events.ts     # Reminder events (DEPRECATED)
│   │   ├── attribution-events.ts  # Signal attribution
│   │   ├── deprecation.ts         # Deprecated event handling
│   │   ├── event-store.ts         # PostgreSQL event store
│   │   └── traceability.ts        # Audit trail validation
│   ├── ingestion/          # Email processing pipeline
│   │   ├── orchestrator.ts # Complete ingestion flow
│   │   └── validator.ts    # Email validation and normalization
│   ├── llm/                # LLM extraction service
│   │   ├── action-request-extractor.ts  # Bounded LLM (COMMERCIAL)
│   │   └── extractor.ts    # Legacy extraction (DEPRECATED)
│   ├── watcher/            # Watcher runtime and state
│   │   ├── runtime.ts      # Event replay and state reconstruction
│   │   ├── silence-tracker.ts   # Silence tracking (COMMERCIAL)
│   │   ├── thread-model.ts      # Simplified thread state (COMMERCIAL)
│   │   ├── alert-queue.ts       # Alert generation and queuing
│   │   └── thread-detection.ts  # Thread grouping algorithm
│   ├── scheduler/          # Periodic task scheduling
│   │   ├── scheduler.ts    # TIME_TICK and report scheduling
│   │   └── worker.ts       # Scheduler worker loop
│   ├── worker/             # Notification delivery
│   │   ├── notification-worker.ts  # Alert delivery orchestrator
│   │   ├── notification.ts # Email/webhook/SMS formatting
│   │   └── worker.ts       # Worker loop
│   └── db/                 # Database access
│       └── client.ts       # PostgreSQL connection pool
├── test/                   # Centralized unit tests
│   ├── events/             # Event system tests (84 migration tests)
│   ├── watcher/            # Silence tracker, thread model tests
│   ├── llm/                # Action request extractor tests
│   └── billing/            # Billing module tests
├── scripts/
│   └── release.ts          # Release automation
├── .env.example
├── eslint.config.js
├── tsconfig.json
└── package.json
```

## Watcher Configuration

Watchers are the primary operational unit. Each watcher is configured through events and managed via the backend API.

### Core Configuration Fields

**Identity (Immutable):**
- `watcher_id`: UUID identifier
- `account_id`: Parent account
- `ingest_token`: Unique token for email routing (e.g., `a7f3k9`)
- `created_at`: Creation timestamp
- `created_by`: Creator user ID

**Operational State:**
- `name`: Human-readable name (mutable)
- `status`: `"created"` | `"active"` | `"paused"` | `"deleted"`
- `policy`: Complete policy configuration (mutable)
- `deleted_at`: Unix ms timestamp when watcher was deleted (null if not deleted)

### Policy Configuration (WatcherPolicy)

```typescript
type WatcherPolicy = {
  // Sender Control
  allowed_senders: string[];              // Email allowlist (exact match, case-insensitive)
  
  // Silence Threshold (Commercial Model)
  silence_threshold_hours: number;        // Default: 72 (range: 1-720)
  
  // Notification Configuration
  notification_channels: NotificationChannel[];
  
  // Reporting Configuration
  reporting_cadence: "daily" | "weekly" | "monthly" | "on_demand";
  reporting_recipients: string[];         // Email addresses for summary reports
  reporting_time?: string;                // ISO 8601 time (e.g., "09:00:00Z")
  reporting_day?: number;                 // 1-7 for weekly, 1-31 for monthly
  
  // DEPRECATED (preserved for backward compatibility)
  deadline_warning_hours?: number;        // No longer used
  deadline_critical_hours?: number;       // No longer used
  enable_soft_deadline_reminders?: boolean;   // No longer used
  enable_urgency_signal_reminders?: boolean;  // No longer used
};
```

**Key Policy Rules:**
- `allowed_senders`: Exact email match, case-insensitive, no wildcards (empty = allow all)
- `silence_threshold_hours`: Hours of thread inactivity before alert (default 72)
- At least one enabled notification channel required for activation
- Deprecated fields ignored during policy evaluation

### Lifecycle Events

**Creation:** `WATCHER_CREATED` → status = "created"
**Activation:** `WATCHER_ACTIVATED` → status = "active" (monitoring begins)
**Pause:** `WATCHER_PAUSED` → status = "paused" (monitoring suspended)
**Resume:** `WATCHER_RESUMED` → status = "active" (monitoring resumes)
**Deletion:** `WATCHER_DELETED` → status = "deleted" (terminal state, cannot be reactivated)
**Policy Change:** `POLICY_UPDATED` → new policy applies immediately

**Deletion Behavior:**
- Emits `WATCHER_DELETED` event with `deleted_at` timestamp
- Stops all monitoring, alerting, and reporting
- Ingestion address becomes inactive (emails rejected/bounced)
- **Cannot be reactivated** (users must create new watcher)
- All historical events preserved for audit (no cascade delete)

### Email Routing

Each watcher has a unique ingestion address:
```
<sanitized-name>-<ingest_token>@vigil.run
```

Examples:
- `personal-finance-a7f3k9@vigil.run`
- `legal-matters-b2j8m1@vigil.run`

Routing is **address-only** (content never examined).

See [System Design Document](../docs/SYSTEM_DESIGN.md#81-watchers) for complete specification.

## State Reconstruction Implementation

The backend provides current watcher state through a **two-tier query strategy**:

### Tier 1: Event Replay (Default)

```typescript
// For watchers with < 10,000 events
async function getWatcherState(watcherId: string) {
  const events = await eventStore.getEventsForWatcher(watcherId);
  const state = replayEvents(events);  // Pure function from runtime.ts
  return state;
}
```

**Characteristics:**
- Always correct (events are source of truth)
- No cache invalidation needed
- Typical latency: 50-200ms
- Used for most watchers

### Tier 2: Cached Projections (Performance)

```typescript
// For watchers with > 10,000 events
async function getWatcherState(watcherId: string) {
  const projection = await db.query(
    "SELECT * FROM thread_projections WHERE watcher_id = ?",
    [watcherId]
  );
  
  // Verify freshness, rebuild if stale
  if (isStale(projection)) {
    await rebuildProjection(watcherId);
  }
  
  return projection;
}
```

**Projection Properties:**
- Disposable (can delete and rebuild anytime)
- Never authoritative (events are truth)
- Self-healing (rebuilds if corrupted)
- Typical latency: < 10ms

### Implementation Strategy

**When to use replay:**
- Event count < 10,000
- Audit/debugging queries
- Projection verification
- Report generation

**When to use projections:**
- Event count > 10,000
- High-frequency dashboard queries
- Performance-critical endpoints

**Fallback behavior:**
- If projection missing → replay
- If projection stale → async rebuild + serve projection
- If projection corrupted → replay + trigger rebuild

### Event Store Queries

```typescript
interface EventStore {
  // Full replay
  getEventsForWatcher(watcherId: string): Promise<VigilEvent[]>;
  
  // Partial replay (since timestamp)
  getEventsSince(watcherId: string, timestamp: number): Promise<VigilEvent[]>;
  
  // Event log pagination
  query(options: {
    watcher_id: string,
    limit: number,
    offset: number,
    order: "ASC" | "DESC"
  }): Promise<VigilEvent[]>;
  
  // Performance queries
  countEvents(watcherId: string): Promise<number>;
  getLastEvent(watcherId: string): Promise<VigilEvent | null>;
}
```

See [System Design Document - Section 7.3](../docs/SYSTEM_DESIGN.md#73-state-reconstruction-and-query-strategy) for complete specification.

## Network Communication

The backend communicates with external services over HTTP:

| Service | Purpose | Configuration |
|---------|---------|---------------|
| LLM Service | Fact extraction from emails | `LLM_SERVICE_URL` |
| Cloudflare Email | Inbound emails via webhook | `POST /api/ingestion/cloudflare-email` |
| Resend API | Outbound email alerts | `RESEND_API_KEY` |
| Frontend | API for web UI | `CORS_ORIGINS` |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Key settings:**
- `PORT` - Backend API port (default: 3000)
- `LLM_SERVICE_URL` - URL for LLM fact extraction service
- `DATABASE_URL` - PostgreSQL connection for event store
- `CORS_ORIGINS` - Allowed frontend origins

See [.env.example](.env.example) for complete configuration options.

## Development

```bash
bun install           # Install dependencies
bun test              # Run tests
bun test --watch      # Watch mode
bun run dev           # Development mode
bun run check         # All checks
```

## Testing

All tests are centralized in the `test/` directory, mirroring the `src/` structure.

```bash
bun test                          # Run all tests
bun test test/events/             # Run specific test directory
bun test test/watcher/runtime     # Run specific test file
```

### Testing Email Ingestion

Use the **Email Ingestion Test Endpoint** to simulate Cloudflare webhook payloads during development:

```bash
# Send a test email via HTTP POST (simulating Cloudflare webhook)
curl -X POST http://localhost:3001/api/ingestion/cloudflare-email \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": "finance-YOUR_TOKEN@vigil.run",
    "subject": "Invoice Due Friday",
    "text": "Please pay by Friday 5pm EST"
  }'

# Send a deadline email
curl -X POST http://localhost:3001/api/ingestion/cloudflare-email \
  -H "Content-Type: application/json" \
  -d '{
    "from": "vendor@example.com",
    "to": "finance-YOUR_TOKEN@vigil.run",
    "subject": "Payment Required",
    "text": "Your payment of $500 is due by December 31, 2025"
  }'
```

**Test Scenarios:**
- **Deadline email**: Include explicit date/time in body
- **Urgency signal**: Include "urgent", "ASAP", "please respond"
- **Closure signal**: Include "resolved", "completed", "no longer needed"
- **Thread continuation**: Use same subject line with "Re:" prefix

## Code Quality

```bash
bun run typecheck     # TypeScript type checking
bun run lint          # ESLint
bun run lint:fix      # Auto-fix linting issues
bun run format        # Format with Prettier
bun run format:check  # Check formatting
```

## Release

```bash
bun run release:patch    # Bump patch version
bun run release:minor    # Bump minor version
bun run release:major    # Bump major version
```

Release script automatically runs all checks before creating release.
