# Vigil

**Deterministic, Event-Sourced Vigilance System for Time-Sensitive Email Oversight**

## SDD Traceability

This document provides a high-level overview of the Vigil system. The authoritative specification is the [Software Design Document (SDD)](docs/SDD.md).

| Section | SDD Requirements |
|---------|------------------|
| Core Principles | [SDD 1.2 System Boundaries](docs/SDD.md#12-system-boundaries) |
| Foundational Architecture | [SDD 1.4 Core Primitives](docs/SDD.md#14-core-system-primitives), CONS-1 through CONS-8 |
| Architectural Invariants | FR-16, FR-20, CONS-1, CONS-2 |
| Watchers | [SDD 1.4 Watcher](docs/SDD.md#watcher), FR-1 through FR-4 |
| Watcher Runtime | MR-WatcherRuntime-1 through MR-WatcherRuntime-6 |
| Email Ingestion | FR-5, MR-BackendIngestion-1 through MR-BackendIngestion-4, IR-8, IR-9 |
| LLM Extraction | FR-6, FR-6b, FR-6c, FR-7, MR-LLMService-1 through MR-LLMService-5 |
| Notifications | FR-11, FR-12, MR-NotificationWorker-1 through MR-NotificationWorker-3 |
| Reports | FR-15, MR-Scheduler-2 |

For complete requirement specifications, acceptance criteria, and unit test requirements, see the [SDD](docs/SDD.md).

---

Vigil is a deterministic, event-sourced vigilance system that provides **delegated oversight** over explicitly routed email streams. The system exists to reduce the risk of quiet failure in time-sensitive email communication by observing elapsed time, silence, and stated or implied deadlines, and by surfacing advisory notifications when attention may be warranted.

## Core Principles

Vigil is intentionally constrained in scope:
- **Does NOT** access inboxes, automate replies, infer intent, assign tasks, or act autonomously
- **Does NOT** connect to financial accounts, track balances, or reconcile transactions
- **Never** becomes a decision-maker
- **Humans** retain full responsibility and control at all times

The system favors **determinism over intelligence**, **transparency over automation**, and **restraint over completeness**. Its core promise is not to manage email, but to provide confidence: confidence that important communication is being observed, that silence is not going unnoticed, and that when nothing happens, it is because nothing needs to happen—not because something was missed.

**Domain Scope:** Vigil tracks time commitments expressed in communication, not money. Bills and payment notices can be monitored, but only as communications with deadlines—Vigil extracts due dates and measures silence, nothing more. This same capability applies to legal deadlines, client requests, or any obligation expressed in language.

## Foundational Architecture

**Events are the sole source of truth.** Every fact that can influence system behavior is captured once as an immutable, append-only event. No authoritative state is stored in mutable database tables, caches, or long-lived memory. All operational state—threads, due boundaries, reminder status, closures, and notification eligibility—is always derived by replaying events in order.

This guarantees:
- **Determinism**: Same events always produce same state
- **Auditability**: Complete history of all decisions
- **Explainability**: Any alert or decision can be reconstructed offline by replaying the event log without invoking external systems or artificial intelligence

## Repository Structure

This repository is organized as a **monorepo** where each top-level directory is its own independent Git repository with network-routed service communication:

```
Vigil/
├── backend/              # Backend Control Plane (TypeScript/Bun)
│   ├── src/
│   │   ├── events/      # Event type definitions and store
│   │   ├── watcher/     # Watcher runtime executor
│   │   ├── backend/     # API and coordination layer
│   │   └── store/       # Event storage implementations
│   ├── test/            # Unit tests (centralized)
│   ├── scripts/         # Release and utility scripts
│   ├── .env.example     # Environment configuration template
│   └── package.json     # Backend dependencies
│
├── llm-service/         # LLM Extraction Service (Python/vLLM)
│   ├── .env.example     # LLM service configuration
│   └── README.md
│
├── smtp-adapter/        # Email Ingress Adapter (Lightweight SMTP)
│   ├── .env.example     # SMTP adapter configuration
│   └── README.md
│
├── frontend/            # Web UI (React/Next.js TBD)
│   ├── .env.example     # Frontend configuration
│   └── README.md
│
└── README.md            # This file
```

### Service Communication

All services communicate over HTTP/network:
- **Frontend** → Backend API (REST/WebSocket)
- **Backend** → LLM Service (HTTP API)
- **Backend** → SMTP Adapter (receives forwarded emails)
- **SMTP Adapter** → Backend (forwards raw email)

Each service has its own `.env.example` file defining connection endpoints.

## Architectural Invariants

These invariants are **non-negotiable** and define the system's foundational guarantees:

### 1. Event-Sourced Architecture

- All authoritative state is derived from immutable events
- Events are append-only and never modified or deleted
- Corrections are made by emitting new events
- Replay of events must be deterministic and side-effect free
- If a future decision depends on data, that data MUST exist in an event

### 2. No Long-Lived Mutable State

- Do NOT store authoritative thread, reminder, or watcher state in a database
- Do NOT rely on in-memory state across runs
- Databases may store:
  - Immutable events
  - Disposable projections
- Projections must be rebuildable from events at any time

### 3. No Agent Behavior

- No background reasoning loops
- No retry-until-success logic
- No feedback cycles where outputs influence control flow
- No LLM calls during replay
- No LLM deciding what happens next

### 4. LLM as Fact Extraction Appliance Only

- LLMs may ONLY extract structured facts from email text
- LLM outputs are frozen into immutable events
- LLMs NEVER:
  - Schedule work
  - Emit events
  - Influence control flow
  - Retry autonomously
- The system must function correctly if the LLM is offline

### 5. Thread Model (Tracked Conversations)

- **Threads represent tracked conversations**, not just obligations
- The router LLM runs on every inbound email and determines thread creation based on what it detects
- Thread creation is driven by extraction, NOT by explicit user intent
- **Threads do NOT own deadlines**—deadlines belong to Reminders derived from threads
- Threads are monitored for silence (no new messages) and inactivity (no updates)
- **Core tracking feature:** When communications were sent, responded to, fulfilled, and when obligations were due
- Threads cannot be merged or reassigned to different watchers
- Threads may be closed:
  - a) Automatically when an email contains explicit, evidence-backed closure language
  - b) Manually by a user through the dashboard
- **Closure is terminal**: Once closed, a thread can **NEVER** reopen
- Closed threads are preserved for tracking and audit, but excluded from reports by default
- Subsequent emails may create new threads if they introduce new signals, but they never resurrect closed ones

### 6. Message Model (Non-Persistence)

- **Messages are NOT persisted as first-class entities**
- The system does NOT store full email body content after ingestion
- Only metadata is retained: from, subject, headers, received_at, original_date
- Email bodies are parsed, sent to LLM for extraction, then discarded
- If a watcher misses an email, the sender must resend and clearly label it as forwarded/resent
- This constraint preserves state machine integrity and minimizes PII storage
- All metadata is tracked for user traceability and transparency

### 7. Reminder Model (Urgency)

- Reminder state is **derived and time-relative**, not stored as authoritative data
- **Reminders carry deadline information**—deadlines belong to reminders, not threads
- `deadline_type` and `deadline_utc` are reminder-level fields
- Computed on demand by comparing current time to extraction event deadlines and last observed activity, using policy-defined thresholds
- **Time never changes facts—only urgency**
- **Alerts fire only on state transitions** (e.g., from stable to due), never on steady state, and only once per transition
- This prevents alert fatigue, duplication, and drift
- Closed threads never alert

### 8. Extraction Event Audit Trail

- Extraction events are ALWAYS emitted and persisted for audit purposes
- Even when a thread already exists for a message
- Even when policy would not generate reminders
- Extraction events form the complete audit trail of what the LLM detected

### 9. Watcher Deletion

- Watchers are deletable entities
- Deletion removes the oversight role without mutating historical data
- All historical threads, extraction records, and events remain in the event store
- Deleted watchers do not receive TIME_TICKs or generate reports

### 10. Data Traceability

- All pipeline data is tracked and saved for user transparency
- Every email captured with: received_at, from, original_date, threading metadata
- Every extraction event persisted with source_span and causal_event_id
- Complete trace from alert → reminder → thread → extraction → message possible

## System Components

Vigil consists of these components with **strict boundaries**:

1. **Backend Control Plane** (authoritative)
2. **Event Store** (authoritative)
3. **Watcher Runtime Executor** (stateless)
4. **Email Ingress Adapter** (SMTP listener, non-authoritative)
5. **LLM Extraction Service** (separate deployable, non-authoritative)
6. **Notification Worker** (non-authoritative)
7. **Frontend** (read-heavy, no business logic)

**ONLY the Backend Control Plane may make decisions.**

## Core Concepts

### Watchers

The **watcher** is the primary configuration and operational unit in Vigil. A watcher represents a bounded area of responsibility, such as personal finance, legal correspondence, or client billing.

#### Watcher Properties

Each watcher is defined by the following immutable and mutable properties:

**Identity Properties (Immutable):**
- `watcher_id` (string): Unique UUID identifier, assigned at creation, never changes
- `account_id` (string): Parent account identifier
- `ingest_token` (string): Unique cryptographic token for email routing (e.g., `a7f3k9`)
- `created_at` (number): Unix timestamp (milliseconds) when watcher was created
- `created_by` (string): User ID of creator

**Configuration Properties (Mutable via POLICY_UPDATED events):**
- `name` (string): Human-readable name (e.g., "Personal Finance", "Legal Matters")
  - Used in email subjects, dashboard display, and reports
  - Can be updated by users
  - Must be non-empty, max 100 characters

- `status` (enum): Operational state, derived from lifecycle events
  - `"created"` - Watcher exists but not yet activated
  - `"active"` - Monitoring enabled, threads open, alerts fire
  - `"paused"` - Monitoring suspended, no new threads, no alerts
  - Transitions: created → active (WATCHER_ACTIVATED), active ⇄ paused (WATCHER_PAUSED/RESUMED)

**Policy Configuration (WatcherPolicy object):**

```typescript
type WatcherPolicy = {
  allowed_senders: readonly string[];        // Email allowlist
  silence_threshold_hours: number;           // Silence detection window
  deadline_warning_hours: number;            // Warning threshold before deadline
  deadline_critical_hours: number;           // Critical threshold before deadline
  notification_channels: readonly NotificationChannel[];
  reporting_cadence: "daily" | "weekly" | "on_demand";
  reporting_recipients: readonly string[];   // Email addresses for reports
};

type NotificationChannel = {
  type: "email" | "webhook";
  destination: string;                       // Email address or webhook URL
  urgency_filter: "all" | "warning" | "critical"; // Minimum urgency to notify
};
```

**Policy Field Definitions:**

- `allowed_senders` (string[]): Email addresses permitted to create threads
  - Exact match only (no wildcards or domains)
  - Empty array = accept from anyone (not recommended)
  - Example: `["alice@example.com", "bob@company.org"]`
  - Emails from non-allowed senders are logged but don't create threads

- `silence_threshold_hours` (number): Hours of inactivity before silence alerts
  - Default: 72 (3 days)
  - Minimum: 1, Maximum: 720 (30 days)
  - Applies only to threads without explicit deadlines
  - Timer resets on any thread activity (incoming or outgoing email)

- `deadline_warning_hours` (number): Hours before deadline to trigger warning alert
  - Default: 24 (1 day)
  - Must be greater than `deadline_critical_hours`
  - Alert fires once when urgency transitions from "ok" to "warning"

- `deadline_critical_hours` (number): Hours before deadline to trigger critical alert
  - Default: 2
  - Must be positive
  - Alert fires once when urgency transitions from "warning" to "critical"

- `notification_channels` (NotificationChannel[]): Where to send alerts
  - At least one channel required when watcher is activated
  - Multiple channels supported (email + webhook)
  - Each channel has urgency filter (e.g., only critical alerts to webhook)
  - Delivery failures are recorded but don't block system

- `reporting_cadence` (enum): How often to send summary reports
  - `"daily"` - Every 24 hours at configured time
  - `"weekly"` - Every 7 days at configured day/time
  - `"on_demand"` - Only when explicitly requested by user

- `reporting_recipients` (string[]): Email addresses to receive reports
  - Separate from notification channels
  - Can overlap with allowed_senders
  - Reports are informational, not alerts

#### Email Routing

Each watcher has a unique ingestion email address constructed from its name and token:

```
<name>-<token>@ingest.vigil.email
```

**Examples:**
```
finance-a7f3k9@ingest.vigil.email
legal-b2j8m1@ingest.vigil.email
client-billing-x4p9j2@ingest.vigil.email
```

**Routing Rules:**
- Routing is determined **solely by recipient address**
- Email content, subject, or sender is **never** examined for routing
- This ensures explicit user intent and prevents misclassification
- Invalid tokens are rejected at SMTP layer (not forwarded to backend)

#### Watcher Lifecycle

**Creation:**
1. User creates watcher via dashboard (POST /api/watchers)
2. Backend emits WATCHER_CREATED event
3. System generates unique watcher_id and ingest_token
4. Status = "created" (not yet monitoring)

**Activation:**
1. User activates watcher (POST /api/watchers/:id/activate)
2. Backend validates policy (at least one notification channel)
3. Backend emits WATCHER_ACTIVATED event
4. Status = "active" (monitoring begins)

**Pause:**
1. User pauses watcher (POST /api/watchers/:id/pause)
2. Backend emits WATCHER_PAUSED event
3. Status = "paused"
4. Existing threads remain but no alerts fire
5. New emails are accepted but don't create threads

**Resume:**
1. User resumes watcher (POST /api/watchers/:id/resume)
2. Backend emits WATCHER_RESUMED event
3. Status = "active"
4. Existing threads re-evaluate urgency
5. New emails can create threads again

#### Watcher Ownership

Each watcher owns:
- Its own isolated event stream
- All threads created from its ingestion address
- All reminders and due boundaries for those threads
- Its policy configuration history
- Its notification and reporting settings

**Watchers never:**
- Share threads with other watchers
- Access other watchers' events
- Inherit configuration from account defaults

### Watcher Runtime

The watcher runtime is **not a long-lived process or agent**. It is a stateless execution invoked only when:
- An event occurs (email ingestion, user action)
- A scheduled time evaluation triggers

On each invocation:
1. Load watcher's events
2. Reconstruct state via replay
3. Apply deterministic transition rules
4. Emit any new events
5. Exit

**No background loops, no waiting, no hidden memory, no autonomous behavior.** The illusion of continuous vigilance emerges from repeated, short-lived evaluations triggered by events, not from an always-running system.

### Email Ingestion

Email ingestion is handled through a lightweight, **non-authoritative transport adapter**—typically a minimal SMTP listener.

**SMTP Adapter responsibilities:**
- Accept email delivery
- Extract watcher address
- Forward raw message to backend ingestion endpoint
- **Does NOT** store email, apply business logic, or make decisions

**Backend ingestion layer:**
- Parses and normalizes message
- Validates sender allowlists
- Performs deduplication
- Emits canonical `MESSAGE_RECEIVED` event

At the moment of event emission, the email becomes part of Vigil's permanent record. **No inference or state mutation occurs prior to event creation.**

### LLM as Fact Extractor

Artificial intelligence is used in a **strictly bounded and subordinate role**. Language models are employed only to extract structured facts from email text:
- Deadlines
- Silence-sensitive language
- Explicit closure confirmations

**LLM Constraints:**
- Never plan, infer intent, decide outcomes, or influence control flow
- Each email triggers **at most one extraction task**
- Outputs are frozen into immutable events (e.g., `HARD_DEADLINE_OBSERVED`, `CLOSURE_SIGNAL_OBSERVED`) with verbatim evidence quotes
- **Never invoked during event replay, reminder evaluation, reporting, or auditing**
- If LLM service is unavailable, system continues to function safely with reduced informational fidelity

**LLM Service:**
- Separate deployment (Python/vLLM)
- Private network only
- HTTP endpoints:
  - `/extract/deadline` - Extract hard deadline information
  - `/extract/soft_deadline` - Extract soft deadline signals
  - `/extract/urgency` - Extract urgency signals (questions, requests)
  - `/extract/closure` - Detect explicit closure
- Returns structured JSON + verbatim evidence
- Does NOT chain prompts, call tools, retry autonomously, or emit events

### Notifications and Reports

Notifications and reports are the **only outward-facing actions** Vigil performs.

**Alerts:**
- Generated based on derived watcher state
- Delivered through separate notification worker
- Delivery outcomes recorded as events (audit trail)

**Reports:**
- Intentionally **reassurance-first**
- Emphasize what appears resolved or stable before highlighting items requiring attention
- All reported statuses are traceable to specific observed emails and elapsed time
- Generated on configurable cadence (daily, weekly, on-demand)

### Dashboard Interface

The dashboard is a **read-heavy inspection surface**, not a system of record.

**Displays:**
- Projections derived from events
- Current threads, due boundaries, reminder status
- Extracted signals and timelines

**User Actions:**
- Pause/resume watchers
- Manually close threads
- Configure watcher policies

**All authoritative changes flow through event creation.**

### State Reconstruction (How You See Current State)

When you log in and view your watcher's threads and reminders, the system provides current state through a **two-tier approach**:

**For Most Watchers (< 10,000 events):**
- Every dashboard query **replays all events in real-time**
- Guarantees 100% accuracy (no stale data possible)
- Response time: 50-200ms
- This is the default and works for most users

**For High-Volume Watchers (> 10,000 events):**
- Queries read from **cached projections** (derived tables)
- Projections are **disposable and rebuildable** from events
- If projection is missing/stale, system falls back to replay
- Response time: < 10ms
- Urgency is still computed in real-time (time-relative)

**Event Log View:**
- Always a direct read from event store
- No replay or derivation
- Shows raw immutable facts with timestamps
- Complete audit trail of all actions

**Key Guarantee:**  
*If you replay events, you MUST get the same state as displayed. If not, the projection is corrupted and automatically rebuilds.*

See [System Design Document - Section 7.3](docs/SYSTEM_DESIGN.md#73-state-reconstruction-and-query-strategy) for complete implementation details.


## System Components

### 1. Backend Control Plane (TypeScript/Bun)

**Location:** `backend/` (independent Git repository)

The authoritative decision-making component.

**Responsibilities:**
- Expose HTTPS API for frontend
- Create and validate events
- Persist events to immutable event store (append-only)
- Invoke watcher runtime on triggers
- Rebuild state via event replay
- Coordinate scheduled evaluations
- Dispatch notifications
- Call LLM service for fact extraction

**Architecture:**
- Stateless HTTP API
- Event-sourced state management
- Network-routed communication with LLM service and SMTP adapter

**Configuration:** See `backend/.env.example`

**Development:**
```bash
cd backend
bun install
bun test              # Run all tests
bun run dev           # Development mode
bun run check         # All checks (typecheck, lint, format, test)
```

### 2. LLM Extraction Service (Python/vLLM)

**Location:** `llm-service/` (independent Git repository)

Fact extraction service using vLLM for inference.

**Responsibilities:**
- Extract deadlines from email text
- Extract risk/silence-sensitive language
- Extract explicit closure signals
- Optional: Route emails to existing threads

**Architecture:**
- Separate deployment (can run on different machine/GPU)
- Private network only
- HTTP API for single-task extraction
- Returns structured JSON + verbatim evidence

**Constraints:**
- One task per request (no chaining)
- No tool calling
- No autonomous retries
- No event emission
- Outputs frozen into backend events

**Configuration:** See `llm-service/.env.example`

**Tech Stack:**
- Python 3.11+
- vLLM for inference
- FastAPI for HTTP endpoints

### 3. SMTP Adapter (Lightweight Transport)

**Location:** `smtp-adapter/` (independent Git repository)

Lightweight, non-authoritative email ingress layer.

**Responsibilities:**
- Listen for SMTP connections on configured port
- Accept email delivery
- Extract watcher address from recipient
- Forward raw email bytes to backend ingestion endpoint

**Constraints:**
- **Never stores** emails persistently
- **Never applies** business logic or makes decisions
- **Never emits** events directly (only backend does)
- Operates as transparent transport layer

**Architecture:**
- Minimal SMTP server (can run on same machine as backend but network-routed)
- Forwards to backend HTTP API
- Rate limiting and basic security

**Configuration:** See `smtp-adapter/.env.example`

**Tech Stack:**
- Node.js/TypeScript or Python
- SMTP library (minimal)

### 4. Frontend (Web UI)

**Location:** `frontend/` (independent Git repository)

Read-heavy inspection and control interface.

**Responsibilities:**
- Display thread status, due boundaries, urgency
- Display alerts and notification history
- Show extracted signals and timelines
- Allow manual thread closure
- Configure watcher policies and notification preferences
- Pause/resume watchers

**Architecture:**
- Communicates with backend via REST API
- Optional: WebSocket for real-time updates
- Displays projections (not authoritative state)
- All mutations flow through backend event creation

**Constraints:**
- **No business logic** in frontend
- **No direct database access**
- All state derived from backend API responses

**Configuration:** See `frontend/.env.example`

**Tech Stack:**
- React/Next.js or similar (TBD)
- TypeScript
- REST API client

## Getting Started

### Prerequisites

- **Backend**: Bun runtime
- **LLM Service**: Python 3.11+, GPU (recommended), vLLM
- **SMTP Adapter**: Node.js or Python
- **Frontend**: Node.js/Bun

### Initial Setup

Each component is an independent repository. Set up each one:

#### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
bun install
bun test
bun run dev
```

#### 2. LLM Service

```bash
cd llm-service
cp .env.example .env
# Edit .env with model configuration
# Follow llm-service/README.md for Python setup
```

#### 3. SMTP Adapter

```bash
cd smtp-adapter
cp .env.example .env
# Edit .env with backend URL
# Follow smtp-adapter/README.md for setup
```

#### 4. Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env with backend API URL
# Follow frontend/README.md for setup
```

### Network Configuration

Services communicate over HTTP. Example development setup:

| Service | Address | Purpose ||
| Backend | `http://localhost:3000` | Main API |
| LLM Service | `http://localhost:8000` | Fact extraction |
| SMTP Adapter | `smtp://localhost:2525` | Email ingestion |
| Frontend | `http://localhost:5173` | Web UI |

For production or distributed deployment, update `.env` files accordingly.

## Documentation

For complete implementation details, see the **[System Design Document](docs/SYSTEM_DESIGN.md)**.

### Key Documents
- **[System Design Document](docs/SYSTEM_DESIGN.md)** - Complete implementation-grade specification
- **[Documentation Index](docs/README.md)** - Full documentation catalog
- **[Backend README](backend/README.md)** - Backend control plane details
- **[LLM Service README](llm-service/README.md)** - Fact extraction service details
- **[SMTP Adapter README](smtp-adapter/README.md)** - Email ingress details
- **[Frontend README](frontend/README.md)** - Dashboard interface details

## Event Model

Events are the single source of truth. See [backend/src/events/types.ts](backend/src/events/types.ts) for complete definitions.

**Event categories include:**

- **Control Plane:** Account, User, Watcher, Policy
- **Email Ingress:** Email received
- **LLM Extraction:** Deadline, Risk, Closure (frozen facts)
- **Thread Lifecycle:** Opened, Updated, Activity Seen, Closed
- **Time & Reminders:** Time Tick, Reminder Evaluated
- **Notifications:** Alert Queued, Sent, Failed
- **Reporting:** Report Generated, Sent

**Forbidden events:**
- `THREAD_REOPENED`
- `AGENT_LOOP_STARTED`
- `AUTO_ESCALATED`
- `INBOX_SCANNED`
- `LLM_RETRIED`

## Coding Rules

When writing code, ALWAYS:

- Start from events
- Ask: "What event makes this true?"
- Ensure replay requires ZERO external calls
- Ensure determinism
- Ensure no state survives process exit
- Use explicit types for all domain objects

**If behavior cannot be explained purely by replaying events, it is WRONG.**

## What NOT to Do

DO NOT:

- Add background schedulers inside business logic
- Add mutable DB tables for state
- Add retry loops for LLM calls
- Add agent frameworks or chains
- Add inbox access or email automation
- Add confidence-based escalation
- Add magic heuristics

## Mental Model

- **Events are truth**
- **Replay is the debugger**
- **LLMs create facts once**
- **Code makes decisions**
- **Time only affects urgency**
- **Closed threads never reopen**

## License

Proprietary. All rights reserved.
