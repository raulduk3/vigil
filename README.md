# Vigil

**Email Response Monitoring & Time-Sensitive Communication Oversight**

---

## What is Vigil?

Vigil is a **delegated oversight system** that monitors time-sensitive email communication on your behalf. Instead of scanning your inbox, Vigil watches a dedicated email address where you forward important messages. It automatically detects deadlines, tracks response times, and surfaces advisory reminders—while giving you **complete control** to correct, edit, merge, or dismiss anything it extracts.

### The Core Value Proposition

**Know how quickly emails are sent, received, and responded to.**

Vigil monitors communication patterns and surfaces insights about:
- ⏱️ **Response times** — How long until replies arrive
- 📅 **Deadline tracking** — Explicit dates extracted from email text
- 🔇 **Silence detection** — When conversations go quiet too long
- ✅ **Closure confirmation** — When obligations are explicitly completed

### The Problem Vigil Solves

Email is where obligations live. Invoices arrive with due dates. Clients ask questions expecting responses. Legal notices carry deadlines. Yet email clients are designed for reading and replying, not for tracking what's been promised, when it's due, and whether anyone followed up.

**Quiet failures** happen when:
- A deadline passes unnoticed in a crowded inbox
- No one responds to an important request, and no one notices the silence
- An obligation is acknowledged but never fulfilled

Vigil provides **confidence through observation**—the assurance that important communication is being watched, and that silence is not going unnoticed.

### How Vigil Works

1. **You forward emails** to a unique Vigil address (e.g., `finance-a7f3k9@ingest.email.vigil.run`)
2. **Vigil automatically extracts facts** from the email: deadlines, urgency signals, closure confirmations
3. **Reminders are created automatically** — The system actively monitors them
4. **Vigil tracks silence** and elapsed time against your configured thresholds
5. **Vigil alerts you** when urgency changes—when a deadline approaches, when silence stretches too long
6. **You can correct mistakes** — Edit, merge, dismiss, or reassign when the LLM gets it wrong (~10% of cases)
7. **You take action** based on the advisory notification (Vigil never acts for you)

### What Makes Vigil Different

- ✅ **Automated extraction with correction capability** — LLM creates reminders automatically; you fix the ~10% it gets wrong
- ✅ **Full audit trail** — Every extraction, correction, and override is traceable
- ✅ **One email, multiple concerns** — A single email can generate multiple independent reminders
- ✅ **Flexible thread association** — Messages can be associated with multiple threads; associations are editable
- ✅ **Portable reminders** — Semantic obligations can be moved between threads
- ✅ **Conflict detection** — Duplicate reminders and conflicting deadlines are flagged for review
- ✅ **Manual overrides persist** — Your corrections are never overwritten by automation
- ✅ **Grounded extraction** — Every LLM output must cite a verbatim source span or it's discarded

### What Vigil Does NOT Do

Vigil is **intentionally constrained**:
- ❌ Does NOT access your inbox or scan your email
- ❌ Does NOT send replies or automate any email actions
- ❌ Does NOT resolve conflicts automatically—it flags them for review
- ❌ Does NOT connect to financial accounts or track payments
- ❌ Does NOT override your manual corrections
- ❌ Does NOT hide its reasoning—every decision is traceable to source text

**Humans retain full responsibility and can correct any automated decision.**

---

## Core Design Principles

### 1. Automated Extraction with Correction Capability

The LLM **automatically extracts reminders** from email text—and ~90% of the time it's correct. When it makes mistakes:
- Users can **edit** any extracted reminder (deadline, description, urgency)
- Users can **merge** duplicate or related reminders
- Users can **dismiss** incorrect extractions
- Users can **reassign** reminders to different threads
- Users can **create** manual reminders not detected by the system

Every extraction and every correction is captured in the event log, making the system's reasoning fully traceable.

### 2. Full Traceability for Corrections

When users correct the system, those corrections:
- Are captured as events in the audit log
- **Always override** automated decisions and persist permanently
- Can be reasoned about by replaying the event log
- Provide feedback signal for understanding extraction accuracy

Manual user actions **always take precedence** over automation.

### 3. One Email, Multiple Concerns

A single email may contain multiple independent obligations:
- "Please send the report by Friday and schedule a call for next week"
- Each concern becomes a separate reminder candidate
- Users control whether to keep, merge, or dismiss each one

### 4. Flexible Message-Thread Association

Messages affect thread state (activity timestamps, participant lists, etc.), so moving them is complex. Vigil uses a **copy and deactivate** model:

- Messages can be **associated** with multiple threads
- When a message is "removed" from a thread, it's **deactivated** (hidden), not deleted
- Deactivated messages don't affect thread matching or activity calculations
- The original association is preserved in the event log for traceability
- Thread matching only considers **active** message associations

### 5. Conflict Detection, Not Resolution

When the system detects ambiguity, it **surfaces the conflict** rather than resolving it:
- Duplicate reminders across threads → Flagged for user review
- Conflicting deadlines in the same thread → Highlighted, not merged
- Overlapping obligations → Displayed together for comparison

**Design for visibility and control of ambiguity, not automatic resolution.**

### 6. Grounded Extraction via Regex + LLM

All LLM outputs must be grounded in verifiable text:
1. **Regex extractor** identifies candidate spans (dates, keywords, patterns)
2. **LLM** interprets context and extracts structured facts
3. **Validation** ensures every extraction cites a `source_span` that exists in the original text
4. **Ungrounded outputs are discarded** — no hallucinated deadlines

---

## Response Time Monitoring

A key capability of Vigil is tracking **communication velocity**:

### What Vigil Tracks

| Metric | Description |
|--------|-------------|
| **Time to First Response** | How long until someone replies to an email |
| **Silence Duration** | How long since the last activity in a thread |
| **Deadline Proximity** | How close a stated deadline is |
| **Activity Patterns** | When emails are sent, received, and replied to |

### How It Works

```
Email A sent (10:00 AM)
    ↓
Email B received (2:00 PM) → 4 hours elapsed
    ↓
Silence begins...
    ↓
48 hours later → WARNING: Silence threshold exceeded
    ↓
72 hours later → CRITICAL: No response
```

### Use Cases

- **Client Management**: Know if clients are responding promptly
- **Vendor Tracking**: Ensure suppliers meet response expectations
- **Legal Compliance**: Document response times for regulatory requirements
- **Team Accountability**: Track internal communication patterns

---

## SDD Traceability

This document provides a high-level overview of the Vigil system. The authoritative specification is the [Software Design Document (SDD)](docs/SDD.md).

| Section | SDD Requirements |
|---------|------------------|
| Core Design Principles | FR-16, FR-20, CONS-1, CONS-2, CONS-7, CONS-8 |
| Grounded Extraction | MR-LLMService-3 (Source Span Validation) |
| User Control | FR-9 (Manual Closure), User Override Events |
| Response Time Monitoring | FR-10, MR-WatcherRuntime-3, MR-WatcherRuntime-4 |
| Conflict Detection | Advisory extraction, duplicate flagging |
| Reminder Lifecycle | FR-6, FR-6b, FR-6c, FR-7, FR-8 |
| Event Sourcing | CONS-1 through CONS-8 |
| Security | SEC-1 through SEC-8 |

For complete requirement specifications, acceptance criteria, and unit test requirements, see the [SDD](docs/SDD.md).

---

## Foundational Architecture

**Events are the sole source of truth.** Every fact that can influence system behavior is captured once as an immutable, append-only event. No authoritative state is stored in mutable database tables, caches, or long-lived memory. All operational state—threads, reminders, closures, and notification eligibility—is always derived by replaying events in order.

This guarantees:
- **Determinism**: Same events always produce same state
- **Auditability**: Complete history of all decisions and user corrections
- **Explainability**: Any alert or decision can be reconstructed offline by replaying the event log
- **User Control**: Manual overrides are events that persist and take precedence

### Reminder Lifecycle

```
Email Arrives
    ↓
Regex Extraction (find candidate spans)
    ↓
LLM Interpretation (extract structured facts)
    ↓
Source Span Validation (must match original text)
    ↓
REMINDERS CREATED AUTOMATICALLY
    ↓
System Monitors for Urgency Changes
    ↓
If LLM was wrong (~10% of cases):
    ├── Edit → Correct the reminder details
    ├── Merge → Combine with another reminder
    ├── Dismiss → Remove from monitoring (audit preserved)
    └── Reassign → Move to different thread
    ↓
Urgency Evaluation → Alerts on State Transitions
```

### Reminders as Portable Semantic Obligations

**Reminders are independent of threads.** They represent semantic obligations (deadlines, requests, tasks) that can be:

- **Created** from LLM extraction or manually by users
- **Moved** between threads without affecting the original thread's message history
- **Monitored** for urgency regardless of which thread they're attached to
- **Deactivated** from a thread while remaining in the audit log

This separation allows:
- A single email to generate multiple reminders for different threads
- Reminders to be reassigned when the LLM associates them with the wrong conversation
- Thread activity tracking to remain accurate even when reminders are moved

### Message-Thread Associations

Messages have **implications** on thread state (activity timestamps, participant lists, silence calculations). The association model:

```
Message M is associated with Thread T
    ↓
Association is ACTIVE by default
    ↓
If user removes M from T:
    └── Association becomes INACTIVE (hidden)
    └── M no longer affects T's calculations
    └── Original association preserved in event log
    ↓
If user adds M to new Thread T2:
    └── New ACTIVE association created
    └── M now affects T2's calculations
```

This "soft association" model allows:
- Messages to be logically reorganized without losing history
- Thread matching to only consider active associations
- Full traceability of all association changes

### Key Invariants

1. **Automated with Correction**: LLM creates reminders automatically; users fix mistakes
2. **Source Span Required**: Every extraction must cite verbatim text from the email
3. **User Overrides Persist**: Manual corrections are never overwritten by automation
4. **Reminders are Portable**: Can be moved between threads without data loss
5. **Associations are Soft**: Messages can be deactivated from threads, not deleted

## Repository Structure

This repository is organized as a **monorepo** where each top-level directory is its own independent Git repository with network-routed service communication:

```
Vigil/
├── backend/              # Backend Control Plane (TypeScript/Bun) - ACTIVE
│   ├── src/
│   │   ├── api/         # HTTP handlers (Hono framework)
│   │   ├── auth/        # JWT + OAuth (Google/GitHub) + password reset
│   │   ├── billing/     # Stripe integration (4 tiers: free/starter/pro/enterprise)
│   │   ├── db/          # PostgreSQL client and event store
│   │   ├── events/      # Event type definitions (45+ types), store, validation, traceability
│   │   ├── ingestion/   # Email pipeline orchestration
│   │   ├── llm/         # LLM extraction interface (with regex fallback)
│   │   ├── logging/     # Structured per-entity logging
│   │   ├── scheduler/   # TIME_TICK generation (15-min intervals)
│   │   ├── security/    # PII sanitizer, rate limiter, webhook signing
│   │   ├── watcher/     # Runtime, urgency evaluation, thread detection, alert queue
│   │   └── worker/      # Notification worker with retry
│   ├── test/            # Unit tests (watcher/, events/, api/, billing/, etc.)
│   ├── scripts/         # Release and utility scripts
│   ├── .env.example     # Environment configuration template
│   └── package.json     # Backend dependencies
│
├── frontend/            # Web UI (Next.js 14) - ACTIVE
│   ├── src/
│   │   ├── app/         # App Router pages (auth, dashboard, watchers, account, learn)
│   │   ├── components/  # UI components (auth, events, layout, system)
│   │   └── lib/         # API client, auth context, Stripe provider
│   ├── .env.example     # Frontend configuration
│   └── package.json     # Frontend dependencies
│
├── llm-service/         # LLM Extraction Service (Python/vLLM) - PLANNED
│   ├── .env.example     # LLM service configuration
│   └── README.md
│
├── smtp-adapter/        # Email Ingress Adapter (Lightweight SMTP) - PLANNED
│   ├── .env.example     # SMTP adapter configuration
│   └── README.md        # (HTTP ingestion endpoint active in backend)
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

## End-to-End System Flow

This section describes the complete lifecycle of an email through the Vigil system—from arrival to alert delivery.

### Phase 1: Email Ingestion

```
┌─────────────────────────────────────────────────────────────────────┐
│  External Email Flow                                                │
│                                                                     │
│  1. User forwards email → finance-a7f3k9@ingest.email.vigil.run     │
│  2. MX lookup routes to SMTP Adapter                                │
│  3. SMTP Adapter extracts ingest_token, forwards to Backend         │
│  4. Backend emits MESSAGE_RECEIVED event (immutable fact)           │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Guarantees:**
- Every email creates exactly one MESSAGE_RECEIVED event
- Email body is processed but NOT stored after extraction
- Routing determined solely by recipient address (never content)

### Phase 2: Fact Extraction

```
┌─────────────────────────────────────────────────────────────────────┐
│  Grounded Extraction Pipeline                                       │
│                                                                     │
│  1. Backend validates sender (allowlist check)                      │
│  2. Regex extractor identifies candidate text spans                 │
│  3. LLM interprets context and extracts structured facts            │
│  4. Each extraction MUST include source_span (verbatim quote)       │
│  5. Backend validates source_span exists in original email          │
│  6. Ungrounded extractions are DISCARDED                            │
│  7. Valid extractions become DRAFT reminders for user review        │
│  8. Email body discarded (only metadata retained)                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Extraction Events (All Advisory):**
- `HARD_DEADLINE_OBSERVED` — Explicit date/time with commitment language
- `SOFT_DEADLINE_SIGNAL_OBSERVED` — Fuzzy temporal language
- `URGENCY_SIGNAL_OBSERVED` — Questions, requests without dates
- `CLOSURE_SIGNAL_OBSERVED` — Resolution or completion language

**Critical Constraint:** Every extraction event includes a `source_span` field that must be a verbatim substring of the original email. If the LLM hallucinates text that doesn't exist, the extraction is discarded.

**One Email, Multiple Extractions:** A single email may generate multiple extraction events. For example:
- "Please send the report by Friday" → HARD_DEADLINE_OBSERVED
- "Also, can you schedule a call?" → URGENCY_SIGNAL_OBSERVED

Each becomes an independent draft reminder for user review.

### Phase 3: Thread & Reminder Management

```
┌─────────────────────────────────────────────────────────────────────┐
│  User-Controlled Thread & Reminder System                           │
│                                                                     │
│  1. Runtime loads ALL events for watcher from Event Store           │
│  2. Replay events to reconstruct current state:                     │
│     • Watcher status (active/paused)                                │
│     • All open/closed threads                                       │
│     • Draft and confirmed reminders                                 │
│     • User overrides and corrections                                │
│  3. Process new extractions:                                        │
│     • Match message to existing thread (via headers/subject)        │
│     • OR create new thread if no match                              │
│     • Create DRAFT reminders from extraction events                 │
│     • Flag potential conflicts (duplicates, deadline mismatches)    │
│  4. User reviews and takes action on drafts                         │
│  5. Emit events for user actions (persists overrides)               │
└─────────────────────────────────────────────────────────────────────┘
```

**Thread Assignment:**
- System suggests thread matches based on headers/subject
- User can **override** thread assignment at any time
- Same email can be linked to **multiple threads** if relevant
- Thread membership is **editable**, not locked

**Reminder States:**
- `draft` — Extracted but awaiting user confirmation
- `confirmed` — User approved, actively monitored
- `dismissed` — User rejected, excluded from alerts (audit preserved)
- `merged` — Combined with another reminder

**Conflict Detection:**
- Duplicate reminders → Flagged for merge/dismiss decision
- Conflicting deadlines → Highlighted for user resolution
- Same task in multiple threads → Surfaced, not auto-resolved

### Phase 4: Urgency Evaluation

```
┌─────────────────────────────────────────────────────────────────────┐
│  Time-Based Evaluation                                              │
│                                                                     │
│  1. Scheduler emits TIME_TICK events (every 15 minutes)             │
│  2. Runtime recalculates urgency for each open thread:              │
│     • hours_until_deadline (from extraction events)                 │
│     • hours_since_activity (silence detection)                      │
│  3. Urgency levels:                                                 │
│     • OK — No pressure                                              │
│     • WARNING — Approaching deadline or silence threshold           │
│     • CRITICAL — Deadline imminent                                  │
│     • OVERDUE — Deadline passed                                     │
│  4. If urgency STATE CHANGES → emit REMINDER_GENERATED              │
│  5. If reminder urgency ≥ warning → emit ALERT_QUEUED               │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Alerts fire ONLY on state transitions (ok → warning, warning → critical), never on steady state. This prevents alert fatigue.

### Phase 5: Alert Delivery

```
┌─────────────────────────────────────────────────────────────────────┐
│  Notification Worker                                                │
│                                                                     │
│  1. Poll Event Store for ALERT_QUEUED events                        │
│  2. Filter channels by urgency_filter (all/warning/critical)        │
│  3. Attempt delivery:                                               │
│     • Email → SMTP relay                                            │
│     • Webhook → HTTP POST to configured URL                         │
│  4. Retry on failure (3 attempts, exponential backoff)              │
│  5. Emit ALERT_SENT or ALERT_FAILED event                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Notification Content:**
```
Subject: [Vigil Alert] Finance - Thread Warning

Watcher: Finance
Thread: t_abc123
Status: WARNING
Deadline: December 30, 2025 5:00 PM
Last Activity: 48 hours ago

This is an attention prompt. Review thread and take action if needed.

View thread: https://vigil.run/threads/t_abc123
```

### Phase 6: Reporting

```
┌─────────────────────────────────────────────────────────────────────┐
│  Scheduled Reports                                                  │
│                                                                     │
│  1. Scheduler checks reporting_cadence (daily/weekly/on_demand)     │
│  2. Generate summary of watcher state:                              │
│     • Reassurance first: resolved threads, stable threads           │
│     • Then attention items: warning/critical/overdue                │
│  3. Emit REPORT_GENERATED event                                     │
│  4. Notification Worker delivers to reporting_recipients            │
│  5. Emit REPORT_SENT event                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Complete Data Flow Diagram

```
┌──────────┐   forward   ┌──────────────┐   HTTP POST   ┌─────────────┐
│  Email   │ ──────────▶ │ SMTP Adapter │ ────────────▶ │   Backend   │
│  Sender  │             │  (port 25)   │               │Control Plane│
└──────────┘             └──────────────┘               └──────┬──────┘
                                                               │
                         ┌──────────────┐                      │
                         │ LLM Service  │ ◀────────────────────┤ HTTP
                         │ (extraction) │ ─────────────────────┤
                         └──────────────┘   structured facts   │
                                                               │
                                                               ▼
                                                        ┌─────────────┐
                                                        │ Event Store │
                                                        │ (PostgreSQL)│
                                                        └──────┬──────┘
                                                               │
              ┌────────────────────────────────────────────────┤
              │                                                │
              ▼                                                ▼
       ┌─────────────┐                                  ┌─────────────┐
       │  Scheduler  │                                  │ Notification│
       │ (TIME_TICK) │                                  │   Worker    │
       └─────────────┘                                  └──────┬──────┘
              │                                                │
              │                                                ▼
              │                                          ┌─────────────┐
              │                                          │   Alerts    │
              │                                          │ (email/hook)│
              │                                          └─────────────┘
              │
              ▼
       ┌─────────────┐
       │  Frontend   │ ◀──── User views state, closes threads
       │ (Dashboard) │
       └─────────────┘
```

## Architectural Invariants

These invariants are **non-negotiable** and define the system's foundational guarantees:

### 1. LLM Output is Advisory, Never Authoritative

- All LLM extractions are **candidates**, not facts
- Every extraction must include a `source_span` (verbatim quote from email)
- Extractions without valid source spans are **discarded**
- Extracted reminders start as **drafts** requiring user confirmation
- Users can edit, merge, dismiss, or reassign any extraction
- **Manual user actions always override automation and persist**

### 2. Grounded Extraction via Regex + LLM

- Regex patterns identify candidate text spans first
- LLM interprets context to extract structured facts
- Every LLM output must reference a matching regex span
- Ungrounded outputs (hallucinated text) are discarded
- This ensures extractions are traceable to original email text

### 3. User Control Over Reminders

- Reminders can be: edited, merged, dismissed, reassigned
- Dismissed reminders are excluded from alerts but preserved in audit trail
- User corrections emit events that persist permanently
- System never overwrites user decisions

### 4. One Email, Multiple Concerns

- A single email may contain multiple independent obligations
- Each concern becomes a separate draft reminder
- Users decide which to keep, merge, or dismiss
- No automatic deduplication—conflicts are surfaced

### 5. Emails Can Belong to Multiple Threads

- Thread assignment is **editable** by the user
- Same email can be linked to multiple threads
- System suggests matches; user controls final assignment

### 6. Conflict Detection, Not Resolution

- Duplicate reminders → Flagged for user review
- Conflicting deadlines → Highlighted, not auto-merged
- Same task in multiple threads → Surfaced, not auto-resolved
- **Design for visibility and control of ambiguity**

### 7. Event-Sourced Architecture

- All authoritative state is derived from immutable events
- Events are append-only and never modified or deleted
- Corrections are made by emitting new events (user overrides)
- Replay of events must be deterministic and side-effect free
- If a future decision depends on data, that data MUST exist in an event

### 8. No Long-Lived Mutable State

- Do NOT store authoritative thread, reminder, or watcher state in a database
- Do NOT rely on in-memory state across runs
- Databases may store:
  - Immutable events
  - Disposable projections
- Projections must be rebuildable from events at any time

### 9. No Agent Behavior

- No background reasoning loops
- No retry-until-success logic
- No feedback cycles where outputs influence control flow
- No LLM calls during replay
- No LLM deciding what happens next

### 10. LLM as Extraction Appliance Only

- LLMs may ONLY extract structured facts from email text
- LLM outputs are frozen into immutable extraction events
- LLMs NEVER:
  - Schedule work
  - Emit events directly
  - Influence control flow
  - Retry autonomously
  - Auto-commit reminders
- The system must function correctly if the LLM is offline

### 11. Thread Model (Tracked Conversations)

- **Threads represent tracked conversations**
- Thread creation is driven by extraction detection
- **Threads do NOT own deadlines**—deadlines belong to Reminders
- Threads are monitored for silence (no new messages) and response times
- **Core tracking feature:** When communications were sent, responded to, and when obligations were due
- Threads may be closed:
  - a) By user-confirmed closure signal from email
  - b) Manually by user through the dashboard
- **Closure is terminal**: Once closed, a thread can **NEVER** reopen

### 12. Message Model (Non-Persistence)

- **Messages are NOT persisted as first-class entities**
- The system does NOT store full email body content after ingestion
- Only metadata is retained: from, subject, headers, received_at, original_date
- Email bodies are parsed, sent to LLM for extraction, then discarded
- This constraint minimizes PII storage and preserves privacy

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
<name>-<token>@ingest.email.vigil.run
```

**Examples:**
```
finance-a7f3k9@ingest.email.vigil.run
legal-b2j8m1@ingest.email.vigil.run
client-billing-x4p9j2@ingest.email.vigil.run
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

### 1. Backend Control Plane (TypeScript/Bun) — ACTIVE

**Location:** `backend/`

The authoritative decision-making component. **Fully implemented** with event-sourced architecture.

**Core Responsibilities:**
- Expose HTTP API for frontend (Hono framework)
- Create and validate 45+ event types
- Persist events to PostgreSQL append-only store
- Invoke watcher runtime on triggers
- Rebuild state via deterministic event replay
- Coordinate scheduled evaluations (TIME_TICK)
- Dispatch notifications with retry logic

**Additional Implemented Modules:**
- **Authentication**: JWT access/refresh tokens (15 min / 7 days), Google/GitHub OAuth with PKCE, password reset
- **Billing**: Stripe integration with 4 subscription tiers (free, starter, pro, enterprise), weekly usage tracking
- **Security**: PII/secret sanitization, rate limiting, HMAC webhook signing
- **Logging**: Structured per-entity logging with correlation IDs

**Architecture:**
- Stateless HTTP API (Hono)
- Event-sourced state management
- PostgreSQL event store with projections

**Configuration:** See `backend/.env.example`

**Development:**
```bash
cd backend
bun install
bun test              # Run all tests
bun run dev           # Development mode with hot reload
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

### 4. Frontend (Web UI) — ACTIVE

**Location:** `frontend/`

Read-heavy inspection and control interface. **Fully implemented** with Next.js 14.

**Implemented Features:**
- **Authentication**: Login, register, password reset, Google/GitHub OAuth
- **Dashboard**: Watcher overview with status and activity
- **Watcher Management**: Create, edit, pause/resume, delete watchers
- **Thread Viewing**: Thread details with message history and urgency
- **Account Settings**: Profile, security (OAuth links), billing/subscription
- **Billing**: Stripe checkout, subscription management, usage display
- **Documentation**: Learn pages covering architecture, security, alerts

**Architecture:**
- Next.js 14 App Router
- TypeScript with Tailwind CSS
- Singleton API client with auto token refresh
- React Context for auth state
- Stripe Elements integration

**Constraints:**
- **No business logic** in frontend
- **No direct database access**
- All state derived from backend API responses

**Configuration:** See `frontend/.env.example`

**Development:**
```bash
cd frontend
npm install
npm run dev           # Development server (http://localhost:3000)
npm run build         # Production build
npm run typecheck     # TypeScript checking
```

## Getting Started

### Prerequisites

- **Backend**: Bun runtime, PostgreSQL
- **Frontend**: Node.js (npm)
- **LLM Service** (Planned): Python 3.11+, GPU (recommended), vLLM
- **SMTP Adapter** (Planned): Node.js or Python

### Quick Start (Development)

```bash
# 1. Backend
cd backend
cp .env.example .env
# Configure: JWT_SECRET, JWT_REFRESH_SECRET, PostgreSQL connection
# Optional: Stripe keys, OAuth credentials
bun install
bun run dev           # Starts on http://localhost:3001

# 2. Frontend
cd frontend
cp .env.example .env
# Configure: NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev           # Starts on http://localhost:3000
```

### Full Setup (with optional services)

#### 1. Backend (Required)

```bash
cd backend
cp .env.example .env
# Required: JWT_SECRET, JWT_REFRESH_SECRET (generate with: openssl rand -base64 32)
# Required: PostgreSQL connection (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
# Optional: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# Optional: GOOGLE_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_ID
bun install
bun test
bun run dev
```

#### 2. Frontend (Required)

```bash
cd frontend
cp .env.example .env
# Required: NEXT_PUBLIC_API_URL (default: http://localhost:3001)
# Optional: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Optional: NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED, NEXT_PUBLIC_GITHUB_OAUTH_ENABLED
npm install
npm run dev
```

#### 3. LLM Service (Planned)

```bash
cd llm-service
cp .env.example .env
# Follow llm-service/README.md for Python setup
```

#### 4. SMTP Adapter (Planned)

```bash
cd smtp-adapter
cp .env.example .env
# Note: HTTP ingestion endpoint is active in backend at POST /ingest/:token
# Follow smtp-adapter/README.md for SMTP setup when available
```

### Network Configuration

Services communicate over HTTP. Development setup:

| Service | Address | Purpose | Status |
|---------|---------|---------|--------|
| Backend | `http://localhost:3001` | Main API | ✅ Active |
| Frontend | `http://localhost:3000` | Web UI | ✅ Active |
| LLM Service | `http://localhost:8000` | Fact extraction | ⏳ Planned |
| SMTP Adapter | `smtp://localhost:2525` | Email ingestion | ⏳ Planned |

For production or distributed deployment, update `.env` files accordingly.

## Documentation

The Vigil system is comprehensively documented across multiple specification levels.

### Specification Hierarchy

```
SDD.md (Authoritative Source of Truth)
├── Feature Requirements (FR-1 to FR-20) — What the system does
├── Infrastructure Requirements (IR-1 to IR-24) — Non-functional requirements  
├── Module Requirements (MR-*) — Component-level specifications
├── Security Requirements (SEC-1 to SEC-8) — Auth, PII, encryption
├── Data Consistency (CONS-1 to CONS-8) — Ordering, replay, idempotence
├── Design Constraints (DC-1 to DC-11) — Authoritative clarifications
└── Unit Test Requirements — Per-feature test specifications

SYSTEM_DESIGN.md (Implementation Guide)
├── Four-Subsystem Architecture
├── Component Responsibilities  
├── Network Communication
└── Engineering Constraints
```

### Key Documents
- **[Software Design Document (SDD)](docs/SDD.md)** — Authoritative production-grade specification
- **[System Design Document](docs/SYSTEM_DESIGN.md)** — Complete implementation-grade specification
- **[Documentation Index](docs/README.md)** — Full documentation catalog
- **[Backend README](backend/README.md)** — Backend control plane (~60% of implementation)
- **[LLM Service README](llm-service/README.md)** — Fact extraction service (~10%)
- **[SMTP Adapter README](smtp-adapter/README.md)** — Email ingress (~5%)
- **[Frontend README](frontend/README.md)** — Dashboard interface (~15%)

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
