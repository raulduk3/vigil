# Vigil System Design Document (SDD)

**Deterministic, Event-Sourced Vigilance System for Time-Sensitive Email Oversight**

This document defines the complete, implementation-grade system design for Vigil. It is written for engineers responsible for implementing, operating, and evolving the system. All behavior, including AI usage, is strictly bounded and explainable through immutable event replay.

## SDD Traceability

The [Software Design Document (SDD)](SDD.md) is the **authoritative source of truth** for all system requirements. This technical design document elaborates on SDD architecture and behaviors.

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| System Purpose and Scope | FR-16 (Delegated Vigilance), FR-20 (Expressly Constrained Behavior) |
| Foundational Architecture | FR-16, CONS-1 through CONS-8, ASSUM-1 through ASSUM-8 |
| Event Store | MR-EventStore-1, MR-EventStore-2, MR-EventStore-3 |
| Watcher Runtime | MR-WatcherRuntime-1 through MR-WatcherRuntime-6 |
| API Endpoints | FR-2, FR-3, FR-4, FR-5, FR-6, FR-6b, FR-6c, FR-9, FR-15 |
| LLM Integration | FR-7, FR-7a, FR-8, FR-10, FR-11, FR-12, FR-13 |
| Notification System | FR-14, MR-NotificationWorker-1 through MR-NotificationWorker-3 |
| Infrastructure | IR-1 through IR-24 |
| Security | SEC-1 through SEC-8 |

See [SDD Section 5: Implementation Coverage Table](SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## 1. System Purpose and Scope

### 1.1 What Vigil Is

Vigil is a deterministic, event-sourced vigilance system that provides **delegated oversight** over explicitly routed email streams. The system exists to reduce the risk of quiet failure in time-sensitive email communication by:

- Observing elapsed time and silence
- Tracking stated or implied deadlines
- Surfacing advisory notifications when attention may be warranted

### 1.2 What Vigil Is NOT

Vigil is intentionally constrained and:

- **Does NOT** access inboxes
- **Does NOT** automate replies
- **Does NOT** infer intent beyond explicit extraction
- **Does NOT** assign tasks
- **Does NOT** act autonomously
- **Does NOT** connect to financial accounts, track balances, detect payments, or reconcile transactions
- **Never** becomes a decision-maker

**Humans retain full responsibility and control at all times.**

**Note on Financial Communications:** Bills, payment notices, and transaction emails can be routed to Vigil, but they are treated solely as communications asserting time-bound obligations—not as financial records. Vigil records when an email arrived, extracts any explicit deadlines stated in the message, and measures elapsed time and silence. This makes it useful for monitoring bill-related communication (noticing due dates, missing confirmations) while remaining fully general across all contexts where obligations emerge from language. Vigil tracks time commitments, not money.

### 1.3 Design Philosophy

The system favors:

- **Determinism over intelligence**
- **Transparency over automation**
- **Restraint over completeness**
- **Auditability over convenience**

Vigil's core promise is not to manage email, but to provide **confidence**: confidence that important communication is being observed, that silence is not going unnoticed, and that when nothing happens, it is because nothing needs to happen—not because something was missed.

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

Vigil is organized around four conceptual subsystems. These subsystems define **responsibility boundaries**, not deployment boundaries. Each subsystem contains one or more concrete components that may be independently deployed or scaled, but which do not constitute separate architectural domains.

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

#### Responsibilities

- Listen for SMTP connections on configured port
- Accept inbound email delivery
- Extract recipient address identifying the watcher
- Forward raw email payload to backend ingestion endpoint

#### Implementation Constraints

- **Must NOT** persist email content
- **Must NOT** apply business logic
- **Must NOT** emit events (only backend emits events)
- **Must NOT** call LLMs
- **Must NOT** retry indefinitely
- Failure is acceptable and visible

#### Routing Model

- Email routing is determined **solely by recipient address**
- Format: `<name>-<token>@ingest.vigil.email`
- Content is never examined for routing decisions
- This ensures explicit user intent and prevents misclassification

#### Configuration

See `smtp-adapter/.env.example`

#### Tech Stack

- Node.js/TypeScript or Python
- Minimal SMTP library
- HTTP client for backend forwarding

### 4.2 Backend Ingestion Endpoint

**Location:** `backend/src/backend/ingestion/` (to be implemented)

The backend ingestion endpoint is the **authoritative boundary** where email becomes part of the system.

#### Responsibilities

- Receive forwarded email from SMTP adapter
- Parse headers and body deterministically
- Normalize content (charset conversion, whitespace, etc.)
- Validate sender against watcher allowlists
- Deduplicate messages (by Message-ID or hash)
- Emit canonical `MESSAGE_RECEIVED` event (baseline fact)
- Emit `THREAD_ACTIVITY_OBSERVED` event (activity tracking)
- Orchestrate LLM extraction (if sender allowed and watcher active)
- Emit extraction record events based on LLM output

#### Invariants

- **No inference occurs before baseline event emission**
- **No state mutation occurs before event emission**
- MESSAGE_RECEIVED is sworn evidence—represents that an email was delivered, not what it means
- THREAD_ACTIVITY_OBSERVED is emitted for every message, establishing temporal baseline
- LLM extraction is called AFTER baseline events are persisted
- Parsing failures result in ERROR events, not silent drops

#### Message Non-Persistence Constraint

**Messages are NOT persisted as first-class entities.** The system does NOT store full email body content after ingestion.

- **Metadata Only Retained:** `from`, `subject`, `headers` (threading-related), `received_at`, `original_date`, `message_id`
- **Processing Pipeline:**
  1. Email body parsed for metadata extraction
  2. Body text sent to LLM service for fact extraction
  3. Body text discarded after extraction records are created
- **Recovery:** If a watcher misses an email (watcher paused, sender not in allowlist), the sender must resend and clearly label it as forwarded/resent
- **Rationale:** Minimizes PII storage, preserves state machine integrity, simplifies compliance
- **Data Traceability:** All pipeline metadata is preserved for user transparency—`received_at`, `from`, `original_date`, threading headers

#### Event Emission Sequence (Deterministic Pipeline)

**Step 1: Parse and Validate**

- Parse RFC 5322 email
- Normalize charset and whitespace
- Validate sender against allowlist
- Generate or retrieve message_id for deduplication

**Step 2: Emit Baseline Events (Always)**

```typescript
// Event 1: Message received (immutable fact)
{
  type: "MESSAGE_RECEIVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",        // Unique message identifier
  from: "sender@example.com",
  subject: "...",
  body_text: "...",
  received_at: number,
  headers: { ... },
  sender_allowed: boolean           // Result of allowlist check
}

// Event 2: Activity observed (temporal baseline for silence tracking)
{
  type: "THREAD_ACTIVITY_OBSERVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",
  observed_at: number               // When activity occurred
}
```

**Step 3: LLM Extraction (If Conditions Met)**

Conditions:

- Watcher status is `active`
- Sender is in allowlist (`sender_allowed: true`)
- LLM service is available

Extract structured facts:

- Hard deadlines (absolute timestamps with explicit language)
- Soft deadline signals (relative or fuzzy temporal language)
- Urgency signals (priority indicators without deadlines)
- Closure signals (completion or resolution language)

**Step 4: Emit Extraction Record Events**

Based on LLM output, emit zero or more:

```typescript
// Hard deadline found (binding obligation)
{
  type: "HARD_DEADLINE_OBSERVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",
  deadline_utc: number,             // Absolute UTC timestamp
  deadline_text: "by Friday 5pm EST",
  source_span: "Please reply by Friday 5pm EST",
  confidence: "high" | "medium" | "low",
  extractor_version: "v1.0.0",
  binding: true                      // This is a hard constraint
}

// Soft deadline signal (risk indicator, non-binding)
{
  type: "SOFT_DEADLINE_SIGNAL_OBSERVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",
  signal_text: "soon",
  source_span: "Please reply soon",
  estimated_horizon_hours: 48,      // Heuristic estimate
  confidence: "medium",
  extractor_version: "v1.0.0",
  binding: false                     // This is advisory only
}

// Urgency signal (attention indicator, no deadline)
{
  type: "URGENCY_SIGNAL_OBSERVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",
  urgency_level: "high" | "medium" | "low",
  indicators: ["urgent", "time-sensitive"],
  source_span: "This is urgent and time-sensitive",
  extractor_version: "v1.0.0"
}

// Closure signal (resolution language)
{
  type: "CLOSURE_SIGNAL_OBSERVED",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  message_id: "msg_abc123",
  closure_type: "explicit" | "implicit",
  source_span: "This issue is now resolved",
  confidence: "high",
  extractor_version: "v1.0.0"
}
```

#### Deduplication Strategy

- Use Message-ID header if present and valid
- Fall back to content hash (SHA-256 of from + subject + received_at)
- Store deduplication keys with message_id
- Duplicate detection prevents re-processing but logs occurrence

### 4.3 Event Store

**Location:** `backend/src/store/` (to be implemented)

The Event Store persists all immutable events.

#### Responsibilities

- Append-only event storage
- Preserve ordering per watcher
- Support full replay (all events)
- Support partial replay (events since timestamp)
- Support event retrieval by ID
- Support schema versioning

#### Implementation Options

- **PostgreSQL** with JSONB and append-only table (recommended)
- **EventStoreDB** for dedicated event sourcing
- **DynamoDB** for distributed deployment

#### Storage Schema

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

#### Constraints

- **No updates** to events
- **No deletes** (except compliance-required data removal)
- **No reinterpretation** of past events
- All system state must be reconstructible from events alone

#### Event Ordering

- Events for a single watcher are totally ordered by timestamp
- Events across watchers have no ordering guarantee
- Timestamp + event_id provides tie-breaking

## 5. Subsystem 2: Event-Sourced Runtime Executing Watchers

This subsystem evaluates events and determines whether new events should be emitted. It is the **only subsystem that applies business rules and policies**.

### 5.1 Backend Control Plane

**Location:** `backend/src/backend/` (to be implemented)

The Backend Control Plane is the **sole decision-making authority**.

#### Responsibilities

- Expose authenticated HTTP APIs
- Validate commands and user actions
- Create and persist events
- Invoke watcher runtime execution
- Orchestrate calls to LLM service
- Orchestrate notification dispatching
- Enforce access control

#### API Surface (Planned)

- `POST /api/watchers` - Create watcher
- `POST /api/watchers/:id/activate` - Activate watcher
- `POST /api/watchers/:id/pause` - Pause watcher
- `POST /api/threads/:id/close` - Manually close thread
- `GET /api/watchers/:id/threads` - Get current thread projections
- `POST /api/ingestion/email` - Receive email from SMTP adapter

#### Architecture

- Stateless HTTP API (no session state)
- Event-sourced state management
- Synchronous event emission
- Asynchronous watcher runtime invocation (queued)

#### Constraints

- **No authoritative state stored outside event store**
- **No background reasoning loops**
- **No LLM calls during replay**
- Stateless between requests
- All decisions traceable to events

#### Configuration

See `backend/.env.example`

### 5.2 Watcher Runtime Executor

**Location:** `backend/src/watcher/runtime.ts`

The Watcher Runtime Executor is a **stateless evaluation engine**.

#### Execution Sequence

1. **Load Events**  
   Fetch all events for watcher from event store

2. **Replay Events**  
   Reconstruct state deterministically:

   ```typescript
   type WatcherState = {
     watcher_id: string;
     status: "created" | "active" | "paused" | "deleted";
     threads: Map<string, ThreadState>;
     policy: WatcherPolicy | null;
   };

   type ThreadState = {
     thread_id: string;
     opened_at: number;
     last_activity_at: number;
     trigger_type: "hard_deadline" | "soft_deadline" | "urgency_signal";
     // NOTE: Threads do NOT own deadlines. References to extraction events for audit:
     hard_deadline_event_id: string | null;
     soft_deadline_event_id: string | null;
     urgency_signal_event_id: string | null;
     original_sender: string;
     original_received_at: number;
     status: "open" | "closed";
     closed_at: number | null;
     message_ids: readonly string[];
   };
   ```

3. **Evaluate Transitions**  
   Check for state transitions:

   - New thread creation (if MESSAGE_RECEIVED + HARD_DEADLINE_OBSERVED)
   - Thread closure (if CLOSURE_SIGNAL_OBSERVED or user action)
   - Reminder state change (if TIME_TICK)

4. **Emit New Events**  
   Generate events for any transitions:

   - THREAD_OPENED
   - THREAD_CLOSED
   - REMINDER_GENERATED
   - ALERT_QUEUED

5. **Exit**  
   Runtime execution completes

#### Invocation Model

```typescript
async function runWatcher(
  watcherId: string,
  eventStore: EventStore,
  triggerEventId?: string
): Promise<readonly VigilEvent[]>;
```

#### Constraints

- **No persistence** of internal state
- **No waiting** or looping
- **No external service calls** during replay
- **No mutation** of historical events
- Must be **deterministic** (same events → same output)
- **No LLM calls** during execution

#### Thread Lifecycle Rules

**Message Reception (Always):**

- Every email generates MESSAGE_RECEIVED event (immutable fact)
- Every email generates THREAD_ACTIVITY_OBSERVED event (temporal baseline)
- These are baseline observations, not interpretations

**Thread Opening (Extraction-Driven):**

- Thread opens when ANY extraction event is emitted
- **Router LLM runs on every email** and determines thread creation based on what it detects
- Thread creation is driven by extraction, NOT by explicit user intent
- Hard deadline observed → thread created (always)
- Soft deadline signal observed → thread created (always, but reminder generation controlled by policy)
- Urgency signal observed → thread created (always, but reminder generation controlled by policy)
- **Policy controls reminders, NOT thread creation**—threads are always created for audit and silence monitoring
- Opening decision is made by watcher runtime during replay when extraction events are present

**Thread Purpose:**

- Threads represent tracked conversations requiring monitoring
- **Threads do NOT own deadlines**—deadlines belong to Reminders
- Threads track silence (no new messages) and inactivity (no updates)
- Core feature: tracking when communications were sent, responded to, fulfilled, and when obligations were due
- Threads cannot be merged or reassigned across watchers

**Thread Tracking:**

- Threads track message_ids (chronological message history)
- Threads track references to extraction events (hard_deadline_event_id, soft_deadline_event_id)
- Threads maintain last_activity_at from THREAD_ACTIVITY_OBSERVED events
- Thread state is derived exclusively from events

**Thread Closure:**

- CLOSURE_SIGNAL_OBSERVED triggers closure evaluation
- User manual closure action (explicit user command)
- **Once closed, thread NEVER reopens** (terminal state)
- Closed threads preserved for tracking and audit
- Closed threads excluded from reports by default
- Messages matching closed threads create NEW threads

**Activity Tracking (Silence Detection):**

- THREAD_ACTIVITY_OBSERVED events update last_activity_at
- Silence is computed by comparing current_time vs last_activity_at
- If (current_time - last_activity_at) > silence_threshold_hours, emit SILENCE_THRESHOLD_EXCEEDED
- Silence events are derived facts, not baseline observations

**Extraction Event Audit Trail:**

- Extraction events are ALWAYS emitted when LLM detects signals
- Even when a thread already exists for the message
- Even when policy would not generate reminders
- Forms complete audit trail of what the system detected

### 5.3 Reminder Evaluation Logic

**Location:** `backend/src/watcher/runtime.ts` (evaluateThreadUrgency)

Reminder state is **derived artifact**, not stored state. Reminders are **attention prompts**, not obligations.

#### Critical Distinction

**Observed Facts (from events):**

- MESSAGE_RECEIVED (email arrived)
- HARD_DEADLINE_OBSERVED (explicit deadline found in message)
- SOFT_DEADLINE_SIGNAL_OBSERVED (temporal language detected)
- THREAD_ACTIVITY_OBSERVED (activity timestamp)
- SILENCE_THRESHOLD_EXCEEDED (derived from activity gaps)

**Derived Artifacts (computed by runtime):**

- Reminders (attention prompts based on policy + events)
- Urgency levels (risk assessment based on time-to-deadline)
- Reminder eligibility (based on thread events + configuration)

#### Reminder Generation Rules

**Reminders are created when:**

1. Hard deadline exists AND time-to-deadline crosses policy threshold
2. Soft deadline signal exists AND policy allows soft deadline reminders AND estimated horizon crossed
3. Silence threshold exceeded (no activity for N hours)
4. Thread is open (closed threads generate no reminders)

**Reminders are NOT created when:**

- Thread has no deadline and silence threshold not exceeded
- Thread is closed
- Watcher is paused
- Policy disables specific reminder type

#### Evaluation Formula

```typescript
function evaluateThreadReminders(
  thread: ThreadState,
  currentTime: number,
  policy: WatcherPolicy
): ReminderState {
  if (thread.status === "closed") {
    return {
      reminders: [],
      reason: "thread_closed",
    };
  }

  const reminders: Reminder[] = [];
  const hours_since_activity =
    (currentTime - thread.last_activity_at) / (1000 * 60 * 60);

  // Check hard deadline reminders (binding obligations)
  if (thread.hard_deadline_utc !== null) {
    const hours_until_deadline =
      (thread.hard_deadline_utc - currentTime) / (1000 * 60 * 60);

    if (hours_until_deadline < 0) {
      reminders.push({
        type: "deadline_overdue",
        urgency: "critical",
        causal_event_id: thread.hard_deadline_event_id,
        message: "Hard deadline has passed",
        binding: true,
      });
    } else if (hours_until_deadline < policy.deadline_critical_hours) {
      reminders.push({
        type: "deadline_approaching",
        urgency: "high",
        causal_event_id: thread.hard_deadline_event_id,
        message: `${hours_until_deadline.toFixed(1)} hours until hard deadline`,
        binding: true,
      });
    } else if (hours_until_deadline < policy.deadline_warning_hours) {
      reminders.push({
        type: "deadline_approaching",
        urgency: "medium",
        causal_event_id: thread.hard_deadline_event_id,
        message: `${hours_until_deadline.toFixed(1)} hours until hard deadline`,
        binding: true,
      });
    }
  }

  // Check soft deadline signals (non-binding, if enabled by policy)
  if (policy.enable_soft_deadline_reminders && thread.soft_deadline_signal) {
    const estimated_hours = thread.soft_deadline_signal.estimated_horizon_hours;
    const hours_since_signal =
      (currentTime - thread.soft_deadline_signal.observed_at) /
      (1000 * 60 * 60);

    if (hours_since_signal > estimated_hours) {
      reminders.push({
        type: "soft_deadline_elapsed",
        urgency: "low",
        causal_event_id: thread.soft_deadline_signal_event_id,
        message: `Soft deadline signal "${thread.soft_deadline_signal.signal_text}" time elapsed`,
        binding: false, // Advisory only
      });
    }
  }

  // Check silence threshold (independent of deadlines)
  if (hours_since_activity > policy.silence_threshold_hours) {
    reminders.push({
      type: "silence_exceeded",
      urgency: "medium",
      causal_event_id: thread.last_activity_event_id,
      message: `No activity for ${hours_since_activity.toFixed(1)} hours`,
      binding: false, // Attention prompt, not obligation
    });
  }

  return {
    reminders,
    evaluated_at: currentTime,
  };
}
```

#### Reminder Emission Rules

- Reminders are emitted as REMINDER_GENERATED events
- Each reminder references its causal thread event (traceability)
- Reminders fire **only on state transitions** (prevents spam)
- Previous reminder state tracked in REMINDER_GENERATED events
- Reminders are labeled as "attention prompts" in user-facing messages

#### Policy Configuration

- `silence_threshold_hours` (default: 72)
- `deadline_warning_hours` (default: 24)
- `deadline_critical_hours` (default: 2)
- `enable_soft_deadline_reminders` (boolean, default: false)
- `reminder_throttle_minutes` (minimum interval between same-type reminders, default: 60)

### 5.4 Scheduler / Time Trigger Source

**Location:** `backend/src/scheduler/` (to be implemented)

The scheduler injects time into the system as an explicit trigger.

#### Responsibilities

- Periodically emit TIME_TICK trigger events
- Schedule watcher runtime execution
- Configurable evaluation frequency per watcher

#### Implementation Options

- **Cron jobs** triggering API endpoints
- **Cloud scheduler** (AWS EventBridge, GCP Cloud Scheduler)
- **In-process scheduler** (node-cron, Bun timer)

#### Event Emission

```typescript
{
  type: "TIME_TICK",
  event_id: "uuid",
  timestamp: number,
  watcher_id: "w1",
  tick_timestamp: number
}
```

#### Constraints

- Does **not** emit authoritative events (only triggers)
- Does **not** store state
- Does **not** evaluate business logic
- **Time never creates facts, only urgency**

#### Frequency Recommendations

- Default: Every 15 minutes
- High-urgency watchers: Every 5 minutes
- Low-urgency watchers: Hourly

## 6. Subsystem 3: Bounded Semantic Intelligence

This subsystem provides **bounded semantic extraction** from unstructured email text. It is explicitly designed to be **incapable of autonomous behavior or decision-making**.

### 6.1 Purpose and Scope

The LLM exists only to extract **structured observations** from email text. It never interprets meaning, never infers intent, never asserts obligation.

**Narrow Extraction Tasks:**

1. **Hard Deadline Extraction**: Identify explicit temporal constraints with absolute timestamps

   - "Please respond by December 31, 2025 at 5pm EST"
   - Output: UTC timestamp + source text span + confidence

2. **Soft Deadline Signal Detection**: Identify fuzzy temporal language without absolute deadlines

   - "Please reply soon", "by end of week", "at your earliest convenience"
   - Output: Signal text + estimated horizon + source span + confidence + binding=false

3. **Urgency Signal Detection**: Identify priority indicators without temporal constraints

   - "urgent", "critical", "time-sensitive", "ASAP"
   - Output: Urgency level + indicator list + source span

4. **Closure Signal Detection**: Identify resolution or completion language
   - "This issue is resolved", "Thanks, we're all set"
   - Output: Closure type + source span + confidence

**The LLM NEVER:**

- ❌ Decides if thread should open (backend decides via policy)
- ❌ Decides if reminder should fire (runtime decides via evaluation)
- ❌ Asserts that message contains obligation (only extracts signals)
- ❌ Interprets what user "meant" (only extracts what text states)
- ❌ Chains reasoning or makes inferences beyond explicit extraction

### 6.2 Architectural Position

```
Email Ingestion → MESSAGE_RECEIVED event → Backend
                                            ↓
                                    Call LLM Service
                                            ↓
                                    Structured Facts
                                            ↓
                                    HARD_DEADLINE_OBSERVED event
```

The LLM service is called **synchronously** after MESSAGE_RECEIVED is emitted, but **never during replay**.

### 6.3 LLM Extraction Service (vLLM)

**Location:** `llm-service/` (independent repository)

The LLM Extraction Service is a dedicated, non-authoritative service backed by vLLM.

#### Responsibilities

- Perform deadline extraction
- Perform silence-sensitive risk extraction
- Perform explicit closure detection
- Optionally classify which extraction should be attempted

#### Architecture

- Separate deployment (can run on different machine with GPU)
- vLLM-backed inference for performance
- Private network only (not publicly accessible)
- HTTP API with minimal endpoints
- Stateless request/response model

#### Supported Endpoints

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
Extract hard deadline (absolute timestamp with explicit language).

Request:

```json
{
  "email_text": "Please reply by Friday December 27, 2025 at 5pm EST",
  "reference_timestamp": 1703462400000,
  "reference_timezone": "America/New_York"
}
```

Response:

```json
{
  "deadline_found": true,
  "deadline_utc": 1735344000000,
  "deadline_text": "Friday December 27, 2025 at 5pm EST",
  "source_span": "Please reply by Friday December 27, 2025 at 5pm EST",
  "confidence": "high",
  "extractor_version": "v1.0.0",
  "is_absolute": true,
  "binding_language": true
}
```

**POST /extract/soft_deadline**  
Extract soft deadline signals (fuzzy temporal language).

Request:

```json
{
  "email_text": "Please respond at your earliest convenience",
  "reference_timestamp": 1703462400000
}
```

Response:

```json
{
  "signal_found": true,
  "signal_text": "at your earliest convenience",
  "source_span": "Please respond at your earliest convenience",
  "estimated_horizon_hours": 72,
  "confidence": "medium",
  "extractor_version": "v1.0.0",
  "is_absolute": false,
  "binding_language": false
}
```

**POST /extract/urgency**  
Extract urgency signals (priority indicators).

Response:

```json
{
  "urgency_found": true,
  "urgency_level": "high",
  "indicators": ["urgent", "time-sensitive"],
  "source_span": "This is urgent and time-sensitive",
  "confidence": "high",
  "extractor_version": "v1.0.0"
}
```

**POST /extract/closure**  
Detect explicit closure language.

Response:

```json
{
  "closure_found": true,
  "closure_type": "explicit",
  "source_span": "This matter is now resolved. Thank you.",
  "confidence": "high",
  "extractor_version": "v1.0.0"
}
```

#### Configuration

See `llm-service/.env.example`

#### Tech Stack

- Python 3.11+
- vLLM for inference
- FastAPI for HTTP endpoints
- Pydantic for schema validation

### 6.4 Output Contract

All LLM outputs must:

- Be fully structured (JSON schema validated)
- Include **source_span** (verbatim text excerpt from email)
- Include **extractor_version** metadata
- Include **confidence** level (high/medium/low)
- Include **binding_language** flag for deadlines (true = hard deadline, false = soft signal)
- Be validated by backend before event emission
- Be deterministic given same input (temperature near-zero)

#### Backend Validation

```typescript
function validateLLMOutput(output: LLMExtractionOutput): boolean {
  // Schema validation (all required fields present)
  if (!output.source_span || !output.confidence || !output.extractor_version) {
    return false;
  }

  // Evidence verification (source_span must exist in email text)
  const normalized_text = email_text.toLowerCase();
  const normalized_span = output.source_span.toLowerCase();
  if (!normalized_text.includes(normalized_span)) {
    return false;
  }

  // Deadline sanity checks
  if (output.deadline_found && output.deadline_utc) {
    // Deadline must be future-dated
    if (output.deadline_utc < Date.now()) {
      return false;
    }
    // Deadline must be within 5 years
    const five_years = 5 * 365 * 24 * 60 * 60 * 1000;
    if (output.deadline_utc > Date.now() + five_years) {
      return false;
    }
  }

  // Confidence threshold (reject low confidence extractions)
  if (output.confidence === "low") {
    return false; // Or log for analysis, don't emit event
  }

  return true;
}
```

LLM output is **not authoritative** until backend converts it to thread event.

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

#### Failure Handling

If LLM service is unavailable:

- Backend logs warning
- MESSAGE_RECEIVED event is still emitted
- Thread may be created with null deadline
- System remains correct but with reduced informational fidelity

If LLM returns low confidence:

- Backend may choose not to emit extraction event
- This is a policy decision, not an LLM decision

#### Replay Guarantee

**LLM calls occur only at ingestion time or explicit evaluation points and are never repeated during replay.**

When replaying events:

- HARD_DEADLINE_OBSERVED event is used as-is
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

#### Responsibilities

- Monitor event stream for ALERT_QUEUED and REPORT_GENERATED events
- Send alert emails to configured recipients
- Send periodic watcher reports
- Retry delivery with exponential backoff
- Emit delivery outcome events (ALERT_SENT, ALERT_FAILED)

#### Event-Driven Model

```
Watcher Runtime → ALERT_QUEUED event → Notification Worker
                                           ↓
                                    Send Email
                                           ↓
                                    ALERT_SENT event
```

Watchers do **not** send emails directly. They emit events that **cause** emails to be sent.

#### Email Templates

**Alert Email:**

```
Subject: [Vigil Alert] Thread requires attention

Watcher: {watcher_name}
Thread: {thread_id}
Status: {urgency_state}
Deadline: {deadline_timestamp}
Last Activity: {hours_since_activity} hours ago

View thread: {dashboard_url}/threads/{thread_id}
```

**Report Email:**

```
Subject: [Vigil Report] {watcher_name} - {date}

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

#### Configuration

- SMTP server for outbound email
- Email templates
- Retry policy (max 3 attempts, exponential backoff)

#### Constraints

- **No decision-making** (only executes based on events)
- **No LLM usage**
- **No domain state mutation**
- Delivery failure is acceptable and recorded

### 7.2 Frontend (Dashboard and Inspection UI)

**Location:** `frontend/` (independent repository)

Read-heavy inspection and control interface.

#### Responsibilities

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

#### Architecture

- Communicates with backend via REST API
- Optional: WebSocket for real-time updates
- Displays **projections** (derived state), not authoritative events
- All mutations flow through backend APIs → event creation

#### Example API Calls

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

#### Design Principles

**Reassurance-First:**

- Reports emphasize what is resolved or stable
- Then show what appears on track
- Finally show what may require attention (last, not first)

**Transparency:**

- Every displayed status links to specific events
- Every alert shows the state transition that triggered it
- Every extracted signal shows verbatim evidence from email

#### Constraints

- ❌ **No business logic** in frontend
- ❌ **No direct database access**
- ❌ **No event emission** (only via backend API)
- ✅ All state derived from backend API responses

#### Tech Stack (TBD)

- React/Next.js or similar
- TypeScript
- REST API client
- Optional: WebSocket for real-time

#### Configuration

See `frontend/.env.example`

### 7.3 State Reconstruction and Query Strategy

When users view watchers, threads, and reminders in the dashboard, the system must provide **current derived state** efficiently while maintaining the guarantee that all state comes from events.

#### The Two-Tier Approach

Vigil uses a **two-tier state reconstruction strategy** that balances correctness with performance:

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
  const threadsWithUrgency = Array.from(state.threads.values()).map(
    (thread) => ({
      ...thread,
      urgency: evaluateThreadUrgency(thread, currentTime),
    })
  );

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
  message_ids JSONB,

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
   async function updateProjection(newEvent: VigilEvent) {
     if (newEvent.type === "THREAD_OPENED") {
       await db.insert("thread_projections", {
         thread_id: newEvent.thread_id,
         status: "open",
         opened_at: newEvent.opened_at,
         last_event_id: newEvent.event_id,
         // ... other fields
       });
     } else if (newEvent.type === "THREAD_CLOSED") {
       await db
         .update("thread_projections")
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
     return threads.map((thread) => ({
       ...thread,
       urgency: evaluateThreadUrgency(thread, Date.now()),
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

| Scenario                           | Strategy              | Rationale                        |
| ---------------------------------- | --------------------- | -------------------------------- |
| New watcher (< 100 events)         | Replay on every query | Fast enough, always fresh        |
| Active watcher (100-10K events)    | Replay on every query | Still fast, simpler architecture |
| High-volume watcher (> 10K events) | Cached projection     | Necessary for performance        |
| Projection missing/corrupted       | Fall back to replay   | Self-healing, always correct     |
| Audit/debugging                    | Always replay         | Verification against projection  |
| Report generation                  | Replay from events    | Ensures accuracy for records     |

#### The Event Log View

When users view the **raw event log** for a watcher:

```typescript
// GET /api/watchers/w1/events?limit=100&offset=0
async function getWatcherEvents(
  watcherId: string,
  limit: number,
  offset: number
) {
  // Direct query from event store (no replay needed)
  const events = await eventStore.query({
    watcher_id: watcherId,
    order: "timestamp DESC",
    limit,
    offset,
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

1. **User navigates to:** `https://Vigil.example.com/watchers/w1`

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
_If frontend displays a status, and you replay events, you MUST get the same status. If not, the projection is wrong and must be rebuilt._

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

## 8. Core Domain Concepts

### 8.1 Watchers

The **watcher** is the primary configuration and operational unit in Vigil.

#### Definition

A watcher represents a **bounded area of responsibility**, such as:

- Personal finance correspondence
- Legal matters
- Client billing
- Vendor contracts
- Customer support escalations
- Compliance deadlines

Each watcher operates independently with its own event stream, policy, and notification configuration.

#### Complete Watcher Schema

```typescript
type Watcher = {
  // Identity (immutable)
  watcher_id: string; // UUID, assigned at creation
  account_id: string; // Parent account
  ingest_token: string; // Unique token for email routing
  created_at: number; // Unix timestamp (ms)
  created_by: string; // User ID of creator

  // Configuration (mutable via events)
  name: string; // Human-readable name
  status: "created" | "active" | "paused";
  policy: WatcherPolicy;
};

type WatcherPolicy = {
  // Sender Control
  allowed_senders: readonly string[]; // Email allowlist (exact match)

  // Timing Thresholds
  silence_threshold_hours: number; // Hours of inactivity before silence alert
  deadline_warning_hours: number; // Hours before deadline for warning alert
  deadline_critical_hours: number; // Hours before deadline for critical alert

  // Notification Configuration
  notification_channels: readonly NotificationChannel[];

  // Reporting Configuration
  reporting_cadence: "daily" | "weekly" | "on_demand";
  reporting_recipients: readonly string[]; // Email addresses for reports
  reporting_time?: string; // ISO 8601 time (e.g., "09:00:00Z")
  reporting_day?:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
};

type NotificationChannel = {
  type: "email" | "webhook";
  destination: string; // Email address or webhook URL
  urgency_filter: "all" | "warning" | "critical"; // Minimum urgency to notify
  enabled: boolean; // Allow disabling without removing
};
```

#### Field Definitions

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
  - Example: "Personal Finance" → `personal-finance-a7f3k9@ingest.vigil.email`

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
    - MESSAGE_RECEIVED event still emitted
    - But no thread creation or LLM extraction
  - Example: `["alice@company.com", "billing@vendor.org"]`

- `silence_threshold_hours`: Inactivity window for silence detection

  - Default: 72 (3 days)
  - Range: 1 to 720 (1 hour to 30 days)
  - Applies only to threads without explicit deadlines
  - Timer resets on any thread activity (MESSAGE_RECEIVED with matching thread_id)
  - If thread has both deadline and silence threshold, earliest boundary triggers alert

- `deadline_warning_hours`: Pre-deadline warning threshold

  - Default: 24 (1 day)
  - Must be > deadline_critical_hours
  - Alert fires once on state transition: ok → warning
  - Used to compute urgency_level in REMINDER_GENERATED events

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
      - `"webhook"`: HTTP POST to URL with JSON payload
    - `destination`: Address/URL for delivery
      - Email: RFC 5322 valid email address
      - Webhook: HTTPS URL (HTTP allowed for dev only)
    - `urgency_filter`: Minimum urgency to deliver
      - `"all"`: ok, warning, critical, overdue
      - `"warning"`: warning, critical, overdue (not ok)
      - `"critical"`: critical, overdue only
      - Used for escalation: email for warnings, webhook for critical
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

#### Watcher Lifecycle

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
  - MESSAGE_RECEIVED events still emitted (audit trail)
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

#### Email Routing

Each watcher has a unique ingestion email address:

```
<sanitized-name>-<ingest_token>@ingest.vigil.email
```

**Address Construction:**

1. Take watcher name: "Personal Finance"
2. Sanitize: lowercase, replace spaces with hyphens: "personal-finance"
3. Append hyphen and ingest_token: "personal-finance-a7f3k9"
4. Append domain: "personal-finance-a7f3k9@ingest.vigil.email"

**Examples:**

```
name: "Personal Finance"  → personal-finance-a7f3k9@ingest.vigil.email
name: "Legal Matters"     → legal-matters-b2j8m1@ingest.vigil.email
name: "Client Billing"    → client-billing-x4p9j2@ingest.vigil.email
name: "Vendor Contracts"  → vendor-contracts-k5n7p9@ingest.vigil.email
```

**Routing Rules:**

- SMTP adapter extracts recipient address from SMTP envelope
- Parses address to extract ingest_token
- Forwards raw email to backend POST /api/ingestion/email with token
- Backend looks up watcher_id by ingest_token
- Backend emits MESSAGE_RECEIVED event with watcher_id
- **Email content, subject, sender, or headers are NEVER examined for routing**
- Invalid tokens (not found) are rejected at SMTP layer (400 response)

**Security:**

- Ingest tokens are cryptographically random (8-12 chars, base36)
- Collision probability is negligible (36^8 = 2.8 trillion combinations)
- Tokens are never logged in plaintext (hash for lookups)
- Changing a watcher's name does NOT change its token
- Token rotation is not currently supported (would require new address)

### 8.2 Threads

**Threads represent tracked communication contexts, not obligations.**

#### Critical Distinction

**Threads track:**

- Messages (chronological message history)
- Observed deadlines (hard and soft signals from extraction)
- Activity timestamps (for silence detection)
- Closure signals

**Threads DO NOT represent:**

- ❌ Obligations (threads track contexts, reminders prompt attention)
- ❌ Tasks (Vigil doesn't assign work)
- ❌ Commitments (threads observe signals, don't assert intent)

#### Definition

A thread is created when extraction records indicate potential attention requirements:

- Hard deadline observed (explicit temporal constraint)
- Soft deadline signal observed AND policy enables soft deadline tracking
- Multiple messages form conversation requiring continuity tracking

#### Thread Properties

```typescript
type ThreadState = {
  thread_id: string;
  watcher_id: string;
  opened_at: number;
  last_activity_at: number;
  status: "open" | "closed";
  closed_at: number | null;

  // Observed deadlines (from extraction records)
  hard_deadline_utc: number | null;
  hard_deadline_event_id: string | null;
  hard_deadline_text: string | null;

  soft_deadline_signal: {
    signal_text: string;
    estimated_horizon_hours: number;
    observed_at: number;
  } | null;
  soft_deadline_signal_event_id: string | null;

  // Message tracking
  message_ids: readonly string[];

  // Closure tracking
  closure_signal_observed: boolean;
  closure_event_id: string | null;
};
```

#### Thread Lifecycle

**Opening (Conditional):**

- Thread opens when extraction record + policy indicate tracking warranted
- HARD_DEADLINE_OBSERVED → thread opens (binding deadline exists)
- SOFT_DEADLINE_SIGNAL_OBSERVED + policy.enable_soft_deadline_tracking → thread opens
- URGENCY_SIGNAL_OBSERVED alone does NOT open thread (advisory only)

**Activity Tracking:**

- THREAD_ACTIVITY_OBSERVED events update last_activity_at
- Used for silence detection (derived evaluation)

**Closure (Terminal):**

- CLOSURE_SIGNAL_OBSERVED triggers closure evaluation
- User manual closure (explicit command)
- **Once closed, thread NEVER reopens** (immutable invariant)

**State Transitions:**

```
[No Thread] → HARD_DEADLINE_OBSERVED → [Thread: Open]
[Thread: Open] → CLOSURE_SIGNAL_OBSERVED → [Thread: Closed]
[Thread: Open] → User Close Command → [Thread: Closed]
[Thread: Closed] → (terminal state, no further transitions)
```

### 8.3 Reminders and Urgency

**Reminders are derived artifacts—attention prompts, not obligations.**

#### Critical Distinction

**Observed Facts (Events):**

- MESSAGE_RECEIVED (email arrived)
- HARD_DEADLINE_OBSERVED (explicit deadline in text)
- SOFT_DEADLINE_SIGNAL_OBSERVED (fuzzy temporal language)
- THREAD_ACTIVITY_OBSERVED (activity timestamp)
- SILENCE_THRESHOLD_EXCEEDED (activity gap exceeded policy)

**Derived Artifacts (Computed):**

- Reminders (attention prompts based on evaluation)
- Urgency levels (time-to-deadline assessment)
- Reminder eligibility (policy + events → should prompt?)

#### Reminder Structure

```typescript
type Reminder = {
  reminder_id: string;
  thread_id: string;
  watcher_id: string;
  type:
    | "deadline_approaching"
    | "deadline_overdue"
    | "soft_deadline_elapsed"
    | "silence_exceeded";
  urgency: "low" | "medium" | "high" | "critical";
  message: string;
  causal_event_id: string; // References thread event that triggered reminder
  binding: boolean; // true = hard deadline, false = advisory
  generated_at: number;
};
```

#### Urgency Levels

**For Hard Deadlines (binding):**

- **critical** - Deadline within deadline_critical_hours (default: 2h) OR overdue
- **high** - Deadline within deadline_warning_hours (default: 24h)
- **medium** - Deadline exists but not yet approaching
- **low** - (not used for hard deadlines)

**For Soft Deadlines (non-binding, if enabled):**

- **low** - Estimated horizon elapsed, advisory prompt

**For Silence (non-binding):**

- **medium** - Silence threshold exceeded
- **low** - Approaching silence threshold (if pre-silence warnings enabled)

#### Reminder Generation Rules

**Reminders fire when:**

1. State transition occurs (not on steady state)
2. Thread is open (closed threads generate no reminders)
3. Watcher is active (paused watchers generate no reminders)
4. Policy enables reminder type

**State Transitions That Generate Reminders:**

```
Hard Deadline:
  [hours_until > warning_hours] → [hours_until < warning_hours] → REMINDER (medium urgency)
  [hours_until < warning_hours] → [hours_until < critical_hours] → REMINDER (high urgency)
  [hours_until < critical_hours] → [hours_until < 0] → REMINDER (critical urgency)

Soft Deadline (if enabled):
  [hours_since_signal < horizon] → [hours_since_signal > horizon] → REMINDER (low urgency, advisory)

Silence:
  [hours_since_activity < threshold] → [hours_since_activity > threshold] → REMINDER (medium urgency, advisory)
```

**Reminders DO NOT fire when:**

- Thread is closed
- Watcher is paused
- Same state persists (prevents spam)
- Policy disables reminder type
- Throttle period not elapsed (anti-spam)

#### Reminder Lifecycle

```
Thread Events + Policy → Evaluation → REMINDER_GENERATED event
REMINDER_GENERATED → Notification Worker → Delivery Attempt
Delivery Success → REMINDER_DELIVERED event
Delivery Failure → REMINDER_DELIVERY_FAILED event
```

### 8.4 Signal Types and Binding Semantics

#### Hard Deadlines (Binding Constraints)

**Definition:**  
Explicit temporal language with absolute or unambiguous timestamps.

**Examples:**

```
"Please respond by December 31, 2025 at 5pm EST"
"Due Friday March 15th end of business day"
"Reply by 3pm today"
```

**Properties:**

- `binding: true` - Represents explicit constraint
- Resolved to absolute UTC timestamp
- High confidence extraction required
- Creates high/critical urgency reminders
- Tracked in thread state as `hard_deadline_utc`

**Event:**

```typescript
{
  type: "HARD_DEADLINE_OBSERVED",
  deadline_utc: 1735689600000,
  deadline_text: "December 31, 2025 at 5pm EST",
  source_span: "Please respond by December 31, 2025 at 5pm EST",
  binding: true,
  confidence: "high"
}
```

#### Soft Deadline Signals (Non-Binding Risk Indicators)

**Definition:**  
Fuzzy temporal language without absolute timestamps. Advisory only.

**Examples:**

```
"Please reply soon"
"At your earliest convenience"
"When you get a chance"
"By end of week"
```

**Properties:**

- `binding: false` - Advisory signal, not hard constraint
- Estimated horizon (heuristic, not absolute)
- Medium/low confidence acceptable
- Creates low urgency reminders (if enabled by policy)
- Tracked in thread state as `soft_deadline_signal`

**Event:**

```typescript
{
  type: "SOFT_DEADLINE_SIGNAL_OBSERVED",
  signal_text: "soon",
  source_span: "Please reply soon",
  estimated_horizon_hours: 48,
  binding: false,
  confidence: "medium"
}
```

**Policy Control:**

```typescript
{
  enable_soft_deadline_tracking: boolean,  // Default: false
  soft_deadline_reminder_enabled: boolean  // Default: false
}
```

#### Urgency Signals (Priority Indicators, No Timeline)

**Definition:**  
Language indicating priority or importance without temporal constraints.

**Examples:**

```
"This is urgent"
"High priority"
"Time-sensitive matter"
"ASAP"
```

**Properties:**

- No deadline (hard or soft)
- Advisory context for other signals
- Does NOT independently create threads
- May influence reminder message tone
- Logged but doesn't drive thread lifecycle

**Event:**

```typescript
{
  type: "URGENCY_SIGNAL_OBSERVED",
  urgency_level: "high",
  indicators: ["urgent", "time-sensitive"],
  source_span: "This is urgent and time-sensitive"
}
```

#### Silence Thresholds (Derived, Not Observed)

**Definition:**  
Time elapsed since last THREAD_ACTIVITY_OBSERVED event.

**Properties:**

- Computed by runtime (not extracted from text)
- Applies to threads with or without deadlines
- Configurable threshold (default: 72 hours)
- Creates medium urgency reminder
- `binding: false` - Attention prompt, not obligation

**Derived Event:**

```typescript
{
  type: "SILENCE_THRESHOLD_EXCEEDED",
  thread_id: "t1",
  hours_since_activity: 73.2,
  threshold_hours: 72,
  last_activity_event_id: "evt_abc123"
}
```

#### Binding Semantics Summary

| Signal Type       | Binding | Creates Thread | Creates Reminder  | Urgency       |
| ----------------- | ------- | -------------- | ----------------- | ------------- |
| Hard Deadline     | Yes     | Always         | Yes               | High/Critical |
| Soft Deadline     | No      | If enabled     | If enabled        | Low           |
| Urgency Signal    | No      | No             | No (context only) | N/A           |
| Silence Threshold | No      | No             | Yes               | Medium        |

## 9. Event Model

Events are the **complete authoritative record** of system state.

### 9.1 Event Structure

All events share base structure:

```typescript
type BaseEvent = {
  readonly event_id: string; // UUID
  readonly timestamp: number; // Unix ms
  readonly watcher_id?: string; // Optional (not all events belong to watcher)
};
```

### 9.2 Event Categories

#### Baseline Observation Events (Always Emitted)

- `MESSAGE_RECEIVED` - Email delivered and parsed (immutable fact)
- `THREAD_ACTIVITY_OBSERVED` - Activity timestamp recorded (silence tracking baseline)

#### Extraction Record Events (LLM-Derived, Conditional)

- `HARD_DEADLINE_OBSERVED` - Explicit deadline with absolute timestamp (binding)
- `SOFT_DEADLINE_SIGNAL_OBSERVED` - Fuzzy temporal language detected (non-binding)
- `URGENCY_SIGNAL_OBSERVED` - Priority indicators found (advisory)
- `CLOSURE_SIGNAL_OBSERVED` - Resolution language detected

#### Thread Lifecycle Events (Runtime-Derived)

- `THREAD_OPENED` - Thread created based on extraction records + policy
- `THREAD_CLOSED` - Thread terminated (user action or closure signal)

#### Derived Events (Time-Based Evaluation)

- `SILENCE_THRESHOLD_EXCEEDED` - No activity for configured duration
- `REMINDER_GENERATED` - Attention prompt based on policy + thread events
- `REMINDER_DELIVERED` - Reminder sent to notification channel
- `REMINDER_DELIVERY_FAILED` - Reminder delivery unsuccessful

#### Control Plane Events

- `ACCOUNT_CREATED` - New account
- `USER_CREATED` - New user in account
- `WATCHER_CREATED` - New watcher
- `WATCHER_ACTIVATED` - Watcher begins monitoring
- `WATCHER_PAUSED` - Watcher paused by user
- `WATCHER_RESUMED` - Watcher resumed
- `POLICY_UPDATED` - Watcher policy changed

#### Time Trigger Events

- `TIME_TICK` - Scheduled evaluation trigger

#### Reporting Events

- `REPORT_GENERATED` - Periodic summary created
- `REPORT_SENT` - Report delivered

### 9.3 Forbidden Events

These events **must never exist** as they violate architectural invariants:

- ❌ `THREAD_REOPENED` (closure is terminal)
- ❌ `AGENT_LOOP_STARTED` (no agent behavior)
- ❌ `AUTO_ESCALATED` (no autonomous action)
- ❌ `INBOX_SCANNED` (no inbox access)
- ❌ `LLM_RETRIED` (LLM calls not retried during replay)
- ❌ `OBLIGATION_INFERRED` (system observes signals, doesn't assert obligations)
- ❌ `INTENT_INTERPRETED` (system extracts facts, doesn't interpret intent)
- ❌ `DEADLINE_ASSUMED` (deadlines must be explicit in extraction records)
- ❌ `REMINDER_OBLIGATION` (reminders are prompts, not obligations)

### 9.4 Event Schema

See [backend/src/events/types.ts](../backend/src/events/types.ts) for complete TypeScript definitions.

## 10. Cross-Cutting Guarantees

These guarantees apply **across all subsystems**:

### 10.1 Deterministic Replay

- Same events always produce identical state
- Replay requires zero external calls
- No randomness in business logic
- LLM outputs frozen in extraction record events, not recomputed

### 10.2 Explainability

- All decisions traceable to specific events
- All reminders reference causal thread event (traceability)
- All extracted signals include source_span (verbatim text)
- Event log is complete audit trail

### 10.3 Graceful Degradation

- LLM unavailability degrades capability, not correctness
- Baseline events (MESSAGE_RECEIVED, THREAD_ACTIVITY_OBSERVED) always emitted
- SMTP adapter failure is visible, not silent
- Reminder delivery failure recorded, system continues

### 10.4 Immutability

- Events never modified
- Events never deleted (except compliance requirements)
- Corrections made by emitting new events
- Event store is append-only

### 10.5 Thread Closure Finality

- **Closed threads never reopen** (hard architectural constraint)
- New messages create new threads if warranted by extraction
- Closure is terminal state

### 10.6 Reminder Firing Discipline

- **Reminders fire only on state transitions** (prevents spam)
- Never fire on steady state
- Previous state tracked in REMINDER_GENERATED events
- Throttle mechanism prevents excessive reminders

### 10.7 Email Sending Event-Driven

- **Fully event-driven** (no direct sending from runtime)
- All outbound email caused by REMINDER_GENERATED events
- Delivery outcomes recorded as events (REMINDER_DELIVERED / REMINDER_DELIVERY_FAILED)

### 10.8 State Authority

- **Event store is sole source of truth**
- Databases may cache projections (disposable)
- Projections are rebuildable from events
- When in doubt, replay

### 10.9 One-Way Data Flow

- Email → MESSAGE_RECEIVED → LLM Extraction → Extraction Record Events → Thread Events → Reminders
- No circular dependencies
- No feedback loops
- Each stage reads previous stage output, never writes backward

### 10.10 Separation of Observation and Interpretation

- Baseline events record facts (message arrived, activity observed)
- Extraction records capture signals (deadline language, urgency indicators)
- Thread events aggregate context (messages + deadlines + activity)
- Reminders are derived prompts (policy + thread state → attention needed?)
- Clear boundaries prevent conflation of "what was said" vs "what it means"

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

**If a system behavior cannot be reconstructed by replaying immutable events without invoking external services, that behavior does not belong in Vigil.**

This is the ultimate test of architectural correctness.

### 12.1 Valid Behaviors

✅ Determining if thread should be closed  
→ Replay events, check for CLOSURE_SIGNAL_OBSERVED or user close command

✅ Computing reminder eligibility  
→ Replay events, apply policy rules to thread state (hard deadline + time → reminder?)

✅ Deciding to generate reminder  
→ Replay events, detect state transition (approaching deadline)

✅ Displaying thread timeline  
→ Replay MESSAGE_RECEIVED events, project message sequence

✅ Computing silence duration  
→ Replay THREAD_ACTIVITY_OBSERVED events, compute time delta

✅ Validating extraction record  
→ Replay MESSAGE_RECEIVED event, verify source_span exists in body_text

### 12.2 Invalid Behaviors

❌ Automatically escalating based on "confidence score"  
→ Confidence is metadata, not decision input

❌ Adjusting deadlines based on "learned patterns"  
→ Learning implies state outside events

❌ Re-running LLM extraction during replay  
→ Extraction records frozen in events

❌ Inferring thread relationships from content  
→ Thread membership must be explicit in events

❌ Asserting obligation exists  
→ System observes deadline signals, doesn't assert obligations

❌ Interpreting user intent  
→ System extracts explicit language, doesn't infer meaning

### 12.3 Traceability Test

For any displayed reminder or alert:

1. Identify the REMINDER_GENERATED event
2. Trace to causal_event_id (thread event that triggered it)
3. Trace to MESSAGE_RECEIVED or extraction record event
4. Verify source_span exists in original message body_text
5. Verify policy rules applied correctly

**If any step fails, the reminder is invalid.**

## 13. Summary

Vigil is a deterministic, event-sourced vigilance system built on four subsystems:

1. **Ingestion** - Captures reality as immutable baseline events
2. **Runtime** - Evaluates events and emits derived events
3. **Intelligence** - Extracts structured signals from text (subordinate)
4. **Interfaces** - Delivers reminders and allows inspection

### Key Architectural Principles

**One-Way Data Flow:**

```
Email → MESSAGE_RECEIVED → LLM Extraction → Extraction Records → Thread Events → Reminders
```

**Event Hierarchy:**

- **Baseline Events**: MESSAGE_RECEIVED, THREAD_ACTIVITY_OBSERVED (always emitted)
- **Extraction Records**: HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, etc. (LLM-derived)
- **Thread Events**: THREAD_OPENED, THREAD_CLOSED (runtime-derived)
- **Derived Events**: REMINDER_GENERATED, SILENCE_THRESHOLD_EXCEEDED (evaluation-derived)

**Clear Separations:**

- **Observation vs Interpretation**: Events capture signals, reminders provide prompts
- **Binding vs Advisory**: Hard deadlines are constraints, soft signals are indicators
- **Fact vs Artifact**: Messages are facts, reminders are derived artifacts

**Core Guarantees:**

- All behavior explainable through event replay
- LLMs extract signals, never assert obligations
- Threads track context, reminders prompt attention
- Closure is terminal, reminders fire once per transition
- Humans retain full control

**What Vigil Is:**
A non-acting vigilance system that observes email signals, tracks temporal context, and generates attention prompts based on configurable policies.

**What Vigil Is Not:**
An agent, a task manager, an obligation tracker, an intent interpreter, or an autonomous decision-maker.

**If it's not in an event, it didn't happen.**

## Appendices

### A. Technology Stack Summary

| Component    | Technology          | Notes                       |
| ------------ | ------------------- | --------------------------- |
| Backend      | TypeScript + Bun    | Event-sourced control plane |
| LLM Service  | Python + vLLM       | Fact extraction only        |
| SMTP Adapter | Node.js or Python   | Minimal transport layer     |
| Frontend     | React/Next.js (TBD) | Read-heavy dashboard        |
| Event Store  | PostgreSQL          | Append-only JSONB           |
| Scheduler    | Cloud or cron       | Time trigger injection      |

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
