# Backend - Vigil Control Plane

**TypeScript/Bun Backend Service**

Backend control plane for Vigil vigilance system. This is the **authoritative decision-making component** that orchestrates all system behavior through event-sourced architecture.

## Key Design Principles

The backend implements these core constraints:

1. **Automated with Correction** — LLM creates reminders automatically; users fix the ~10% mistakes.
2. **Grounded Extraction** — Every LLM output must cite a `source_span` or it's discarded.
3. **User Control** — Reminders can be edited, merged, dismissed, reassigned. Manual actions persist.
4. **One Email, Multiple Concerns** — Single email can generate multiple independent reminders.
5. **Conflict Detection** — Duplicates and conflicts are flagged, not auto-resolved.
6. **Response Time Tracking** — Core feature: monitoring when emails are sent, received, and responded to.

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

## Extraction & Reminder Pipeline

The backend orchestrates the complete extraction and reminder management flow:

### Grounded Extraction Flow

```
1. Email arrives at ingestion endpoint
2. MESSAGE_RECEIVED event emitted (baseline fact)
3. Regex extractor identifies candidate text spans
4. LLM interprets context, extracts structured facts
5. Each extraction MUST include source_span (verbatim quote)
6. Backend validates source_span exists in original email
7. Ungrounded extractions → DISCARDED
8. Valid extractions → ACTIVE REMINDERS (automated)
9. User corrects if LLM was wrong (~10% of cases)
```

### Source Span Validation

Every extraction must cite verbatim text from the original email:

```typescript
// Example extraction response
{
  deadline_found: true,
  deadline_utc: 1735336800000,
  deadline_text: "Friday December 27, 2025 at 5pm",
  source_span: "by Friday December 27, 2025 at 5pm EST",  // MUST exist in email
  confidence: "high"
}

// Validation: source_span.toLowerCase() must be found in email_text.toLowerCase()
// If not found → extraction is DISCARDED
```

### Reminder Lifecycle Events

```typescript
// Reminder created automatically from extraction
REMINDER_CREATED: {
  reminder_id, thread_id, extraction_event_id,
  deadline_utc, source_span, confidence, status: "active"
}

// User edits reminder (correcting LLM mistake)
REMINDER_EDITED: { reminder_id, changes: {...}, edited_by: user_id }

// User dismisses incorrect extraction
REMINDER_DISMISSED: { reminder_id, dismissed_by: user_id, reason? }

// User merges duplicate reminders
REMINDER_MERGED: { source_reminder_id, target_reminder_id, merged_by: user_id }

// User reassigns to different thread (portable reminders)
REMINDER_REASSIGNED: { reminder_id, from_thread_id, to_thread_id, reassigned_by: user_id }

// User creates manual reminder (no extraction)
REMINDER_MANUAL_CREATED: { reminder_id, thread_id, created_by: user_id, ... }
```

### Reminders as Portable Semantic Obligations

Reminders are **independent of messages and threads**. They represent semantic obligations (deadlines, requests, tasks) extracted by the LLM that can:

- Be **moved between threads** without affecting message history
- Be **monitored for urgency** regardless of thread attachment
- Be **created manually** by users without any source email
- Be **deactivated** while remaining in the audit trail

```typescript
// Reminder can be reassigned to any thread
REMINDER_REASSIGNED: {
  reminder_id: "rem_123",
  from_thread_id: "thr_old",  // No longer monitors on this thread
  to_thread_id: "thr_new",    // Now monitors on this thread
  reassigned_by: "user_456"
}
// Thread urgency calculations update automatically
```

### Conflict Detection

The backend flags potential conflicts for user review:

```typescript
// Duplicate detection
CONFLICT_DETECTED: {
  type: "duplicate_reminder",
  reminder_ids: [r1, r2],
  similarity_score: 0.95,
  status: "pending_user_review"
}

// Conflicting deadlines
CONFLICT_DETECTED: {
  type: "deadline_mismatch",
  thread_id,
  deadlines: [{ reminder_id: r1, deadline: d1 }, { reminder_id: r2, deadline: d2 }],
  status: "pending_user_review"
}
```

### User Override Persistence

All user corrections emit events that persist permanently:

```typescript
// User overrides are NEVER overwritten
// Event replay respects the most recent user action
// Automation cannot modify user-confirmed state
```

---

## Response Time Monitoring

Core feature: tracking communication velocity.

### Tracked Metrics

| Metric | How Computed |
|--------|--------------|
| `hours_since_activity` | `(now - last_activity_at) / (1000 * 60 * 60)` |
| `hours_until_deadline` | `(deadline_utc - now) / (1000 * 60 * 60)` |
| `response_interval` | Time between consecutive messages in thread |
| `silence_duration` | Time since last thread activity |

### API Endpoints for Response Metrics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/threads/:id/timeline` | GET | Full activity timeline with timestamps |
| `/api/threads/:id/metrics` | GET | Response time statistics |
| `/api/watchers/:id/summary` | GET | Aggregate response patterns |

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
| IR-8, IR-9 | SMTP Adapter | Email transport |
| MR-LLMService-1,2,3,4,5 | LLM Service | Extraction inference |

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

All event types are defined in `src/events/types.ts`. The system currently defines **24 event types** organized by category:

**Control Plane Events:**
- `ACCOUNT_CREATED` - Account registration
- `USER_CREATED` - User added to account
- `WATCHER_CREATED` - Watcher creation with ingest token
- `WATCHER_ACTIVATED` - Monitoring started
- `WATCHER_PAUSED` - Monitoring suspended
- `WATCHER_RESUMED` - Monitoring resumed
- `POLICY_UPDATED` - Policy configuration changed

**Message Ingress Events:**
- `MESSAGE_RECEIVED` - Baseline observation (always emitted first)

**LLM Extraction Events (Three-Tier Model):**
- `MESSAGE_ROUTED` - Thread routing decision
- `HARD_DEADLINE_OBSERVED` - Tier 1: Explicit deadline extracted (binding)
- `SOFT_DEADLINE_SIGNAL_OBSERVED` - Tier 2: Fuzzy temporal language (advisory)
- `URGENCY_SIGNAL_OBSERVED` - Tier 3: Priority indicators (no deadline)
- `CLOSURE_SIGNAL_OBSERVED` - Resolution language detected

**Thread Lifecycle Events:**
- `THREAD_OPENED` - New thread created
- `THREAD_UPDATED` - Thread state changed
- `THREAD_ACTIVITY_OBSERVED` - Activity timestamp for silence tracking
- `THREAD_CLOSED` - Thread closed (terminal state)

**Time & Reminder Events:**
- `TIME_TICK` - Periodic urgency re-evaluation trigger
- `REMINDER_EVALUATED` - Urgency computation result
- `REMINDER_GENERATED` - Derived artifact with causal traceability (FR-19)

**Notification Events:**
- `ALERT_QUEUED` - Alert ready for delivery
- `ALERT_SENT` - Successful notification delivery
- `ALERT_FAILED` - Delivery failure

**Reporting Events:**
- `REPORT_GENERATED` - Summary report created
- `REPORT_SENT` - Report delivered to recipient

### Testing Patterns

```typescript
// Unit test pattern for runtime features
import { describe, test, expect } from "bun:test";
import { replayEvents, evaluateThreadUrgency } from "../src/watcher/runtime";

describe("FR-10: Urgency Evaluation", () => {
  test("thread with deadline in past has urgency=overdue", () => {
    const events = [
      createWatcherCreatedEvent(),
      createWatcherActivatedEvent(),
      createMessageReceivedEvent(),
      createHardDeadlineObservedEvent({ deadline_utc: Date.now() - 3600000 }),
      createThreadOpenedEvent(),
    ];
    
    const state = replayEvents(events);
    const urgency = evaluateThreadUrgency(state.threads[0], Date.now(), defaultPolicy);
    
    expect(urgency).toBe("overdue");
  });
});
```

## Architecture

The backend is the **only component** that:
- Creates and validates events
- Persists events to immutable event store
- Invokes watcher runtime for state reconstruction
- Orchestrates LLM service for fact extraction
- Dispatches notifications via worker

**Core Principle:** Events are the sole source of truth. All state is derived by replaying events.

## Key Design Constraints

**Thread-Deadline Separation:** Threads do NOT own deadlines. Deadlines belong to Reminders, which are derived artifacts. Threads track conversations and silence/inactivity.

**Router LLM Thread Creation:** The router LLM runs on every email. Thread creation is driven by extraction events (hard deadlines, soft signals, urgency signals), not by explicit user intent.

**Extraction Event Audit Trail:** Extraction events are ALWAYS emitted for audit purposes, even when a thread already exists for a message.

**Message Non-Persistence:** The system does NOT store full email body content. Only metadata is retained; bodies are discarded after LLM extraction.

**Idempotence per Watcher:** Replay idempotence is enforced at watcher scope. Same events always produce same state.

**Component Health Centralization:** All component health signals centralize to backend via `/internal/health/report`. Backend exposes unified `GET /api/system/health`.

## Implementation Status

**Overall:** 402/413 tests passing (97.3%). Core pipeline implemented and functional.

### Fully Implemented 

#### Event Types & Storage
- **Event types** (`src/events/types.ts`) - 24 event types with type guards
- **Event store** (`src/events/event-store.ts`) - PostgreSQL append-only storage with deduplication
- **Thread detection** (`src/watcher/thread-detection.ts`) - Message-ID chaining, Conversation-Index, subject+participants matching
- **Traceability** (`src/events/traceability.ts`) - Audit trail and causal chain tracking

#### Watcher Runtime & Core Logic
- **Event replay** (`src/watcher/runtime.ts`) - State reconstruction from events (MR-WatcherRuntime-1 through MR-WatcherRuntime-5)
- **Urgency evaluation** (`src/watcher/urgency.ts`) - Time-relative urgency with deadline and silence thresholds
- **Alert queuing** (`src/watcher/alert-queue.ts`) - State transition detection and reminder generation
- **Scheduler** (`src/scheduler/scheduler.ts`) - TIME_TICK generation, report scheduling (daily/weekly/monthly)

#### Email Ingestion Pipeline
- **Email parsing** (`src/ingestion/orchestrator.ts`) - RFC 5322 compliant with header extraction
- **Sender validation** (`src/ingestion/validator.ts`) - Allowlist checking, subject normalization
- **Message deduplication** - By Message-ID with duplicate tracking
- **Orchestration** - Complete MR-BackendIngestion-1 through MR-BackendIngestion-4 pipeline

#### LLM Extraction
- **Deadline extraction** (`src/llm/extractor.ts`) - Hard deadline detection with date parsing
- **Soft deadline signals** - Fuzzy temporal language detection
- **Urgency signals** - Priority/obligation indicators
- **Closure detection** - Resolution/completion language

#### Notification & Delivery
- **Alert formatting** (`src/worker/notification.ts`) - Email, webhook, SMS generation
- **Delivery infrastructure** (`src/worker/notification-worker.ts`) - Retry logic with exponential backoff
- **Channel routing** (`src/worker/worker.ts`) - Multi-channel delivery with urgency filtering

#### Authentication & Accounts
- **Password hashing** (`src/auth/password.ts`) - bcrypt cost factor 12
- **JWT tokens** (`src/auth/jwt.ts`) - Token creation, validation, refresh
- **User management** (`src/auth/users.ts`) - User CRUD operations
- **Auth middleware** (`src/auth/middleware.ts`) - Protected endpoints

### Partial / In Progress 

#### API & Integration (402/413 tests passing)
- **Test failures:** 11 tests (2.7%):
  - Subject normalization: 2 tests (unicode, tag prefixes)
  - Extraction filtering: 1 test (allowed senders)
  - Notification retry: 1 test (timeout logic)
  - Audit trail validation: 7 tests (causal chains, cycle detection)

### Not Yet Exposed

#### API Route Handlers
- Watcher CRUD endpoints (handlers exist, not in route table)
- Thread operations (handlers exist, not in route table)
- Background worker polling (code exists, not started automatically)

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
│   ├── events/             # Event types and persistence
│   │   ├── types.ts        # 24 event type definitions
│   │   ├── event-store.ts  # PostgreSQL event store
│   │   └── traceability.ts # Audit trail validation
│   ├── ingestion/          # Email processing pipeline
│   │   ├── orchestrator.ts # Complete ingestion flow (MR-BackendIngestion)
│   │   └── validator.ts    # Email validation and normalization
│   ├── llm/                # LLM extraction service
│   │   └── extractor.ts    # Deadline, urgency, closure detection
│   ├── watcher/            # Watcher runtime and state
│   │   ├── runtime.ts      # Event replay and state reconstruction
│   │   ├── urgency.ts      # Urgency evaluation logic
│   │   ├── alert-queue.ts  # Alert generation and queuing
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
  
  // Timing Thresholds
  silence_threshold_hours: number;        // Default: 72 (range: 1-720)
  deadline_warning_hours: number;         // Default: 24 (must be > critical)
  deadline_critical_hours: number;        // Default: 2 (must be > 0)
  
  // Reminder Type Control
  enable_soft_deadline_reminders: boolean;   // Whether soft signals create reminders (default: false)
  enable_urgency_signal_reminders: boolean;  // Whether urgency signals create reminders (default: false)
  
  // Notification Configuration
  notification_channels: NotificationChannel[];
  
  // Reporting Configuration
  reporting_cadence: "daily" | "weekly" | "monthly" | "on_demand";
  reporting_recipients: string[];         // Email addresses for summary reports
  reporting_time?: string;                // ISO 8601 time (e.g., "09:00:00Z")
  reporting_day?: number;                 // 1-7 for weekly, 1-31 for monthly
};
```

**Key Policy Rules:**
- `allowed_senders`: Exact email match, case-insensitive, no wildcards (empty = allow all)
- `deadline_warning_hours` must be > `deadline_critical_hours`
- At least one enabled notification channel required for activation
- Threads are always created for audit purposes; policy controls whether reminders are generated

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
<sanitized-name>-<ingest_token>@ingest.email.vigil.run
```

Examples:
- `personal-finance-a7f3k9@ingest.email.vigil.run`
- `legal-matters-b2j8m1@ingest.email.vigil.run`

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
| SMTP Adapter | Receives forwarded emails | Incoming HTTP POST |
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
