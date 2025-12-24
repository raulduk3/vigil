# DEVA

**Deterministic, Event-Sourced Vigilance System for Time-Sensitive Email Oversight**

DEVA is NOT an agent, NOT an assistant, NOT an automation system, and NOT a task manager.

DEVA provides delegated vigilance over explicitly routed email streams. It observes timing, silence, and deadlines, and notifies humans when risk emerges. Humans remain responsible at all times.

---

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

### 5. Thread Model (Obligations)

- Threads represent obligations, not conversations
- A thread exists ONLY if a due boundary exists
- Threads may be CLOSED by:
  - a) explicit closure evidence in an email
  - b) explicit user action
- CLOSED threads MUST NEVER reopen
- New obligations always create new threads

### 6. Reminder Model (Urgency)

- Reminder state is derived, not stored
- Time never mutates facts — only urgency
- Alerts fire on state transitions, never steady state
- Closed threads never alert

---

## System Components

DEVA consists of these components with **strict boundaries**:

1. **Backend Control Plane** (authoritative)
2. **Event Store** (authoritative)
3. **Watcher Runtime Executor** (stateless)
4. **Email Ingress Adapter** (SMTP listener, non-authoritative)
5. **LLM Extraction Service** (separate deployable, non-authoritative)
6. **Notification Worker** (non-authoritative)
7. **Frontend** (read-heavy, no business logic)

**ONLY the Backend Control Plane may make decisions.**

---

## Backend Control Plane

The backend is the authoritative decision-making component.

**Responsibilities:**
- Expose HTTPS API for frontend
- Create and validate events
- Persist events (append-only)
- Invoke watcher runtime
- Rebuild state via replay
- Coordinate scheduling
- Dispatch notifications

**The backend:**
- May call the LLM service
- May call the notification service
- Must never hold watcher state in memory
- Must never reason autonomously

---

## Watcher Runtime Executor

**Definition:**
- A stateless function or job
- Invoked only by an event or a scheduled trigger

**Invocation:**
```typescript
runWatcher(watcherId, eventStore, triggerEventId?)
```

**Responsibilities:**
- Load events for watcher
- Replay events to rebuild state
- Apply deterministic transition rules
- Emit new events

**Forbidden:**
- Loops
- Waiting
- Internal persistence
- LLM calls during replay

---

## Email Ingestion Model

- Each watcher has a unique email address:  
  `<name>-<token>@ingest.deva.email`
- Emails are routed by ADDRESS ONLY, never content
- A lightweight SMTP adapter receives email and forwards raw bytes
- The backend ingestion endpoint:
  - Parses
  - Validates sender allowlists
  - Deduplicates
  - Emits `EMAIL_RECEIVED`

**The SMTP adapter:**
- Never stores emails
- Never applies business logic
- Never emits events directly

Email delivery is best-effort and advisory.

---

## LLM Extraction Service

- Separate repo and deployment
- vLLM-backed
- Private network only

**Exposes minimal HTTP endpoints:**
- `/route`
- `/extract/deadline`
- `/extract/risk`
- `/extract/closure`

**LLM service:**
- Performs exactly ONE task per request
- Returns structured JSON + verbatim evidence
- Does NOT chain prompts
- Does NOT call tools
- Does NOT retry autonomously
- Does NOT emit events

---

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun
- **Style:** Explicit, boring, testable
- Prefer pure functions
- Prefer discriminated unions
- Avoid clever abstractions
- Avoid frameworks unless explicitly requested

---

## Event Model

Events are the single source of truth. See [`src/events/types.ts`](src/events/types.ts) for complete definitions.

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

---

## Coding Rules

When writing code, ALWAYS:

- Start from events
- Ask: "What event makes this true?"
- Ensure replay requires ZERO external calls
- Ensure determinism
- Ensure no state survives process exit
- Use explicit types for all domain objects

**If behavior cannot be explained purely by replaying events, it is WRONG.**

---

## What NOT to Do

DO NOT:

- Add background schedulers inside business logic
- Add mutable DB tables for state
- Add retry loops for LLM calls
- Add agent frameworks or chains
- Add inbox access or email automation
- Add confidence-based escalation
- Add magic heuristics

---

## Mental Model

- **Events are truth**
- **Replay is the debugger**
- **LLMs create facts once**
- **Code makes decisions**
- **Time only affects urgency**
- **Closed threads never reopen**

---

## Project Structure

```
deva/
├── src/
│   ├── events/           # Event type definitions and event store
│   ├── backend/          # Backend control plane (API, coordination)
│   ├── watcher/          # Watcher runtime executor (stateless replay)
│   ├── store/            # Event storage implementations
│   └── index.ts          # Entry point
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run typecheck

# Run tests
bun test

# Build
bun run build
```

---

## License

Proprietary. All rights reserved.
