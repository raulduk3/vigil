# Backend - Vigil Control Plane

**TypeScript/Bun Backend Service**

Backend control plane for Vigil vigilance system. This is the **authoritative decision-making component** that orchestrates all system behavior through event-sourced architecture.

## SDD Traceability

The [Software Design Document (SDD)](../docs/SDD.md) is the **authoritative source of truth** for all system requirements. This backend service implements the following requirements:

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| Event Store | MR-EventStore-1, MR-EventStore-2, MR-EventStore-3 |
| Watcher Runtime | MR-WatcherRuntime-1, MR-WatcherRuntime-2, MR-WatcherRuntime-3, MR-WatcherRuntime-4, MR-WatcherRuntime-5, MR-WatcherRuntime-6 |
| Backend Ingestion | MR-BackendIngestion-1, MR-BackendIngestion-2, MR-BackendIngestion-3, MR-BackendIngestion-4 |
| LLM Orchestration | FR-7, FR-7a, FR-8, FR-10, FR-11, FR-12, FR-13 |
| Notification Worker | MR-NotificationWorker-1, MR-NotificationWorker-2, MR-NotificationWorker-3, FR-14 |
| Scheduler | MR-Scheduler-1, MR-Scheduler-2 |
| API Endpoints | FR-2, FR-3, FR-4, FR-5, FR-6, FR-6b, FR-6c, FR-9, FR-15 |
| Event Sourcing | FR-16, CONS-1, CONS-2, CONS-3, CONS-4, CONS-5, CONS-6, CONS-7, CONS-8 |
| Security | SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, SEC-6, SEC-7, SEC-8 |
| User & Account Management | FR-17 (Access Control), SEC-1, SEC-2 |

See [SDD Section 5: Implementation Coverage Table](../docs/SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Implementation Coverage Contribution

This component contributes **~60%** of overall project implementation. The backend is the authoritative decision-making component.

### Coverage by Category

| Category | Backend Owns | Total in SDD | Coverage |
|----------|--------------|--------------|----------|
| Feature Requirements (FR) | 16 of 22 | 22 | 73% |
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
  plan: "free" | "pro" | "enterprise";  // Subscription tier
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

4. All Protected Endpoints
   └─→ Require Authorization: Bearer {token}
   └─→ Backend extracts user_id, account_id from JWT
   └─→ Validates watcher.account_id === user.account_id
```

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
| SEC-7: Rate Limiting | 1000 req/min per account |
| SEC-8: Token Scope | JWTs scoped to account_id |

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

All event types are defined in `src/events/types.ts`. When implementing features:

- **Baseline events:** MESSAGE_RECEIVED (always emitted first)
- **Extraction events:** HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED
- **Thread events:** THREAD_OPENED, THREAD_ACTIVITY_OBSERVED, THREAD_CLOSED
- **Reminder events:** REMINDER_GENERATED (derived artifact)
- **Alert events:** ALERT_QUEUED, ALERT_SENT, ALERT_FAILED

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

## Features Implemented

### Event Store (MR-EventStore-1 through 3)
- **Append-only storage** - Immutable event persistence
- **Event retrieval** - By watcher, with pagination and filtering
- **Deduplication** - Prevent duplicate events by event_id
- **PostgreSQL backend** - JSONB storage with timestamp ordering

### Watcher Runtime (MR-WatcherRuntime-1 through 5)
- **Event replay** - Reconstruct state from event sequence
- **Thread state reconstruction** - Apply thread lifecycle events
- **Urgency computation** - Calculate time-relative urgency (ok/warning/critical/overdue)
- **State transition detection** - Identify changes requiring alerts
- **Reminder generation** - Create derived artifacts with causal traceability

### Backend Ingestion (MR-BackendIngestion-1 through 4)
- **Email parsing** - RFC 5322 compliant parsing
- **Sender validation** - Allowlist checking
- **Message deduplication** - By Message-ID or content hash
- **Event emission** - MESSAGE_RECEIVED, extraction records

### LLM Orchestration
- **Extraction calls** - Deadlines, soft signals, urgency, closure
- **Response validation** - Schema enforcement, source_span verification
- **Failure handling** - Graceful degradation when LLM unavailable

### Notification Worker (MR-NotificationWorker-1 through 3)
- **Alert delivery** - Email via SMTP, webhooks via HTTP POST
- **Retry logic** - Exponential backoff (1s, 5s, 25s)
- **Delivery tracking** - ALERT_SENT/ALERT_FAILED events

### Scheduler (MR-Scheduler-1 through 2)
- **TIME_TICK generation** - Periodic urgency re-evaluation
- **Report scheduling** - Daily/weekly/monthly cadence

### API Surface
```
# Authentication
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh

# Watcher Management (FR-1 through FR-4)
GET    /api/watchers
POST   /api/watchers
GET    /api/watchers/:id
PUT    /api/watchers/:id/policy
POST   /api/watchers/:id/activate
POST   /api/watchers/:id/pause
POST   /api/watchers/:id/resume

# Thread Operations (FR-8, FR-9)
GET    /api/watchers/:id/threads
POST   /api/threads/:id/close

# Email Ingestion (FR-5)
POST   /api/ingestion/email

# Event Log (FR-14)
GET    /api/watchers/:id/events

# Reports (FR-15)
POST   /api/watchers/:id/reports
```

## Structure

```
backend/
├── src/
│   ├── index.ts            # Entry point
│   ├── events/             # Event types and store
│   │   ├── types.ts        # Event type definitions (20+ types)
│   │   └── event-store.ts  # PostgreSQL event store
│   ├── watcher/            # Watcher runtime executor
│   │   └── runtime.ts      # Stateless replay engine
│   ├── backend/            # API and coordination (TBD)
│   │   ├── api/            # HTTP routes
│   │   ├── ingestion/      # Email processing
│   │   └── worker/         # Notification delivery
│   └── store/              # Storage implementations (TBD)
├── test/                   # Centralized unit tests
│   ├── events/             # Event store tests
│   └── watcher/            # Watcher runtime tests
├── scripts/                # Utility scripts
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
- `status`: `"created"` | `"active"` | `"paused"`
- `policy`: Complete policy configuration (mutable)

### Policy Configuration (WatcherPolicy)

```typescript
type WatcherPolicy = {
  allowed_senders: string[];              // Email allowlist
  silence_threshold_hours: number;        // Default: 72
  deadline_warning_hours: number;         // Default: 24
  deadline_critical_hours: number;        // Default: 2
  notification_channels: NotificationChannel[];
  reporting_cadence: "daily" | "weekly" | "on_demand";
  reporting_recipients: string[];
};
```

**Key Policy Rules:**
- `allowed_senders`: Exact email match, case-insensitive, no wildcards
- `deadline_warning_hours` must be > `deadline_critical_hours`
- At least one enabled notification channel required for activation
- Thresholds: silence (1-720 hours), warning (> critical), critical (> 0)

### Lifecycle Events

**Creation:** `WATCHER_CREATED` → status = "created"
**Activation:** `WATCHER_ACTIVATED` → status = "active" (monitoring begins)
**Pause:** `WATCHER_PAUSED` → status = "paused" (monitoring suspended)
**Resume:** `WATCHER_RESUMED` → status = "active" (monitoring resumes)
**Policy Change:** `POLICY_UPDATED` → new policy applies immediately

### Email Routing

Each watcher has a unique ingestion address:
```
<sanitized-name>-<ingest_token>@ingest.vigil.email
```

Examples:
- `personal-finance-a7f3k9@ingest.vigil.email`
- `legal-matters-b2j8m1@ingest.vigil.email`

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
