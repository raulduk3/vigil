# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vigil is a deterministic, event-sourced vigilance system for time-sensitive email oversight. Monorepo with 4 independent services:

| Service | Language | Status |
|---------|----------|--------|
| **backend/** | TypeScript/Bun | Active (event-sourced control plane with billing, auth, ingestion) |
| **frontend/** | Next.js 14 | Active (dashboard, auth, billing, watcher management) |
| **llm-service/** | Python/vLLM | Planned (extraction stubs in backend/src/llm/) |
| **smtp-adapter/** | Node.js | Planned (HTTP ingestion endpoint active) |

## Build & Test Commands

All commands run from `backend/`:

```bash
bun install              # Install dependencies
bun run dev              # Watch mode with hot reload
bun test                 # Run all tests
bun test test/watcher/   # Run tests in directory
bun test test/events/event-store.test.ts  # Run single file
bun test --watch         # Watch mode
bun run typecheck        # Type checking (tsc --noEmit)
bun run lint             # ESLint
bun run check            # All checks: typecheck + lint + format + test
```

## Architecture

### Event Sourcing (Core Pattern)

**Events are the ONLY source of truth.** All state derives from replaying immutable, append-only events. No mutable database tables for authoritative state.

Golden rule: *If behavior cannot be explained purely by replaying events, it is WRONG.*

### Key Modules (backend/src/)

**Core Event System:**
- **events/types.ts** - 45+ event type definitions (control plane, ingestion, extraction, thread, reminder, notification, reporting)
- **events/event-store.ts** - PostgreSQL append-only store
- **events/traceability.ts** - Event chain traceability (FR-19)
- **events/validation.ts** - Event schema validation

**Watcher Runtime:**
- **watcher/runtime.ts** - Event replay & state reconstruction
- **watcher/urgency.ts** - Urgency evaluation (OK → WARNING → CRITICAL → OVERDUE)
- **watcher/thread-detection.ts** - Message-ID chaining, Conversation-Index, subject normalization
- **watcher/alert-queue.ts** - Alert queue management

**Ingestion & Extraction:**
- **ingestion/orchestrator.ts** - Email pipeline orchestration
- **llm/extractor.ts** - LLM extraction interface (with regex fallback)

**Authentication & Authorization:**
- **auth/middleware.ts** - JWT verification, rate limiting
- **auth/jwt.ts** - Access/refresh token generation (15 min / 7 days)
- **auth/oauth.ts** - Google/GitHub OAuth with PKCE flow
- **auth/password-reset.ts** - Token-based password reset

**Billing & Subscription:**
- **billing/subscription.ts** - Stripe integration, 4 tiers (free/starter/pro/enterprise)
- **billing/usage.ts** - Weekly email usage tracking, watcher limits
- **billing/stripe.ts** - Checkout, customer portal, webhook handling

**Background Workers:**
- **scheduler/scheduler.ts** - TIME_TICK generation (15-min intervals)
- **worker/notification-worker.ts** - Alert delivery with exponential backoff retry

**Security:**
- **security/pii-sanitizer.ts** - PII/secret detection and redaction
- **security/rate-limiter.ts** - Token bucket rate limiting
- **security/webhook-signing.ts** - HMAC-SHA256 webhook signatures

**Database:**
- **db/client.ts** - PostgreSQL connection pool
- **db/event-store.ts** - Event persistence layer

### Design Constraints

1. **No mutable state** - State survives only in event store
2. **LLM is bounded** - Extracts facts only, never schedules work or makes decisions
3. **Threads don't own deadlines** - Deadlines belong to Reminders (derived artifacts)
4. **Closed threads never reopen** - Terminal state
5. **Alerts fire on transitions only** - ok→warning, warning→critical (prevents fatigue)
6. **Email bodies not persisted** - Sent to LLM then discarded (PII constraint)

## Documentation Hierarchy

1. **docs/SDD.md** (217KB) - Authoritative specification with requirement IDs (FR-X, MR-X, SEC-X)
2. **docs/SYSTEM_DESIGN.md** - Implementation-grade technical spec
3. **README.md** - Project overview and concepts

Before implementing features, check SDD for requirements.

## Core Concepts

**Watcher** - Isolated monitoring scope with unique ingestion address (`<name>-<token>@ingest.email.vigil.run`). Lifecycle: created → active ⇄ paused → deleted

**Thread** - Tracked conversation (NOT obligation). Created by extraction events. Detection uses Message-ID chaining, subject normalization, Conversation-Index headers.

**Urgency** - Computed from `hours_until_deadline` + `hours_since_activity` against policy thresholds.

**Event Categories (45+ types):**
- Control plane: ACCOUNT_CREATED, USER_CREATED, WATCHER_CREATED, WATCHER_ACTIVATED, WATCHER_PAUSED, WATCHER_RESUMED, WATCHER_UPDATED, WATCHER_DELETED, POLICY_UPDATED
- Ingestion: MESSAGE_RECEIVED (with PII/secret sanitization)
- Extraction: MESSAGE_ROUTED, ROUTE_EXTRACTION_COMPLETE, EXTRACTION_COMPLETE, HARD_DEADLINE_OBSERVED, SOFT_DEADLINE_SIGNAL_OBSERVED, URGENCY_SIGNAL_OBSERVED, CLOSURE_SIGNAL_OBSERVED
- Thread lifecycle: THREAD_OPENED, THREAD_UPDATED, THREAD_ACTIVITY_OBSERVED, THREAD_CLOSED
- Message associations: MESSAGE_THREAD_ASSOCIATED, MESSAGE_THREAD_DEACTIVATED, MESSAGE_THREAD_REACTIVATED
- Reminders: TIME_TICK, REMINDER_EVALUATED, REMINDER_CREATED, REMINDER_MANUAL_CREATED, REMINDER_EDITED, REMINDER_DISMISSED, REMINDER_MERGED, REMINDER_REASSIGNED, REMINDER_GENERATED
- Notifications: ALERT_QUEUED, ALERT_SENT, ALERT_FAILED
- Reporting: REPORT_GENERATED, REPORT_SENT

## Environment Setup

```bash
cd backend
cp .env.example .env
# Required: JWT_SECRET, JWT_REFRESH_SECRET (generate with: openssl rand -base64 32)
# Required: PostgreSQL connection (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
# Optional: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
# Optional: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
# Optional: GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET
# Optional: LLM_API_BASE, LLM_MODEL

cd frontend
cp .env.example .env
# Required: NEXT_PUBLIC_API_URL (default: http://localhost:3001)
# Optional: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# Optional: NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED, NEXT_PUBLIC_GITHUB_OAUTH_ENABLED
```
