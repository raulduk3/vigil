# Vigil Software Design Document (SDD)

**Document Version:** 1.1.0  
**Date:** December 25, 2025  
**Status:** Production-Grade Specification

## Document Structure

This SDD provides complete, test-derivable specifications for the Vigil system organized into eleven sections:

1. **System Overview** - Purpose, boundaries, actors, core primitives, integrations, and complete system lifecycle
   - 1.1 System Purpose
   - 1.2 System Boundaries
   - 1.3 External Actors
   - 1.4 Core System Primitives (Watcher, Event, Thread, Message, Reminder, Alert, Policy)
   - 1.5 System Integrations
   - 1.6 Complete System Lifecycle (6 phases: Ingestion → Evaluation → Notification → Reporting → Time-Based → User Actions)
   - 1.7 Logging Architecture
   - 1.8 Unit Testing Strategy
   - 1.9 Authoritative Design Constraints (DC-1 through DC-11)
2. **Feature Requirements (FR-1 through FR-20)** - User-facing capabilities with acceptance criteria
3. **Infrastructure Requirements (IR-1 through IR-24)** - Non-functional requirements with verification methods
4. **Module-Level Requirements** - Implementation specifications for 7 modules:
   - Event Store (MR-EventStore-1 through 3)
   - Watcher Runtime (MR-WatcherRuntime-1 through 6)
   - Backend Ingestion (MR-BackendIngestion-1 through 4)
   - LLM Service (MR-LLMService-1 through 5)
   - Notification Worker (MR-NotificationWorker-1 through 3)
   - Frontend API Client (MR-Frontend-1 through 3)
   - Scheduler (MR-Scheduler-1 through 2)
5. **Traceability Matrix** - Maps features to modules to tests
6. **Security Requirements (SEC-1 through SEC-8)** - Authentication, authorization, PII protection
7. **Data Consistency Requirements (CONS-1 through CONS-8)** - Event ordering, replay guarantees, causal integrity, per-watcher idempotence
8. **Assumptions (ASSUM-1 through ASSUM-8)** - System preconditions and mitigations
9. **Document Revision History**
10. **Event Type Catalog** - Complete reference for all 20+ event types organized by tier
11. **Glossary** - Definitions for 30+ domain terms

**Key Architectural Principles:**

- **Event-Sourced:** All state derived from immutable, append-only events
- **Deterministic:** Same events always produce same state via replay
- **Traceable:** Every alert traces backward through causal chain to original email
- **One-Way Flow:** Strict data flow from baseline → extraction → thread → reminder → alert
- **Bounded LLM:** Semantic extraction only, never interpretation or decision-making
- **Separation of Concerns:** Observations (events) vs. Interpretations (reminders) clearly distinguished

## 1. System Overview

### 1.1 System Purpose

Vigil is a deterministic, event-sourced vigilance system that monitors explicitly routed email streams for time-sensitive obligations. The system provides delegated oversight by tracking deadlines, detecting prolonged silence, and emitting advisory notifications when human attention may be warranted.

### 1.2 System Boundaries

**In Scope:**

- Accepting email forwarded to unique ingestion addresses
- Extracting structured facts from email text (deadlines, closure signals)
- Tracking obligation threads with due boundaries
- Computing time-relative urgency state
- Emitting alert notifications on state transitions
- Providing audit trail via immutable event log
- Displaying current state derived from events

**Explicitly Out of Scope:**

- Inbox access or scanning
- Automated email replies or composition
- Task assignment or delegation
- Autonomous decision-making or escalation
- Intent inference beyond explicit extraction
- Agent behavior or feedback loops

### 1.3 External Actors

1. **Human Users** - Configure watchers, view state, close threads manually
2. **Email Senders** - Send email to watcher ingestion addresses
3. **SMTP Infrastructure** - Delivers email to Vigil ingestion endpoint
4. **LLM Service** - Extracts structured facts from email text (subordinate component)

### 1.4 Core System Primitives

The Vigil system is built from these foundational objects:

#### Watcher

**Definition:** Isolated monitoring scope with unique ingestion address and policy configuration.

**Key Properties:**

- `watcher_id` (UUID) - Unique identifier
- `watcher_name` (string) - Human-readable label
- `ingestion_address` (string) - Email address for forwarding: `<name>-<token>@ingest.vigil.email`
- `status` (enum: created, active, paused, deleted) - Current operational state
- `policy` (WatcherPolicy object) - Configuration including allowlists, thresholds, notification channels
- `deleted_at` (Unix ms | null) - When watcher was deleted (null if not deleted)

**Lifecycle:** Created → Activated → [Paused ↔ Resumed] → Active → [Deleted]

**Deletion Behavior:** Watchers are deletable entities. Deleting a watcher:
- Emits WATCHER_DELETED event with `deleted_at` timestamp
- Sets watcher status to `deleted`
- Stops all monitoring, alerting, and reporting for this watcher
- Preserves all historical thread and extraction data (immutable audit trail)
- Ingestion address becomes inactive (emails rejected or bounced)
- Deleted watchers are excluded from scheduler TIME_TICK generation

**Data Preservation:** Deletion removes the oversight role without mutating historical data. All events, threads, reminders, and alerts associated with the watcher remain in the event store for audit purposes.

**Relationship:** Each watcher owns zero or more Threads. Watchers are isolated - events from one watcher never affect another.

#### Event

**Definition:** Immutable, append-only record of state change. The sole source of truth.

**Key Properties:**

- `event_id` (UUID) - Unique identifier
- `timestamp` (Unix ms) - When event was created
- `watcher_id` (UUID) - Which watcher this event belongs to
- `type` (string) - Event type (MESSAGE_RECEIVED, HARD_DEADLINE_OBSERVED, etc.)
- Type-specific payload fields

**Hierarchy:**

1. **Baseline Events** - Direct observations (MESSAGE_RECEIVED)
2. **Extraction Records** - LLM-extracted facts (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED)
3. **Thread Lifecycle** - State transitions (THREAD_OPENED, THREAD_ACTIVITY_OBSERVED, THREAD_CLOSED)
4. **Derived Artifacts** - Computed state (REMINDER_GENERATED, ALERT_QUEUED)

**Three-Tier Extraction Model:**

- **Tier 1 (Binding):** HARD_DEADLINE_OBSERVED - Explicit dates/times ("Friday 5pm", "December 31st")
- **Tier 2 (Advisory):** SOFT_DEADLINE_SIGNAL_OBSERVED - Fuzzy temporal language ("next week", "end of month", "soon")
- **Tier 3 (Loosest):** URGENCY_SIGNAL_OBSERVED - Questions, requests, obligations without dates ("I need this", "can you provide", "ASAP", "please respond")

**Relationship:** Events are stored in Event Store. Runtime reads events to reconstruct current state.

#### Thread

**Definition:** Tracked communication context representing an ongoing conversation that a watcher is responsible for monitoring. Threads do NOT own deadlines—deadlines belong to Reminders derived from threads.

**Key Properties:**

- `thread_id` (UUID) - Unique identifier
- `watcher_id` (UUID) - Parent watcher
- `status` (enum: open, closed) - Current state
- `opened_at` (Unix ms) - When thread was created
- `closed_at` (Unix ms | null) - When thread was closed (null if open)
- `message_ids` (array) - All message_ids in this thread (references to MESSAGE_RECEIVED events)
- `last_activity_at` (Unix ms) - Most recent activity timestamp (for silence detection)
- `original_sender` (string) - Email address of original message sender
- `original_received_at` (Unix ms) - When the triggering email was originally received
- `participants` (array) - All email addresses involved in thread (from, to, cc)
- `trigger_type` (enum: hard_deadline, soft_deadline, urgency_signal) - What extraction triggered thread creation

**Thread Creation:** The router LLM runs on every inbound email and determines whether a new thread must be created. Thread creation is driven by extraction events, not by explicit user intent. When ANY extraction event occurs (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, or CLOSURE_SIGNAL_OBSERVED for an untracked conversation), a thread is created.

**Silence and Inactivity Monitoring:** Threads are monitored for silence (no new messages) and inactivity (no updates). When `hours_since_activity` exceeds `policy.silence_threshold_hours`, a SILENCE_THRESHOLD_EXCEEDED event is emitted, which may generate reminders.

**No Deadline Ownership:** Threads themselves have no `deadline_utc` field. Deadlines are properties of Reminders, which are derived artifacts computed from extraction events associated with threads.

**Lifecycle:** Created (on extraction event) → Open (active monitoring) → Closed (on closure signal or manual action)

**Relationship:** Each thread belongs to exactly one Watcher. Threads aggregate Messages (by reference) and may have Reminders (derived artifacts). Threads cannot be arbitrarily reassigned or merged across watchers.

**Closed Thread Behavior:** Closed threads remain in the system for audit and confirmation purposes. Users may track closed threads in watchers to confirm obligations were fulfilled. Closed threads are excluded from reports unless explicitly requested.

**Thread Detection and Grouping:**

Threads are formed by grouping related messages using email metadata. Vigil does NOT store email body text after ingestion, so thread detection relies exclusively on headers and identifiers.

**Primary Thread Grouping Logic:**

1. **Message-ID Chaining** (RFC 5322 References)

   - Extract `In-Reply-To` header from incoming email
   - Extract `References` header (contains chain of parent Message-IDs)
   - If any Message-ID in chain matches existing thread's messages → add to that thread
   - Example: Email B with `In-Reply-To: <msg-A@example.com>` joins thread containing message A

2. **Subject Line Normalization**

   - Normalize subject: remove `Re:`, `Fwd:`, `[External]`, case-insensitive, trim whitespace
   - If normalized subject matches existing open thread AND sender/recipient overlap → potential match
   - Subject alone is NOT sufficient (prevents false positives from generic subjects like "Question")

3. **Conversation-Index Header** (Microsoft Outlook threading)

   - Extract `Conversation-Index` header if present
   - If matches existing thread's conversation index → add to thread
   - Provides deterministic threading for Outlook-generated emails

4. **Thread-Topic Header** (Microsoft threading)
   - Extract `Thread-Topic` header if present
   - Use as secondary signal when combined with sender/recipient overlap

**Thread Grouping Algorithm:**

```
FUNCTION determine_thread_id(message: MessageReceived, existing_threads: Thread[]):

  // Step 1: Check In-Reply-To and References headers
  IF message.headers['In-Reply-To'] OR message.headers['References']:
    parent_message_ids = parse_message_id_chain(message.headers)
    FOR EACH thread IN existing_threads WHERE thread.status == "open":
      FOR EACH message_id IN thread.message_ids:
        IF message_id IN parent_message_ids:
          RETURN thread.thread_id  // Found parent, join this thread

  // Step 2: Check Conversation-Index (Outlook threading)
  IF message.headers['Conversation-Index']:
    conversation_index = message.headers['Conversation-Index']
    FOR EACH thread IN existing_threads WHERE thread.status == "open":
      IF thread.conversation_index == conversation_index:
        RETURN thread.thread_id

  // Step 3: Normalized subject + participant overlap (weak signal)
  normalized_subject = normalize_subject(message.subject)
  FOR EACH thread IN existing_threads WHERE thread.status == "open":
    IF thread.normalized_subject == normalized_subject:
      // Check if sender or recipient appears in thread participant list
      IF message.from IN thread.participants OR
         ANY(message.to INTERSECT thread.participants):
        // Additional check: messages within 7 days of each other
        IF (message.received_at - thread.last_activity_at) < (7 * 24 * 3600000):
          RETURN thread.thread_id  // Likely same conversation

  // Step 4: No match found - this is a new thread
  RETURN generate_new_thread_id()
```

**Handling Forwarded Duplicates:**

Emails forwarded multiple times to the same watcher create potential duplicates:

- **Deduplication at Ingestion:** MESSAGE_RECEIVED events use `message_id` derived from email's Message-ID header or content hash
- If same email forwarded twice → both forwards have SAME `message_id` → only ONE MESSAGE_RECEIVED event created
- Event Store rejects duplicate `message_id` via MR-BackendIngestion-3
- Result: Duplicate forwards are silently ignored (not a bug, it's a feature)

**Forward Chain Handling:**

When email is forwarded (not duplicate, but legitimate forward):

- Forwarded message gets NEW Message-ID header (assigned by forwarding mail server)
- Original message appears in body (not parsed by Vigil)
- Threading decision:
  - If `In-Reply-To` or `References` headers preserved by forwarding server → joins original thread
  - If headers NOT preserved → treated as new thread (forwarded content in body is ignored)
  - User can manually close and reassign if needed via dashboard

**Thread Participant Tracking:**

Each thread maintains `participants` set:

- Add `from` address from each MESSAGE_RECEIVED
- Add all `to` and `cc` addresses
- Used for subject-based grouping disambiguation
- Never stored in events (derived during replay)

**Edge Cases:**

1. **Generic Subjects:** "Question", "Update", "FYI" → subject alone insufficient, require header chain
2. **Long Conversations:** Threads remain open indefinitely until closure signal or manual close
3. **Cross-Thread Replies:** If email references multiple threads → joins FIRST matched thread (chronological)
4. **Closed Thread Reactivation:** Messages matching closed thread create NEW thread (closure is terminal)

**Thread Integrity Constraints:**

- Threads cannot be merged: Each thread represents a distinct tracked conversation
- Threads cannot be reassigned: A thread belongs to exactly one watcher for its entire lifecycle
- Thread history is immutable: All associated events preserved for audit trail

#### Message

**Definition:** Email metadata captured at ingestion. Messages are NOT persisted as first-class entities.

**Key Properties:**

- `message_id` (string) - Unique identifier (derived from Message-ID header or content hash)
- `from` (string) - Sender email address
- `subject` (string) - Email subject line
- `received_at` (Unix ms) - When email was received by Vigil
- `original_date` (Unix ms | null) - Date header from original email (when sender composed it)
- `headers` (object) - Relevant headers for threading (In-Reply-To, References, Conversation-Index, Thread-Topic)

**Non-Persistence Constraint:** The system does NOT store full email body content after ingestion. Email bodies are:
1. Parsed for metadata extraction (headers, subject, from)
2. Sent to LLM service for fact extraction (deadlines, urgency signals, closure signals)
3. Discarded after extraction records are created

**Rationale:** This constraint preserves state machine integrity and minimizes PII storage. If a watcher misses an email (e.g., watcher paused, sender not in allowlist), the sender must resend it and clearly label it as forwarded or resent.

**Metadata Preservation:** All pipeline data is tracked and saved for user traceability and transparency:
- When the email was received (`received_at`)
- Who sent the email originally (`from`)
- Original composition timestamp (`original_date` from Date header)
- Threading metadata (Message-ID chains, conversation identifiers)

**Relationship:** Each message creates one MESSAGE_RECEIVED event containing all preserved metadata. Messages may belong to one Thread if extraction triggers thread opening or they match an existing thread.

#### Reminder

**Definition:** Derived artifact - attention prompt computed from thread events. NOT an obligation. Reminders carry deadline information extracted from threads.

**Key Properties:**

- `reminder_id` (UUID) - Unique identifier (from REMINDER_GENERATED event)
- `thread_id` (UUID) - Which thread this reminder is for
- `reminder_type` (enum: hard_deadline, soft_deadline, silence) - What triggered this reminder
- `deadline_type` (enum: hard, soft, none) - Type of deadline associated with this reminder:
  - `hard` - Binding deadline with explicit date/time (from HARD_DEADLINE_OBSERVED)
  - `soft` - Advisory deadline with fuzzy temporal language (from SOFT_DEADLINE_SIGNAL_OBSERVED)
  - `none` - No deadline; reminder triggered by silence threshold
- `deadline_utc` (Unix ms | null) - The deadline timestamp (only for hard/soft deadline types)
- `urgency_level` (enum: warning, critical, overdue) - How urgent
- `causal_event_id` (UUID) - Which thread event caused this reminder (for traceability)
- `binding` (boolean) - Copied from causal event (true for hard deadlines, false for soft signals and silence)

**Deadline Ownership:** Deadlines belong to Reminders, not to Threads. When a HARD_DEADLINE_OBSERVED or SOFT_DEADLINE_SIGNAL_OBSERVED event occurs, the extracted deadline information is captured in the Reminder that evaluates urgency for that thread.

**Lifecycle:** Generated on urgency state transition → Alert Queued → Notification Sent

**Relationship:** Each reminder references exactly one Thread (via thread_id) and one causal Event (via causal_event_id).

#### Alert

**Definition:** Queued notification ready for delivery.

**Key Properties:**

- `alert_id` (UUID) - Unique identifier
- `reminder_id` (UUID) - Which reminder triggered this alert
- `urgency_level` (enum: warning, critical, overdue) - Severity
- `channels` (array of NotificationChannel) - Where to send

**Lifecycle:** Queued (ALERT_QUEUED) → Sent (ALERT_SENT) or Failed (ALERT_FAILED)

**Relationship:** Each alert references exactly one Reminder. Alerts trigger Notifications.

#### WatcherPolicy

**Definition:** Configuration object controlling watcher behavior.

**Key Properties:**

- `allowed_senders` (array of email addresses) - Sender allowlist (empty = allow all)
- `silence_threshold_hours` (number) - Hours of inactivity before silence reminder
- `deadline_warning_hours` (number) - Hours before deadline to emit warning
- `deadline_critical_hours` (number) - Hours before deadline to emit critical alert
- `enable_soft_deadline_reminders` (boolean) - Whether soft deadline signals create threads/reminders (default: false)
- `enable_urgency_signal_reminders` (boolean) - Whether urgency signals create threads/reminders (default: false)
- `notification_channels` (array of NotificationChannel) - Where to send alerts
- `reporting_cadence` (enum: daily, weekly, monthly, on_demand) - Report frequency
- `reporting_time` (ISO 8601 time) - When to send reports (UTC, e.g., "09:00:00Z")
- `reporting_day` (number, 1-7 for weekly, 1-31 for monthly) - Which day to send reports
- `reporting_recipients` (array of email addresses) - Who receives reports

**Relationship:** Each Watcher has exactly one Policy (updated via POLICY_UPDATED events).

#### NotificationChannel

**Definition:** Delivery target for alerts and reports.

**Key Properties:**

- `type` (enum: email, webhook) - Delivery method
- `destination` (string) - Email address or webhook URL
- `enabled` (boolean) - Whether this channel is active
- `urgency_filter` (enum: all, warning, critical) - Minimum urgency to deliver

**Relationship:** Policies contain arrays of NotificationChannels. Alerts are sent to all enabled channels matching urgency filter.

#### Object Relationship Diagram

```
Account
  ├── Watcher (1:N)
  ├── Policy (1:1)
  │     └── NotificationChannels (1:N)
  ├── Events (1:N) [append-only, immutable]
  └── Threads (1:N) [derived from events]
        ├── Messages (N:N) [via message_ids]
        ├── Reminders (1:N) [derived artifacts]
        └── Alerts (1:N) [via reminders]
```

### 1.5 System Integrations

#### Network Topology

**Inbound:**

- **SMTP Email Delivery** - External SMTP servers deliver to ingestion addresses
- **User HTTP/HTTPS** - Frontend dashboard access, API calls

**Outbound:**

- **SMTP Alert Delivery** - Notification worker sends alerts via external SMTP relay
- **Webhook Delivery** - HTTP POST to user-configured endpoints
- **LLM Service Calls** - HTTP requests to LLM extraction endpoints (internal or external)

**Internal:**

- **Backend ↔ Event Store** - PostgreSQL wire protocol (TCP 5432)
- **Backend ↔ LLM Service** - HTTP REST API (internal network)
- **SMTP Adapter → Backend** - HTTP POST for email forwarding
- **Notification Worker → Event Store** - PostgreSQL wire protocol for event polling
- **Scheduler → Event Store** - PostgreSQL wire protocol for watcher queries

**Storage:**

- **PostgreSQL** - Event store, optional projections, schema migrations
- **File System** - Application logs, configuration files

#### Distributed Deployment Model

**Horizontal Scaling Strategy:**

Vigil components can be deployed across multiple machines and networks with independent scaling:

1. **SMTP Adapter (Stateless)**

   - Deployed: Load-balanced cluster (2-N instances)
   - Scaling: Add instances based on email ingestion rate
   - Network: Public-facing, ports 25/587/2525
   - Failover: Any instance can receive any email

2. **Backend Ingestion + Control Plane (Stateless)**

   - Deployed: Load-balanced cluster (2-N instances)
   - Scaling: Add instances based on API request rate
   - Network: Internal + public API endpoints
   - Failover: Stateless - any instance can handle any watcher

3. **Watcher Runtime (Stateless, Ephemeral)**

   - Deployed: Invoked on-demand by Backend Control Plane
   - Scaling: Parallel execution per watcher, single-threaded per watcher
   - Network: Internal - called as library or subprocess
   - Isolation: Each watcher runtime sees only its own events

4. **Event Store (Stateful)**

   - Deployed: PostgreSQL cluster (primary + replicas)
   - Scaling: Vertical scaling + read replicas for projections
   - Network: Internal only (no public access)
   - Failover: PostgreSQL replication (streaming, logical)

5. **LLM Service (Stateless)**

   - Deployed: Internal cluster or external API
   - Scaling: Add GPU instances based on extraction request rate
   - Network: Internal only (if self-hosted)
   - Failover: Round-robin load balancing, circuit breaker on failures

6. **Notification Worker (Stateless)**

   - Deployed: Worker pool (1-N instances)
   - Scaling: Add instances based on alert queue depth
   - Network: Internal + outbound SMTP/webhook
   - Failover: At-least-once delivery via event polling

7. **Scheduler (Stateful - Single Leader)**

   - Deployed: Single active instance with standby
   - Scaling: Vertical only (not horizontally scalable)
   - Network: Internal only
   - Failover: Leader election (via PostgreSQL advisory locks)

8. **Frontend (Stateless)**
   - Deployed: Static files + API gateway
   - Scaling: CDN distribution, horizontal API scaling
   - Network: Public-facing HTTPS
   - Failover: Multi-region CDN, stateless API

**Cross-Machine Communication:**

- **Synchronous:** Backend → LLM Service (HTTP, 10s timeout)
- **Asynchronous:** All other communication via Event Store polling
- **No Direct RPC:** Components never call each other directly except Backend → LLM
- **Event-Driven:** Workers poll Event Store for new events (every 1-5 seconds)

**Network Segmentation:**

```
┌─────────────────────────────────────────────────────────────┐
│ Public Internet                                              │
│  - SMTP ingestion (port 25/587)                            │
│  - HTTPS dashboard (port 443)                              │
│  - Webhook destinations (outbound)                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ DMZ / Edge Network                                          │
│  - SMTP Adapter (stateless, load balanced)                 │
│  - Frontend / API Gateway (stateless, load balanced)       │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ Application Network (Internal Only)                         │
│  - Backend Ingestion + Control Plane (stateless)           │
│  - Notification Worker (stateless)                         │
│  - Scheduler (single leader)                               │
│  - LLM Service (stateless, optional external)              │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ Data Network (Internal Only)                                │
│  - PostgreSQL Event Store (stateful, replicated)           │
│  - Backup storage                                           │
└─────────────────────────────────────────────────────────────┘
```

**Failure Modes:**

- **SMTP Adapter Down:** Email bounces or queues at sender MTA
- **Backend Down:** API requests fail (503), email ingestion paused
- **Event Store Down:** Entire system halts (critical dependency)
- **LLM Service Down:** Ingestion continues, extraction events not emitted (logged)
- **Notification Worker Down:** Alerts queue in Event Store, delivered when worker recovers
- **Scheduler Down:** No TIME_TICK events, urgency evaluation paused until recovery
- **Network Partition:** Components continue processing local events, sync when partition heals

### 1.7 Logging Architecture

#### Three-Tier Logging Strategy

**1. Component-Level Logs (Distributed)**

Each system component maintains its own structured logs:

- **SMTP Adapter:** Email receipt, parsing errors, forwarding status
- **Backend Ingestion:** Email validation, LLM calls, event emission
- **Watcher Runtime:** Event replay, state transitions, decision logic
- **Notification Worker:** Alert delivery attempts, SMTP errors, webhook responses
- **Scheduler:** TIME_TICK generation, report scheduling
- **LLM Service:** Extraction requests, model inference, timeout handling
- **Frontend:** API requests, authentication, user actions

**Format:** Structured JSON with fields:

```json
{
  "timestamp": "2025-12-24T10:15:30.123Z",
  "level": "INFO",
  "component": "backend-ingestion",
  "host": "backend-01.internal",
  "process_id": "12345",
  "message": "LLM extraction completed",
  "context": {
    "watcher_id": "w_abc123",
    "message_id": "msg_xyz789",
    "extraction_duration_ms": 234,
    "extractions_found": ["HARD_DEADLINE_OBSERVED"]
  }
}
```

**Retention:** 7 days local, 30 days in central log aggregator

**2. Central Log Aggregator (Control Plane)**

Backend Control Plane aggregates all component logs into unified stream:

- **Collection:** Log shippers (Fluentd, Filebeat) forward from each component
- **Storage:** Elasticsearch, Loki, or CloudWatch Logs
- **Indexing:** By timestamp, component, watcher_id, message_id, user_id
- **Querying:** Full-text search, structured field filtering
- **Alerting:** Anomaly detection, error rate monitoring
- **Correlation:** Trace requests across components via `correlation_id`

**Benefits:**

- Cross-component debugging (trace email from ingestion → alert delivery)
- System-wide metrics (total events/sec, error rates by component)
- Security audit trail (all user actions, auth failures)
- Performance analysis (identify bottlenecks across services)

**3. Per-Watcher Logs (Isolated)**

Each watcher gets dedicated log stream for user visibility:

- **Scope:** Only events and operations for that watcher_id
- **Access:** Watcher owner can view via dashboard
- **Format:** User-friendly, non-technical summaries
- **Content:**
  - Email received: "Message from sender@example.com at 10:15 AM"
  - Extraction: "Deadline found: Friday 5pm"
  - Thread opened: "Thread created for deadline tracking"
  - Alert sent: "Warning alert sent via email to user@example.com"
  - User actions: "Thread manually closed by you at 10:45 AM"

**Storage:** Derived from Event Store (query events WHERE watcher_id = X)

**Retention:** Indefinite (stored as events)

**No PII:** Email body text never logged, only metadata (from, subject, timestamp)

#### Log Levels

- **DEBUG:** Detailed execution flow (enabled in development only)
- **INFO:** Normal operations (email received, thread opened, alert sent)
- **WARN:** Recoverable issues (LLM timeout, retry scheduled, policy validation warning)
- **ERROR:** Failures requiring attention (database connection failed, invalid event schema)
- **CRITICAL:** System-wide failures (Event Store unavailable, all components halted)

#### Correlation and Tracing

All logs include `correlation_id` to trace single email through entire pipeline:

```
1. SMTP Adapter: correlation_id=req_abc123
2. Backend Ingestion: correlation_id=req_abc123, watcher_id=w_xyz
3. LLM Service: correlation_id=req_abc123, extraction_type=deadline
4. Watcher Runtime: correlation_id=req_abc123, thread_id=t_def456
5. Notification Worker: correlation_id=req_abc123, alert_id=a_ghi789
```

**Query Example:** "Show all logs for email that triggered alert a_ghi789"

### 1.8 Unit Testing Strategy

#### Testing Pyramid

**Level 1: Pure Function Unit Tests (70% of tests)**

Test stateless, deterministic functions in isolation:

- **Event Replay:** Given event sequence, verify WatcherState reconstruction
- **Urgency Computation:** Given thread + policy + time, verify urgency level
- **Thread Detection:** Given message + existing threads, verify thread_id match
- **Deadline Parsing:** Given LLM response, verify event validation
- **Email Parsing:** Given RFC 5322 email, verify field extraction

**Characteristics:**

- No I/O (no database, no network, no filesystem)
- Fast execution (< 1ms per test)
- Deterministic (same input always produces same output)
- High code coverage (aim for 90%+ of pure logic)

**Example Test:**

```typescript
test("urgency_computation: overdue when deadline passed", () => {
  const thread = {
    deadline_timestamp: Date.parse("2025-12-20T17:00:00Z"),
    last_activity_at: Date.parse("2025-12-19T10:00:00Z"),
    status: "open",
  };
  const current_time = Date.parse("2025-12-24T10:00:00Z");
  const policy = {
    deadline_warning_hours: 24,
    deadline_critical_hours: 4,
  };

  const result = compute_urgency(thread, current_time, policy);

  expect(result.urgency_state).toBe("overdue");
  expect(result.hours_until_deadline).toBe(-90); // 90 hours late
});
```

**Level 2: Integration Tests (25% of tests)**

Test component interactions with real dependencies:

- **Event Store:** Append events, retrieve by watcher, verify ordering
- **Backend Ingestion:** POST email, verify events emitted to database
- **Watcher Runtime:** Load events from DB, verify new events written
- **Notification Worker:** Poll events, verify SMTP/webhook calls
- **LLM Service:** Send extraction request, verify response format

**Characteristics:**

- Uses real PostgreSQL (test database)
- May use test doubles for external services (LLM, SMTP)
- Slower execution (10-100ms per test)
- Verifies contracts between components

**Example Test:**

```typescript
test("backend_ingestion: MESSAGE_RECEIVED event written to Event Store", async () => {
  const email = build_test_email({
    from: "sender@example.com",
    subject: "Deadline Friday 5pm",
    body: "Please respond by Friday 5pm EST",
  });

  await backend.ingest_email(watcher_id, email);

  const events = await event_store.get_events(watcher_id);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe("MESSAGE_RECEIVED");
  expect(events[0].payload.from).toBe("sender@example.com");
});
```

**Level 3: End-to-End Tests (5% of tests)**

Test complete user workflows across all components:

- **Email → Alert:** Send email, verify alert delivered
- **Policy Update → Behavior Change:** Update policy, verify new rules applied
- **Manual Thread Close → No More Alerts:** Close thread, verify silence
- **Report Generation:** Trigger report, verify email sent with correct summary

**Characteristics:**

- Uses all real components (except external SMTP/LLM)
- Slowest execution (1-10 seconds per test)
- Verifies user-facing behavior
- Runs in CI/CD pipeline before deployment

**Example Test:**

```typescript
test("e2e: email with deadline triggers warning alert", async () => {
  // Setup: Create watcher with warning threshold = 24 hours
  const watcher = await create_test_watcher({
    policy: { deadline_warning_hours: 24 },
  });

  // Action: Send email with deadline 20 hours away
  const deadline = new Date(Date.now() + 20 * 3600 * 1000);
  await send_test_email(watcher.ingestion_address, {
    body: `Please respond by ${deadline.toISOString()}`,
  });

  // Wait for processing
  await wait_for_events(watcher.id, [
    "MESSAGE_RECEIVED",
    "HARD_DEADLINE_OBSERVED",
    "THREAD_OPENED",
  ]);

  // Trigger urgency evaluation
  await scheduler.emit_time_tick(watcher.id);

  // Assert: Warning alert emitted
  const alerts = await get_alerts(watcher.id);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].urgency_level).toBe("warning");
});
```

#### Test Doubles Strategy

**LLM Service Mock:**

- Returns predictable extractions for test emails
- Configurable delays to test timeout handling
- Controllable failures to test error paths

**SMTP Server Mock:**

- Captures sent emails without delivering
- Verifies recipient, subject, body content
- Simulates connection failures

**Time Control:**

- Injectable clock for deterministic time-based tests
- Fast-forward time to test deadline urgency transitions
- No `sleep()` calls - advance time instantly

#### Test Data Builders

Use fluent builders for test data construction:

```typescript
const watcher = new WatcherBuilder()
  .withName("Test Watcher")
  .withPolicy(
    new PolicyBuilder().withDeadlineWarning(24).withSilenceThreshold(72).build()
  )
  .build();

const email = new EmailBuilder()
  .from("sender@example.com")
  .withSubject("Urgent request")
  .withBody("Please respond by Friday 5pm")
  .withDeadline("2025-12-27T17:00:00Z")
  .build();
```

#### Continuous Integration

**Test Execution:**

- Run on every commit (pre-push hook)
- Run in CI pipeline (GitHub Actions, GitLab CI)
- Parallel execution by test suite
- Fail fast on first error

**Coverage Requirements:**

- Unit tests: 90% code coverage minimum
- Integration tests: All module contracts covered
- E2E tests: All user workflows covered
- No deployment without passing tests

### 1.9 Authoritative Design Constraints

This section documents authoritative constraints and clarifications that apply across the entire SDD and all derived documentation. These constraints are definitive and override any conflicting statements elsewhere.

#### DC-1: Thread-Deadline Separation

**Constraint:** Threads do NOT own deadlines. Deadlines belong to Reminders.

- **Thread Purpose:** A thread represents an ongoing conversation that a watcher is responsible for tracking. Threads track when communications were sent, when responses occurred, when obligations were fulfilled, and monitor silence/inactivity.
- **Reminder Purpose:** Reminders are derived artifacts that carry deadline information (`deadline_type`, `deadline_utc`). Deadlines are properties of reminders, computed from extraction events.
- **Field Location:** ThreadState contains references to extraction events (`hard_deadline_event_id`, `soft_deadline_event_id`) for audit purposes, but no `deadline_timestamp` field. The `deadline_type` and `deadline_utc` fields exist only on Reminder objects.
- **Urgency Resolution:** Urgency computation resolves deadlines by looking up referenced extraction events, NOT by reading deadline fields from threads.
- **Silence Monitoring:** Threads are monitored for silence (no new messages) and inactivity (no updates). When silence exceeds policy thresholds, reminders are generated to prompt user attention.

**Rationale:** Clean separation of concerns—threads track conversation state and communication timelines, reminders track attention prompts with deadline context.

#### DC-2: Router LLM Thread Creation

**Constraint:** The router LLM runs on every inbound email and determines thread creation.

- **Universal Invocation:** The router LLM is invoked on every email received by an active watcher (after sender validation). It performs all extraction types in a single pass.
- **Extraction-Driven Creation:** Thread creation is driven by extraction events, not by explicit user intent. When ANY extraction event occurs (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, or CLOSURE_SIGNAL_OBSERVED for untracked conversations), a thread is created if one does not already exist for that conversation.
- **Policy Scope:** Policy flags (`enable_soft_deadline_reminders`, `enable_urgency_signal_reminders`) control REMINDER and ALERT generation, NOT thread creation. Threads are always created for audit and silence monitoring.
- **No User-Initiated Threads:** Users do not manually create threads. Thread creation is a system response to detected signals in email content.

**Rationale:** Threads provide audit trail and silence monitoring regardless of whether alerts are desired. The system observes and records what exists in communications.

#### DC-3: Extraction Event Audit Trail

**Constraint:** Extraction events are ALWAYS emitted and persisted for audit purposes.

- **Always Emitted:** Extraction events are emitted whenever the LLM detects relevant signals, regardless of system state:
  - Even when a thread already exists for the message
  - Even when the message is associated with an existing thread via threading headers
  - Even when policy would not generate reminders or alerts
  - Even when watcher policy has soft deadline or urgency reminders disabled
- **Audit Trail:** Extraction events form the complete audit trail of what the LLM detected in each email. This enables users to see exactly what the system observed.
- **Idempotent Replay:** During event replay, extraction events are processed but not re-emitted. The audit trail is preserved in the event store.

**Rationale:** Complete traceability requires recording all observations, not just those that trigger actions. Users need visibility into what the system detected.

#### DC-4: Message Non-Persistence

**Constraint:** Messages are NOT persisted as first-class entities. The system does NOT store full email body content.

- **Metadata Only:** Only email metadata is retained: `from`, `subject`, `headers` (threading-related), `received_at`, `original_date`, `message_id`.
- **Processing Pipeline:** Email bodies are:
  1. Parsed for metadata extraction
  2. Sent to LLM service for fact extraction (deadlines, urgency signals, closure signals)
  3. Discarded after extraction records are created
- **Missed Email Recovery:** If a watcher misses an email (e.g., watcher paused, sender not in allowlist, ingestion error), the sender must resend the email and clearly label it as forwarded or resent. The system cannot recover missed emails.
- **State Machine Integrity:** This constraint preserves state machine integrity—the system's state is derived entirely from events, not from stored email content.
- **No Email Retrieval API:** There is no API to retrieve email body content after ingestion. Users see metadata and extraction results only.

**Rationale:** Minimizes PII storage, preserves state machine integrity, simplifies compliance, and ensures deterministic replay.

#### DC-5: Thread Integrity

**Constraint:** Threads cannot be merged or reassigned.

- **Single Watcher Ownership:** Each thread belongs to exactly one watcher for its entire lifecycle. Threads cannot be moved between watchers.
- **No Merging:** Threads cannot be merged. If the system incorrectly creates two threads for the same conversation, they remain separate. Users may manually close one if needed.
- **No Reassignment:** A thread's `watcher_id` is immutable after creation.
- **Communication Tracking:** A core feature of the system is tracking when communications were sent, responded to, fulfilled, and when obligations were due. Thread integrity ensures this timeline is preserved.
- **Immutable History:** All thread history is immutable—events associated with a thread remain in the event store permanently.

**Rationale:** Simplifies state management, ensures deterministic replay, maintains complete traceability of communication timelines.

#### DC-6: Watcher Deletion

**Constraint:** Watchers are deletable entities.

- **Deletion Effect:** Deleting a watcher removes its oversight role without mutating historical data:
  - Emits WATCHER_DELETED event with `deleted_at` timestamp
  - Sets watcher status to `deleted`
  - Stops all monitoring, alerting, and reporting for this watcher
  - Ingestion address becomes inactive (emails rejected or bounced)
  - Excluded from scheduler TIME_TICK generation
- **Data Preservation:** All historical data is preserved (immutable audit trail):
  - All events remain in event store
  - All threads remain queryable
  - All extraction records remain queryable
  - All alert history remains queryable
- **No Cascade Delete:** Deleting a watcher does NOT delete threads, events, or any historical data.
- **Reactivation:** Deleted watchers cannot be reactivated. Users must create a new watcher if they want to resume monitoring.

**Rationale:** Users need ability to sunset monitoring without losing historical record. Data retention ensures compliance and audit requirements are met.

#### DC-7: Closed Thread Behavior

**Constraint:** Closed threads are preserved for tracking but excluded from reports by default.

- **Terminal State:** Closed threads enter a terminal `closed` state. Once closed, a thread NEVER transitions back to `open`.
- **Tracking and Confirmation:** Users may continue to track closed threads in watchers for confirmation and record-keeping:
  - Verify obligations were fulfilled as expected
  - Reference historical thread context and communication timeline
  - Audit when things were sent, received, and resolved
- **Report Exclusion:** Closed threads are excluded from periodic reports by default. Reports focus on actionable items requiring attention.
- **Dashboard Visibility:** Closed threads remain visible in dashboard with a "closed" status filter. Users can view closed threads at any time.
- **No Alerting:** Closed threads NEVER generate reminders or alerts. Their urgency is always `ok`.
- **New Thread on Match:** Messages matching a closed thread create a NEW thread—they do not reopen the closed thread.

**Rationale:** Closure is terminal but audit trail must persist. Reports focus on actionable items. Users retain access to historical record.

#### DC-8: Idempotence Scope

**Constraint:** Idempotence is enforced per-watcher, not per-thread.

- **Watcher-Level Scope:** Each watcher maintains replay state that tracks which reminders and alerts have been generated. Idempotence is tracked at watcher scope for simplicity.
- **Why Per-Watcher (not Per-Thread):**
  - Simpler implementation: single state tracking scope per runtime invocation
  - Deterministic: watcher state is fully reconstructed from its event stream
  - No cross-thread coordination needed within a watcher
  - Isolation guarantee: watcher A's replay never affects watcher B
- **Mechanism:**
  - Runtime tracks `last_urgency_state` per thread during replay
  - REMINDER_GENERATED events are only emitted on state TRANSITIONS (ok→warning, warning→critical, etc.)
  - Repeated replay with same events produces identical reminder events
  - No new events emitted if state hasn't changed
- **Guarantees:**
  - Same event sequence → same alerts (deterministic)
  - No duplicate ALERT_QUEUED for same urgency transition
  - Thread urgency evaluated independently, but idempotence tracked at watcher scope
- **No Cross-Watcher Leakage:** Watcher isolation is absolute—one watcher's events cannot influence another watcher's state.

**Rationale:** Simplest behavior, least ambiguous system state, aligns with watcher isolation principle.

#### DC-9: Policy Validation

**Constraint:** Policy validation prioritizes simplicity and determinism over flexibility.

- **Validation Rules:**
  - Threshold ordering enforced: `deadline_warning_hours > deadline_critical_hours > 0`
  - Silence threshold range: `silence_threshold_hours` must be in [1, 720]
  - At least one enabled notification channel required for watcher activation
  - All email addresses validated against RFC 5322 format
  - Webhook URLs validated against RFC 3986 format (https:// required for production)
- **Validation Timing:**
  - All policy fields validated on every update, not just changed fields
  - Validation occurs before POLICY_UPDATED event is emitted
  - Invalid policies are rejected with detailed error messages
- **Fail-Fast Principle:**
  - Invalid policies are REJECTED, never silently corrected or defaulted
  - API returns HTTP 400 with specific validation errors
  - No partial policy updates—entire policy must be valid
- **Determinism:**
  - Same policy + same events = same behavior (always)
  - No hidden defaults or conditional logic based on missing fields
  - Required fields must be explicitly set

**Rationale:** Deterministic behavior requires valid configuration. Fail-fast prevents subtle errors that could cause missed alerts or unexpected behavior.

#### DC-10: Component Health Centralization

**Constraint:** All component health signals centralize into the Backend Control Plane.

- **Health Reporting Model:**
  - Each component implements `GET /health` endpoint returning its own status
  - Each component periodically reports health to Backend `/internal/health/report`
  - Backend aggregates health signals from all components
  - Backend exposes unified `GET /api/system/health` endpoint for external monitoring
- **Component Health Signals:**
  - `smtp_adapter`: Connection status, message throughput, error rate
  - `backend`: API latency, event store connectivity, active watcher count
  - `llm_service`: Model availability, inference latency, queue depth
  - `notification_worker`: Delivery success rate, retry queue depth, SMTP connectivity
  - `scheduler`: Tick generation status, next scheduled time, missed ticks
  - `event_store`: Connection pool status, query latency, storage utilization
- **Aggregated Health Response:**
  - `status`: "healthy" | "degraded" | "unhealthy"
  - `components`: Object with per-component status
  - `timestamp`: When health was last checked
  - `alerts`: Array of current health alerts
- **Operational Dashboard:** Single health endpoint enables straightforward system-wide monitoring and alerting.

**Rationale:** Operational simplicity—one place to check system health, one place to configure alerts, one source of truth for system status.

#### DC-11: Data Traceability

**Constraint:** All pipeline data is tracked and saved for user traceability and transparency.

- **Email Metadata Capture:** Every email captured with comprehensive metadata:
  - `received_at`: When Vigil received the email (Unix ms)
  - `from`: Original sender email address
  - `original_date`: Date header from original email (when sender composed it)
  - `subject`: Email subject line
  - `message_id`: Unique identifier from Message-ID header or content hash
  - `headers`: Threading-related headers (In-Reply-To, References, Conversation-Index, Thread-Topic)
  - `participants`: All email addresses involved (from, to, cc)
- **Extraction Event Traceability:**
  - Every extraction event persisted with `source_span` (verbatim text from email that triggered extraction)
  - Every extraction event includes `causal_event_id` referencing the MESSAGE_RECEIVED event
  - Extraction events include `extractor_version` for reproducibility
- **Thread Traceability:**
  - THREAD_OPENED includes `trigger_type`, `original_sender`, `original_received_at`
  - THREAD_ACTIVITY_OBSERVED links messages to threads with timestamps
  - THREAD_CLOSED includes `closed_by` (signal_observed or user_action) and `causal_event_id`
- **Reminder and Alert Traceability:**
  - REMINDER_GENERATED includes `causal_event_id` referencing the thread event that caused urgency transition
  - ALERT_QUEUED includes `reminder_id` for upstream reference
  - ALERT_SENT/ALERT_FAILED include delivery details and timestamps
- **Complete Audit Trail:** Full trace from alert → reminder → thread → extraction → message possible for any notification.
- **Thread Context:** Users can see when emails were received, who sent them originally, what was extracted, and why alerts were generated.

**Rationale:** Users need visibility into what the system detected, when communications occurred, and why alerts were generated. Complete traceability enables debugging, audit compliance, and user trust.

### 1.6 Complete System Lifecycle

This section describes the end-to-end flow from email ingestion through notification delivery.

#### Phase 1: Email Ingestion and Event Creation

**Trigger:** Email delivered to watcher ingestion address

**Flow:**

1. SMTP adapter receives email → forwards to Backend Ingestion endpoint
2. Backend parses email → validates watcher exists
3. Backend emits **MESSAGE_RECEIVED** event (baseline observation - always happens)
4. Backend validates sender against watcher's `allowed_senders` allowlist
5. If sender allowed AND watcher active → Backend calls LLM service for extraction
6. LLM returns structured facts → Backend emits extraction record events:
   - **HARD_DEADLINE_OBSERVED** (if explicit deadline found with binding language)
   - **SOFT_DEADLINE_SIGNAL_OBSERVED** (if fuzzy temporal language found)
   - **URGENCY_SIGNAL_OBSERVED** (if priority indicators found)
   - **CLOSURE_SIGNAL_OBSERVED** (if resolution language found)
7. All events persisted to Event Store

**Events Created:**

- MESSAGE_RECEIVED (always)
- 0-4 extraction record events (conditional on LLM findings)

**Timeline:** Completes within 5 seconds of email delivery (p99)

#### Phase 2: Runtime Evaluation and Thread Management

**Trigger:** New event arrival (MESSAGE_RECEIVED, extraction records, TIME_TICK, user actions)

**Flow:**

1. Backend Control Plane invokes Watcher Runtime with trigger event
2. Runtime loads all events for watcher from Event Store
3. Runtime replays events in chronological order to reconstruct current state:
   - Watcher status (active/paused)
   - Open threads with deadlines and activity timestamps
   - Previous reminder states
4. Runtime evaluates thread lifecycle transitions:
   - **Thread Detection:** Determine if message belongs to existing thread using message metadata (Message-ID chain, Conversation-Index, normalized subject + participant overlap) per Thread Grouping Algorithm
   - **Thread Opening:** If ANY extraction event occurs (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, or URGENCY_SIGNAL_OBSERVED) AND no existing thread matched → emit **THREAD_OPENED** event with new thread_id. **Note:** Threads are ALWAYS created for extraction events regardless of policy settings. Policy controls reminder/alert generation, not thread creation.
   - **Message Association:** If message associated with thread (new or existing) → emit **THREAD_ACTIVITY_OBSERVED** event with `thread_id` and `message_id` to update thread's `last_activity_at` timestamp for silence detection
   - **Thread Closure:** If CLOSURE_SIGNAL_OBSERVED or user manual close → emit **THREAD_CLOSED** event
5. Runtime evaluates urgency for each open thread:
   - Compute `hours_until_deadline` and `hours_since_activity`
   - Apply policy thresholds (deadline_warning_hours, deadline_critical_hours, silence_threshold_hours)
   - Determine urgency level: ok / warning / critical / overdue
6. Runtime detects urgency state transitions:
   - If state changed from previous evaluation → emit **REMINDER_GENERATED** event
   - Reminder includes `causal_event_id` (references thread event that caused reminder)
7. If reminder urgency is warning/critical/overdue → emit **ALERT_QUEUED** event
8. All new events persisted to Event Store
9. Runtime exits (stateless - no long-lived process)

**Events Created:**

- THREAD_OPENED (conditional on ANY extraction event occurring AND no existing thread matched)
- THREAD_ACTIVITY_OBSERVED (conditional on message-to-thread association)
- THREAD_CLOSED (conditional on closure signal or user action)
- SILENCE_THRESHOLD_EXCEEDED (conditional on inactivity)
- REMINDER_GENERATED (conditional on urgency state transition AND policy allows reminders for extraction type)
- ALERT_QUEUED (conditional on reminder urgency ≥ warning)

**Timeline:** Runtime execution completes within 2 seconds

**Key Principle:** Runtime is purely reactive - it only runs when triggered by events, never runs continuously.

#### Phase 3: Alert Delivery and Notification

**Trigger:** ALERT_QUEUED event appears in event stream

**Flow:**

1. Notification Worker monitors Event Store for ALERT_QUEUED events
2. Worker loads alert details including `channels` array from event
3. Worker filters channels by `enabled` flag and `urgency_filter`:
   - If channel urgency_filter = \"critical\" and alert urgency = \"warning\" → skip
   - If channel urgency_filter = \"warning\" or \"all\" → include
4. For each eligible channel, worker attempts delivery:
   - **Email channel:** Worker formats alert email with thread context → sends via SMTP
   - **Webhook channel:** Worker formats JSON payload → sends HTTP POST
5. Worker implements retry logic:
   - Retry up to 3 times on failure
   - Exponential backoff: 1s, 5s, 25s
   - 5xx errors → retry; 4xx errors → fail immediately
6. Worker emits outcome event:
   - **ALERT_SENT** (on successful delivery) with sent_at timestamp
   - **ALERT_FAILED** (after final retry failure) with error_message

**Events Created:**

- ALERT_SENT (one per successful channel delivery)
- ALERT_FAILED (one per failed channel after retries)

**Timeline:** Alert delivery completes within 60 seconds (including retries)

**Notification Content:**

```
Subject: [Vigil Alert] {watcher_name} - Thread {urgency_level}

Watcher: {watcher_name}
Thread: {thread_id}
Status: {urgency_level}
Deadline: {deadline_utc} OR \"None\"
Last Activity: {hours_since_activity} hours ago

This is an attention prompt. Review thread and take action if needed.

View thread: {dashboard_url}/threads/{thread_id}
```

#### Phase 4: Report Generation and Delivery

**Trigger:** Scheduled time based on watcher policy OR user on-demand request

**Flow:**

1. Scheduler checks all active watchers for reporting_cadence:
   - **Daily:** Every 24 hours at `reporting_time` UTC
   - **Weekly:** Every 7 days on `reporting_day` at `reporting_time` UTC
   - **On-demand:** Only when user clicks \"Generate Report\" in dashboard
2. For each watcher due for report:
   - Backend Control Plane invokes Watcher Runtime (without trigger event)
   - Runtime replays all events since last report
   - Runtime computes summary statistics:
     - `threads_opened` (count since last report)
     - `threads_closed` (count since last report)
     - `threads_active` (count currently open)
     - `alerts_sent` (count since last report)
   - Runtime emits **REPORT_GENERATED** event with summary
3. Notification Worker monitors Event Store for REPORT_GENERATED events
4. Worker formats report email:
   - **Reassurance First:** Resolved and stable threads highlighted
   - **Then Items Requiring Attention:** Warning/critical threads listed
5. Worker sends report to all addresses in `reporting_recipients`
6. Worker emits **REPORT_SENT** event with recipient and sent_at

**Events Created:**

- REPORT_GENERATED (on schedule or user request)
- REPORT_SENT (one per recipient)

**Timeline:** Reports sent within 5 minutes of scheduled time

**Report Content Definition:**

Reports reflect exactly what a user would reasonably expect based on thread state, reminder state, and watcher configuration. Reports are designed for **reassurance-first** communication.

**Included in Reports:**
- **Open Threads Only:** Only threads with `status = open` are included in the main report body
- **Thread State:** For each open thread: thread_id, trigger_type, original_sender, deadline (if any), hours_until_deadline or hours_since_activity
- **Urgency Summary:** Count of threads by urgency level (ok, warning, critical, overdue)
- **Reminder History:** Count of reminders generated since last report
- **Alert History:** Count of alerts sent since last report, delivery success/failure breakdown
- **Activity Summary:** Threads opened, threads closed, messages received since last report
- **Resolved Summary:** Count and brief list of recently closed threads (for reassurance)

**Excluded from Reports (by default):**
- **Closed Threads:** Threads with `status = closed` are NOT listed in the active threads section
- **Email Body Content:** Never included (messages not persisted)
- **Extraction Details:** Source spans and raw extraction data not shown (available in dashboard)
- **Deleted Watcher Data:** Deleted watchers do not generate reports

**Optional Report Inclusions (via policy):**
- `include_closed_threads`: If true, show summary of closed threads in separate section
- `include_extraction_summary`: If true, show count of extractions by type

**Report Template:**

```
Subject: [Vigil Report] {watcher_name} - {date}

=== REASSURANCE ===
✓ {resolved_count} threads resolved since last report
✓ {stable_count} threads on track (no deadline pressure)
✓ {no_alerts_count} threads with no alerts needed

=== ACTIVE THREADS ({count}) ===
Threads currently being monitored:

[WARNING] Thread {thread_id}
  → Trigger: {trigger_type} from {original_sender}
  → Deadline: {deadline_utc} ({hours_until} hours remaining)
  → Last Activity: {hours_since_activity} hours ago

[OK] Thread {thread_id}
  → Trigger: {trigger_type} from {original_sender}
  → Last Activity: {hours_since_activity} hours ago
  → Status: On track

=== ATTENTION NEEDED ===
⚠ {warning_count} threads approaching deadline
🔴 {critical_count} threads critical
⏰ {overdue_count} threads overdue

=== ACTIVITY SINCE LAST REPORT ===
📥 Messages Received: {count}
📂 Threads Opened: {count}
✅ Threads Closed: {count}
🔔 Alerts Sent: {count} ({delivered}/{failed})

=== CLOSED THREADS (for reference) ===
(Only shown if include_closed_threads = true)
- Thread {thread_id}: Closed {closed_at} by {closed_by}

---
This is an automated report from Vigil.
View details: {dashboard_url}/watchers/{watcher_id}
```

#### Phase 5: Time-Based Evaluation

**Trigger:** Scheduler emits TIME_TICK events

**Flow:**

1. Scheduler runs on configurable interval (default: every 15 minutes)
2. Scheduler queries Event Store for all active watchers
3. For each active watcher:
   - Scheduler emits **TIME_TICK** event with current `tick_timestamp`
4. TIME_TICK events trigger Runtime Evaluation (Phase 2):
   - Runtime recalculates urgency for all open threads
   - Runtime detects if urgency crossed threshold → generates reminders
5. This creates feedback loop: TIME_TICK → Runtime → REMINDER_GENERATED → ALERT_QUEUED → Notification

**Events Created:**

- TIME_TICK (every N minutes per active watcher)

**Key Principle:** Time doesn't create facts, only urgency. TIME_TICK causes re-evaluation of existing threads against current time.

#### Phase 6: User Actions

**Trigger:** User interaction via Dashboard

**Flow:**

1. User submits action via Frontend API:
   - Manual thread closure: `POST /api/threads/{thread_id}/close`
   - Watcher pause: `POST /api/watchers/{watcher_id}/pause`
   - Policy update: `PUT /api/watchers/{watcher_id}/policy`
2. Backend validates authentication and authorization
3. Backend emits corresponding event:
   - **THREAD_CLOSED** (with `closed_by: user_action`)
   - **WATCHER_PAUSED** (with `paused_by: {user_id}`)
   - **POLICY_UPDATED** (with complete new policy)
4. Event persisted to Event Store
5. Backend returns success response to Frontend
6. Frontend updates UI to reflect new state

**Events Created:**

- THREAD_CLOSED (on manual closure)
- WATCHER_PAUSED (on pause)
- WATCHER_RESUMED (on resume)
- POLICY_UPDATED (on policy change)

#### Control Plane Orchestration Model

**The Backend Control Plane guides watcher execution through event-driven triggers:**

**Trigger Sources:**

1. **Email Arrival** → Ingestion endpoint → MESSAGE_RECEIVED event → Runtime invocation
2. **Time Passage** → Scheduler → TIME_TICK event → Runtime invocation
3. **User Action** → API endpoint → User action event → Runtime invocation
4. **LLM Extraction** → Extraction records → Runtime invocation

**Watcher Autonomy:**

- Each watcher determines its own next actions by replaying its events
- Watchers never access other watchers' events (isolation guarantee)
- Watcher logic is deterministic: same events + same trigger = same output
- No watcher state persists between runtime invocations (stateless execution)

**Control Plane Responsibilities:**

1. Route incoming emails to correct watcher (via ingest_token)
2. Invoke watcher runtime when events arrive
3. Orchestrate LLM calls during ingestion
4. Ensure event ordering per watcher
5. Trigger scheduled evaluations via TIME_TICK
6. Enforce access control for user actions

**What Control Plane Does NOT Do:**

- Does not maintain watcher state in memory
- Does not decide thread lifecycle (runtime decides via replay)
- Does not compute urgency (runtime computes during evaluation)
- Does not filter or prioritize events (all events are equal)

**Mental Model:**

```
Control Plane = Event Router + Runtime Orchestrator + Time Trigger Generator
Watcher Runtime = Stateless Event Processor (input: events, output: new events)
Event Store = Single Source of Truth
```

#### Event Creation Summary

**Always Created:**

- MESSAGE_RECEIVED (every email)
- TIME_TICK (every N minutes per active watcher)

**Conditionally Created:**

- Extraction records (if LLM finds evidence: HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED)
- THREAD_OPENED (if hard deadline extracted, OR soft deadline with policy enabled, OR urgency signal with policy enabled)
- THREAD_ACTIVITY_OBSERVED (if message gets associated with a thread during runtime evaluation)
- THREAD_CLOSED (if closure signal or user action)
- SILENCE_THRESHOLD_EXCEEDED (if inactivity exceeds threshold)
- REMINDER_GENERATED (if urgency state transitions)
- ALERT_QUEUED (if reminder urgency ≥ warning)
- ALERT_SENT/ALERT_FAILED (per notification channel)
- REPORT_GENERATED (on schedule or user request)
- REPORT_SENT (per report recipient)

**Never Created:**

- No speculative events (\"might need attention\")
- No predictive events (\"will be overdue tomorrow\")
- No aggregate events across watchers
- No events for state that hasn't changed

## 2. Tier 1: Feature Requirements

### FR-1: Watcher Creation and Configuration

**Description:**  
Users shall create isolated watchers with unique ingestion addresses and configurable policies.

**Acceptance Criteria:**

- User submits watcher name (1-100 characters, alphanumeric with spaces/hyphens)
- System generates unique `watcher_id` (UUID format)
- System generates unique `ingest_token` (8-12 character base36 string)
- System constructs ingestion address: `<sanitized-name>-<ingest_token>@ingest.vigil.email`
- System emits `WATCHER_CREATED` event with all fields populated
- Watcher status initializes to `created`
- Ingestion address becomes immediately active

**Unit Test Requirements:**

- UUID generation: Verify `watcher_id` is valid UUID v4 format
- Token uniqueness: Generate 1000 watchers → verify all `ingest_token` values unique
- Ingestion address: Verify format `<name>-<token>@ingest.vigil.email` valid RFC 5321
- Name sanitization: Create watcher with name "My Watcher!" → verify ingestion address sanitized to "my-watcher-<token>@..."
- Default values: New watcher created with `status = "created"` and empty channels array
- Field validation: Reject `watcher_id = null`, `ingest_token = ""`, missing required fields
- Name length: Reject names < 1 or > 100 characters
- Idempotency: Create watcher twice with same ID → verify second create fails with conflict error
- Performance: Create 100 watchers in < 500ms

### FR-2: Watcher Activation

**Description:**  
Users shall activate watchers to enable monitoring and alerting.

**Acceptance Criteria:**

- User submits activation command for watcher in `created` or `paused` status
- System validates at least one enabled notification channel exists in policy
- System validates threshold ordering: `deadline_warning_hours > deadline_critical_hours > 0`
- System emits `WATCHER_ACTIVATED` event
- Watcher status transitions to `active`
- Subsequent emails to ingestion address create threads

**Unit Test Requirements:**

- Status transition: Watcher with `status = "created"` → activate → verify `status = "active"`
- From paused: Watcher with `status = "paused"` → activate → verify `status = "active"`
- Policy validation: Activate watcher with invalid policy (missing notification channels) → verify activation rejected
- Channel validation: Activate with `channels = [{type: "email", enabled: true}]` (missing `destination`) → verify rejected
- Email format: Activate with `channels = [{type: "email", destination: "invalid", enabled: true}]` → verify RFC 5322 validation fails
- Threshold ordering: Activate with `deadline_warning_hours = 24, deadline_critical_hours = 48` → verify rejected (warning must be > critical)
- Threshold zero: Activate with `deadline_critical_hours = 0` → verify rejected (must be > 0)
- No channels: Activate watcher with all channels `enabled: false` → verify rejected
- Idempotency: Activate already-active watcher → verify no error, status remains "active"
- Event emission: Activate watcher → verify WATCHER_ACTIVATED event with correct policy snapshot
- Performance: Activate 100 watchers in < 200ms

### FR-3: Watcher Pause and Resume

**Description:**  
Users shall temporarily suspend and resume watcher monitoring without data loss.

**Acceptance Criteria:**

- User submits pause command with optional reason string
- System emits `WATCHER_PAUSED` event with `paused_by` user_id and `reason`
- Watcher status transitions to `paused`
- Emails to ingestion address logged but do not create threads or trigger LLM extraction
- Existing open threads persist but urgency evaluation halts
- User submits resume command
- System emits `WATCHER_RESUMED` event with `resumed_by` user_id
- Watcher status transitions to `active`
- All open threads immediately re-evaluate urgency

**Unit Test Requirements:**

- Pause active: Watcher with `status = "active"` → pause → verify `status = "paused"`
- Pause paused: Watcher already paused → pause again → verify idempotent (no error, status unchanged)
- Resume paused: Watcher with `status = "paused"` → resume → verify `status = "active"`
- Resume active: Watcher already active → resume again → verify idempotent
- Ingestion blocked: Pause watcher → send email to ingestion address → verify MESSAGE_RECEIVED still created (ingestion not gated by status)
- Runtime blocked: Pause watcher → trigger urgency evaluation → verify no ALERT_QUEUED events created
- LLM extraction blocked: Pause watcher → send email with deadline → verify no HARD_DEADLINE_OBSERVED (extraction skipped)
- State transitions: Test sequence pause → resume → pause → resume → verify all state changes recorded
- Event emission: Pause → verify WATCHER_PAUSED event with reason; Resume → verify WATCHER_RESUMED event
- Thread state preserved: Pause watcher with open threads → resume → verify threads still open (not closed by pause)
- Performance: Pause/resume 100 watchers in < 300ms

### FR-4: Policy Configuration

**Description:**  
Users shall configure watcher policies with sender allowlists, timing thresholds, and notification channels.

**Acceptance Criteria:**

- User submits policy update with complete `WatcherPolicy` object
- System validates `allowed_senders` array contains valid RFC 5322 email addresses
- System validates `silence_threshold_hours` in range [1, 720]
- System validates `deadline_warning_hours > deadline_critical_hours`
- System validates `deadline_critical_hours > 0`
- System validates `enable_soft_deadline_reminders` is boolean (default: false)
- System validates `enable_urgency_signal_reminders` is boolean (default: false)
- System validates `notification_channels` array has at least one entry with `enabled: true`
- System validates each notification channel `destination` matches channel type format
- System validates `reporting_cadence` is one of: daily, weekly, monthly, on_demand
- If `reporting_cadence` is weekly: validates `reporting_day` in range [1, 7]
- If `reporting_cadence` is monthly: validates `reporting_day` in range [1, 31]
- System validates `reporting_time` is valid ISO 8601 time format
- System emits `POLICY_UPDATED` event with complete new policy
- Policy changes apply to subsequent evaluations immediately
- Historical events remain unchanged

**Unit Test Requirements:**

- Email validation: Update policy with `allowed_senders = ["invalid@"]` → verify RFC 5322 validation fails
- Multiple senders: Update policy with `allowed_senders = ["alice@a.com", "bob@b.com"]` → verify accepted (allowlist with multiple addresses)
- Empty allowlist: Update policy with `allowed_senders = []` → verify accepted (no sender filtering)
- Silence range: Update `silence_threshold_hours = 721` → verify rejected (max 720); Update `silence_threshold_hours = 0` → verify rejected (min 1)
- Threshold validation: Update `deadline_warning_hours = 24, deadline_critical_hours = 48` → verify rejected (warning must be > critical)
- Negative thresholds: Update `deadline_critical_hours = -1` → verify rejected
- Zero critical: Update `deadline_critical_hours = 0` → verify rejected (must be > 0)
- Channel format: Update channel with `type = "email", destination = "user@example.com"` → verify accepted; Update with `destination = "invalid"` → verify rejected
- Webhook (Slack): Update channel with `type = "webhook", destination = "https://hooks.slack.com/services/..."` → verify URL format validation
- No enabled channels: Update all channels to `enabled: false` → verify rejected (at least one must be enabled)
- Reporting cadence: Update `reporting_cadence = "invalid"` → verify rejected (must be daily/weekly/monthly/on_demand)
- Weekly day validation: Update `reporting_cadence = "weekly", reporting_day = 8` → verify rejected (max 7)
- Monthly day validation: Update `reporting_cadence = "monthly", reporting_day = 32` → verify rejected (max 31)
- Time format: Update `reporting_time = "25:00:00"` → verify rejected (invalid ISO 8601)
- Event emission: Update policy → verify POLICY_UPDATED event contains old and new policy snapshots
- Idempotency: Update policy with identical values → verify still emits POLICY_UPDATED (event sourcing requires all writes)
- Performance: Update policy for 100 watchers in < 400ms

### FR-5: Email Ingestion

**Description:**  
System shall accept email delivered to watcher ingestion addresses and emit baseline observation events.

**Acceptance Criteria:**

- SMTP adapter receives email on configured port
- Adapter extracts recipient address and parses `ingest_token`
- Adapter forwards raw email to backend ingestion endpoint via HTTP POST
- Backend validates `ingest_token` maps to existing watcher
- Backend parses email headers (From, Subject, Message-ID, Date)
- Backend normalizes body text (UTF-8 conversion, whitespace normalization)
- Backend validates sender against watcher `allowed_senders` (case-insensitive exact match)
- Backend deduplicates via Message-ID header or content hash (SHA-256 of from+subject+timestamp)
- Backend emits `MESSAGE_RECEIVED` event with fields: `event_id`, `timestamp`, `watcher_id`, `message_id`, `from`, `subject`, `body_text`, `received_at`, `headers`, `sender_allowed`
- Event emitted before LLM extraction (baseline fact established first)
- Event emission occurs within 5 seconds of email delivery (p99)

**Unit Test Requirements:**

- **Test 1:** Given valid RFC 5322 email → verify all fields extracted correctly
- **Test 2:** Given email with multipart MIME → verify text/plain part extracted
- **Test 3:** Given email with no Message-ID header → verify SHA-256 content hash used as message_id
- **Test 4:** Given duplicate Message-ID → verify only one MESSAGE_RECEIVED event created
- **Test 5:** Given email with UTF-8 body → verify normalization preserves Unicode characters
- **Test 6:** Given email with malformed headers → verify graceful handling and error logged
- **Test 7:** Given sender in allowed_senders list → verify sender_allowed = true
- **Test 8:** Given sender NOT in allowed_senders list → verify sender_allowed = false and LLM not called
- **Test 9:** Given ingestion endpoint receives 1000 emails/sec → verify p99 < 5 seconds
- **Test 10:** Given invalid ingest_token → verify HTTP 404 response and no event emitted

### FR-6: Hard Deadline Extraction

**Description:**  
System shall extract explicit deadline timestamps from email text via LLM service and emit extraction record events.

**Acceptance Criteria:**

- Backend calls LLM service `/extract/deadline` endpoint with email text and reference timestamp
- LLM returns JSON with fields: `deadline_timestamp` (Unix ms or null), `deadline_text`, `source_span`, `confidence`, `is_absolute`, `binding_language`, `extractor_version`
- Backend validates response schema
- Backend validates `source_span` substring exists verbatim in email body
- Backend validates `deadline_timestamp` is future-dated (> `received_at`)
- Backend validates `deadline_timestamp` is within 5 years of reference timestamp
- If confidence is `high` or `medium` and `is_absolute` is true, backend emits `HARD_DEADLINE_OBSERVED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `message_id`, `deadline_utc`, `deadline_text`, `source_span`, `confidence`, `extractor_version`, `binding: true`
- If LLM service unavailable, backend logs warning and continues without emitting extraction event
- Extraction records are facts about what text contains, not interpretations of obligation

**Unit Test Requirements:**

- **Test 1:** Given "Please respond by Friday December 27, 2025 at 5pm EST" → verify deadline_utc = 1735336800000 (Unix ms)
- **Test 2:** Given "Deadline: 2025-12-27 17:00 EST" → verify is_absolute = true and binding = true
- **Test 3:** Given "sometime next week" → verify NO HARD_DEADLINE_OBSERVED event (soft signal)
- **Test 4:** Given LLM response with confidence = low → verify event NOT emitted
- **Test 5:** Given LLM response with source_span not in email body → verify validation fails and event NOT emitted
- **Test 6:** Given deadline_timestamp in past → verify validation fails and event NOT emitted
- **Test 7:** Given deadline_timestamp > 5 years future → verify validation fails and event NOT emitted
- **Test 8:** Given LLM service returns HTTP 500 → verify warning logged and ingestion continues
- **Test 9:** Given LLM service timeout (10 seconds) → verify HTTP 504 handled gracefully
- **Test 10:** Given email with multiple deadlines → verify all HARD_DEADLINE_OBSERVED events emitted
- **Test 11:** Mock LLM service with test doubles → verify extraction request format and response parsing

### FR-6b: Soft Deadline Signal Extraction

**Description:**  
System shall extract fuzzy temporal language from email text via LLM service as advisory signals.

**Acceptance Criteria:**

- Backend calls LLM service `/extract/soft_deadline` endpoint with email text and reference timestamp
- LLM returns JSON with fields: `signal_found` (boolean), `signal_text`, `source_span`, `estimated_horizon_hours`, `confidence`, `binding_language`, `extractor_version`
- Backend validates response schema
- Backend validates `source_span` substring exists verbatim in email body
- Backend validates `binding_language` is false (soft signals are never binding)
- If `signal_found` is true and confidence is `high` or `medium`, backend emits `SOFT_DEADLINE_SIGNAL_OBSERVED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `message_id`, `signal_text`, `source_span`, `estimated_horizon_hours`, `confidence`, `extractor_version`, `binding: false`
- Soft signals are advisory only and do not create binding obligations
- Policy configuration determines if soft signals trigger thread opening (default: false)

### FR-6c: Urgency Signal Extraction

**Description:**  
System shall extract questions, requests, and urgency indicators from email text via LLM service as loosest-tier signals.

**Acceptance Criteria:**

- Backend calls LLM service `/extract/urgency` endpoint with email text
- LLM returns JSON with fields: `signal_found` (boolean), `signal_type` (enum: question, request, urgency_keyword, obligation), `signal_text`, `source_span`, `confidence`, `extractor_version`
- Backend validates response schema
- Backend validates `source_span` substring exists verbatim in email body
- If `signal_found` is true and confidence is `high` or `medium`, backend emits `URGENCY_SIGNAL_OBSERVED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `message_id`, `signal_type`, `signal_text`, `source_span`, `confidence`, `extractor_version`, `binding: false`
- Signal types include:
  - `question`: Questions requiring response ("Can you...", "Do you have...")
  - `request`: Document/information requests ("Please provide", "I need")
  - `urgency_keyword`: Temporal urgency without dates ("ASAP", "urgent", "immediately")
  - `obligation`: Future responsibility without explicit deadline ("will send", "need to follow up")
- Urgency signals are advisory only and never binding
- Policy configuration determines if urgency signals trigger thread opening (default: false)
- Urgency signals create activity pulse for silence tracking regardless of thread creation

### FR-7: Closure Detection

**Description:**  
System shall detect explicit closure language in email text via LLM service.

**Acceptance Criteria:**

- Backend calls LLM service `/extract/closure` endpoint with email text
- LLM returns JSON with fields: `closure_found` (boolean), `closure_type`, `source_span`, `extractor_version`
- Backend validates response schema
- Backend validates `source_span` substring exists verbatim in email body
- If `closure_found` is true and `closure_type` is `explicit`, backend emits `CLOSURE_SIGNAL_OBSERVED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `message_id`, `closure_type`, `source_span`, `extractor_version`
- If LLM service unavailable, backend logs warning and continues without emitting extraction event
- Closure signals are observations of resolution language, not authoritative closure decisions

**Unit Test Requirements:**

- Closure language: Mock LLM to return `closure_found = true, closure_type = "explicit"` for messages containing "this is done", "completed", "no longer needed" → verify CLOSURE_SIGNAL_OBSERVED emitted
- No closure: Mock LLM to return `closure_found = false` for ongoing messages → verify no CLOSURE_SIGNAL_OBSERVED
- Implicit closure: Mock LLM to return `closure_type = "implicit"` → verify NO event emitted (only explicit closures count)
- Source span validation: Mock LLM to return `source_span = "this is done"` → verify event contains exact text snippet
- Source span mismatch: Mock LLM to return `source_span` not in email body → verify event NOT emitted (validation failure)
- LLM failure: Mock LLM to timeout → verify no CLOSURE_SIGNAL_OBSERVED, log WARN level
- LLM unavailable: Mock LLM to return HTTP 503 → verify retry with exponential backoff (1s, 2s, 4s)
- Multiple closures: Send 5 messages, all with closure language → verify 5 CLOSURE_SIGNAL_OBSERVED events (one per message)
- No LLM call if watcher paused: Paused watcher receives email → verify no LLM request sent (extraction skipped)
- Deterministic replay: Replay CLOSURE_SIGNAL_OBSERVED event → verify no LLM call made (extraction already recorded)
- Performance: Process 100 messages with closure detection in < 5 seconds (with mocked LLM)

### FR-8: Thread Creation

**Description:**  
System shall create threads when extraction events are emitted. The router LLM runs on every inbound email and determines whether a new thread must be created. Thread creation is driven by extraction, not by explicit user intent.

**Router LLM Behavior:**

The router LLM is invoked on every email received by an active watcher (after sender validation). It performs all extraction types in a single pass and emits extraction events. Thread creation is a direct consequence of extraction—if any extraction event occurs, thread creation logic is triggered.

**Extraction Events Always Emitted for Audit:**

Extraction events (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED) are ALWAYS emitted and persisted to the event store when the LLM detects them, regardless of whether a thread already exists. This ensures complete audit trail.

**Acceptance Criteria:**

- Backend receives `MESSAGE_RECEIVED` event for active watcher (baseline observation always emitted)
- Backend validates sender against allowlist; if allowed, invokes router LLM for extraction
- Router LLM analyzes email and emits extraction events for all detected signals (multiple extractions per email possible)
- **Extraction events are ALWAYS emitted for audit purposes, even if thread already exists**
- Backend invokes watcher runtime with trigger event(s)
- Runtime replays all events to reconstruct state
- Runtime applies Thread Grouping Algorithm to determine if message belongs to existing thread:
  - Check In-Reply-To and References headers for Message-ID chain match
  - Check Conversation-Index header for Outlook threading
  - Check normalized subject + participant overlap + temporal proximity (within 7 days)
  - If match found → associate message with existing thread (no new THREAD_OPENED event)
- **Thread Creation Triggers (Any Extraction Event):**
  - **Tier 1 (Binding):** `HARD_DEADLINE_OBSERVED` → always creates thread
  - **Tier 2 (Advisory):** `SOFT_DEADLINE_SIGNAL_OBSERVED` → creates thread (policy may control reminder generation, but thread always created)
  - **Tier 3 (Loosest):** `URGENCY_SIGNAL_OBSERVED` → creates thread (policy may control reminder generation, but thread always created)
  - **Tier 4 (Closure on new):** `CLOSURE_SIGNAL_OBSERVED` for untracked conversation → may create thread to record closure
- If no existing thread matched AND any extraction event emitted:
  - Runtime emits `THREAD_OPENED` event with new `thread_id`
- **After thread association (new or existing thread):**
  - Runtime emits `THREAD_ACTIVITY_OBSERVED` event with fields: `event_id`, `timestamp`, `watcher_id`, `thread_id`, `message_id`, `observed_at`
  - **Purpose:** Updates thread's `last_activity_at` for silence detection, prevents false "silence exceeded" alerts
- THREAD_OPENED event contains fields: `event_id`, `timestamp`, `watcher_id`, `thread_id` (UUID), `message_id`, `opened_at`, `normalized_subject`, `conversation_index` (if present), `trigger_type` (enum: hard_deadline, soft_deadline, urgency_signal, closure), `original_sender`, `original_received_at`
- Thread_id is unique across all threads system-wide
- Threads track communication contexts requiring attention
- Messages without any extraction signals do NOT create threads (just logged via MESSAGE_RECEIVED)
- Duplicate message forwards (same Message-ID) silently ignored via deduplication
- Runtime execution completes and exits

**Thread Creation Decision Matrix:**

```
Extraction Event               | Thread Created?        | Reminder Generation?
------------------------------|------------------------|---------------------
HARD_DEADLINE_OBSERVED        | Yes (always)           | Yes (always, binding)
SOFT_DEADLINE_SIGNAL_OBSERVED | Yes (always)           | If enable_soft_deadline_reminders
URGENCY_SIGNAL_OBSERVED       | Yes (always)           | If enable_urgency_signal_reminders
CLOSURE_SIGNAL_OBSERVED       | If no existing thread  | No (closure terminates)
None (informational email)    | No                     | No
```

**Key Clarification:** The policy flags `enable_soft_deadline_reminders` and `enable_urgency_signal_reminders` control whether REMINDERS are generated and ALERTS are sent for soft deadlines and urgency signals. They do NOT control thread creation—threads are always created when extraction events occur.

**Unit Test Requirements:**

- **Test 1:** Given MESSAGE_RECEIVED + HARD_DEADLINE_OBSERVED → verify THREAD_OPENED event emitted
- **Test 2:** Given MESSAGE_RECEIVED with In-Reply-To header matching existing thread → verify message joins existing thread (no new THREAD_OPENED)
- **Test 3:** Given MESSAGE_RECEIVED with Conversation-Index matching existing thread → verify message joins existing thread
- **Test 4:** Given MESSAGE_RECEIVED with normalized subject matching existing thread + participant overlap → verify message joins existing thread
- **Test 5:** Given MESSAGE_RECEIVED with generic subject ("Question") and no header chain → verify new thread created if extraction event present
- **Test 6:** Given SOFT_DEADLINE_SIGNAL_OBSERVED (any policy setting) → verify THREAD_OPENED event emitted (thread always created)
- **Test 7:** Given SOFT_DEADLINE_SIGNAL_OBSERVED + enable_soft_deadline_reminders = false → verify THREAD created but NO REMINDER_GENERATED
- **Test 8:** Given URGENCY_SIGNAL_OBSERVED (any policy setting) → verify THREAD_OPENED event emitted (thread always created)
- **Test 9:** Given MESSAGE_RECEIVED with no extraction signals → verify NO thread created (just logged)
- **Test 10:** Given thread association (new or existing) → verify THREAD_ACTIVITY_OBSERVED event emitted with thread_id
- **Test 11:** Given duplicate Message-ID (forward) → verify deduplication prevents duplicate thread
- **Test 12:** Given message matching closed thread → verify NEW thread created (closure is terminal)
- **Test 13:** Mock Thread Grouping Algorithm → verify priority order (Message-ID > Conversation-Index > subject+participants)
- **Test 14:** Given 10,000 existing threads → verify thread detection completes within 100ms
- **Test 15:** Verify THREAD_OPENED event contains trigger_type, original_sender, original_received_at
- **Test 16:** Given existing thread + new HARD_DEADLINE_OBSERVED for same thread → verify extraction event emitted (audit) but no new thread
- **Test 17:** Given router LLM detects multiple signals (deadline + urgency) → verify all extraction events emitted

### FR-9: Thread Closure

**Description:**  
System shall close threads via explicit closure evidence or manual user action. Closed threads are preserved for audit and tracking purposes.

**Acceptance Criteria:**

- Backend receives `CLOSURE_SIGNAL_OBSERVED` event with `closure_found: true`
- Backend invokes watcher runtime with trigger event
- Runtime replays events to reconstruct state
- If thread status is `open`, runtime emits `THREAD_CLOSED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `thread_id`, `closed_at`, `closed_by` (enum: `signal_observed` or `user_action`), `causal_event_id` (references closure signal or user command)
- Alternatively, user submits manual close command via API
- Backend emits `THREAD_CLOSED` event with `closed_by: user_action`
- Once closed, thread status never transitions to `open` (closure is terminal)
- Subsequent messages do not reopen closed threads (create new thread instead)

**Closed Thread Tracking:**

- Closed threads enter a terminal `closed` state
- Users may continue to track closed threads in watchers for confirmation or record-keeping:
  - Verify obligations were fulfilled as expected
  - Reference historical thread context
  - Audit communication timelines
- **Report Exclusion:** Closed threads are excluded from periodic reports by default
- **Dashboard Visibility:** Closed threads remain visible in dashboard with "closed" status filter
- **No Alerting:** Closed threads never generate reminders or alerts (urgency = ok always)

**Unit Test Requirements:**

- Automatic closure: Given CLOSURE_SIGNAL_OBSERVED + open thread → verify THREAD_CLOSED event emitted with `closed_by = "signal_observed"`
- Manual closure: Given user API call `POST /threads/{id}/close` → verify THREAD_CLOSED event with `closed_by = "user_action"`
- Terminal state: Given closed thread + subsequent message → verify thread remains closed (no reopening)
- New thread on closed match: Given message matching closed thread → verify NEW thread created
- Causal reference: Verify THREAD_CLOSED.causal_event_id references CLOSURE_SIGNAL_OBSERVED.event_id
- Already closed: Given CLOSURE_SIGNAL_OBSERVED + already-closed thread → verify no duplicate THREAD_CLOSED event
- Urgency after closure: Given thread closed + TIME_TICK evaluation → verify urgency = ok (closed threads never urgent)
- Multiple threads: Given 5 open threads + CLOSURE_SIGNAL_OBSERVED for thread 3 → verify only thread 3 closed
- Report exclusion: Given closed thread → verify not included in REPORT_GENERATED summary unless explicitly requested
- Dashboard filter: Given closed threads → verify retrievable via API with status=closed filter
- Performance: Close 100 threads in < 300ms

### FR-10: Urgency Evaluation

**Description:**  
System shall compute time-relative urgency state for open threads based on policy thresholds.

**Acceptance Criteria:**

- Scheduler emits `TIME_TICK` event every N minutes (configurable, default 15)
- Backend invokes watcher runtime with `TIME_TICK` trigger
- Runtime replays events to reconstruct all open threads
- For each open thread, runtime computes `hours_until_deadline` and `hours_since_activity`
- Runtime applies urgency rules:
  - If `hours_until_deadline < 0`: urgency = `overdue`
  - Else if `hours_until_deadline < deadline_critical_hours`: urgency = `critical`
  - Else if `hours_until_deadline < deadline_warning_hours`: urgency = `warning`
  - Else if `hours_since_activity > silence_threshold_hours` and no deadline: urgency = `warning`
  - Else: urgency = `ok`
- Runtime detects urgency state transitions and emits `REMINDER_GENERATED` event when urgency crosses threshold
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `thread_id`, `reminder_type`, `urgency_level`, `causal_event_id`, `binding`, `hours_until_deadline`, `hours_since_activity`

**Unit Test Requirements:**

- **Test 1:** Given thread with deadline in past (hours_until_deadline < 0) → verify urgency = overdue
- **Test 2:** Given thread with deadline in 2 hours + deadline_critical_hours = 4 → verify urgency = critical
- **Test 3:** Given thread with deadline in 20 hours + deadline_warning_hours = 24 → verify urgency = warning
- **Test 4:** Given thread with deadline in 48 hours + deadline_warning_hours = 24 → verify urgency = ok
- **Test 5:** Given thread with no deadline + hours_since_activity = 80 + silence_threshold_hours = 72 → verify urgency = warning
- **Test 6:** Given closed thread with overdue deadline → verify urgency = ok (closed threads never urgent)
- **Test 7:** Given thread transitions from ok → warning → verify REMINDER_GENERATED event emitted
- **Test 8:** Given thread transitions from warning → ok → verify NO REMINDER_GENERATED (improvement)
- **Test 9:** Given thread urgency unchanged after TIME_TICK → verify NO duplicate REMINDER_GENERATED
- **Test 10:** Given policy change (deadline_warning_hours increased) → verify urgency recalculated immediately
- **Test 11:** Mock time injection → verify deterministic urgency computation at different timestamps
- **Test 12:** Given 1000 open threads → verify all urgency evaluations complete within 2 seconds

### FR-11: Alert Queuing

**Description:**  
System shall queue alerts when reminder events indicate attention required.

**Acceptance Criteria:**

- Runtime generates `REMINDER_GENERATED` event when urgency crosses threshold
- If reminder urgency_level is `warning`, `critical`, or `overdue`, runtime emits `ALERT_QUEUED` event
- Event contains fields: `event_id`, `timestamp`, `watcher_id`, `thread_id`, `alert_id` (UUID), `reminder_id` (references REMINDER_GENERATED), `urgency_level`, `channels` (copy of `notification_channels` from policy)
- Alert never emits if urgency level unchanged (prevents duplicate alerts)
- Alert never emits if thread status is `closed`
- Each reminder state transition generates exactly one alert
- Alert references causal reminder event for full traceability

**Unit Test Requirements:**

- Urgency threshold: Given REMINDER_GENERATED with urgency_level = "warning" → verify ALERT_QUEUED emitted
- Critical alert: Given urgency_level = "critical" → verify ALERT_QUEUED emitted
- Overdue alert: Given urgency_level = "overdue" → verify ALERT_QUEUED emitted
- OK level: Given urgency_level = "ok" → verify NO ALERT_QUEUED (no alert needed)
- Duplicate prevention: Given urgency unchanged (warning → warning) → verify NO duplicate ALERT_QUEUED
- State transition: Given urgency changes (ok → warning) → verify ALERT_QUEUED emitted
- Closed thread: Given REMINDER_GENERATED + thread status = "closed" → verify NO ALERT_QUEUED
- Channel copy: Verify ALERT_QUEUED.channels = exact copy of notification_channels from policy at time of alert
- Causal reference: Verify ALERT_QUEUED.reminder_id = REMINDER_GENERATED.event_id
- Alert ID uniqueness: Generate 1000 alerts → verify all alert_id values unique (UUID)
- Performance: Queue 100 alerts in < 200ms

### FR-12: Alert Delivery

**Description:**  
System shall deliver alerts to configured notification channels with retry logic.

**Acceptance Criteria:**

- Notification worker monitors event stream for `ALERT_QUEUED` events
- Worker filters channels by `urgency_filter` (e.g., if channel filter is `critical`, skip `warning` alerts)
- For each enabled channel, worker attempts delivery:
  - Email: SMTP send to `destination` address
  - Webhook: HTTP POST to `destination` URL with JSON payload
- Worker retries failed delivery up to 3 times with exponential backoff (1s, 5s, 25s)
- On successful delivery, worker emits `ALERT_SENT` event with fields: `event_id`, `timestamp`, `alert_id`, `channel`, `sent_at`
- On final failure, worker emits `ALERT_FAILED` event with fields: `event_id`, `timestamp`, `alert_id`, `channel`, `error_message`, `failed_at`
- Alert delivery failure does not block system operation

**Unit Test Requirements:**

- Email delivery: Given ALERT_QUEUED + channel type = "email" → verify SMTP send called with correct destination address
- Webhook delivery: Given channel type = "webhook" → verify HTTP POST to destination URL with JSON payload
- Urgency filter: Given channel urgency_filter = "critical" + alert urgency = "warning" → verify NO delivery (filtered out)
- Channel disabled: Given channel enabled = false → verify NO delivery
- Retry logic: Given SMTP send fails (connection timeout) → verify retry with backoff (1s, 5s, 25s)
- Success event: Given successful delivery → verify ALERT_SENT event emitted with channel and sent_at timestamp
- Failure event: Given 3 failed retries → verify ALERT_FAILED event with error_message
- Multiple channels: Given ALERT_QUEUED with 2 enabled channels → verify 2 deliveries (one per channel)
- Partial failure: Given 2 channels + channel 1 succeeds + channel 2 fails → verify ALERT_SENT for channel 1, ALERT_FAILED for channel 2
- Performance: Deliver 100 alerts in < 5 seconds (with mocked SMTP/webhook)
- Mock SMTP service: Verify delivery without actually sending email (test double)
- JSON payload format: Verify webhook POST body contains alert_id, thread_id, urgency_level, message

### FR-13: State Reconstruction

**Description:**  
System shall reconstruct current watcher state by replaying events deterministically.

**Acceptance Criteria:**

- User requests current thread state via API: `GET /api/watchers/{watcher_id}/threads`
- Backend counts events for watcher
- If event count < 10,000, backend loads all events and replays in memory
- Replay applies events in timestamp order to reconstruct `WatcherState` object
- Backend computes current urgency for each open thread using current timestamp
- Backend returns JSON with thread projections including fields: `thread_id`, `status`, `opened_at`, `last_activity_at`, `deadline_timestamp`, `closed_at`, `message_ids`, `urgency_state`
- Response time p99 < 200ms for watchers with < 10,000 events
- If event count ≥ 10,000, backend queries projection table (cached derived state)
- Projection query response time p99 < 10ms

**Unit Test Requirements:**

- Small replay: Given watcher with 100 events → verify state reconstructed via in-memory replay in < 50ms
- Large watcher: Given watcher with 10,000 events → verify projection table queried (not full replay)
- Timestamp ordering: Given events with out-of-order timestamps → verify replay sorts by timestamp before applying
- Urgency computation: Given open thread + current_time → verify hours_until_deadline computed correctly
- Closed thread exclusion: Given watcher with 5 open threads + 3 closed threads → verify API returns only open threads
- Thread projection fields: Verify response includes all required fields (thread_id, status, opened_at, last_activity_at, deadline_timestamp, etc.)
- Empty watcher: Given watcher with 0 events → verify empty threads array returned
- Performance (in-memory): Given watcher with 5000 events → verify p99 response time < 200ms
- Performance (projection): Given watcher with 20,000 events → verify p99 response time < 10ms
- Projection accuracy: Compare projection table result with full replay → verify states match (projection is cached correctly)

### FR-14: Event Log Inspection

**Description:**  
Users shall inspect immutable event log for audit and debugging with full traceability.

**Acceptance Criteria:**

- User requests event log via API: `GET /api/watchers/{watcher_id}/events?limit={N}&offset={M}`
- Backend queries event store directly (no replay)
- Backend returns events in descending timestamp order
- Each event includes all fields: `event_id`, `timestamp`, `type`, event-specific payload
- Response includes pagination metadata: `total`, `limit`, `offset`
- Extraction records (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, etc.) include verbatim `source_span` field and `binding` flag
- Reminder events include `causal_event_id` for traceability to thread events
- Alert events include `reminder_id` for traceability to reminder events
- All user actions include actor `user_id`
- Event hierarchy enables complete audit trail from email → extraction → thread → reminder → alert

**Unit Test Requirements:**

- Pagination: Given watcher with 500 events + limit=100 + offset=200 → verify response contains events 200-299
- Pagination metadata: Verify response includes total=500, limit=100, offset=200
- Descending order: Verify events sorted by timestamp (newest first)
- Event fields: Verify each event includes event_id (UUID), timestamp (ISO 8601), type (enum), payload (object)
- Extraction record: Verify HARD_DEADLINE_OBSERVED includes source_span, binding=true, deadline_utc
- Causal traceability: Given REMINDER_GENERATED → verify causal_event_id references THREAD_OPENED
- Alert traceability: Given ALERT_QUEUED → verify reminder_id references REMINDER_GENERATED
- User action audit: Given THREAD_CLOSED by user → verify closed_by="user_action" + user_id present
- Direct query: Verify API queries event store without replay (no state reconstruction)
- Performance: Given watcher with 10,000 events → verify p99 response time < 50ms for paginated query
- Authorization: Given user B requests events for watcher owned by user A → verify HTTP 403 Forbidden

### FR-15: Report Generation

**Description:**  
System shall generate periodic summary reports emphasizing reassurance before items requiring attention.

**Acceptance Criteria:**

- Scheduler emits `REPORT_GENERATED` event based on watcher `reporting_cadence`
- For `daily`: emit every 24 hours at `reporting_time` UTC
- For `weekly`: emit every 7 days on `reporting_day` (1=Monday, 7=Sunday) at `reporting_time` UTC
- For `monthly`: emit on `reporting_day` (1-31) of each month at `reporting_time` UTC; if day exceeds month length (e.g., day 31 in February), use last day of month
- For `on_demand`: emit only when user explicitly requests
- Backend computes report summary by replaying events:
  - `threads_opened`: count of `THREAD_OPENED` since last report
  - `threads_closed`: count of `THREAD_CLOSED` since last report
  - `threads_active`: count of open threads
  - `alerts_sent`: count of `ALERT_SENT` since last report
  - `messages_received`: count of `MESSAGE_RECEIVED` since last report
- Backend emits `REPORT_GENERATED` event with `report_id`, `report_type`, `summary`
- Notification worker sends report email to `reporting_recipients`
- Email emphasizes resolved/stable threads before warning/critical threads
- Worker emits `REPORT_SENT` event with `report_id`, `recipient`, `sent_at`

**Report Content Specification:**

Reports reflect exactly what a user would reasonably expect to see based on thread state, reminder state, and watcher configuration. The report is structured as follows:

**Section 1: Reassurance Summary (always first)**
- Count of threads resolved/closed since last report
- Count of threads on track (open, urgency = ok)
- Count of deadlines successfully met

**Section 2: Active Threads Overview**
- List of all open threads with:
  - Thread subject (normalized)
  - Original sender
  - When opened (relative time: "3 days ago")
  - Current urgency level (ok, warning, critical, overdue)
  - Deadline if any (for threads with associated hard/soft deadline reminders)
  - Hours until deadline OR hours since last activity

**Section 3: Attention Required (if any)**
- Threads with urgency = warning, critical, or overdue
- Sorted by urgency (overdue first, then critical, then warning)
- Each entry includes:
  - Thread identifier
  - Urgency reason (deadline approaching, deadline passed, silence threshold exceeded)
  - Recommended action

**Section 4: Activity Summary**
- `threads_opened`: New threads created since last report
- `threads_closed`: Threads closed since last report
- `messages_received`: Total emails processed since last report
- `alerts_sent`: Notifications delivered since last report

**Exclusions:**
- **Closed threads:** NOT included in reports by default (they appear only in "threads_closed" count)
- **Deleted watchers:** No reports generated for deleted watchers
- **Paused watchers:** Reports still generated but include "Watcher Paused" notice

**Unit Test Requirements:**

- Daily cadence: Given reporting_cadence="daily" + reporting_time="09:00" → verify REPORT_GENERATED emitted every 24 hours at 09:00 UTC
- Weekly cadence: Given reporting_cadence="weekly" + reporting_day=1 (Monday) + reporting_time="09:00" → verify emitted every Monday at 09:00
- Monthly cadence: Given reporting_cadence="monthly" + reporting_day=15 → verify emitted on 15th of each month
- Month overflow: Given reporting_day=31 + current month=February (28 days) → verify emitted on Feb 28 (last day)
- On-demand: Given reporting_cadence="on_demand" → verify NO automatic REPORT_GENERATED (only manual trigger)
- Summary computation: Given watcher with 10 THREAD_OPENED + 3 THREAD_CLOSED + 5 ALERT_SENT since last report → verify summary counts correct
- Event replay: Verify report summary computed via event replay (not projection table)
- Email format: Verify report email lists reassurance first, then stable threads, then attention-required threads
- Closed thread exclusion: Given 5 open threads + 3 closed threads → verify report lists only 5 threads in Active section
- Multiple recipients: Given reporting_recipients=["alice@a.com", "bob@b.com"] → verify REPORT_SENT emitted for each recipient
- Paused watcher: Given paused watcher → verify report includes "Watcher Paused" notice
- Performance: Generate report for watcher with 5000 events in < 1 second
- Timezone: Verify reporting_time interpreted as UTC (not local time)

### FR-16: Deterministic Replay

**Description:**  
System shall reconstruct identical state when replaying the same event sequence.

**Acceptance Criteria:**

- Given event sequence E1, E2, ..., En for watcher W
- Backend invokes runtime with no trigger
- Runtime loads events in timestamp order
- Runtime applies events via pure functions (no external calls)
- Runtime produces `WatcherState` S1
- Backend invokes runtime again with same events
- Runtime produces `WatcherState` S2
- S1 and S2 are deeply equal (same thread_ids, statuses, timestamps, deadlines)
- No LLM calls occur during replay
- No database writes occur during replay
- No network calls occur during replay
- Replay execution is idempotent

**Unit Test Requirements (Critical for Event Sourcing):**

- **Test 1:** Given event sequence [E1, E2, E3] → replay twice → verify identical WatcherState (deep equality)
- **Test 2:** Given 10,000 events → replay → verify no LLM calls made (mock HTTP client should have 0 calls)
- **Test 3:** Given event replay → verify no database writes (mock event store should only READ, not WRITE)
- **Test 4:** Given event sequence with HARD_DEADLINE_OBSERVED → replay → verify thread.deadline_timestamp matches event payload
- **Test 5:** Given event sequence with THREAD_OPENED → THREAD_ACTIVITY_OBSERVED → THREAD_CLOSED → verify thread.status = closed
- **Test 6:** Given replay with same events at different timestamps → verify state identical (deterministic)
- **Test 7:** Given event sequence with malformed event → verify event skipped and warning logged, replay continues
- **Test 8:** Given empty event array → verify initial state returned (status = created, threads = empty)
- **Test 9:** Given events out of timestamp order → verify error thrown (replay requires chronological order)
- **Test 10:** Given 100 threads, 10,000 events → verify replay completes in < 200ms (p99)
- **Test 11:** Property-based testing: Generate random event sequences → verify replay always deterministic
- **Test 12:** Snapshot testing: Given known event sequence → verify state matches stored snapshot
- **Test 13:** Time-travel testing: Replay to timestamp T1 → get state S1 → replay to T2 → verify S2 extends S1
- **Test 14:** Verify no side effects: Mock all I/O → replay → verify 0 calls to mocked dependencies

### FR-17: Access Control

**Description:**  
System shall enforce account-based access control for all watcher operations.

**Acceptance Criteria:**

- All API requests include authentication token (JWT or session cookie)
- Backend validates token and extracts `user_id` and `account_id`
- Backend rejects requests with invalid or expired tokens (HTTP 401)
- For watcher operations, backend verifies `watcher.account_id` matches `user.account_id`
- Backend rejects unauthorized access (HTTP 403)
- Backend logs all authorization failures with `user_id`, `watcher_id`, `operation`
- Event emission includes `created_by`, `updated_by`, `paused_by`, `resumed_by` fields

**Unit Test Requirements:**

- Token validation: Given valid JWT token → verify user_id and account_id extracted correctly
- Expired token: Given expired token → verify HTTP 401 Unauthorized response
- Invalid token: Given malformed token → verify HTTP 401 response
- Authorization check: Given user A (account 1) requests watcher W (account 2) → verify HTTP 403 Forbidden
- Same account: Given user A (account 1) requests watcher W (account 1) → verify access granted
- Missing token: Given API request with no auth header → verify HTTP 401 response
- Authorization logging: Given unauthorized access → verify log entry with user_id, watcher_id, operation, timestamp
- Event attribution: Given user A pauses watcher → verify WATCHER_PAUSED event includes paused_by=user_A_id
- Cross-account protection: Given account 1 has 10 watchers → verify user from account 2 cannot list them
- Performance: Validate 1000 tokens in < 100ms

### FR-18: Sender Validation

**Description:**  
System shall validate email senders against watcher allowlists.

**Acceptance Criteria:**

- Backend receives `MESSAGE_RECEIVED` event
- Backend retrieves watcher policy via event replay
- Backend extracts sender email from `from` field
- Backend performs case-insensitive exact match against `allowed_senders` array
- If match found or `allowed_senders` is empty, backend proceeds with LLM extraction
- If no match, backend logs INFO message with `watcher_id`, `sender`, `message_id`
- Backend still emits `MESSAGE_RECEIVED` event (audit trail)
- Backend does not emit `THREAD_OPENED` or call LLM service
- Rejection does not result in SMTP bounce or failure response

**Unit Test Requirements:**

- Exact match: Given allowed_senders=["alice@example.com"] + sender="alice@example.com" → verify LLM extraction proceeds
- Case insensitive: Given allowed_senders=["Alice@Example.COM"] + sender="alice@example.com" → verify match succeeds
- No match: Given allowed_senders=["alice@example.com"] + sender="bob@example.com" → verify LLM extraction skipped
- Empty allowlist: Given allowed_senders=[] (empty array) + any sender → verify extraction proceeds (no filtering)
- Multiple senders: Given allowed_senders=["alice@a.com", "bob@b.com"] + sender="bob@b.com" → verify match succeeds
- Domain mismatch: Given allowed_senders=["alice@a.com"] + sender="alice@b.com" → verify no match
- Subdomain: Given allowed_senders=["alice@mail.example.com"] + sender="alice@example.com" → verify no match (exact match required)
- Rejection logging: Given sender not in allowlist → verify INFO log with watcher_id, sender, message_id
- Audit trail: Given rejected sender → verify MESSAGE_RECEIVED still emitted (for audit)
- No SMTP bounce: Given rejected sender → verify no SMTP 5xx response (silent rejection)
- Performance: Validate 1000 senders against 50-entry allowlist in < 200ms

### FR-19: Event Model Traceability

**Description:**  
System shall maintain complete causal chains from ingestion through alerting via event references.

**Acceptance Criteria:**

- Every `HARD_DEADLINE_OBSERVED` event references `message_id` from `MESSAGE_RECEIVED`
- Every `SOFT_DEADLINE_SIGNAL_OBSERVED` event references `message_id` from `MESSAGE_RECEIVED`
- Every `CLOSURE_SIGNAL_OBSERVED` event references `message_id` from `MESSAGE_RECEIVED`
- Every `THREAD_OPENED` event references triggering message via `message_id`
- Every `REMINDER_GENERATED` event includes `causal_event_id` referencing the thread event (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, or SILENCE_THRESHOLD_EXCEEDED) that caused the reminder
- Every `ALERT_QUEUED` event includes `reminder_id` referencing `REMINDER_GENERATED`
- Given any alert, user can trace backward: ALERT_QUEUED → REMINDER_GENERATED → thread event → MESSAGE_RECEIVED → original email
- Traceability verification test: select random alert, follow references, confirm chain reaches MESSAGE_RECEIVED
- Broken references (orphaned events) trigger data integrity alerts

**Unit Test Requirements:**

- Message reference: Given HARD_DEADLINE_OBSERVED event → verify message_id field references existing MESSAGE_RECEIVED.event_id
- Soft signal reference: Given SOFT_DEADLINE_SIGNAL_OBSERVED → verify message_id present
- Thread reference: Given THREAD_OPENED → verify message_id references MESSAGE_RECEIVED
- Reminder causality: Given REMINDER_GENERATED → verify causal_event_id references HARD_DEADLINE_OBSERVED or SOFT_DEADLINE_SIGNAL_OBSERVED or SILENCE_THRESHOLD_EXCEEDED
- Alert reference: Given ALERT_QUEUED → verify reminder_id references REMINDER_GENERATED.event_id
- Backward chain: Given random alert → follow alert.reminder_id → reminder.causal_event_id → thread.message_id → verify reaches MESSAGE_RECEIVED
- Reference integrity: Given 1000 events → verify all references point to existing events (no orphaned references)
- Broken reference detection: Given event with causal_event_id="nonexistent" → verify data integrity alert logged
- Multi-hop trace: Given alert → verify complete chain ALERT_QUEUED → REMINDER_GENERATED → THREAD_OPENED → HARD_DEADLINE_OBSERVED → MESSAGE_RECEIVED
- Performance: Trace 100 alerts backward to MESSAGE_RECEIVED in < 500ms

### FR-20: One-Way Data Flow Guarantee

**Description:**  
System shall enforce strict one-way data flow from observation to derivation without feedback loops.

**Acceptance Criteria:**

- Baseline events (MESSAGE_RECEIVED, THREAD_ACTIVITY_OBSERVED) never reference extraction records or reminders
- Extraction records (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED) never reference reminders or alerts
- Thread events never reference reminders or alerts
- Reminder events reference thread events (upstream) but never modify them
- Alert events reference reminder events (upstream) but never modify them
- Code review confirms no bidirectional references between tiers
- Architectural test: dependency graph shows strict layering (Baseline → Extraction → Thread → Reminder → Alert)
- No event type can trigger modification of events earlier in the chain

**Unit Test Requirements:**

- Baseline isolation: Given MESSAGE_RECEIVED event schema → verify no fields reference extraction records, reminders, or alerts
- Extraction isolation: Given HARD_DEADLINE_OBSERVED schema → verify no fields reference REMINDER_GENERATED or ALERT_QUEUED
- Thread isolation: Given THREAD_OPENED schema → verify no fields reference reminders or alerts
- Upward references only: Given REMINDER_GENERATED → verify causal_event_id references thread event (upstream)
- No downward references: Given HARD_DEADLINE_OBSERVED → verify no fields reference REMINDER_GENERATED (downstream)
- Immutability: Given event E1 created at T1 → create downstream event E2 at T2 → verify E1 unchanged (no modification)
- Layering test: Build dependency graph from event schemas → verify DAG structure (no cycles)
- Tier ordering: Verify events only reference same tier or upstream tiers (never downstream)
- Code analysis: Scan codebase for "update event" or "modify event" → verify 0 occurrences
- Architectural test: Given event hierarchy diagram → verify no arrows pointing from derived tiers back to baseline/extraction tiers

## 3. Tier 2: Infrastructure Requirements

### IR-1: Event Store Immutability

**Description:**  
Event store shall support append-only operations with no updates or deletes except for legal compliance.

**Verification Method:**

- Database schema inspection confirms no UPDATE or DELETE triggers/permissions
- Audit log confirms all event_ids written exactly once
- Integrity check: compare event count at T1 and T2, confirm monotonic increase
- Manual test: attempt to update event via SQL, confirm failure

### IR-2: Event Store Ordering Guarantee

**Description:**  
Event store shall preserve total ordering of events within a single watcher by timestamp.

**Verification Method:**

- Query events for watcher: `SELECT * FROM events WHERE watcher_id = 'w1' ORDER BY timestamp ASC`
- Confirm timestamp sequence is monotonically increasing
- Confirm no duplicate timestamps for same watcher (tie-breaking via event_id)
- Performance test: insert 10,000 events, verify retrieval order matches insertion order

### IR-3: Event Store Availability

**Description:**  
Event store shall achieve 99.9% availability measured over rolling 30-day window.

**Verification Method:**

- Monitor uptime via synthetic health checks every 60 seconds
- Calculate availability: (total_time - downtime) / total_time
- Downtime defined as inability to append or retrieve events within 5 second timeout
- Alert if availability drops below 99.9% in any 30-day period

### IR-4: Event Store Durability

**Description:**  
Event store shall persist events to durable storage before acknowledging write.

**Verification Method:**

- Backend appends event to store
- Store returns success acknowledgment
- Simulate immediate crash (kill -9 database process)
- Restart database
- Query event store for event_id
- Confirm event exists and payload is intact

### IR-5: Backend API Availability

**Description:**  
Backend API shall respond to health checks within 100ms at p99.

**Verification Method:**

- Deploy synthetic monitor calling `GET /health` every 10 seconds
- Measure response time distribution
- Confirm p99 response time < 100ms over rolling 24-hour window
- Alert if p99 exceeds threshold

### IR-6: Backend API Authentication

**Description:**  
Backend API shall reject unauthenticated requests with HTTP 401.

**Verification Method:**

- Send request to protected endpoint without Authorization header
- Confirm response status is 401
- Confirm response includes `WWW-Authenticate` header
- Send request with invalid token
- Confirm response status is 401

### IR-7: Backend API Rate Limiting

**Description:**  
Backend API shall enforce rate limiting of 1000 requests per minute per account.

**Verification Method:**

- Generate 1001 requests from same account within 60 seconds
- Confirm first 1000 requests succeed (HTTP 200/201)
- Confirm 1001st request fails with HTTP 429
- Confirm response includes `Retry-After` header
- Wait 60 seconds
- Confirm subsequent request succeeds

### IR-8: SMTP Adapter Port Configuration

**Description:**  
SMTP adapter shall listen on configurable port defined in environment variable `SMTP_PORT`.

**Verification Method:**

- Set `SMTP_PORT=2525` in environment
- Start SMTP adapter
- Use netstat or equivalent to confirm listener on port 2525
- Attempt connection via telnet to port 2525
- Confirm SMTP greeting received

### IR-9: SMTP Adapter Forwarding

**Description:**  
SMTP adapter shall forward raw email to backend ingestion endpoint within 1 second of receipt.

**Verification Method:**

- Send test email to ingestion address
- Monitor network traffic with tcpdump
- Confirm HTTP POST to backend endpoint occurs within 1000ms of SMTP DATA completion
- Confirm payload includes raw email headers and body

### IR-10: LLM Service Network Isolation

**Description:**  
LLM service shall listen only on private network interface, not public internet.

**Verification Method:**

- Inspect LLM service bind configuration
- Confirm listen address is 127.0.0.1 or private RFC 1918 IP
- Attempt connection from external host
- Confirm connection refused or timeout
- Attempt connection from backend host on same network
- Confirm connection succeeds

### IR-11: LLM Service Timeout

**Description:**  
LLM service shall timeout requests after 10 seconds and return HTTP 504.

**Verification Method:**

- Send extraction request with extremely long input text (100KB)
- Measure response time
- Confirm response received within 11 seconds (10s timeout + 1s overhead)
- Confirm response status is 504 if processing exceeds timeout
- Confirm response includes partial result or error message

### IR-12: LLM Service Determinism

**Description:**  
LLM service shall return consistent outputs given identical inputs.

**Verification Method:**

- Define test email: "Please respond by Friday December 27, 2025 at 5pm EST"
- Call `/extract/deadline` with same text and reference_timestamp 10 times
- Confirm all 10 responses have identical `deadline_timestamp` (within 1 hour tolerance)
- Confirm `evidence` field identical across all responses
- Temperature parameter set to ≤ 0.1

### IR-13: Database Connection Pooling

**Description:**  
Backend shall maintain connection pool to PostgreSQL with max 50 connections.

**Verification Method:**

- Inspect backend database configuration
- Confirm `max_connections` parameter set to 50
- Monitor active connections: `SELECT count(*) FROM pg_stat_activity WHERE datname = 'Vigil'`
- Generate 100 concurrent API requests
- Confirm connection count never exceeds 50
- Confirm requests queue or fail gracefully if pool exhausted

### IR-14: TLS Encryption for API Traffic

**Description:**  
All backend API traffic shall use TLS 1.2 or higher.

**Verification Method:**

- Attempt HTTP connection to API endpoint
- Confirm redirect to HTTPS (HTTP 301) or connection refused
- Attempt HTTPS connection with TLS 1.1
- Confirm connection refused or handshake failure
- Attempt HTTPS connection with TLS 1.2
- Confirm connection succeeds
- Inspect certificate: confirm valid, not expired, matches domain

### IR-15: Email Delivery Retry Policy

**Description:**  
Notification worker shall retry failed email delivery 3 times with exponential backoff (1s, 5s, 25s).

**Verification Method:**

- Configure SMTP server to reject connections
- Trigger alert generation
- Monitor notification worker logs
- Confirm 4 total attempts: initial + 3 retries
- Confirm delays: 0s, 1s, 5s, 25s between attempts
- Confirm `ALERT_FAILED` event emitted after final failure

### IR-16: Event Store Backup

**Description:**  
Event store shall be backed up daily with 30-day retention.

**Verification Method:**

- Inspect backup schedule configuration
- Confirm daily backup job configured
- Query backup storage
- Confirm backups exist for each of past 30 days
- Confirm backups older than 30 days are deleted
- Test restore: restore backup from 7 days ago, confirm data integrity

### IR-17: Logging Structured Output

**Description:**  
All components shall emit structured JSON logs with required fields and correlation IDs for distributed tracing.

**Verification Method:**

- Trigger backend API request with correlation_id header
- Inspect log output from all components involved
- Confirm JSON format parseable by standard JSON parsers
- Confirm required fields present in every log line:
  - `timestamp` (ISO 8601 format: "2025-12-24T10:15:30.123Z")
  - `level` (enum: DEBUG, INFO, WARN, ERROR, CRITICAL)
  - `component` (string: "smtp-adapter", "backend-ingestion", "watcher-runtime", etc.)
  - `host` (string: hostname or container ID)
  - `process_id` (string or number)
  - `message` (string: human-readable description)
  - `context` (object: structured data specific to log event)
  - `correlation_id` (string: trace ID for request/email flow)
- Confirm context object includes relevant identifiers:
  - `watcher_id` (if operation is watcher-specific)
  - `message_id` (if operation is email-specific)
  - `thread_id` (if operation is thread-specific)
  - `user_id` (if operation is user-initiated)
- Confirm no PII in logs:
  - Email body text never logged (only `body_length` metric)
  - User email addresses hashed or tokenized in non-production
  - Secret values never logged (passwords, API keys, tokens)
  - `headers` field excludes `Authorization` and `Cookie`
- Confirm log levels used appropriately:
  - DEBUG: Detailed execution flow (replay steps, state transitions)
  - INFO: Normal operations (email received, thread opened, alert sent)
  - WARN: Recoverable issues (LLM timeout with retry, validation warning)
  - ERROR: Failures requiring attention (database connection failed, invalid event)
  - CRITICAL: System-wide failures (Event Store unavailable, all components halted)
- Performance test: Generate 10,000 log entries/sec → verify no log loss or blocking
- Verify log rotation: Logs rotate daily or at 1GB, retain 7 days locally

### IR-18: Observability Metrics

**Description:**  
Backend shall expose Prometheus-compatible metrics endpoint.

**Verification Method:**

- Query `GET /metrics`
- Confirm response format matches Prometheus text exposition format
- Confirm metrics include:
  - `vigil_events_total{watcher_id, event_type}` (counter)
  - `vigil_api_requests_total{method, path, status}` (counter)
  - `vigil_api_request_duration_seconds{method, path}` (histogram)
  - `vigil_llm_requests_total{endpoint, status}` (counter)
  - `vigil_llm_request_duration_seconds{endpoint}` (histogram)

### IR-19: Secret Management

**Description:**  
System shall load secrets from environment variables or secret management service, never from code or config files.

**Verification Method:**

- Inspect codebase with grep for patterns: `password=`, `token=`, `api_key=`
- Confirm no hardcoded secrets
- Inspect environment variable loading
- Confirm secrets loaded via `process.env` or equivalent
- Confirm secret values never logged

### IR-20: Data Retention Compliance

**Description:**  
System shall support deletion of events containing personal data upon user request (GDPR compliance).

**Verification Method:**

- User submits data deletion request for specific watcher
- System marks events for deletion with `deletion_requested_at` timestamp
- System retains events for 30-day grace period
- After 30 days, system deletes events from event store
- Confirm replay after deletion produces incomplete state (expected)
- Confirm audit log records deletion with user_id, timestamp, reason

### IR-21: Central Log Aggregation

**Description:**  
Backend Control Plane shall aggregate logs from all distributed components into centralized searchable index.

**Verification Method:**

- Deploy log shipper (Fluentd, Filebeat, or equivalent) on each component host
- Configure shipper to forward logs to central aggregator (Elasticsearch, Loki, CloudWatch)
- Send test email through system
- Query central log index for correlation_id from test email
- Confirm logs from all components present:
  - SMTP Adapter: email receipt log
  - Backend Ingestion: parsing and validation logs
  - LLM Service: extraction request and response logs
  - Watcher Runtime: event replay and state transition logs
  - Notification Worker: alert delivery logs
- Confirm logs indexed by:
  - `timestamp` (with millisecond precision)
  - `component` (for filtering by service)
  - `level` (for error aggregation)
  - `watcher_id` (for per-watcher debugging)
  - `correlation_id` (for request tracing)
  - Full-text search on `message` and `context` fields
- Verify query performance: Find all logs for correlation_id in < 500ms
- Verify retention: Central logs retained 30 days, then archived or deleted
- Confirm no log loss: Component log count matches central log count (within 1% tolerance)
- Test failure scenario: Disconnect log shipper → verify local logs buffered, forwarded when reconnected

### IR-22: Per-Watcher Log Isolation

**Description:**  
System shall provide isolated log view for each watcher accessible to watcher owner.

**Verification Method:**

- Create two watchers: W1 (user A) and W2 (user B)
- Send email to W1 ingestion address
- Authenticate as user A, query `GET /api/watchers/W1/logs`
- Confirm response contains only W1 events:
  - "Message received from sender@example.com"
  - "Deadline found: Friday 5pm"
  - "Thread created for deadline tracking"
  - "Warning alert sent via email"
- Confirm response does NOT contain W2 events
- Authenticate as user B, attempt to query `GET /api/watchers/W1/logs`
- Confirm HTTP 403 Forbidden (authorization failure)
- Verify log format is user-friendly:
  - Timestamps in local timezone (configured by user)
  - Technical event types translated to plain English
  - No internal IDs exposed (event_id, process_id hidden)
  - Actions attributed correctly ("by you", "automatically", "by system")
- Verify pagination: Logs returned in pages of 100, with `next` cursor
- Verify filtering: Support `?level=WARN` and `?start_date=2025-12-20`
- Performance test: Watcher with 100,000 events → verify first page loads in < 200ms

### IR-23: Log Correlation and Distributed Tracing

**Description:**  
System shall propagate correlation IDs across all components to enable end-to-end request tracing.

**Verification Method:**

- SMTP Adapter receives email → generates correlation*id = "req*" + UUID
- Verify correlation_id passed to Backend Ingestion in HTTP POST
- Verify Backend logs include correlation_id in all log lines for that request
- Verify Backend passes correlation_id to LLM Service in HTTP header
- Verify LLM Service logs include correlation_id
- Verify Backend stores correlation_id in MESSAGE_RECEIVED event.context
- Verify Watcher Runtime inherits correlation_id from trigger event
- Verify Notification Worker inherits correlation_id from ALERT_QUEUED event
- Query central logs: `correlation_id = "req_abc123"`
- Confirm complete trace from ingestion → extraction → thread opening → alert delivery
- Verify trace timeline:
  - T0: SMTP Adapter receives email
  - T0+50ms: Backend Ingestion starts processing
  - T0+200ms: LLM Service extraction completes
  - T0+250ms: Watcher Runtime emits THREAD_OPENED
  - T0+300ms: Notification Worker delivers alert
- Confirm gaps identified: Missing logs indicate component failure or bottleneck
- Test correlation across restarts: Component restarts → correlation preserved in Event Store

### IR-24: Component Health Centralization

**Description:**  
All component health signals shall centralize into the Backend Control Plane to enable straightforward system-wide health monitoring and operational oversight.

**Design Rationale:**

This requirement establishes a minimal, clean component health reporting model. Rather than distributing health monitoring across multiple dashboards or requiring operators to query each component individually, all health signals flow to a single point of aggregation.

**Health Signal Sources:**

Each distributed component reports health status to Backend Control Plane:

| Component | Health Signals Reported |
|-----------|------------------------|
| SMTP Adapter | Connection status, emails received/sec, parse errors/sec |
| Backend Ingestion | API availability, event emission rate, LLM call success rate |
| Event Store (PostgreSQL) | Connection pool usage, query latency p99, disk usage |
| LLM Service | Availability, extraction latency p99, timeout rate |
| Notification Worker | Queue depth, delivery success rate, retry rate |
| Scheduler | Tick generation status, last successful tick timestamp |
| Frontend | API reachability (from frontend perspective) |

**Health Reporting Protocol:**

1. **Heartbeat Model:** Each component sends periodic health reports (every 30 seconds)
2. **Push-Based:** Components push health data to Backend `/internal/health/report` endpoint
3. **Pull Fallback:** Backend can query component health endpoints if push fails
4. **Aggregation:** Backend aggregates all health signals into unified health state

**Unified Health Endpoint:**

Backend exposes `GET /api/system/health` returning:

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-12-25T10:00:00Z",
  "components": {
    "smtp_adapter": {"status": "healthy", "last_heartbeat": "...", "metrics": {...}},
    "event_store": {"status": "healthy", "last_heartbeat": "...", "metrics": {...}},
    "llm_service": {"status": "degraded", "last_heartbeat": "...", "metrics": {...}},
    "notification_worker": {"status": "healthy", "last_heartbeat": "...", "metrics": {...}},
    "scheduler": {"status": "healthy", "last_heartbeat": "...", "metrics": {...}}
  },
  "overall_metrics": {
    "events_per_minute": 150,
    "active_watchers": 42,
    "open_threads": 287
  }
}
```

**Health Status Definitions:**

- **healthy:** All systems operational, no errors
- **degraded:** Some non-critical issues (high latency, elevated error rate), system functional
- **unhealthy:** Critical failures, system unable to fulfill core functions

**Verification Method:**

- Start all components
- Query `GET /api/system/health` → confirm all components report "healthy"
- Stop LLM Service
- Wait 60 seconds (2 missed heartbeats)
- Query health endpoint → confirm LLM Service shows "unhealthy", overall status "degraded"
- Restart LLM Service
- Wait 30 seconds (1 heartbeat)
- Query health endpoint → confirm LLM Service shows "healthy", overall status "healthy"
- Verify health endpoint requires no authentication (for load balancer health checks)
- Verify detailed component health requires authentication (internal metrics)

## 4. Tier 3: Module-Level Requirements

### Module: Event Store

**Purpose:**  
Persist immutable events in append-only log with ordering guarantees.

#### MR-EventStore-1: Event Append

**Description:**  
Append new event to store atomically.

**Inputs:**

- `event`: VigilEvent object with fields:
  - `event_id` (string, UUID format)
  - `timestamp` (number, Unix milliseconds)
  - `type` (string, one of defined event types)
  - `watcher_id` (string, UUID format, optional)
  - Type-specific payload fields

**Outputs:**

- Success: void (event persisted)
- Failure: Error with code `DUPLICATE_EVENT_ID` or `VALIDATION_ERROR`

**Failure Modes:**

- Duplicate `event_id`: reject with error, do not modify store
- Missing required fields: reject with validation error
- Database unavailable: throw error, caller must handle

#### MR-EventStore-2: Event Retrieval by Watcher

**Description:**  
Retrieve all events for specific watcher in chronological order.

**Inputs:**

- `watcher_id` (string, UUID format)

**Outputs:**

- Success: Array of VigilEvent objects sorted by `timestamp` ascending
- Empty array if no events exist for watcher

**Failure Modes:**

- Database unavailable: throw error
- Invalid watcher_id format: return empty array

#### MR-EventStore-3: Event Deduplication

**Description:**  
Prevent duplicate event insertion based on `event_id`.

**Inputs:**

- `event`: VigilEvent with `event_id`

**Outputs:**

- If `event_id` exists: reject with `DUPLICATE_EVENT_ID` error
- If `event_id` unique: proceed with insertion

**Failure Modes:**

- Concurrent inserts with same `event_id`: database constraint ensures one succeeds, one fails

### Module: Watcher Runtime

**Purpose:**  
Stateless execution engine that replays events and emits new events based on state transitions.

#### MR-WatcherRuntime-1: Event Replay

**Description:**  
Reconstruct watcher state by applying events in order.

**Inputs:**

- `events`: Array of VigilEvent objects in chronological order

**Outputs:**

- `WatcherState` object with fields:
  - `watcher_id` (string, UUID)
  - `status` (enum: `created`, `active`, `paused`)
  - `threads` (Map<string, ThreadState>)

**Failure Modes:**

- Malformed event: skip event, log warning
- Empty event array: return initial state (status = `created`, threads = empty)

#### MR-WatcherRuntime-2: Thread State Reconstruction

**Description:**  
Apply thread lifecycle events to build thread state. Note: Threads do NOT own deadline timestamps—deadlines are tracked via associated extraction events and propagated to Reminders.

**Inputs:**

- Event sequence containing `THREAD_OPENED`, `THREAD_ACTIVITY_OBSERVED`, `THREAD_CLOSED`, and extraction events (`HARD_DEADLINE_OBSERVED`, `SOFT_DEADLINE_SIGNAL_OBSERVED`)

**Outputs:**

- `ThreadState` object with fields:
  - `thread_id` (string, UUID)
  - `watcher_id` (string, UUID)
  - `trigger_type` (enum: `hard_deadline`, `soft_deadline`, `urgency_signal`, `closure`)
  - `opened_at` (number, Unix milliseconds)
  - `last_activity_at` (number, Unix milliseconds)
  - `status` (enum: `open`, `closed`)
  - `closed_at` (number | null, Unix milliseconds)
  - `message_ids` (array of strings) - References to MESSAGE_RECEIVED events
  - `participants` (array of strings) - Email addresses involved in thread
  - `normalized_subject` (string) - For thread grouping
  - `original_sender` (string) - Email address of original message sender
  - `original_received_at` (number, Unix milliseconds) - When triggering email was received
  - `hard_deadline_event_id` (string | null) - Reference to HARD_DEADLINE_OBSERVED if any
  - `soft_deadline_event_id` (string | null) - Reference to SOFT_DEADLINE_SIGNAL_OBSERVED if any
  - `last_urgency_state` (enum: `ok`, `warning`, `critical`, `overdue`) - For transition detection

**Deadline Resolution:** To determine if a thread has a deadline and its timestamp:
1. Check if `hard_deadline_event_id` is set → lookup event for `deadline_utc`
2. Else check if `soft_deadline_event_id` is set → lookup event for `estimated_horizon_hours`
3. Else thread has no deadline (silence monitoring only)

**Failure Modes:**

- `THREAD_ACTIVITY_OBSERVED` for nonexistent thread: ignore event
- `THREAD_CLOSED` for nonexistent thread: ignore event
- `THREAD_OPENED` with duplicate thread_id: log error, skip

#### MR-WatcherRuntime-3: Urgency Computation

**Description:**  
Calculate urgency state for open thread given current time and policy. Deadline information is resolved via the thread's associated extraction events.

**Inputs:**

- `thread`: ThreadState with `hard_deadline_event_id`, `soft_deadline_event_id`, `last_activity_at`, `status`
- `events`: Map of event_id → Event (for deadline lookup)
- `current_time` (number, Unix milliseconds)
- `policy`: WatcherPolicy with `silence_threshold_hours`, `deadline_warning_hours`, `deadline_critical_hours`

**Outputs:**

- Object with fields:
  - `urgency_state` (enum: `ok`, `warning`, `critical`, `overdue`)
  - `hours_until_deadline` (number | null)
  - `hours_since_activity` (number)
  - `deadline_type` (enum: `hard`, `soft`, `none`)
  - `deadline_utc` (number | null, Unix milliseconds)

**Failure Modes:**

- Thread status is `closed`: always return `urgency_state: ok`
- No deadline and no policy: return `urgency_state: ok`
- Referenced deadline event not found: treat as no deadline, log warning

**Algorithm:**

```
IF thread.status == "closed":
  RETURN urgency_state = "ok", deadline_type = "none"

hours_since_activity = (current_time - thread.last_activity_at) / 3600000

// Resolve deadline from extraction events (deadlines belong to reminders, not threads)
deadline_timestamp = null
deadline_type = "none"

IF thread.hard_deadline_event_id IS NOT null:
  hard_event = events.get(thread.hard_deadline_event_id)
  IF hard_event:
    deadline_timestamp = hard_event.deadline_utc
    deadline_type = "hard"
ELSE IF thread.soft_deadline_event_id IS NOT null:
  soft_event = events.get(thread.soft_deadline_event_id)
  IF soft_event:
    // Convert estimated_horizon_hours to absolute timestamp
    deadline_timestamp = soft_event.timestamp + (soft_event.estimated_horizon_hours * 3600000)
    deadline_type = "soft"

IF deadline_timestamp == null:
  // No deadline - check silence threshold
  IF hours_since_activity > policy.silence_threshold_hours:
    RETURN urgency_state = "warning", deadline_type = "none"
  ELSE:
    RETURN urgency_state = "ok", deadline_type = "none"

hours_until_deadline = (deadline_timestamp - current_time) / 3600000

IF hours_until_deadline < 0:
  RETURN urgency_state = "overdue", deadline_type, deadline_utc = deadline_timestamp
ELSE IF hours_until_deadline < policy.deadline_critical_hours:
  RETURN urgency_state = "critical", deadline_type, deadline_utc = deadline_timestamp
ELSE IF hours_until_deadline < policy.deadline_warning_hours:
  RETURN urgency_state = "warning", deadline_type, deadline_utc = deadline_timestamp
ELSE:
  RETURN urgency_state = "ok", deadline_type, deadline_utc = deadline_timestamp
```

#### MR-WatcherRuntime-4: State Transition Detection

**Description:**  
Compare current and previous urgency states to detect transitions.

**Inputs:**

- `previous_urgency` (enum: `ok`, `warning`, `critical`, `overdue`)
- `current_urgency` (enum: `ok`, `warning`, `critical`, `overdue`)

**Outputs:**

- Boolean: true if transition warrants alert, false otherwise

**Failure Modes:**

- Undefined previous state: treat as `ok`

**Transition Rules:**

- `ok → warning`: emit alert
- `warning → critical`: emit alert
- `critical → overdue`: emit alert
- `warning → ok`: no alert (improvement)
- `critical → warning`: no alert (improvement)
- Same state: no alert

#### MR-WatcherRuntime-5: Reminder Generation with Causal Traceability

**Description:**  
Generate reminder events as derived artifacts with full causal chain.

**Inputs:**

- `thread`: ThreadState with deadline and activity information
- `urgency`: Computed urgency object from MR-WatcherRuntime-3
- `current_time` (number, Unix milliseconds)
- `policy`: WatcherPolicy

**Outputs:**

- `REMINDER_GENERATED` event OR null if no reminder needed
- Event fields:
  - `event_id` (string, UUID)
  - `timestamp` (number, Unix milliseconds)
  - `watcher_id` (string, UUID)
  - `thread_id` (string, UUID)
  - `reminder_type` (enum: `hard_deadline`, `soft_deadline`, `silence`)
  - `urgency_level` (enum: `warning`, `critical`, `overdue`)
  - `causal_event_id` (string, UUID of thread event that caused reminder)
  - `binding` (boolean, copied from causal event)
  - `hours_until_deadline` (number | null)
  - `hours_since_activity` (number)

**Failure Modes:**

- Thread closed: return null (no reminders for closed threads)
- No urgency transition: return null (prevent duplicate reminders)
- Cannot find causal event: log error, return null

**Algorithm:**

```
IF thread.status == "closed":
  RETURN null

IF urgency.urgency_state == "ok":
  RETURN null

// Find causal event for traceability
causal_event_id = null
binding = false
reminder_type = null

IF thread.hard_deadline_event_id IS NOT null:
  causal_event_id = thread.hard_deadline_event_id
  binding = true
  reminder_type = "hard_deadline"
ELSE IF thread.soft_deadline_event_id IS NOT null AND policy.enable_soft_deadline_reminders:
  causal_event_id = thread.soft_deadline_event_id
  binding = false
  reminder_type = "soft_deadline"
ELSE IF urgency.hours_since_activity > policy.silence_threshold_hours:
  causal_event_id = thread.last_activity_event_id
  binding = false
  reminder_type = "silence"

IF causal_event_id IS null:
  RETURN null  // No valid causal chain

RETURN REMINDER_GENERATED event with all fields populated
```

**Traceability Guarantee:**

- Every reminder MUST reference a specific event (hard deadline, soft deadline signal, or activity event)
- Broken causal_event_id references are data integrity errors
- Given reminder, user can trace to exact extraction record or baseline event

#### MR-WatcherRuntime-6: Thread Detection and Message Grouping

**Description:**  
Determine if incoming message belongs to existing thread using email metadata.

**Inputs:**

- `message`: MESSAGE_RECEIVED event with fields:
  - `message_id` (string)
  - `subject` (string)
  - `from` (string)
  - `headers` (object with In-Reply-To, References, Conversation-Index, etc.)
  - `received_at` (number, Unix ms)
- `existing_threads`: Array of open ThreadState objects

**Outputs:**

- `thread_id` (string, UUID) - Existing thread ID if match found, OR null if new thread needed
- `match_confidence` (enum: high, medium, low) - Strength of match

**Failure Modes:**

- Malformed headers: skip that matching method, try next
- Multiple thread matches: select first match chronologically (oldest thread)
- No headers present: rely on subject + participant matching only

**Algorithm:**

```
FUNCTION detect_thread(message, existing_threads):
  // Priority 1: In-Reply-To and References headers (high confidence)
  IF message.headers['In-Reply-To'] OR message.headers['References']:
    parent_ids = extract_message_ids(message.headers)
    FOR EACH thread IN existing_threads WHERE thread.status == "open":
      IF ANY(parent_ids INTERSECT thread.message_ids):
        RETURN thread.thread_id, confidence="high"

  // Priority 2: Conversation-Index (high confidence for Outlook)
  IF message.headers['Conversation-Index']:
    FOR EACH thread IN existing_threads WHERE thread.status == "open":
      IF thread.conversation_index == message.headers['Conversation-Index']:
        RETURN thread.thread_id, confidence="high"

  // Priority 3: Subject + participants + temporal proximity (medium confidence)
  normalized_subject = normalize_subject(message.subject)
  IF normalized_subject.length > 5:  // Avoid generic subjects
    FOR EACH thread IN existing_threads WHERE thread.status == "open":
      IF thread.normalized_subject == normalized_subject:
        IF message.from IN thread.participants:
          time_delta = message.received_at - thread.last_activity_at
          IF time_delta < (7 * 24 * 3600000):  // Within 7 days
            RETURN thread.thread_id, confidence="medium"

  // No match found
  RETURN null, confidence="low"

FUNCTION normalize_subject(subject):
  // Remove reply/forward prefixes
  cleaned = subject
  cleaned = remove_prefix(cleaned, "Re:", "RE:", "re:")
  cleaned = remove_prefix(cleaned, "Fwd:", "FW:", "fwd:")
  cleaned = remove_prefix(cleaned, "[External]", "[EXTERNAL]")
  cleaned = cleaned.trim().toLowerCase()
  RETURN cleaned

FUNCTION extract_message_ids(headers):
  ids = []
  IF headers['In-Reply-To']:
    ids.append(parse_message_id(headers['In-Reply-To']))
  IF headers['References']:
    // References is space-separated list of Message-IDs
    ids.extend(parse_message_id_list(headers['References']))
  RETURN ids
```

**Thread State Updates:**
When message joins existing thread:

- Append `message_id` to thread's `message_ids` array
- Update thread's `last_activity_at` to message's `received_at`
- Add message's `from`, `to`, `cc` addresses to thread's `participants` set
- Emit THREAD_ACTIVITY_OBSERVED event (already emitted during ingestion)

**Deduplication Integration:**
Thread detection happens AFTER deduplication:

- Duplicate forwards (same Message-ID) rejected at ingestion → never reach thread detection
- Legitimate forwards (new Message-ID) processed normally → may or may not match existing thread based on headers

### Module: Backend Ingestion

**Purpose:**  
Parse incoming email, validate sender, emit MESSAGE_RECEIVED event, orchestrate LLM extraction.

#### MR-BackendIngestion-1: Email Parsing

**Description:**  
Parse raw email into structured fields.

**Inputs:**

- `raw_email` (string, RFC 5322 format)

**Outputs:**

- Object with fields:
  - `from` (string, email address)
  - `subject` (string)
  - `body_text` (string, plain text body)
  - `headers` (object, key-value pairs)
  - `message_id` (string | null)
  - `received_at` (number, Unix milliseconds)

**Failure Modes:**

- Invalid RFC 5322 format: throw `PARSE_ERROR`
- Missing From header: throw `MISSING_REQUIRED_HEADER`
- Multipart body without text/plain: extract from HTML or return empty string

#### MR-BackendIngestion-2: Sender Validation

**Description:**  
Check if sender is in watcher allowlist.

**Inputs:**

- `sender_email` (string)
- `allowed_senders` (array of strings)

**Outputs:**

- Boolean: true if sender allowed, false otherwise

**Failure Modes:**

- Empty allowlist: return true (allow all)
- Null sender_email: return false

**Algorithm:**

```
IF allowed_senders.length == 0:
  RETURN true

normalized_sender = sender_email.toLowerCase().trim()

FOR EACH allowed IN allowed_senders:
  normalized_allowed = allowed.toLowerCase().trim()
  IF normalized_sender == normalized_allowed:
    RETURN true

RETURN false
```

#### MR-BackendIngestion-3: Email Deduplication

**Description:**  
Generate unique message_id and check for duplicates.

**Inputs:**

- `header_message_id` (string | null, from email Message-ID header)
- `from` (string)
- `subject` (string)
- `received_at` (number)

**Outputs:**

- `message_id` (string, unique identifier for Vigil system)
- Boolean: true if duplicate, false if unique

**Failure Modes:**

- Hash collision: extremely unlikely (SHA-256), treat as non-duplicate

**Algorithm:**

```
IF header_message_id IS NOT null AND header_message_id is valid:
  message_id = "msgid-" + SHA256(header_message_id).substring(0, 16)
ELSE:
  content = from + "|" + subject + "|" + received_at
  message_id = "hash-" + SHA256(content).substring(0, 16)

exists = query_event_store_for_message_id(message_id)
RETURN message_id, exists
```

#### MR-BackendIngestion-4: LLM Orchestration

**Description:**  
Call LLM service for extraction if sender is allowed and watcher is active.

**Inputs:**

- `email_text` (string, body text)
- `reference_timestamp` (number, Unix milliseconds)
- `sender_allowed` (boolean)
- `watcher_status` (enum: created, active, paused)

**Outputs:**

- Zero or more extraction record events:
  - `HARD_DEADLINE_OBSERVED` (if hard deadline found)
  - `SOFT_DEADLINE_SIGNAL_OBSERVED` (if soft deadline signal found)
  - `URGENCY_SIGNAL_OBSERVED` (if urgency indicator found)
  - `CLOSURE_SIGNAL_OBSERVED` (if closure language found)

**Failure Modes:**

- LLM service unreachable: log warning, return empty array
- LLM timeout: log warning, return empty array
- Invalid LLM response: log error, return empty array
- Sender not allowed: skip LLM call, return empty array
- Watcher not active: skip LLM call, return empty array

### Module: LLM Service

**Purpose:**  
Extract structured facts from email text using language model inference.

#### MR-LLMService-1: Hard Deadline Extraction

**Description:**  
Extract explicit deadline timestamp with absolute temporal constraints from natural language text.

**Inputs:**

- Request body (JSON):
  - `email_text` (string)
  - `reference_timestamp` (number, Unix milliseconds)
  - `reference_timezone` (string, IANA timezone, e.g., "America/New_York")

**Outputs:**

- Response body (JSON):
  - `deadline_found` (boolean)
  - `deadline_utc` (number | null, Unix milliseconds)
  - `deadline_text` (string, verbatim phrase from email)
  - `source_span` (string, verbatim excerpt containing deadline)
  - `confidence` (enum: `high`, `medium`, `low`)
  - `is_absolute` (boolean, true if explicit date/time, false if relative)
  - `binding_language` (boolean, true for hard deadline language)
  - `extractor_version` (string, e.g., "v1.0.0")

**Failure Modes:**

- No deadline found: return `deadline_found: false`, `deadline_utc: null`
- Ambiguous deadline: return best guess with `confidence: low`
- Invalid input JSON: return HTTP 400
- Timeout: return HTTP 504 after 10 seconds
- Only extract if language indicates binding commitment

#### MR-LLMService-2: Closure Signal Detection

**Description:**  
Detect explicit closure language in email.

**Inputs:**

- Request body (JSON):
  - `email_text` (string)

**Outputs:**

- Response body (JSON):
  - `closure_found` (boolean)
  - `closure_type` (enum: `explicit`, `implicit`, `none`)
  - `source_span` (string, verbatim excerpt)
  - `confidence` (enum: `high`, `medium`, `low`)
  - `extractor_version` (string)

**Failure Modes:**

- No closure detected: return `closure_found: false`, `closure_type: none`
- Ambiguous: return `closure_found: false`, `confidence: low`
- Invalid input JSON: return HTTP 400

#### MR-LLMService-3: Source Span Validation

**Description:**  
Ensure extracted source_span substring exists in original text.

**Inputs:**

- `email_text` (string, original email body)
- `source_span` (string, extracted by LLM)

**Outputs:**

- Boolean: true if source_span found verbatim in email_text, false otherwise

**Failure Modes:**

- Case mismatch: perform case-insensitive search
- Source span not found: log error, reject LLM output

**Algorithm:**

```
normalized_text = email_text.toLowerCase()
normalized_span = source_span.toLowerCase()

RETURN normalized_text.includes(normalized_span)
```

#### MR-LLMService-4: Soft Deadline Signal Extraction

**Description:**  
Extract fuzzy temporal language indicating advisory timeframes.

**Inputs:**

- Request body (JSON):
  - `email_text` (string)
  - `reference_timestamp` (number, Unix milliseconds)

**Outputs:**

- Response body (JSON):
  - `signal_found` (boolean)
  - `signal_text` (string, verbatim temporal phrase)
  - `source_span` (string, verbatim excerpt)
  - `estimated_horizon_hours` (number | null, rough time estimate)
  - `confidence` (enum: `high`, `medium`, `low`)
  - `binding_language` (boolean, always false for soft signals)
  - `extractor_version` (string)

**Failure Modes:**

- No signal found: return `signal_found: false`
- Invalid input JSON: return HTTP 400
- Timeout: return HTTP 504 after 10 seconds

#### MR-LLMService-5: Urgency Signal Detection

**Description:**  
Detect priority indicators without temporal constraints.

**Inputs:**

- Request body (JSON):
  - `email_text` (string)

**Outputs:**

- Response body (JSON):
  - `urgency_found` (boolean)
  - `urgency_level` (enum: `high`, `medium`, `low`)
  - `indicators` (array of strings, urgency keywords found)
  - `source_span` (string, verbatim excerpt)
  - `extractor_version` (string)

**Failure Modes:**

- No urgency found: return `urgency_found: false`
- Invalid input JSON: return HTTP 400

### Module: Notification Worker

**Purpose:**  
Monitor event stream for alert and report events, deliver to configured channels.

#### MR-NotificationWorker-1: Alert Delivery

**Description:**  
Deliver alert to notification channel with retry.

**Inputs:**

- `alert`: ALERT_QUEUED event with fields:
  - `alert_id` (string, UUID)
  - `watcher_id` (string, UUID)
  - `thread_id` (string, UUID)
  - `urgency_state` (enum)
  - `channels` (array of NotificationChannel)

**Outputs:**

- For each channel:
  - ALERT_SENT event OR
  - ALERT_FAILED event after 3 retries

**Failure Modes:**

- SMTP unreachable: retry 3 times, emit ALERT_FAILED
- Webhook returns 5xx: retry 3 times, emit ALERT_FAILED
- Webhook returns 4xx: do not retry, emit ALERT_FAILED immediately
- Channel disabled: skip without error

#### MR-NotificationWorker-2: Channel Filtering

**Description:**  
Filter channels based on urgency threshold.

**Inputs:**

- `channels` (array of NotificationChannel)
- `alert_urgency` (enum: `warning`, `critical`, `overdue`)

**Outputs:**

- Filtered array of channels where alert should be delivered

**Failure Modes:**

- Empty channels array: return empty, log warning

**Algorithm:**

```
filtered = []

FOR EACH channel IN channels:
  IF channel.enabled == false:
    CONTINUE

  IF channel.urgency_filter == "all":
    filtered.append(channel)
  ELSE IF channel.urgency_filter == "critical" AND alert_urgency IN ["critical", "overdue"]:
    filtered.append(channel)
  ELSE IF channel.urgency_filter == "warning" AND alert_urgency IN ["warning", "critical", "overdue"]:
    filtered.append(channel)

RETURN filtered
```

#### MR-NotificationWorker-3: Email Formatting

**Description:**  
Format alert email with thread context.

**Inputs:**

- `watcher_name` (string)
- `thread_id` (string)
- `urgency_state` (enum)
- `deadline_timestamp` (number | null)
- `hours_since_activity` (number)
- `dashboard_url` (string, base URL)

**Outputs:**

- Email object with fields:
  - `subject` (string)
  - `body` (string, plain text)
  - `to` (string, recipient email)

**Failure Modes:**

- Null deadline: omit deadline line from email body

**Template:**

```
Subject: [Vigil Alert] {watcher_name} - Thread {urgency_state}

Watcher: {watcher_name}
Thread: {thread_id}
Status: {urgency_state}
Deadline: {deadline_timestamp formatted as ISO 8601 OR "None"}
Last Activity: {hours_since_activity} hours ago

View thread: {dashboard_url}/threads/{thread_id}

--
Vigil Vigilance System
```

### Module: Frontend API Client

**Purpose:**  
Communicate with backend API from web dashboard.

#### MR-Frontend-1: Thread List Retrieval

**Description:**  
Fetch current thread state for watcher.

**Inputs:**

- `watcher_id` (string, UUID)
- `auth_token` (string, JWT)

**Outputs:**

- HTTP GET request to `/api/watchers/{watcher_id}/threads`
- Headers: `Authorization: Bearer {auth_token}`
- Response: JSON array of thread objects

**Failure Modes:**

- 401 Unauthorized: prompt user to re-authenticate
- 403 Forbidden: display access denied message
- 404 Not Found: display watcher not found error
- 500 Server Error: display error, allow retry

#### MR-Frontend-2: Manual Thread Closure

**Description:**  
Submit user action to close thread.

**Inputs:**

- `thread_id` (string, UUID)
- `reason` (string, optional user note)
- `auth_token` (string, JWT)

**Outputs:**

- HTTP POST request to `/api/threads/{thread_id}/close`
- Headers: `Authorization: Bearer {auth_token}`
- Body: `{"reason": "{reason}"}`
- Response: 200 OK with event_id

**Failure Modes:**

- Thread already closed: backend returns 409 Conflict
- Thread not found: backend returns 404
- Unauthorized: backend returns 403

#### MR-Frontend-3: Event Log Display

**Description:**  
Render event log with pagination.

**Inputs:**

- `events` (array of VigilEvent objects)
- `current_page` (number)
- `total_events` (number)

**Outputs:**

- Rendered HTML table with columns:
  - Timestamp (formatted as ISO 8601 local time)
  - Event Type
  - Actor (user_id if present, else "System")
  - Details (event-specific fields)
- Pagination controls: Previous, Next, Page X of Y

**Failure Modes:**

- Empty events array: display "No events"
- Invalid timestamp: display raw value

### Module: Scheduler

**Purpose:**  
Generate TIME_TICK events at regular intervals.

#### MR-Scheduler-1: Tick Generation

**Description:**  
Emit TIME_TICK event every N minutes for each active watcher.

**Inputs:**

- `interval_minutes` (number, default 15)
- Active watcher list (queried from event store)

**Outputs:**

- For each active watcher:
  - TIME_TICK event with fields:
    - `event_id` (string, UUID)
    - `timestamp` (number, current Unix milliseconds)
    - `watcher_id` (string, UUID)
    - `type` (string, "TIME_TICK")
    - `tick_timestamp` (number, Unix milliseconds)

**Failure Modes:**

- Event store unavailable: skip tick, log error, retry next interval
- Watcher list query fails: use cached list from previous tick

#### MR-Scheduler-2: Report Scheduling

**Description:**  
Trigger report generation based on watcher cadence.

**Inputs:**

- Watcher policy with:
  - `reporting_cadence` (enum: `daily`, `weekly`, `monthly`, `on_demand`)
  - `reporting_time` (string, ISO 8601 time, e.g., "09:00:00Z")
  - `reporting_day` (number, 1-7 for weekly, 1-31 for monthly)

**Outputs:**

- For daily: emit REPORT_GENERATED event every 24 hours at `reporting_time`
- For weekly: emit REPORT_GENERATED event every 7 days on `reporting_day` (1=Monday) at `reporting_time`
- For monthly: emit REPORT_GENERATED event on `reporting_day` of each month at `reporting_time`; clamp to last day if day exceeds month length
- For on_demand: do not emit (user triggers manually)

**Failure Modes:**

- Invalid reporting_time format: log error, skip report
- Missed scheduled time (system downtime): emit report at next opportunity, do not emit duplicate

## 5. Traceability Matrix

### Feature to Module Mappings

| Feature Requirement                    | Module Requirements                                                                  | Test Strategy                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| FR-1: Watcher Creation                 | MR-EventStore-1, MR-EventStore-3                                                     | Unit: event emission; Integration: API endpoint                             |
| FR-2: Watcher Activation               | MR-EventStore-1, MR-WatcherRuntime-1                                                 | Unit: status transition; Integration: validation                            |
| FR-3: Watcher Pause/Resume             | MR-EventStore-1, MR-WatcherRuntime-1                                                 | Unit: status transition; Integration: effect on threads                     |
| FR-4: Policy Configuration             | MR-EventStore-1                                                                      | Unit: validation; Integration: policy application                           |
| FR-5: Email Ingestion                  | MR-BackendIngestion-1, MR-BackendIngestion-2, MR-BackendIngestion-3, MR-EventStore-1 | Unit: parsing, validation; Integration: end-to-end                          |
| FR-6: Hard Deadline Extraction         | MR-LLMService-1, MR-LLMService-3, MR-BackendIngestion-4                              | Unit: LLM response; Integration: event emission                             |
| FR-6b: Soft Deadline Signal Extraction | MR-LLMService-4, MR-LLMService-3, MR-BackendIngestion-4                              | Unit: signal detection; Integration: advisory event                         |
| FR-7: Closure Detection                | MR-LLMService-2, MR-LLMService-3                                                     | Unit: LLM response; Integration: thread closure                             |
| FR-8: Thread Creation                  | MR-WatcherRuntime-1, MR-WatcherRuntime-2, MR-EventStore-1                            | Unit: state transition; Integration: event sequence                         |
| FR-9: Thread Closure                   | MR-WatcherRuntime-2, MR-EventStore-1                                                 | Unit: terminal state; Integration: no reopen                                |
| FR-10: Urgency Evaluation              | MR-WatcherRuntime-3                                                                  | Unit: algorithm correctness; Property: determinism                          |
| FR-11: Alert Generation                | MR-WatcherRuntime-4                                                                  | Unit: transition detection; Integration: no duplicates                      |
| FR-12: Alert Delivery                  | MR-NotificationWorker-1, MR-NotificationWorker-2, MR-NotificationWorker-3            | Unit: retry logic; Integration: SMTP delivery                               |
| FR-13: State Reconstruction            | MR-WatcherRuntime-1, MR-WatcherRuntime-2, MR-EventStore-2                            | Unit: replay correctness; Property: idempotence                             |
| FR-14: Event Log Inspection            | MR-EventStore-2, MR-Frontend-3                                                       | Integration: API query; UI: display                                         |
| FR-15: Report Generation               | MR-Scheduler-2, MR-NotificationWorker-3                                              | Unit: summary computation; Integration: delivery                            |
| FR-16: Deterministic Replay            | MR-WatcherRuntime-1, MR-WatcherRuntime-2, MR-WatcherRuntime-3                        | Property: idempotence, determinism                                          |
| FR-17: Access Control                  | Backend validation (to be specified)                                                 | Unit: token validation; Integration: 401/403                                |
| FR-18: Sender Validation               | MR-BackendIngestion-2                                                                | Unit: allowlist matching; Integration: rejection                            |
| FR-19: Event Model Traceability        | MR-WatcherRuntime-5, MR-EventStore-2                                                 | Integration: causal chain verification; Property: referential integrity     |
| FR-20: One-Way Data Flow               | All modules                                                                          | Architecture: dependency graph analysis; Code review: no bidirectional refs |

### Infrastructure to Verification Mappings

| Infrastructure Requirement            | Verification Tests                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| IR-1: Event Store Immutability        | SQL injection test, manual UPDATE attempt, audit log review                       |
| IR-2: Event Store Ordering            | Query ordering verification, concurrent insert test                               |
| IR-3: Event Store Availability        | Synthetic uptime monitoring, 30-day availability calculation                      |
| IR-4: Event Store Durability          | Crash recovery test, fsync verification                                           |
| IR-5: Backend API Availability        | Synthetic health check, p99 latency monitoring                                    |
| IR-6: Backend API Authentication      | Negative test (no token), invalid token test                                      |
| IR-7: Backend API Rate Limiting       | Load test with 1001 requests/min                                                  |
| IR-8: SMTP Adapter Port Configuration | Environment variable test, netstat verification                                   |
| IR-9: SMTP Adapter Forwarding         | End-to-end email test with timing                                                 |
| IR-10: LLM Service Network Isolation  | External connection test (should fail), internal connection test (should succeed) |
| IR-11: LLM Service Timeout            | Long input test, timeout measurement                                              |
| IR-12: LLM Service Determinism        | Repeated input test, output comparison                                            |
| IR-13: Database Connection Pooling    | Connection count monitoring, pool exhaustion test                                 |
| IR-14: TLS Encryption                 | SSL Labs scan, protocol version verification                                      |
| IR-15: Email Delivery Retry Policy    | SMTP failure simulation, retry timing verification                                |
| IR-16: Event Store Backup             | Backup job inspection, restore test                                               |
| IR-17: Logging Structured Output      | Log format validation, JSON parsing test                                          |
| IR-18: Observability Metrics          | Metrics endpoint query, Prometheus scrape test                                    |
| IR-19: Secret Management              | Grep codebase for secrets, environment variable verification                      |
| IR-20: Data Retention Compliance      | Deletion request test, 30-day grace period verification                           |

### Implementation Coverage Table

This table maps every requirement to its implementation, test, and infrastructure locations within the repository. Requirements without linked implementations are marked **Not Implemented**. Requirements without linked tests are marked **Not Tested**.

#### Feature Requirements Coverage

| Requirement | Description | Implementation | Tests | Infrastructure | Status |
|-------------|-------------|----------------|-------|----------------|--------|
| FR-1 | Watcher Creation | [backend/src/events/types.ts](../backend/src/events/types.ts) (WatcherCreatedEvent) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | [backend/.env.example](../backend/.env.example) | Partial - Event types defined, API not implemented |
| FR-2 | Watcher Activation | [backend/src/events/types.ts](../backend/src/events/types.ts) (WatcherActivatedEvent), [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Partial - Event replay implemented, API not implemented |
| FR-3 | Watcher Pause/Resume | [backend/src/events/types.ts](../backend/src/events/types.ts) (WatcherPausedEvent, WatcherResumedEvent), [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Partial - Event replay implemented, API not implemented |
| FR-4 | Policy Configuration | [backend/src/events/types.ts](../backend/src/events/types.ts) (PolicyUpdatedEvent, WatcherPolicy) | **Not Tested** | — | Partial - Types defined, validation not implemented |
| FR-5 | Email Ingestion | [backend/src/events/types.ts](../backend/src/events/types.ts) (MessageReceivedEvent) | **Not Tested** | [smtp-adapter/.env.example](../smtp-adapter/.env.example) | **Not Implemented** - Event types only |
| FR-6 | Hard Deadline Extraction | [backend/src/events/types.ts](../backend/src/events/types.ts) (HardDeadlineObservedEvent) | **Not Tested** | [llm-service/.env.example](../llm-service/.env.example) | **Not Implemented** - Event types only |
| FR-6b | Soft Deadline Signal Extraction | [backend/src/events/types.ts](../backend/src/events/types.ts) (SoftDeadlineSignalObservedEvent) | **Not Tested** | [llm-service/.env.example](../llm-service/.env.example) | **Not Implemented** - Event types only |
| FR-6c | Urgency Signal Extraction | [backend/src/events/types.ts](../backend/src/events/types.ts) (UrgencySignalObservedEvent) | **Not Tested** | [llm-service/.env.example](../llm-service/.env.example) | **Not Implemented** - Event types only |
| FR-7 | Closure Detection | [backend/src/events/types.ts](../backend/src/events/types.ts) (ClosureSignalObservedEvent) | **Not Tested** | [llm-service/.env.example](../llm-service/.env.example) | **Not Implemented** - Event types only |
| FR-8 | Thread Creation | [backend/src/events/types.ts](../backend/src/events/types.ts) (ThreadOpenedEvent), [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Partial - Event replay implemented |
| FR-9 | Thread Closure | [backend/src/events/types.ts](../backend/src/events/types.ts) (ThreadClosedEvent), [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Implemented - Closure finality tested |
| FR-10 | Urgency Evaluation | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) (evaluateThreadUrgency) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Implemented |
| FR-11 | Alert Queuing | [backend/src/events/types.ts](../backend/src/events/types.ts) (AlertQueuedEvent) | **Not Tested** | — | **Not Implemented** - Event types only |
| FR-12 | Alert Delivery | [backend/src/events/types.ts](../backend/src/events/types.ts) (AlertSentEvent, AlertFailedEvent) | **Not Tested** | — | **Not Implemented** - Event types only |
| FR-13 | State Reconstruction | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) (replayEvents) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Implemented |
| FR-14 | Event Log Inspection | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) | [backend/test/events/event-store.test.ts](../backend/test/events/event-store.test.ts) | — | Partial - Store implemented, API not implemented |
| FR-15 | Report Generation | [backend/src/events/types.ts](../backend/src/events/types.ts) (ReportGeneratedEvent, ReportSentEvent) | **Not Tested** | — | **Not Implemented** - Event types only |
| FR-16 | Deterministic Replay | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | — | Implemented |
| FR-17 | Access Control | **Not Implemented** | **Not Tested** | — | **Not Implemented** |
| FR-18 | Sender Validation | **Not Implemented** | **Not Tested** | — | **Not Implemented** |
| FR-19 | Event Model Traceability | [backend/src/events/types.ts](../backend/src/events/types.ts) (causal_event_id fields) | **Not Tested** | — | Partial - Types defined |
| FR-20 | One-Way Data Flow | Architecture enforced in [backend/src/events/types.ts](../backend/src/events/types.ts) | **Not Tested** | — | Partial - Type system enforces |

#### Module Requirements Coverage

| Requirement | Description | Implementation | Tests | Status |
|-------------|-------------|----------------|-------|--------|
| MR-EventStore-1 | Event Append | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) (append) | [backend/test/events/event-store.test.ts](../backend/test/events/event-store.test.ts) | Implemented |
| MR-EventStore-2 | Event Retrieval | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) (getEventsForWatcher) | [backend/test/events/event-store.test.ts](../backend/test/events/event-store.test.ts) | Implemented |
| MR-EventStore-3 | Event Deduplication | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) (event_id check) | [backend/test/events/event-store.test.ts](../backend/test/events/event-store.test.ts) | Implemented |
| MR-WatcherRuntime-1 | Event Replay | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) (replayEvents) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | Implemented |
| MR-WatcherRuntime-2 | Thread State Reconstruction | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) (replayEvents) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | Implemented |
| MR-WatcherRuntime-3 | Urgency Computation | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) (evaluateThreadUrgency) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | Implemented |
| MR-WatcherRuntime-4 | State Transition Detection | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | **Not Tested** | Partial |
| MR-WatcherRuntime-5 | Reminder Generation | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-WatcherRuntime-6 | Thread Detection | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-BackendIngestion-1 | Email Parsing | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-BackendIngestion-2 | Sender Validation | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-BackendIngestion-3 | Email Deduplication | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-BackendIngestion-4 | LLM Orchestration | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-LLMService-1 | Hard Deadline Extraction | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-LLMService-2 | Closure Signal Detection | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-LLMService-3 | Source Span Validation | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-LLMService-4 | Soft Deadline Signal Extraction | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-LLMService-5 | Urgency Signal Detection | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-NotificationWorker-1 | Alert Delivery | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-NotificationWorker-2 | Channel Filtering | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-NotificationWorker-3 | Email Formatting | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-Frontend-1 | Thread List Retrieval | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-Frontend-2 | Manual Thread Closure | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-Frontend-3 | Event Log Display | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-Scheduler-1 | Tick Generation | **Not Implemented** | **Not Tested** | **Not Implemented** |
| MR-Scheduler-2 | Report Scheduling | **Not Implemented** | **Not Tested** | **Not Implemented** |

#### Infrastructure Requirements Coverage

| Requirement | Description | Implementation | Infrastructure | Status |
|-------------|-------------|----------------|----------------|--------|
| IR-1 | Event Store Immutability | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) (append-only) | — | Implemented (in-memory) |
| IR-2 | Event Store Ordering | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) | — | Implemented |
| IR-3 | Event Store Availability | **Not Implemented** | PostgreSQL (TBD) | **Not Implemented** |
| IR-4 | Event Store Durability | **Not Implemented** | PostgreSQL (TBD) | **Not Implemented** |
| IR-5 | Backend API Availability | **Not Implemented** | — | **Not Implemented** |
| IR-6 | Backend API Authentication | **Not Implemented** | — | **Not Implemented** |
| IR-7 | Backend API Rate Limiting | **Not Implemented** | — | **Not Implemented** |
| IR-8 | SMTP Adapter Port Config | [smtp-adapter/.env.example](../smtp-adapter/.env.example) | — | Config only |
| IR-9 | SMTP Adapter Forwarding | **Not Implemented** | — | **Not Implemented** |
| IR-10 | LLM Service Network Isolation | [llm-service/.env.example](../llm-service/.env.example) | — | Config only |
| IR-11 | LLM Service Timeout | **Not Implemented** | — | **Not Implemented** |
| IR-12 | LLM Service Determinism | **Not Implemented** | — | **Not Implemented** |
| IR-13 | Database Connection Pooling | **Not Implemented** | PostgreSQL (TBD) | **Not Implemented** |
| IR-14 | TLS Encryption | **Not Implemented** | — | **Not Implemented** |
| IR-15 | Email Delivery Retry | **Not Implemented** | — | **Not Implemented** |
| IR-16 | Event Store Backup | **Not Implemented** | PostgreSQL (TBD) | **Not Implemented** |
| IR-17 | Logging Structured Output | **Not Implemented** | — | **Not Implemented** |
| IR-18 | Observability Metrics | **Not Implemented** | — | **Not Implemented** |
| IR-19 | Secret Management | [backend/.env.example](../backend/.env.example) | — | Config only |
| IR-20 | Data Retention Compliance | **Not Implemented** | — | **Not Implemented** |
| IR-21 | Central Log Aggregation | **Not Implemented** | — | **Not Implemented** |
| IR-22 | Per-Watcher Log Isolation | **Not Implemented** | — | **Not Implemented** |
| IR-23 | Log Correlation | **Not Implemented** | — | **Not Implemented** |

#### Security Requirements Coverage

| Requirement | Description | Implementation | Tests | Status |
|-------------|-------------|----------------|-------|--------|
| SEC-1 | Authentication Token Expiry | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-2 | Password Storage | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-3 | Ingest Token Entropy | [backend/src/events/types.ts](../backend/src/events/types.ts) (ingest_token field) | **Not Tested** | Partial - Type defined |
| SEC-4 | SQL Injection Prevention | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-5 | Email Content PII Protection | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-6 | HTTPS Certificate Validation | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-7 | Rate Limiting Per Watcher | **Not Implemented** | **Not Tested** | **Not Implemented** |
| SEC-8 | Access Token Scope | **Not Implemented** | **Not Tested** | **Not Implemented** |

#### Data Consistency Requirements Coverage

| Requirement | Description | Implementation | Tests | Status |
|-------------|-------------|----------------|-------|--------|
| CONS-1 | Event Ordering Within Watcher | [backend/src/events/event-store.ts](../backend/src/events/event-store.ts) | [backend/test/events/event-store.test.ts](../backend/test/events/event-store.test.ts) | Implemented |
| CONS-2 | Thread State Convergence | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | Implemented |
| CONS-3 | Alert Idempotence | **Not Implemented** | **Not Tested** | **Not Implemented** |
| CONS-4 | Closure Finality | [backend/src/watcher/runtime.ts](../backend/src/watcher/runtime.ts) | [backend/test/watcher/runtime.test.ts](../backend/test/watcher/runtime.test.ts) | Implemented |
| CONS-5 | Projection Correctness | **Not Implemented** | **Not Tested** | **Not Implemented** |
| CONS-6 | Time Tick Monotonicity | **Not Implemented** | **Not Tested** | **Not Implemented** |
| CONS-7 | Email Deduplication | **Not Implemented** | **Not Tested** | **Not Implemented** |
| CONS-8 | Reminder Causal Traceability | **Not Implemented** | **Not Tested** | **Not Implemented** |

#### Documentation Coverage

| Document | SDD Requirements Covered |
|----------|--------------------------|
| [README.md](../README.md) | System Overview (1.1-1.4), Architectural Invariants |
| [docs/README.md](README.md) | Navigation index for all requirements |
| [docs/SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | All FR-*, MR-* implementation details |
| [backend/README.md](../backend/README.md) | FR-1 to FR-16, MR-EventStore-*, MR-WatcherRuntime-*, MR-BackendIngestion-*, MR-NotificationWorker-*, MR-Scheduler-* |
| [frontend/README.md](../frontend/README.md) | FR-13, FR-14, MR-Frontend-1 to MR-Frontend-3 |
| [llm-service/README.md](../llm-service/README.md) | FR-6, FR-6b, FR-6c, FR-7, MR-LLMService-1 to MR-LLMService-5, IR-10 to IR-12 |
| [smtp-adapter/README.md](../smtp-adapter/README.md) | FR-5, IR-8, IR-9 |

#### Implementation Summary

| Category | Total | Implemented | Partial | Not Implemented |
|----------|-------|-------------|---------|-----------------|
| Feature Requirements (FR-*) | 22 | 4 | 9 | 9 |
| Module Requirements (MR-*) | 26 | 6 | 1 | 19 |
| Infrastructure Requirements (IR-*) | 23 | 2 | 3 | 18 |
| Security Requirements (SEC-*) | 8 | 0 | 1 | 7 |
| Data Consistency (CONS-*) | 8 | 3 | 0 | 5 |
| **Total** | **87** | **15** | **14** | **58** |

## 6. Security Requirements

### SEC-1: Authentication Token Expiry

**Description:**  
JWT tokens shall expire after 24 hours and require refresh.

**Verification:**

- Issue token at T0
- Attempt API call at T0 + 25 hours
- Confirm 401 Unauthorized response
- Confirm error message includes "token expired"

### SEC-2: Password Storage

**Description:**  
User passwords shall be hashed using bcrypt with cost factor ≥ 12.

**Verification:**

- Create user with password "TestPass123!"
- Query database for user record
- Confirm password field starts with "$2b$12$" (bcrypt identifier + cost)
- Confirm password field length is 60 characters
- Attempt login with correct password: succeeds
- Attempt login with incorrect password: fails

### SEC-3: Ingest Token Entropy

**Description:**  
Ingest tokens shall have minimum 40 bits of entropy to prevent brute force.

**Verification:**

- Generate 1000 ingest tokens
- Confirm all tokens are 8-12 characters from base36 alphabet
- Calculate entropy: log2(36^8) = 41.4 bits
- Confirm no collisions in 1000 samples
- Attempt brute force: 36^8 = 2.8 trillion combinations (infeasible)

### SEC-4: SQL Injection Prevention

**Description:**  
All database queries shall use parameterized statements, never string concatenation.

**Verification:**

- Code review: grep for string concatenation in SQL queries
- Confirm all queries use `?` placeholders or named parameters
- Injection test: submit `watcher_id = "' OR '1'='1"` to API
- Confirm query returns 404 or 0 results, not all watchers

### SEC-5: Email Content PII Protection

**Description:**  
Email body content shall never appear in logs, metrics, or error messages.

**Verification:**

- Send test email with sensitive content: "SSN: 123-45-6789"
- Grep all log files for "SSN", "123-45-6789"
- Confirm no matches
- Trigger parsing error with malformed email
- Confirm error log includes "parsing failed" but not email body

### SEC-6: HTTPS Certificate Validation

**Description:**  
Backend shall validate TLS certificates for all outbound HTTPS requests.

**Verification:**

- Configure webhook notification with self-signed certificate
- Trigger alert
- Confirm webhook delivery fails with certificate validation error
- Confirm error includes "certificate verification failed"
- Configure webhook with valid certificate
- Confirm delivery succeeds

### SEC-7: Rate Limiting Per Watcher

**Description:**  
Email ingestion shall be rate limited to 100 emails per hour per watcher.

**Verification:**

- Send 101 emails to same watcher ingestion address within 60 minutes
- Confirm first 100 emails processed (MESSAGE_RECEIVED events emitted)
- Confirm 101st email rejected with SMTP 450 (temporary failure)
- Wait 60 minutes
- Confirm next email accepted

### SEC-8: Access Token Scope

**Description:**  
JWT tokens shall include `account_id` claim limiting access to watchers within that account.

**Verification:**

- Create two accounts: A1, A2
- Create watcher W1 in A1, watcher W2 in A2
- Issue token T1 for account A1
- Attempt to access W2 using T1: `GET /api/watchers/W2/threads`
- Confirm 403 Forbidden response
- Attempt to access W1 using T1: succeeds

## 7. Data Consistency Requirements

### CONS-1: Event Ordering Within Watcher

**Description:**  
Events for single watcher shall be totally ordered by timestamp with no gaps.

**Verification:**

- Query events for watcher: `SELECT timestamp FROM events WHERE watcher_id = 'w1' ORDER BY timestamp`
- Compute deltas: `timestamp[i+1] - timestamp[i]`
- Confirm all deltas > 0 (strictly increasing)
- Confirm no duplicate timestamps for same watcher

### CONS-2: Thread State Convergence

**Description:**  
Replaying same event sequence shall always produce identical thread state.

**Verification:**

- Define event sequence E1...E10 for watcher
- Replay 100 times
- Compare resulting WatcherState objects
- Confirm all 100 are deeply equal:
  - Same thread_ids
  - Same statuses
  - Same deadlines
  - Same message_ids arrays in same order

### CONS-3: Alert Idempotence (Per-Watcher)

**Description:**  
Replaying events shall not cause duplicate alert emissions. Idempotence is enforced at the watcher level for simplicity and determinism.

**Idempotence Strategy:**

Idempotence is enforced **per-watcher**, not per-thread. This yields the simplest behavior and least ambiguous system state:

1. **Watcher-Level Deduplication:** Each watcher maintains replay state that tracks which alerts have been generated. During replay, the runtime compares current urgency state against previously recorded reminder states to detect transitions.

2. **Why Per-Watcher (not Per-Thread):**
   - Simpler implementation: single state tracking scope per runtime invocation
   - Deterministic: watcher state is fully reconstructed from its event stream
   - No cross-thread coordination needed
   - Isolation guarantee: watcher A's replay never affects watcher B

3. **Mechanism:**
   - Runtime tracks `last_urgency_state` per thread during replay
   - REMINDER_GENERATED events are only emitted on state TRANSITIONS (ok→warning, warning→critical, etc.)
   - Repeated replay with same events produces same reminder events (idempotent)
   - No new events emitted if state hasn't changed

4. **Guarantees:**
   - Same event sequence → same alerts (deterministic)
   - No duplicate ALERT_QUEUED for same urgency transition
   - Thread urgency evaluated independently, but idempotence tracked at watcher scope

**Verification:**

- Define event sequence including urgency transition ok → warning
- Replay sequence
- Count ALERT_QUEUED events: should be exactly 1
- Replay sequence again (with same events)
- Count ALERT_QUEUED events: should still be 1 (no new alerts)
- Verify no cross-watcher state leakage

### CONS-4: Closure Finality

**Description:**  
Once thread is closed, no events shall cause status transition to open.

**Verification:**

- Create event sequence: THREAD_OPENED, THREAD_CLOSED, MESSAGE_RECEIVED (new email for same thread_id)
- Replay sequence
- Confirm thread.status remains "closed"
- Confirm thread.closed_at unchanged
- Confirm new email does NOT add to thread.message_ids

### CONS-5: Projection Correctness

**Description:**  
Cached projections shall match state derived from event replay.

**Verification:**

- Insert 10,000 events for watcher W1
- Build projection table via incremental updates
- Query projection: get thread states P1
- Delete projection table
- Replay all 10,000 events: get thread states R1
- Compare P1 and R1: must be deeply equal
- If not equal, projection is corrupted and must rebuild

### CONS-6: Time Tick Monotonicity

**Description:**  
TIME_TICK events shall have strictly increasing tick_timestamp values.

**Verification:**

- Query TIME_TICK events: `SELECT tick_timestamp FROM events WHERE type = 'TIME_TICK' ORDER BY timestamp`
- Compute deltas: `tick_timestamp[i+1] - tick_timestamp[i]`
- Confirm all deltas > 0
- Confirm no backwards time jumps

### CONS-7: Email Deduplication

**Description:**  
Emails with same Message-ID shall emit only one MESSAGE_RECEIVED event.

**Verification:**

- Send email E1 with Message-ID: `<abc123@example.com>`
- Confirm MESSAGE_RECEIVED event emitted with message_id: `msgid-abc123...`
- Send identical email E2 with same Message-ID
- Confirm no new MESSAGE_RECEIVED event
- Query event store: confirm only 1 event with message_id `msgid-abc123...`

### CONS-8: Reminder Causal Traceability

**Description:**  
Every reminder event shall reference valid causal thread event via causal_event_id.

**Verification:**

- Query all REMINDER_GENERATED events from event store
- For each reminder, extract `causal_event_id`
- Query event store for event with matching event_id
- Confirm event exists and is one of: HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, THREAD_ACTIVITY_OBSERVED, SILENCE_THRESHOLD_EXCEEDED
- Confirm no orphaned reminders (causal_event_id references nonexistent event)
- Data integrity test: broken causal chain triggers alert

## 8. Assumptions

### ASSUM-1: Email Delivery Timing

**Assumption:**  
Users forward email to Vigil ingestion addresses within 1 hour of receiving original email.

**Rationale:**  
Urgency calculations assume `received_at` timestamp approximates when user became aware of obligation. Significant delay in forwarding may cause incorrect urgency state.

**Mitigation:**  
Document recommended forwarding practices. Consider adding "original received time" header extraction.

### ASSUM-2: LLM Extraction Accuracy

**Assumption:**  
LLM deadline extraction achieves ≥ 90% precision and ≥ 80% recall on English-language emails.

**Rationale:**  
System relies on LLM for deadline extraction. Low accuracy reduces utility.

**Mitigation:**  
Maintain evaluation dataset. Allow users to manually correct extracted deadlines. Log extraction confidence for analysis.

### ASSUM-3: Clock Synchronization

**Assumption:**  
All system components maintain clock synchronization within 1 second via NTP.

**Rationale:**  
Event ordering and urgency calculations depend on accurate timestamps.

**Mitigation:**  
Monitor clock drift. Alert if drift exceeds 1 second. Use logical clocks (Lamport timestamps) for event ordering if physical clock unreliable.

### ASSUM-4: User Monitoring Cadence

**Assumption:**  
Users check dashboard or receive alerts within 2 hours of emission.

**Rationale:**  
Critical alerts aim to prevent missed deadlines. If user doesn't monitor alerts, system cannot fulfill purpose.

**Mitigation:**  
Document recommended monitoring practices. Support multiple notification channels (email + SMS). Escalation policy (out of scope for v1).

### ASSUM-5: PostgreSQL Transaction Isolation

**Assumption:**  
PostgreSQL configured with READ COMMITTED isolation level or higher.

**Rationale:**  
Event store relies on transaction isolation to prevent dirty reads.

**Mitigation:**  
Verify isolation level in deployment. Add integration tests for concurrent event insertion.

### ASSUM-6: SMTP Adapter Single Point of Failure

**Assumption:**  
SMTP adapter is single instance (no high availability in v1).

**Rationale:**  
Simple deployment for initial version. Downtime is acceptable as system degrades gracefully.

**Mitigation:**  
Document single point of failure. Plan for HA deployment in v2 (load balancer + multiple instances).

### ASSUM-7: Maximum Events Per Watcher

**Assumption:**  
No watcher exceeds 1 million events in production.

**Rationale:**  
Event replay performance degrades with large event counts. Projection strategy handles up to 1M events.

**Mitigation:**  
Monitor event counts per watcher. Alert if approaching 1M. Implement event archival strategy for long-running watchers.

### ASSUM-8: Email Body Size Limit

**Assumption:**  
Email body text does not exceed 1MB.

**Rationale:**  
LLM service has input token limits. Large emails may truncate or fail extraction.

**Mitigation:**  
Enforce 1MB limit at SMTP adapter. Truncate body if exceeds limit. Log truncation event.

## 9. Document Revision History

| Version | Date       | Author           | Changes                      |
| ------- | ---------- | ---------------- | ---------------------------- |
| 1.0.0   | 2025-12-24 | System Architect | Initial production-grade SDD |
| 1.1.0   | 2025-12-25 | System Architect | Added Section 1.9 Authoritative Design Constraints (DC-1 through DC-11). Clarified Thread-Deadline separation (deadlines belong to Reminders). Updated Thread, Message, Reminder primitives. Added router LLM thread creation behavior. Clarified extraction events always emitted for audit. Added Message non-persistence constraint. Added Watcher deletion capability (WATCHER_DELETED event). Updated closed thread behavior for reports. Clarified per-watcher idempotence strategy. Added IR-24 Component Health Centralization. Updated MR-WatcherRuntime-2 ThreadState fields. Added deadline_type to REMINDER_GENERATED event. Updated Glossary with new terms. |

## 10. Event Type Catalog

This section defines all event types in the Vigil system, organized by tier in the event hierarchy.

### 10.1 Baseline Observation Events

Events that represent immutable observations of external reality. Always emitted, regardless of content.

#### MESSAGE_RECEIVED

**Purpose:** Record that an email was delivered to a watcher. Contains metadata only—full email body is NOT persisted.

**Fields:**

- `event_id` (string, UUID) - Unique event identifier
- `timestamp` (number, Unix ms) - When event was created
- `watcher_id` (string, UUID) - Target watcher
- `message_id` (string) - Unique message identifier (from Message-ID header or content hash)
- `from` (string) - Sender email address
- `subject` (string) - Email subject line
- `received_at` (number, Unix ms) - When Vigil received the email
- `original_date` (number | null, Unix ms) - Date header from original email (when sender composed it)
- `headers` (object) - Relevant email headers for threading (In-Reply-To, References, Conversation-Index, Thread-Topic)
- `sender_allowed` (boolean) - Result of allowlist check
- `body_length` (number) - Character count of email body (for metrics, body itself not stored)

**Note:** Email body content is processed for extraction then discarded. This event records metadata for traceability without persisting PII.

#### THREAD_ACTIVITY_OBSERVED

**Purpose:** Establish temporal baseline for silence tracking.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `message_id` (string) - References MESSAGE_RECEIVED
- `observed_at` (number, Unix ms) - When activity occurred

### 10.2 Extraction Record Events

Events representing structured facts extracted from email text by LLM service.

#### HARD_DEADLINE_OBSERVED

**Purpose:** Record explicit deadline with binding language.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `message_id` (string) - References MESSAGE_RECEIVED
- `deadline_utc` (number, Unix ms) - Deadline timestamp
- `deadline_text` (string) - Verbatim deadline phrase
- `source_span` (string) - Verbatim excerpt from email
- `confidence` (enum: high, medium, low) - Extraction confidence
- `extractor_version` (string) - LLM extractor version
- `binding` (boolean) - Always true for hard deadlines

#### SOFT_DEADLINE_SIGNAL_OBSERVED

**Purpose:** Record fuzzy temporal language (advisory only).

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `message_id` (string) - References MESSAGE_RECEIVED
- `signal_text` (string) - Verbatim temporal phrase
- `source_span` (string) - Verbatim excerpt from email
- `estimated_horizon_hours` (number | null) - Rough time estimate
- `confidence` (enum: high, medium, low)
- `extractor_version` (string)
- `binding` (boolean) - Always false for soft signals

#### URGENCY_SIGNAL_OBSERVED

**Purpose:** Record priority indicators without temporal constraints.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `message_id` (string) - References MESSAGE_RECEIVED
- `urgency_level` (enum: high, medium, low)
- `indicators` (array of strings) - Urgency keywords found
- `source_span` (string) - Verbatim excerpt from email
- `extractor_version` (string)

#### CLOSURE_SIGNAL_OBSERVED

**Purpose:** Record resolution or completion language.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `message_id` (string) - References MESSAGE_RECEIVED
- `closure_type` (enum: explicit, implicit, none)
- `source_span` (string) - Verbatim excerpt from email
- `confidence` (enum: high, medium, low)
- `extractor_version` (string)

### 10.3 Thread Lifecycle Events

Events tracking thread state transitions.

#### THREAD_OPENED

**Purpose:** Record creation of new thread triggered by extraction event.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `thread_id` (string, UUID) - Unique thread identifier
- `message_id` (string) - Triggering message
- `opened_at` (number, Unix ms)
- `trigger_type` (enum: hard_deadline, soft_deadline, urgency_signal, closure)
- `normalized_subject` (string) - For thread grouping
- `original_sender` (string) - Email address of original sender
- `original_received_at` (number, Unix ms) - When triggering email was received
- `conversation_index` (string | null) - Outlook threading header if present

#### THREAD_CLOSED

**Purpose:** Record terminal closure of thread.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `thread_id` (string, UUID)
- `closed_at` (number, Unix ms)
- `closed_by` (enum: signal_observed, user_action)
- `causal_event_id` (string, UUID) - References closure signal or user command

### 10.4 Derived Artifact Events

Events representing computed state derived from other events.

#### SILENCE_THRESHOLD_EXCEEDED

**Purpose:** Record that thread has been inactive beyond policy threshold.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `thread_id` (string, UUID)
- `hours_since_activity` (number)
- `threshold_hours` (number) - From policy
- `last_activity_event_id` (string, UUID) - References THREAD_ACTIVITY_OBSERVED

#### REMINDER_GENERATED

**Purpose:** Create attention prompt for thread requiring review. Reminders carry deadline information.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `thread_id` (string, UUID)
- `reminder_type` (enum: hard_deadline, soft_deadline, silence)
- `deadline_type` (enum: hard, soft, none) - Type of deadline on this reminder
- `deadline_utc` (number | null, Unix ms) - The deadline timestamp (only for hard/soft types)
- `urgency_level` (enum: warning, critical, overdue)
- `causal_event_id` (string, UUID) - References thread event that caused reminder
- `binding` (boolean) - true for hard deadlines, false for soft/silence
- `hours_until_deadline` (number | null)
- `hours_since_activity` (number)

#### ALERT_QUEUED

**Purpose:** Queue notification for delivery.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `thread_id` (string, UUID)
- `alert_id` (string, UUID)
- `reminder_id` (string, UUID) - References REMINDER_GENERATED
- `urgency_level` (enum: warning, critical, overdue)
- `channels` (array of NotificationChannel)

#### ALERT_SENT

**Purpose:** Record successful alert delivery.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `alert_id` (string, UUID) - References ALERT_QUEUED
- `channel` (object) - NotificationChannel that succeeded
- `sent_at` (number, Unix ms)

#### ALERT_FAILED

**Purpose:** Record failed alert delivery after retries.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `alert_id` (string, UUID) - References ALERT_QUEUED
- `channel` (object) - NotificationChannel that failed
- `error_message` (string)
- `failed_at` (number, Unix ms)

### 10.5 Administrative Events

Events for watcher configuration and control.

#### WATCHER_CREATED

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `watcher_name`, `ingest_token`, `ingestion_address`, `created_by`

#### WATCHER_ACTIVATED

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `activated_by`

#### WATCHER_PAUSED

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `paused_by`, `reason`

#### WATCHER_RESUMED

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `resumed_by`

#### POLICY_UPDATED

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `policy` (complete WatcherPolicy object), `updated_by`

#### WATCHER_DELETED

**Purpose:** Record terminal deletion of watcher. Deletion removes oversight role without mutating historical data.

**Fields:**

- `event_id` (string, UUID)
- `timestamp` (number, Unix ms)
- `watcher_id` (string, UUID)
- `deleted_at` (number, Unix ms)
- `deleted_by` (string, user_id)
- `reason` (string | null) - Optional deletion reason

**Effects:**
- Watcher status transitions to `deleted`
- Ingestion address becomes inactive (emails rejected)
- No more TIME_TICK events generated for this watcher
- No more reports generated
- Historical events, threads, reminders preserved for audit

### 10.6 System Events

Events for time triggers and reporting.

#### TIME_TICK

**Purpose:** Trigger periodic urgency evaluation.

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `tick_timestamp`

#### REPORT_GENERATED

**Purpose:** Trigger periodic summary report.

**Fields:**

- `event_id`, `timestamp`, `watcher_id`, `report_id`, `report_type`, `summary`

#### REPORT_SENT

**Fields:**

- `event_id`, `timestamp`, `report_id`, `recipient`, `sent_at`

### 10.7 Event Hierarchy Diagram

```
Baseline Observation (Always Emitted)
├── MESSAGE_RECEIVED
└── THREAD_ACTIVITY_OBSERVED
    │
    ↓
Extraction Records (LLM-Generated)
├── HARD_DEADLINE_OBSERVED (binding=true)
├── SOFT_DEADLINE_SIGNAL_OBSERVED (binding=false)
├── URGENCY_SIGNAL_OBSERVED
└── CLOSURE_SIGNAL_OBSERVED
    │
    ↓
Thread Lifecycle (Runtime-Generated)
├── THREAD_OPENED
└── THREAD_CLOSED
    │
    ↓
Derived Artifacts (Runtime-Computed)
├── SILENCE_THRESHOLD_EXCEEDED
├── REMINDER_GENERATED
├── ALERT_QUEUED
├── ALERT_SENT
└── ALERT_FAILED
```

## 11. Glossary

**Account:** Parent container for users and watchers with shared access control.

**Alert:** Notification emitted when reminder urgency transitions to warning, critical, or overdue.

**Baseline Event:** Immutable observation of external reality (MESSAGE_RECEIVED, THREAD_ACTIVITY_OBSERVED) emitted before any extraction or interpretation.

**Binding:** Property indicating whether a temporal constraint represents hard obligation (binding=true) or advisory signal (binding=false). Deadlines can be binding (hard) or advisory (soft).

**Causal Event:** The upstream event that caused a derived event; referenced via causal_event_id for traceability.

**Closed Thread:** A thread that has entered terminal closed state via closure signal or manual action. Closed threads are preserved for audit and tracking but excluded from reports by default.

**Deadline:** Explicit timestamp by which action must be taken. Deadlines belong to Reminders, NOT to Threads. Extracted from email text as HARD_DEADLINE_OBSERVED or SOFT_DEADLINE_SIGNAL_OBSERVED events.

**Deadline Type:** Classification of deadline on a Reminder: `hard` (binding, explicit date/time), `soft` (advisory, fuzzy temporal language), or `none` (silence-triggered).

**Derived Artifact:** State computed from events (reminders, urgency levels, silence detection) rather than directly observed.

**Due Boundary:** Generic term for obligation timing (deadline or silence threshold).

**Event:** Immutable, append-only record of system state change.

**Event Store:** Append-only database persisting all events.

**Extraction Record:** Event representing structured fact extracted from email (HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED). Extraction events are ALWAYS emitted for audit purposes, even when a thread already exists.

**Hard Deadline:** Explicit temporal constraint with binding language ("must respond by Friday at 5pm"). Captured in HARD_DEADLINE_OBSERVED events.

**Idempotence (Per-Watcher):** Guarantee that replaying the same event sequence produces identical state and does not emit duplicate alerts. Enforced at watcher level for simplicity.

**Ingestion Address:** Unique email address for each watcher, formatted `<name>-<token>@ingest.vigil.email`.

**LLM:** Large Language Model, used for fact extraction from email text (never interpretation or decision-making).

**Message:** Email metadata captured at ingestion. Messages are NOT persisted as first-class entities—only metadata is retained, not full email body content. If a watcher misses an email, sender must resend.

**Message ID:** Unique identifier for each email message in Vigil system (derived from email Message-ID header or content hash).

**Obligation:** Commitment requiring human action, represented as thread in Vigil.

**One-Way Data Flow:** Architectural guarantee that data flows strictly from baseline → extraction → thread → reminder → alert without feedback loops.

**Projection:** Cached derived state built from events for query performance.

**Reminder:** Derived artifact representing attention prompt generated from thread events. Reminders carry deadline information (deadline_type, deadline_utc). NOT an obligation itself.

**Replay:** Process of reconstructing state by applying events in order.

**Router LLM:** The LLM component that runs on every inbound email to determine extraction events. Thread creation is driven by router LLM extraction, not by explicit user intent.

**Silence Monitoring:** Tracking of thread inactivity. When hours_since_activity exceeds policy.silence_threshold_hours, a silence reminder may be generated.

**Soft Deadline Signal:** Fuzzy temporal language without explicit deadline ("please reply soon", "by end of week"). Advisory only, binding=false.

**Source Span:** Verbatim text excerpt from email body that provides evidence for extracted fact.

**Thread:** Tracked communication context representing an ongoing conversation that a watcher is responsible for monitoring. Threads do NOT own deadlines—deadlines belong to Reminders. Threads are monitored for silence and inactivity. Threads cannot be merged or reassigned.

**Time Tick:** Periodic trigger event causing urgency re-evaluation.

**Traceability:** Ability to follow causal chain backward from any derived artifact to its originating baseline observation. All pipeline data is tracked for user transparency.

**Urgency State:** Time-relative enum (ok, warning, critical, overdue) indicating attention required.

**Watcher:** Primary configuration unit monitoring email stream for specific area of responsibility. Watchers are deletable entities—deletion removes oversight role without mutating historical data.
