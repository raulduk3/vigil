# DEVA System Design Document (SDD)

**Deterministic, Event-Sourced Vigilance System for Time-Sensitive Email Oversight**

This document defines the complete, implementation-grade system design for DEVA. It is written for engineers responsible for implementing, operating, and evolving the system. All behavior, including AI usage, is strictly bounded and explainable through immutable event replay.


## Table of Contents

1. [System Purpose and Scope](#1-system-purpose-and-scope)
2. [Foundational Architecture](#2-foundational-architecture)
3. [Four-Subsystem Architecture](#3-four-subsystem-architecture)
4. [Subsystem 1: Ingestion and Immutable Event Capture](#4-subsystem-1-ingestion-and-immutable-event-capture)
5. [Subsystem 2: Event-Sourced Runtime Executing Watchers](#5-subsystem-2-event-sourced-runtime-executing-watchers)
6. [Subsystem 3: Bounded Semantic Intelligence](#6-subsystem-3-bounded-semantic-intelligence)
7. [Subsystem 4: Notification and Inspection Interfaces](#7-subsystem-4-notification-and-inspection-interfaces)
   - 7.3 [State Reconstruction and Query Strategy](#73-state-reconstruction-and-query-strategy)
8. [Core Domain Concepts](#8-core-domain-concepts)
9. [Event Model](#9-event-model)
10. [Cross-Cutting Guarantees](#10-cross-cutting-guarantees)
11. [Implementation Constraints](#11-implementation-constraints)
12. [Canonical System Rule](#12-canonical-system-rule)


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

### 7.3 State Reconstruction and Query Strategy

When users view watchers, threads, and reminders in the dashboard, the system must provide **current derived state** efficiently while maintaining the guarantee that all state comes from events.

#### The Two-Tier Approach

DEVA uses a **two-tier state reconstruction strategy** that balances correctness with performance:

**Tier 1: Real-Time Event Replay (Small Watchers)**

For watchers with manageable event counts (typically < 10,000 events):

```typescript
// User requests: GET /api/watchers/w1/threads
async function getWatcherThreads(watcherId: string) {
  // 1. Load ALL events for this watcher from event store
  const events = await eventStore.getEventsForWatcher(watcherId);
  
  // 2. Replay events to rebuild state (pure function, no side effects)
  const state = replayEvents(events);
  
  // 3. Compute current urgency for each open thread
  const currentTime = Date.now();
  const threadsWithUrgency = Array.from(state.threads.values())
    .map(thread => ({
      ...thread,
      urgency: evaluateThreadUrgency(thread, currentTime)
    }));
  
  // 4. Return derived state as JSON
  return { threads: threadsWithUrgency };
}
```

**Properties:**
- ✅ Always 100% correct (truth comes from events)
- ✅ No stale data possible
- ✅ No cache invalidation complexity
- ✅ Deterministic (same events = same state)
- ⏱️ Typical response time: 50-200ms for ~1000 events

This is the **default mode** and works well for most users.

**Tier 2: Cached Projections (High-Volume Watchers)**

For watchers with many events (> 10,000) where replay becomes slow:

```sql
-- Projection table (disposable, rebuildable)
CREATE TABLE thread_projections (
  thread_id VARCHAR PRIMARY KEY,
  watcher_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  opened_at BIGINT,
  last_activity_at BIGINT,
  deadline_timestamp BIGINT,
  closed_at BIGINT,
  email_ids JSONB,
  
  -- Metadata for cache management
  last_event_id VARCHAR,      -- Last event that updated this projection
  last_event_timestamp BIGINT, -- When projection was last updated
  
  INDEX idx_watcher_status (watcher_id, status)
);
```

**Projection Maintenance:**

1. **Initial Build:** When watcher is created or projection is missing
   ```typescript
   const events = await eventStore.getEventsForWatcher(watcherId);
   const state = replayEvents(events);
   await saveProjections(state.threads);
   ```

2. **Incremental Update:** When new events arrive
   ```typescript
   async function updateProjection(newEvent: DevaEvent) {
     if (newEvent.type === "THREAD_OPENED") {
       await db.insert("thread_projections", {
         thread_id: newEvent.thread_id,
         status: "open",
         opened_at: newEvent.opened_at,
         last_event_id: newEvent.event_id,
         // ... other fields
       });
     }
     else if (newEvent.type === "THREAD_CLOSED") {
       await db.update("thread_projections")
         .where("thread_id", newEvent.thread_id)
         .set({ status: "closed", closed_at: newEvent.closed_at });
     }
   }
   ```

3. **Query:** Dashboard reads from projection table
   ```typescript
   async function getWatcherThreads(watcherId: string) {
     const threads = await db
       .select("*")
       .from("thread_projections")
       .where("watcher_id", watcherId)
       .where("status", "open");
     
     // Still compute urgency in real-time (changes with time)
     return threads.map(thread => ({
       ...thread,
       urgency: evaluateThreadUrgency(thread, Date.now())
     }));
   }
   ```

**Properties:**
- ⚡ Very fast (< 10ms for queries)
- 🔄 Eventually consistent (may lag slightly after new events)
- 🗑️ **Disposable** - can be deleted and rebuilt anytime
- ✅ **Never authoritative** - events are still the source of truth
- 🔧 Rebuilds automatically if projection is missing or stale

#### Strategy Selection

| Scenario | Strategy | Rationale |
|----------|----------|-----------|
| New watcher (< 100 events) | Replay on every query | Fast enough, always fresh |
| Active watcher (100-10K events) | Replay on every query | Still fast, simpler architecture |
| High-volume watcher (> 10K events) | Cached projection | Necessary for performance |
| Projection missing/corrupted | Fall back to replay | Self-healing, always correct |
| Audit/debugging | Always replay | Verification against projection |
| Report generation | Replay from events | Ensures accuracy for records |

#### The Event Log View

When users view the **raw event log** for a watcher:

```typescript
// GET /api/watchers/w1/events?limit=100&offset=0
async function getWatcherEvents(watcherId: string, limit: number, offset: number) {
  // Direct query from event store (no replay needed)
  const events = await eventStore.query({
    watcher_id: watcherId,
    order: "timestamp DESC",
    limit,
    offset
  });
  
  return { events };
}
```

**This is always a direct read** from the event store - no replay, no derivation, just the raw immutable facts. This provides:
- Complete audit trail
- Exact timestamps of every action
- Verbatim evidence from LLM extractions
- User actions and system decisions
- Alert delivery outcomes

#### Projection Self-Healing

Projections can become stale or corrupted. The system detects and rebuilds:

```typescript
// Health check: verify projection matches replay
async function verifyProjection(watcherId: string): Promise<boolean> {
  const projection = await loadProjection(watcherId);
  const events = await eventStore.getEventsForWatcher(watcherId);
  const replayedState = replayEvents(events);
  
  return deepEqual(projection, replayedState);
}

// If verification fails, rebuild
async function rebuildProjection(watcherId: string) {
  console.log(`Rebuilding projection for watcher ${watcherId}`);
  
  const events = await eventStore.getEventsForWatcher(watcherId);
  const state = replayEvents(events);
  
  // Atomic replace
  await db.transaction(async (tx) => {
    await tx.delete("thread_projections").where("watcher_id", watcherId);
    await tx.insert("thread_projections", Array.from(state.threads.values()));
  });
  
  console.log(`Projection rebuilt from ${events.length} events`);
}
```

**Rebuild triggers:**
- Manual admin command
- Scheduled verification job (nightly)
- Automatic on query timeout
- After major version upgrade
- On projection schema change

#### Example: User Login Flow

Here's what happens when a user logs in and views a watcher:

1. **User navigates to:** `https://deva.example.com/watchers/w1`

2. **Frontend calls:** `GET /api/watchers/w1/threads`

3. **Backend decides strategy:**
   ```typescript
   const eventCount = await eventStore.countEvents(watcherId);
   
   if (eventCount < 10000) {
     // Tier 1: Replay
     return await getThreadsViaReplay(watcherId);
   } else {
     // Tier 2: Projection (with freshness check)
     return await getThreadsViaProjection(watcherId);
   }
   ```

4. **If using replay (Tier 1):**
   - Load all events for watcher
   - Replay in memory (pure function)
   - Compute urgency for each thread
   - Return JSON to frontend
   - **Total time: ~100ms**

5. **If using projection (Tier 2):**
   - Query projection table
   - Check last_event_timestamp
   - If stale (> 5 min old), trigger async rebuild
   - Compute urgency for each thread (always live)
   - Return JSON to frontend
   - **Total time: ~10ms**

6. **Frontend renders:**
   - Thread cards with status badges
   - Urgency indicators (color-coded)
   - Last activity timestamps
   - Deadline countdowns
   - Links to view full thread details

#### Architectural Guarantees

**The Golden Rule:**  
*If frontend displays a status, and you replay events, you MUST get the same status. If not, the projection is wrong and must be rebuilt.*

**Benefits:**
- ✅ **Always correct**: Events are source of truth
- ✅ **Self-healing**: Projections rebuild if corrupted
- ✅ **No cache invalidation**: Projections are disposable
- ✅ **Debuggable**: Can always verify projection vs replay
- ✅ **Scalable**: Handles both small and large watchers
- ✅ **Simple**: No complex distributed cache coordination

**Trade-offs:**
- 🔄 Projections may lag slightly (typically < 1 second)
- 💾 Duplicate storage (events + projections)
- 🔧 Requires projection maintenance logic

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
- Customer support escalations
- Compliance deadlines

Each watcher operates independently with its own event stream, policy, and notification configuration.

#### Complete Watcher Schema:

```typescript
type Watcher = {
  // Identity (immutable)
  watcher_id: string;                // UUID, assigned at creation
  account_id: string;                // Parent account
  ingest_token: string;              // Unique token for email routing
  created_at: number;                // Unix timestamp (ms)
  created_by: string;                // User ID of creator
  
  // Configuration (mutable via events)
  name: string;                      // Human-readable name
  status: "created" | "active" | "paused";
  policy: WatcherPolicy;
};

type WatcherPolicy = {
  // Sender Control
  allowed_senders: readonly string[];        // Email allowlist (exact match)
  
  // Timing Thresholds
  silence_threshold_hours: number;           // Hours of inactivity before silence alert
  deadline_warning_hours: number;            // Hours before deadline for warning alert
  deadline_critical_hours: number;           // Hours before deadline for critical alert
  
  // Notification Configuration
  notification_channels: readonly NotificationChannel[];
  
  // Reporting Configuration
  reporting_cadence: "daily" | "weekly" | "on_demand";
  reporting_recipients: readonly string[];   // Email addresses for reports
  reporting_time?: string;                   // ISO 8601 time (e.g., "09:00:00Z")
  reporting_day?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
};

type NotificationChannel = {
  type: "email" | "sms" | "webhook";
  destination: string;                       // Email address, phone number, or URL
  urgency_filter: "all" | "warning" | "critical"; // Minimum urgency to notify
  enabled: boolean;                          // Allow disabling without removing
};
```

#### Field Definitions:

**Identity Fields (Immutable):**

- `watcher_id`: UUID assigned at creation, never changes, used in all events
- `account_id`: Links watcher to parent account for access control
- `ingest_token`: Cryptographically random string (8-12 characters) for email routing
  - Must be unique across all watchers
  - Used to construct ingestion email address
  - Never exposed in logs or external APIs (PII-like sensitivity)
- `created_at`: Timestamp of WATCHER_CREATED event
- `created_by`: User who created the watcher (for audit trail)

**Configuration Fields (Mutable):**

- `name`: Human-readable identifier
  - Displayed in dashboards, emails, and reports
  - Used in ingestion email address (sanitized: lowercase, hyphens only)
  - Validation: 1-100 characters, alphanumeric + spaces/hyphens
  - Example: "Personal Finance" → `personal-finance-a7f3k9@ingest.deva.email`

- `status`: Operational state derived from lifecycle events
  - `"created"`: Watcher exists but not yet activated (no monitoring)
  - `"active"`: Fully operational (emails create threads, alerts fire)
  - `"paused"`: Temporarily suspended (emails accepted but no threads/alerts)
  - State transitions:
    - created → active: WATCHER_ACTIVATED (requires valid policy)
    - active → paused: WATCHER_PAUSED (user action)
    - paused → active: WATCHER_RESUMED (user action)

**Policy Fields:**

- `allowed_senders`: Email address allowlist
  - Exact match only (no wildcards, no domain-level matching)
  - Case-insensitive comparison
  - Empty array = accept from anyone (not recommended for production)
  - Emails from non-allowed senders:
    - Logged as INFO (not ERROR)
    - EMAIL_RECEIVED event still emitted
    - But no thread creation or LLM extraction
  - Example: `["alice@company.com", "billing@vendor.org"]`

- `silence_threshold_hours`: Inactivity window for silence detection
  - Default: 72 (3 days)
  - Range: 1 to 720 (1 hour to 30 days)
  - Applies only to threads without explicit deadlines
  - Timer resets on any thread activity (EMAIL_RECEIVED with matching thread_id)
  - If thread has both deadline and silence threshold, earliest boundary triggers alert

- `deadline_warning_hours`: Pre-deadline warning threshold
  - Default: 24 (1 day)
  - Must be > deadline_critical_hours
  - Alert fires once on state transition: ok → warning
  - Used to compute urgency_state in REMINDER_EVALUATED events

- `deadline_critical_hours`: Pre-deadline critical threshold
  - Default: 2
  - Must be > 0
  - Alert fires once on state transition: warning → critical
  - Separate alert fires on critical → overdue (when deadline passes)

- `notification_channels`: Alert delivery destinations
  - At least one enabled channel required for watcher activation
  - Multiple channels supported (redundancy and escalation)
  - Each channel has:
    - `type`: Delivery mechanism
      - `"email"`: SMTP delivery to email address
      - `"sms"`: SMS via Twilio/similar (future)
      - `"webhook"`: HTTP POST to URL with JSON payload
    - `destination`: Address/URL for delivery
      - Email: RFC 5322 valid email address
      - SMS: E.164 format phone number (future)
      - Webhook: HTTPS URL (HTTP allowed for dev only)
    - `urgency_filter`: Minimum urgency to deliver
      - `"all"`: ok, warning, critical, overdue
      - `"warning"`: warning, critical, overdue (not ok)
      - `"critical"`: critical, overdue only
      - Used for escalation: email for warnings, SMS for critical
    - `enabled`: Allows disabling without removing from array
  - Delivery failure handling:
    - Retry 3 times with exponential backoff (1s, 5s, 25s)
    - If all retries fail, emit ALERT_FAILED event
    - System continues (doesn't block on notification delivery)

- `reporting_cadence`: Summary report frequency
  - `"daily"`: Every 24 hours at specified time
  - `"weekly"`: Every 7 days at specified day/time
  - `"on_demand"`: Only when user explicitly requests
  - Used by scheduler to emit REPORT_GENERATED events

- `reporting_recipients`: Email addresses for reports
  - Separate from notification_channels (different content and urgency)
  - Can overlap with allowed_senders
  - Reports emphasize reassurance (what's resolved/stable) before items requiring attention

- `reporting_time` (optional): ISO 8601 time for daily/weekly reports
  - Format: "HH:MM:SSZ" (UTC timezone)
  - Example: "09:00:00Z" = 9 AM UTC
  - If omitted, defaults to "09:00:00Z"

- `reporting_day` (optional): Day of week for weekly reports
  - Required if cadence is "weekly"
  - Example: "monday" = weekly report every Monday at reporting_time

#### Watcher Lifecycle:

**1. Creation (WATCHER_CREATED event):**
```typescript
{
  type: "WATCHER_CREATED",
  watcher_id: "w_a1b2c3d4",
  account_id: "acc_x9y8z7",
  name: "Personal Finance",
  ingest_token: "a7f3k9",
  created_by: "user_abc123",
  timestamp: 1703001600000
}
```
- User submits POST /api/watchers with name and initial policy
- Backend generates watcher_id and ingest_token
- Backend validates policy (allowed_senders, thresholds, channels)
- Backend emits WATCHER_CREATED event
- Status = "created" (not yet monitoring)
- Ingestion email address is immediately active but won't create threads

**2. Activation (WATCHER_ACTIVATED event):**
```typescript
{
  type: "WATCHER_ACTIVATED",
  watcher_id: "w_a1b2c3d4",
  timestamp: 1703002000000
}
```
- User submits POST /api/watchers/:id/activate
- Backend validates:
  - Watcher exists and status is "created" or "paused"
  - Policy has at least one enabled notification channel
  - Thresholds are valid (warning > critical > 0)
- Backend emits WATCHER_ACTIVATED event
- Status = "active"
- Monitoring begins: emails can create threads, alerts can fire

**3. Pause (WATCHER_PAUSED event):**
```typescript
{
  type: "WATCHER_PAUSED",
  watcher_id: "w_a1b2c3d4",
  paused_by: "user_abc123",
  reason: "On vacation until Jan 15",
  timestamp: 1703088000000
}
```
- User submits POST /api/watchers/:id/pause with optional reason
- Backend emits WATCHER_PAUSED event
- Status = "paused"
- Effects:
  - Emails still accepted at ingestion address (logged)
  - EMAIL_RECEIVED events still emitted (audit trail)
  - But no THREAD_OPENED, no LLM extraction, no alerts
  - Existing open threads remain open but don't evaluate urgency
- Use case: Temporary absence, system maintenance, testing

**4. Resume (WATCHER_RESUMED event):**
```typescript
{
  type: "WATCHER_RESUMED",
  watcher_id: "w_a1b2c3d4",
  resumed_by: "user_abc123",
  timestamp: 1703174400000
}
```
- User submits POST /api/watchers/:id/resume
- Backend emits WATCHER_RESUMED event
- Status = "active"
- Effects:
  - All existing open threads re-evaluate urgency (may fire alerts if overdue)
  - New emails can create threads and trigger LLM extraction
  - Alerts resume firing

**5. Policy Update (POLICY_UPDATED event):**
```typescript
{
  type: "POLICY_UPDATED",
  watcher_id: "w_a1b2c3d4",
  policy: {
    allowed_senders: ["alice@company.com"],
    silence_threshold_hours: 48,
    deadline_warning_hours: 12,
    deadline_critical_hours: 2,
    notification_channels: [...],
    reporting_cadence: "weekly",
    reporting_recipients: ["user@example.com"]
  },
  updated_by: "user_abc123",
  timestamp: 1703260800000
}
```
- User submits PATCH /api/watchers/:id/policy
- Backend validates new policy (same rules as activation)
- Backend emits POLICY_UPDATED event with complete new policy
- Effects apply immediately:
  - New thresholds used in next urgency evaluation
  - New notification channels used for next alert
  - Historical events unchanged (policy is forward-only)

#### Email Routing:

Each watcher has a unique ingestion email address:

```
<sanitized-name>-<ingest_token>@ingest.deva.email
```

**Address Construction:**
1. Take watcher name: "Personal Finance"
2. Sanitize: lowercase, replace spaces with hyphens: "personal-finance"
3. Append hyphen and ingest_token: "personal-finance-a7f3k9"
4. Append domain: "personal-finance-a7f3k9@ingest.deva.email"

**Examples:**
```
name: "Personal Finance"  → personal-finance-a7f3k9@ingest.deva.email
name: "Legal Matters"     → legal-matters-b2j8m1@ingest.deva.email
name: "Client Billing"    → client-billing-x4p9j2@ingest.deva.email
name: "Vendor Contracts"  → vendor-contracts-k5n7p9@ingest.deva.email
```

**Routing Rules:**
- SMTP adapter extracts recipient address from SMTP envelope
- Parses address to extract ingest_token
- Forwards raw email to backend POST /api/ingestion/email with token
- Backend looks up watcher_id by ingest_token
- Backend emits EMAIL_RECEIVED event with watcher_id
- **Email content, subject, sender, or headers are NEVER examined for routing**
- Invalid tokens (not found) are rejected at SMTP layer (400 response)

**Security:**
- Ingest tokens are cryptographically random (8-12 chars, base36)
- Collision probability is negligible (36^8 = 2.8 trillion combinations)
- Tokens are never logged in plaintext (hash for lookups)
- Changing a watcher's name does NOT change its token
- Token rotation is not currently supported (would require new address)


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


## 13. Summary

DEVA is a deterministic, event-sourced vigilance system built on four subsystems:

1. **Ingestion** - Captures reality as immutable events
2. **Runtime** - Evaluates events and emits new events
3. **Intelligence** - Extracts bounded facts from text
4. **Interfaces** - Delivers notifications and allows inspection

All behavior is explainable through event replay. LLMs are subordinate fact extractors, not decision-makers. Threads represent obligations with terminal closures. Alerts fire exactly once per transition. Humans remain in control at all times.

**If it's not in an event, it didn't happen.**


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


**Document Version:** 1.0.0  
**Last Updated:** December 24, 2025  
**Status:** Implementation-Ready
