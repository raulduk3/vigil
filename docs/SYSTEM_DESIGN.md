# DEVA System Design Document (SDD)

**Deterministic, Event-Sourced Vigilance System for Time-Sensitive Email Oversight**

This document defines the complete, implementation-grade system design for DEVA. It is written for engineers responsible for implementing, operating, and evolving the system. All behavior, including AI usage, is strictly bounded and explainable through immutable event replay.

---

## Table of Contents

1. [System Purpose and Scope](#1-system-purpose-and-scope)
2. [Foundational Architecture](#2-foundational-architecture)
3. [Four-Subsystem Architecture](#3-four-subsystem-architecture)
4. [Subsystem 1: Ingestion and Immutable Event Capture](#4-subsystem-1-ingestion-and-immutable-event-capture)
5. [Subsystem 2: Event-Sourced Runtime Executing Watchers](#5-subsystem-2-event-sourced-runtime-executing-watchers)
6. [Subsystem 3: Bounded Semantic Intelligence](#6-subsystem-3-bounded-semantic-intelligence)
7. [Subsystem 4: Notification and Inspection Interfaces](#7-subsystem-4-notification-and-inspection-interfaces)
8. [Core Domain Concepts](#8-core-domain-concepts)
9. [Event Model](#9-event-model)
10. [Cross-Cutting Guarantees](#10-cross-cutting-guarantees)
11. [Implementation Constraints](#11-implementation-constraints)
12. [Canonical System Rule](#12-canonical-system-rule)

---

## 1. System Purpose and Scope

### 1.1 What DEVA Is

DEVA is a deterministic, event-sourced vigilance system that provides **delegated oversight** over explicitly routed email streams. The system exists to reduce the risk of quiet failure in time-sensitive email communication by:

- Observing elapsed time and silence
- Tracking stated or implied deadlines
- Surfacing advisory notifications when attention may be warranted

### 1.2 What DEVA Is NOT

DEVA is intentionally constrained and:
- **Does NOT** access inboxes
- **Does NOT** automate replies
- **Does NOT** infer intent beyond explicit extraction
- **Does NOT** assign tasks
- **Does NOT** act autonomously
- **Never** becomes a decision-maker

**Humans retain full responsibility and control at all times.**

### 1.3 Design Philosophy

The system favors:
- **Determinism over intelligence**
- **Transparency over automation**
- **Restraint over completeness**
- **Auditability over convenience**

DEVA's core promise is not to manage email, but to provide **confidence**: confidence that important communication is being observed, that silence is not going unnoticed, and that when nothing happens, it is because nothing needs to happen—not because something was missed.

---

## 2. Foundational Architecture

### 2.1 Events as Source of Truth

**Events are the sole source of truth.** Every fact that can influence system behavior is captured once as an immutable, append-only event. No authoritative state is stored in mutable database tables, caches, or long-lived memory.

All operational state is **always derived** by replaying events in order:
- Threads and their status
- Due boundaries
- Reminder status
- Closures
- Notification eligibility

### 2.2 Guarantees from Event-Sourcing

This architecture guarantees:

1. **Determinism**: Same events always produce same state
2. **Auditability**: Complete history of all decisions
3. **Explainability**: Any alert or decision can be reconstructed offline by replaying the event log without invoking external systems or artificial intelligence
4. **Debuggability**: Replay is the debugger
5. **Correctness**: If behavior cannot be explained by replaying events, it is wrong

### 2.3 State Reconstruction

Projections (derived state) may be stored in databases for performance, but:
- Projections are **disposable**
- Projections are **rebuildable** from events at any time
- Projections are **never authoritative**
- The event log is always the canonical source

### 2.4 Time Handling

Time is treated as an explicit trigger, not a source of facts:
- Time enters the system through explicit TIME_TICK events
- **Time never changes facts—only urgency**
- Scheduled evaluations create time triggers but don't mutate state
- All time-based decisions are deterministic given the same events

---

## 3. Four-Subsystem Architecture

DEVA is organized around four conceptual subsystems. These subsystems define **responsibility boundaries**, not deployment boundaries. Each subsystem contains one or more concrete components that may be independently deployed or scaled, but which do not constitute separate architectural domains.

### 3.1 The Four Subsystems

1. **Ingestion and Immutable Event Capture**  
   Observes external reality and converts it into immutable internal facts

2. **Event-Sourced Runtime Executing Watchers**  
   Evaluates events and determines whether new events should be emitted

3. **Bounded Semantic Intelligence**  
   Provides bounded semantic extraction from unstructured email text

4. **Notification and Inspection Interfaces**  
   Handles outward-facing effects and human interaction

### 3.2 Deployment Independence

While organized into four subsystems conceptually, components may be:
- Deployed independently
- Scaled independently
- Versioned independently
- Operated on different infrastructure

However, they remain within their subsystem's responsibility boundary.

### 3.3 Communication

All inter-component communication is:
- Network-routed over HTTP/SMTP
- Explicitly configured via environment variables
- Traceable through events
- Fail-safe (degraded rather than broken)

---

## 4. Subsystem 1: Ingestion and Immutable Event Capture

This subsystem observes external reality and converts it into immutable internal facts. Its only output is events. It performs **no inference** and **no decision-making**.

### 4.1 SMTP Server / Email Ingress Adapter

**Location:** `smtp-adapter/` (independent repository)

The SMTP server is a transport-layer adapter that accepts inbound email and forwards it into the system.

#### Responsibilities:
- Listen for SMTP connections on configured port
- Accept inbound email delivery
- Extract recipient address identifying the watcher
- Forward raw email payload to backend ingestion endpoint

#### Implementation Constraints:
- **Must NOT** persist email content
- **Must NOT** apply business logic
- **Must NOT** emit events (only backend emits events)
- **Must NOT** call LLMs
- **Must NOT** retry indefinitely
- Failure is acceptable and visible

#### Routing Model:
- Email routing is determined **solely by recipient address**
- Format: `<name>-<token>@ingest.deva.email`
- Content is never examined for routing decisions
- This ensures explicit user intent and prevents misclassification

#### Configuration:
See `smtp-adapter/.env.example`

#### Tech Stack:
- Node.js/TypeScript or Python
- Minimal SMTP library
- HTTP client for backend forwarding

---

### 4.2 Backend Ingestion Endpoint

**Location:** `backend/src/backend/ingestion/` (to be implemented)

The backend ingestion endpoint is the **authoritative boundary** where email becomes part of the system.

#### Responsibilities:
- Receive forwarded email from SMTP adapter
- Parse headers and body deterministically
- Normalize content (charset conversion, whitespace, etc.)
- Validate sender against watcher allowlists
- Deduplicate messages (by Message-ID or hash)
- Emit canonical `EMAIL_RECEIVED` event

#### Invariants:
- **No inference occurs before event emission**
- **No state mutation occurs before event emission**
- EMAIL_RECEIVED is sworn evidence—it represents that an email was delivered, not what it means
- Parsing failures result in ERROR events, not silent drops

#### Deduplication Strategy:
- Use Message-ID header if present and valid
- Fall back to content hash (subject + from + timestamp)
- Store deduplication keys in event store
- Duplicate detection is itself recorded as an event

#### Event Emission:
```typescript
{
  type: "EMAIL_RECEIVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  email_id: "unique-id",
  from: "sender@example.com",
  subject: "...",
  body_text: "...",
  received_at: number,
  headers: { ... }
}
```

---

### 4.3 Event Store

**Location:** `backend/src/store/` (to be implemented)

The Event Store persists all immutable events.

#### Responsibilities:
- Append-only event storage
- Preserve ordering per watcher
- Support full replay (all events)
- Support partial replay (events since timestamp)
- Support event retrieval by ID
- Support schema versioning

#### Implementation Options:
- **PostgreSQL** with JSONB and append-only table (recommended)
- **EventStoreDB** for dedicated event sourcing
- **DynamoDB** for distributed deployment

#### Storage Schema:
```sql
CREATE TABLE events (
  event_id UUID PRIMARY KEY,
  watcher_id VARCHAR,
  timestamp BIGINT NOT NULL,
  event_type VARCHAR NOT NULL,
  event_data JSONB NOT NULL,
  schema_version INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_watcher_timestamp ON events(watcher_id, timestamp);
```

#### Constraints:
- **No updates** to events
- **No deletes** (except compliance-required data removal)
- **No reinterpretation** of past events
- All system state must be reconstructible from events alone

#### Event Ordering:
- Events for a single watcher are totally ordered by timestamp
- Events across watchers have no ordering guarantee
- Timestamp + event_id provides tie-breaking

---

## 5. Subsystem 2: Event-Sourced Runtime Executing Watchers

This subsystem evaluates events and determines whether new events should be emitted. It is the **only subsystem that applies business rules and policies**.

### 5.1 Backend Control Plane

**Location:** `backend/src/backend/` (to be implemented)

The Backend Control Plane is the **sole decision-making authority**.

#### Responsibilities:
- Expose authenticated HTTP APIs
- Validate commands and user actions
- Create and persist events
- Invoke watcher runtime execution
- Orchestrate calls to LLM service
- Orchestrate notification dispatching
- Enforce access control

#### API Surface (Planned):
- `POST /api/watchers` - Create watcher
- `POST /api/watchers/:id/activate` - Activate watcher
- `POST /api/watchers/:id/pause` - Pause watcher
- `POST /api/threads/:id/close` - Manually close thread
- `GET /api/watchers/:id/threads` - Get current thread projections
- `POST /api/ingestion/email` - Receive email from SMTP adapter

#### Architecture:
- Stateless HTTP API (no session state)
- Event-sourced state management
- Synchronous event emission
- Asynchronous watcher runtime invocation (queued)

#### Constraints:
- **No authoritative state stored outside event store**
- **No background reasoning loops**
- **No LLM calls during replay**
- Stateless between requests
- All decisions traceable to events

#### Configuration:
See `backend/.env.example`

---

### 5.2 Watcher Runtime Executor

**Location:** `backend/src/watcher/runtime.ts`

The Watcher Runtime Executor is a **stateless evaluation engine**.

#### Execution Sequence:

1. **Load Events**  
   Fetch all events for watcher from event store

2. **Replay Events**  
   Reconstruct state deterministically:
   ```typescript
   type WatcherState = {
     watcher_id: string;
     status: "created" | "active" | "paused";
     threads: Map<string, ThreadState>;
   };
   
   type ThreadState = {
     thread_id: string;
     opened_at: number;
     last_activity_at: number;
     deadline_timestamp: number | null;
     status: "open" | "closed";
     closed_at: number | null;
     email_ids: readonly string[];
   };
   ```

3. **Evaluate Transitions**  
   Check for state transitions:
   - New thread creation (if EMAIL_RECEIVED + DEADLINE_EXTRACTED)
   - Thread closure (if CLOSURE_EXTRACTED or user action)
   - Reminder state change (if TIME_TICK)

4. **Emit New Events**  
   Generate events for any transitions:
   - THREAD_OPENED
   - THREAD_CLOSED
   - REMINDER_EVALUATED
   - ALERT_QUEUED

5. **Exit**  
   Runtime execution completes

#### Invocation Model:
```typescript
async function runWatcher(
  watcherId: string,
  eventStore: EventStore,
  triggerEventId?: string
): Promise<readonly DevaEvent[]>
```

#### Constraints:
- **No persistence** of internal state
- **No waiting** or looping
- **No external service calls** during replay
- **No mutation** of historical events
- Must be **deterministic** (same events → same output)
- **No LLM calls** during execution

#### Thread Lifecycle Rules:

**Thread Opening:**
- Thread opens when EMAIL_RECEIVED + evidence of obligation (deadline or silence-sensitive)
- Each thread has unique thread_id

**Thread Closure:**
- CLOSURE_EXTRACTED (explicit closure language in email)
- User manual closure action
- **Once closed, thread NEVER reopens**

**Activity Tracking:**
- Each email updates last_activity_at
- Used for silence detection

---

### 5.3 Reminder Evaluation Logic

**Location:** `backend/src/watcher/runtime.ts` (evaluateThreadUrgency)

Reminder state is **derived and time-relative**, computed on demand.

#### Evaluation Formula:

```typescript
function evaluateThreadUrgency(
  thread: ThreadState,
  currentTime: number
): UrgencyState {
  if (thread.status === "closed") {
    return { urgency_state: "ok" };
  }

  const hours_since_activity = 
    (currentTime - thread.last_activity_at) / (1000 * 60 * 60);
  
  if (thread.deadline_timestamp === null) {
    // No deadline - only check silence
    if (hours_since_activity > 72) {
      return { urgency_state: "warning" };
    }
    return { urgency_state: "ok" };
  }

  const hours_until_deadline = 
    (thread.deadline_timestamp - currentTime) / (1000 * 60 * 60);

  if (hours_until_deadline < 0) {
    return { urgency_state: "overdue" };
  }
  if (hours_until_deadline < 2) {
    return { urgency_state: "critical" };
  }
  if (hours_until_deadline < 24) {
    return { urgency_state: "warning" };
  }

  return { urgency_state: "ok" };
}
```

#### Alert Firing Rules:
- Alerts fire **only on state transitions**
- Never fire on steady state
- Track previous urgency in REMINDER_EVALUATED events
- Fire exactly once per transition

#### Policy Configuration:
- Silence threshold (default: 72 hours)
- Warning threshold (default: 24 hours)
- Critical threshold (default: 2 hours)
- Configurable per watcher via POLICY_UPDATED event

---

### 5.4 Scheduler / Time Trigger Source

**Location:** `backend/src/scheduler/` (to be implemented)

The scheduler injects time into the system as an explicit trigger.

#### Responsibilities:
- Periodically emit TIME_TICK trigger events
- Schedule watcher runtime execution
- Configurable evaluation frequency per watcher

#### Implementation Options:
- **Cron jobs** triggering API endpoints
- **Cloud scheduler** (AWS EventBridge, GCP Cloud Scheduler)
- **In-process scheduler** (node-cron, Bun timer)

#### Event Emission:
```typescript
{
  type: "TIME_TICK",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  tick_timestamp: number
}
```

#### Constraints:
- Does **not** emit authoritative events (only triggers)
- Does **not** store state
- Does **not** evaluate business logic
- **Time never creates facts, only urgency**

#### Frequency Recommendations:
- Default: Every 15 minutes
- High-urgency watchers: Every 5 minutes
- Low-urgency watchers: Hourly

---

## 6. Subsystem 3: Bounded Semantic Intelligence

This subsystem provides **bounded semantic extraction** from unstructured email text. It is explicitly designed to be **incapable of autonomous behavior or decision-making**.

### 6.1 Purpose and Scope

The LLM exists only to answer narrowly-scoped questions:
- "Is there a deadline stated in this text?"
- "Is there language indicating silence-sensitive risk?"
- "Is there explicit language confirming resolution or completion?"

**The LLM never decides what the system should do.** It only produces candidate facts that the backend may choose to record as events.

### 6.2 Architectural Position

```
Email Ingestion → EMAIL_RECEIVED event → Backend
                                            ↓
                                    Call LLM Service
                                            ↓
                                    Structured Facts
                                            ↓
                                    DEADLINE_EXTRACTED event
```

The LLM service is called **synchronously** after EMAIL_RECEIVED is emitted, but **never during replay**.

---

### 6.3 LLM Extraction Service (vLLM)

**Location:** `llm-service/` (independent repository)

The LLM Extraction Service is a dedicated, non-authoritative service backed by vLLM.

#### Responsibilities:
- Perform deadline extraction
- Perform silence-sensitive risk extraction
- Perform explicit closure detection
- Optionally classify which extraction should be attempted

#### Architecture:
- Separate deployment (can run on different machine with GPU)
- vLLM-backed inference for performance
- Private network only (not publicly accessible)
- HTTP API with minimal endpoints
- Stateless request/response model

#### Supported Endpoints:

**POST /route**  
Classify which extraction to perform.

Request:
```json
{
  "email_text": "Please confirm by Friday",
  "from": "sender@example.com",
  "subject": "Action required"
}
```

Response:
```json
{
  "classification": "EXTRACT_DEADLINE",
  "confidence": "high"
}
```

**POST /extract/deadline**  
Extract deadline information.

Request:
```json
{
  "email_text": "Please reply by Friday EOD",
  "reference_timestamp": 1703462400000
}
```

Response:
```json
{
  "deadline_timestamp": 1703721600000,
  "deadline_text": "Friday EOD",
  "evidence": "Please reply by Friday EOD",
  "confidence": "high",
  "extractor_version": "v1.0.0"
}
```

**POST /extract/risk**  
Extract silence-sensitive language.

Response:
```json
{
  "risk_level": "medium",
  "risk_indicators": ["urgent", "ASAP"],
  "evidence": "This is urgent, please respond ASAP",
  "extractor_version": "v1.0.0"
}
```

**POST /extract/closure**  
Detect explicit closure confirmation.

Response:
```json
{
  "is_closure": true,
  "closure_type": "explicit",
  "evidence": "This matter is now resolved. Thank you.",
  "extractor_version": "v1.0.0"
}
```

#### Configuration:
See `llm-service/.env.example`

#### Tech Stack:
- Python 3.11+
- vLLM for inference
- FastAPI for HTTP endpoints
- Pydantic for schema validation

---

### 6.4 Output Contract

All LLM outputs must:
- Be fully structured (JSON schema validated)
- Include **verbatim evidence quotes** from email text
- Include extractor version metadata
- Be validated by backend before event emission
- Be deterministic given same input (temperature near-zero)

#### Backend Validation:
```typescript
function validateLLMOutput(output: LLMOutput): boolean {
  // Schema validation
  // Evidence quote verification
  // Timestamp sanity checks
  // Confidence threshold checks
  return isValid;
}
```

LLM output is **not authoritative** until the backend emits a corresponding event.

---

### 6.5 Constraints and Guarantees

The LLM Extraction Service **MUST NOT**:
- ❌ Emit events (only backend emits events)
- ❌ Store long-lived state
- ❌ Chain prompts (one task per request)
- ❌ Call tools or external APIs
- ❌ Retry autonomously
- ❌ Influence control flow
- ❌ Participate in event replay

The LLM service **MUST**:
- ✅ Return deterministic outputs (low temperature)
- ✅ Include verbatim evidence
- ✅ Timeout within configured limit
- ✅ Return errors explicitly (not silent failures)

#### Failure Handling:

If LLM service is unavailable:
- Backend logs warning
- EMAIL_RECEIVED event is still emitted
- Thread may be created with null deadline
- System remains correct but with reduced informational fidelity

If LLM returns low confidence:
- Backend may choose not to emit extraction event
- This is a policy decision, not an LLM decision

#### Replay Guarantee:

**LLM calls occur only at ingestion time or explicit evaluation points and are never repeated during replay.**

When replaying events:
- DEADLINE_EXTRACTED event is used as-is
- LLM is never called again
- All extracted facts are frozen in events

---

### 6.6 Model Selection and Tuning

Recommended models:
- **Llama 3.1 8B Instruct** - Good balance of speed/accuracy
- **Mistral 7B Instruct** - Faster, slightly lower accuracy
- **Llama 3.1 70B Instruct** - Highest accuracy, slower

Inference parameters:
- Temperature: 0.1 (near-deterministic)
- Max tokens: 512
- Top-p: 0.9

Prompt engineering:
- Use few-shot examples
- Require structured output (JSON)
- Require evidence quotes
- Test prompts against eval dataset

---

## 7. Subsystem 4: Notification and Inspection Interfaces

This subsystem handles outward-facing effects and human interaction. It **never decides what should happen**.

### 7.1 Notification Worker / Outbound Email Sender

**Location:** `backend/src/notification/` (to be implemented)

#### Responsibilities:
- Monitor event stream for ALERT_QUEUED and REPORT_GENERATED events
- Send alert emails to configured recipients
- Send periodic watcher reports
- Retry delivery with exponential backoff
- Emit delivery outcome events (ALERT_SENT, ALERT_FAILED)

#### Event-Driven Model:

```
Watcher Runtime → ALERT_QUEUED event → Notification Worker
                                           ↓
                                    Send Email
                                           ↓
                                    ALERT_SENT event
```

Watchers do **not** send emails directly. They emit events that **cause** emails to be sent.

#### Email Templates:

**Alert Email:**
```
Subject: [DEVA Alert] Thread requires attention

Watcher: {watcher_name}
Thread: {thread_id}
Status: {urgency_state}
Deadline: {deadline_timestamp}
Last Activity: {hours_since_activity} hours ago

View thread: {dashboard_url}/threads/{thread_id}
```

**Report Email:**
```
Subject: [DEVA Report] {watcher_name} - {date}

Threads Opened: {count}
Threads Closed: {count}
Threads Active: {count}
Alerts Sent: {count}

[Reassurance First]
✓ {resolved_count} threads resolved
✓ {stable_count} threads stable

[Items Requiring Attention]
⚠ {warning_count} threads approaching deadline
```

#### Configuration:
- SMTP server for outbound email
- Email templates
- Retry policy (max 3 attempts, exponential backoff)

#### Constraints:
- **No decision-making** (only executes based on events)
- **No LLM usage**
- **No domain state mutation**
- Delivery failure is acceptable and recorded

---

### 7.2 Frontend (Dashboard and Inspection UI)

**Location:** `frontend/` (independent repository)

Read-heavy inspection and control interface.

#### Responsibilities:

**Display (Read-Heavy):**
- Current threads with status, urgency, deadlines
- Alert history and delivery status
- Extracted signals (deadlines, risks, closures) with evidence quotes
- Email timeline per thread
- Watcher configuration and policies

**User Actions:**
- Manual thread closure
- Watcher pause/resume
- Policy updates (silence threshold, notification channels)
- On-demand report generation

#### Architecture:
- Communicates with backend via REST API
- Optional: WebSocket for real-time updates
- Displays **projections** (derived state), not authoritative events
- All mutations flow through backend APIs → event creation

#### Example API Calls:
```typescript
// Get thread projections
GET /api/watchers/w1/threads
Response: {
  threads: [
    {
      thread_id: "t1",
      status: "open",
      urgency_state: "warning",
      deadline: 1703721600000,
      last_activity: 1703635200000,
      emails: [...]
    }
  ]
}

// Close thread
POST /api/threads/t1/close
Body: { reason: "manually_resolved" }
Backend emits: THREAD_CLOSED event
```

#### Design Principles:

**Reassurance-First:**
- Reports emphasize what is resolved or stable
- Then show what appears on track
- Finally show what may require attention (last, not first)

**Transparency:**
- Every displayed status links to specific events
- Every alert shows the state transition that triggered it
- Every extracted signal shows verbatim evidence from email

#### Constraints:
- ❌ **No business logic** in frontend
- ❌ **No direct database access**
- ❌ **No event emission** (only via backend API)
- ✅ All state derived from backend API responses

#### Tech Stack (TBD):
- React/Next.js or similar
- TypeScript
- REST API client
- Optional: WebSocket for real-time

#### Configuration:
See `frontend/.env.example`

---

## 8. Core Domain Concepts

### 8.1 Watchers

The **watcher** is the primary configuration and operational unit in DEVA.

#### Definition:
A watcher represents a **bounded area of responsibility**, such as:
- Personal finance correspondence
- Legal matters
- Client billing
- Vendor contracts

#### Watcher Properties:
```typescript
type Watcher = {
  watcher_id: string;
  account_id: string;
  name: string;
  ingest_token: string; // for email routing
  status: "created" | "active" | "paused";
  policy: WatcherPolicy;
};

type WatcherPolicy = {
  allowed_senders: readonly string[];
  silence_threshold_hours: number;
  deadline_buffer_hours: number;
  notification_channels: readonly NotificationChannel[];
};
```

#### Watcher Lifecycle:
1. **Created** - User creates watcher via dashboard
2. **Activated** - Watcher begins monitoring
3. **Paused** - Temporarily stop monitoring (user action)
4. **Resumed** - Resume monitoring

#### Email Routing:
Each watcher has a unique ingestion email address:
```
<name>-<token>@ingest.deva.email
```

Example:
```
finance-a7f3k9@ingest.deva.email
legal-b2j8m1@ingest.deva.email
```

Routing is **address-only**. Content is never examined for routing.

---

### 8.2 Threads

**Threads represent obligations, not conversations.**

#### Definition:
A thread exists **if and only if a due boundary exists**:
- Explicitly stated deadline
- Implicitly windowed deadline (e.g., "soon", "this week")
- Silence-sensitive obligation (requires timely response)

#### Thread Properties:
```typescript
type Thread = {
  thread_id: string;
  watcher_id: string;
  opened_at: number;
  last_activity_at: number;
  deadline_timestamp: number | null;
  status: "open" | "closed";
  closed_at: number | null;
  email_ids: readonly string[];
};
```

#### Thread Lifecycle:

**Opening:**
- Thread opens when EMAIL_RECEIVED + evidence of obligation
- Evidence: DEADLINE_EXTRACTED or RISK_EXTRACTED with urgency

**Activity:**
- Each subsequent email in thread updates last_activity_at
- Used for silence detection

**Closure:**
- CLOSURE_EXTRACTED (explicit closure language)
- User manual closure
- **Closure is terminal** - thread can NEVER reopen

**New Obligations:**
- Subsequent emails may create **new threads** if new obligations
- They never resurrect closed threads

---

### 8.3 Reminders and Urgency

Reminder state is **derived, not stored**.

#### Urgency Levels:
- **ok** - No action needed
- **warning** - Deadline within 24 hours or silence > 72 hours
- **critical** - Deadline within 2 hours
- **overdue** - Deadline passed

#### State Transition Alerts:
```
ok → warning → ALERT_QUEUED(warning)
warning → critical → ALERT_QUEUED(critical)
critical → overdue → ALERT_QUEUED(overdue)
```

Alerts fire **exactly once per transition**, never on steady state.

---

### 8.4 Obligations and Due Boundaries

#### Types of Due Boundaries:

**Explicit Deadline:**
```
"Please respond by December 31, 2025 at 5pm"
→ deadline_timestamp: 1735689600000
```

**Implicit Deadline:**
```
"Let me know by end of week"
→ deadline_timestamp: inferred from current date
```

**Silence-Sensitive:**
```
"This is urgent, please confirm ASAP"
→ No explicit deadline, but requires prompt response
→ Uses silence threshold (default 72 hours)
```

**No Obligation:**
```
"FYI: Invoice attached for your records"
→ No thread created
```

---

## 9. Event Model

Events are the **complete authoritative record** of system state.

### 9.1 Event Structure

All events share base structure:
```typescript
type BaseEvent = {
  readonly event_id: string;      // UUID
  readonly timestamp: number;     // Unix ms
  readonly watcher_id?: string;   // Optional (not all events belong to watcher)
};
```

### 9.2 Event Categories

#### Control Plane Events:
- `ACCOUNT_CREATED` - New account
- `USER_CREATED` - New user in account
- `WATCHER_CREATED` - New watcher
- `WATCHER_ACTIVATED` - Watcher begins monitoring
- `WATCHER_PAUSED` - Watcher paused by user
- `WATCHER_RESUMED` - Watcher resumed
- `POLICY_UPDATED` - Watcher policy changed

#### Email Ingress Events:
- `EMAIL_RECEIVED` - Email delivered and parsed

#### LLM Extraction Events (Frozen Facts):
- `EMAIL_ROUTED` - Email classified to thread (optional)
- `DEADLINE_EXTRACTED` - Deadline found in email
- `RISK_EXTRACTED` - Silence-sensitive language found
- `CLOSURE_EXTRACTED` - Explicit closure detected

#### Thread Lifecycle Events:
- `THREAD_OPENED` - New obligation thread created
- `THREAD_UPDATED` - Thread deadline updated
- `THREAD_ACTIVITY_SEEN` - New email in thread
- `THREAD_CLOSED` - Thread obligation resolved

#### Time & Reminder Events:
- `TIME_TICK` - Time-based evaluation trigger
- `REMINDER_EVALUATED` - Thread urgency computed

#### Notification Events:
- `ALERT_QUEUED` - Alert scheduled for delivery
- `ALERT_SENT` - Alert successfully delivered
- `ALERT_FAILED` - Alert delivery failed

#### Reporting Events:
- `REPORT_GENERATED` - Periodic report created
- `REPORT_SENT` - Report delivered

### 9.3 Forbidden Events

These events **must never exist** as they violate architectural invariants:

- ❌ `THREAD_REOPENED` (closure is terminal)
- ❌ `AGENT_LOOP_STARTED` (no agent behavior)
- ❌ `AUTO_ESCALATED` (no autonomous action)
- ❌ `INBOX_SCANNED` (no inbox access)
- ❌ `LLM_RETRIED` (LLM calls not retried during replay)

### 9.4 Event Schema

See [backend/src/events/types.ts](../backend/src/events/types.ts) for complete TypeScript definitions.

---

## 10. Cross-Cutting Guarantees

These guarantees apply **across all subsystems**:

### 10.1 Deterministic Replay
- Same events always produce identical state
- Replay requires zero external calls
- No randomness in business logic
- LLM outputs are frozen in events, not recomputed

### 10.2 Explainability
- All decisions traceable to specific events
- All alerts link to state transition that triggered them
- All extracted facts include verbatim evidence
- Event log is the complete audit trail

### 10.3 Graceful Degradation
- LLM unavailability degrades capability, not correctness
- SMTP adapter failure is visible, not silent
- Notification delivery failure is recorded
- System continues functioning with reduced fidelity

### 10.4 Immutability
- Events never modified
- Events never deleted (except compliance requirements)
- Corrections made by emitting new events
- Event store is append-only

### 10.5 Thread Closure
- **Closed threads never reopen**
- New emails create new threads if new obligations
- This is a hard architectural constraint

### 10.6 Alert Firing
- **Alerts fire exactly once per transition**
- Never fire on steady state
- Previous urgency tracked in REMINDER_EVALUATED events
- Prevents alert fatigue

### 10.7 Email Sending
- **Fully event-driven**
- Watchers never send emails directly
- All outbound email is caused by events
- Delivery outcomes are recorded as events

### 10.8 State Authority
- **Event store is sole source of truth**
- Databases may cache projections
- Projections are disposable
- When in doubt, replay

---

## 11. Implementation Constraints

These constraints **must be enforced** in all implementations:

### 11.1 Backend Control Plane

**MUST:**
- ✅ Emit events synchronously before returning responses
- ✅ Validate all commands before event emission
- ✅ Enforce access control on all APIs
- ✅ Call LLM service only at ingestion, never during replay

**MUST NOT:**
- ❌ Store authoritative state outside event store
- ❌ Run background reasoning loops
- ❌ Retry LLM calls during replay
- ❌ Hold state in memory across requests

### 11.2 Watcher Runtime

**MUST:**
- ✅ Load all events for watcher
- ✅ Replay events deterministically
- ✅ Exit immediately after emitting events
- ✅ Be idempotent (same events → same output)

**MUST NOT:**
- ❌ Persist internal state
- ❌ Wait or loop indefinitely
- ❌ Call external services during replay
- ❌ Mutate historical events

### 11.3 LLM Service

**MUST:**
- ✅ Return structured JSON with evidence
- ✅ Include extractor version in output
- ✅ Timeout within configured limit
- ✅ Return errors explicitly

**MUST NOT:**
- ❌ Emit events
- ❌ Store long-lived state
- ❌ Chain prompts or call tools
- ❌ Retry autonomously
- ❌ Be called during replay

### 11.4 SMTP Adapter

**MUST:**
- ✅ Forward all received email to backend
- ✅ Extract watcher address correctly
- ✅ Log errors visibly

**MUST NOT:**
- ❌ Store email content
- ❌ Apply business logic
- ❌ Emit events
- ❌ Call LLMs

### 11.5 Frontend

**MUST:**
- ✅ Display projections from backend API
- ✅ Submit all actions via backend API
- ✅ Show evidence for extracted facts

**MUST NOT:**
- ❌ Contain business logic
- ❌ Access database directly
- ❌ Emit events

---

## 12. Canonical System Rule

**If a system behavior cannot be reconstructed by replaying immutable events without invoking external services, that behavior does not belong in DEVA.**

This is the ultimate test of architectural correctness.

### 12.1 Valid Behaviors

✅ Determining if thread should be closed  
→ Replay events, check for CLOSURE_EXTRACTED or user close action

✅ Computing urgency state  
→ Replay events, apply time-based rules to thread state

✅ Deciding to send alert  
→ Replay events, detect state transition from ok → warning

✅ Displaying thread timeline  
→ Replay events, project email sequence

### 12.2 Invalid Behaviors

❌ Automatically escalating based on "confidence score"  
→ Confidence is not in events

❌ Adjusting deadlines based on "learned patterns"  
→ Learning implies state outside events

❌ Re-running LLM extraction during replay  
→ LLM outputs must be frozen in events

❌ Inferring thread relationships from content  
→ Routing is address-based, not content-based

---

## 13. Summary

DEVA is a deterministic, event-sourced vigilance system built on four subsystems:

1. **Ingestion** - Captures reality as immutable events
2. **Runtime** - Evaluates events and emits new events
3. **Intelligence** - Extracts bounded facts from text
4. **Interfaces** - Delivers notifications and allows inspection

All behavior is explainable through event replay. LLMs are subordinate fact extractors, not decision-makers. Threads represent obligations with terminal closures. Alerts fire exactly once per transition. Humans remain in control at all times.

**If it's not in an event, it didn't happen.**

---

## Appendices

### A. Technology Stack Summary

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend | TypeScript + Bun | Event-sourced control plane |
| LLM Service | Python + vLLM | Fact extraction only |
| SMTP Adapter | Node.js or Python | Minimal transport layer |
| Frontend | React/Next.js (TBD) | Read-heavy dashboard |
| Event Store | PostgreSQL | Append-only JSONB |
| Scheduler | Cloud or cron | Time trigger injection |

### B. Deployment Patterns

**Development:**
- All services on localhost
- In-memory or local PostgreSQL
- Small LLM model

**Production:**
- Backend: Multiple instances behind load balancer
- LLM Service: GPU instance on private network
- SMTP Adapter: Single instance with mail routing
- Frontend: CDN-served static assets
- Event Store: PostgreSQL with replication

### C. Security Considerations

- API authentication with JWT
- LLM service on private network only
- SMTP sender validation and allowlists
- Rate limiting on all ingress points
- Event store access restricted to backend

### D. Monitoring and Observability

**Key Metrics:**
- Events per second
- Watcher runtime execution time
- LLM service latency and availability
- Alert delivery success rate
- Thread state distribution

**Logging:**
- All events logged structured
- LLM calls logged with input/output
- Error conditions logged explicitly
- Audit trail via event stream

### E. Testing Strategy

**Unit Tests:**
- Event replay determinism
- Thread urgency calculation
- Event validation

**Integration Tests:**
- Email ingestion → event emission
- LLM service calls → event creation
- Alert queueing → notification delivery

**Event Replay Tests:**
- Golden event logs → expected state
- No external service calls during replay
- Idempotence verification

---

**Document Version:** 1.0.0  
**Last Updated:** December 24, 2025  
**Status:** Implementation-Ready
