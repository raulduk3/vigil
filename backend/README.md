# Backend - DEVA Control Plane

Backend control plane for DEVA vigilance system. This is the authoritative decision-making component that orchestrates all system behavior.

## Architecture

The backend is the only component that:
- Creates and validates events
- Persists events to immutable event store
- Invokes watcher runtime
- Calls LLM service for fact extraction
- Emits notifications

**Core Principle:** Events are the sole source of truth. All state is derived by replaying events.

## Structure

```
backend/
├── src/
│   ├── events/       # Event types and event store
│   ├── watcher/      # Watcher runtime executor (stateless)
│   ├── backend/      # API and coordination (TBD)
│   ├── store/        # Storage implementations (TBD)
│   └── index.ts      # Entry point
├── test/             # Centralized unit tests
│   ├── events/       # Event store tests
│   └── watcher/      # Watcher runtime tests
├── scripts/          # Utility scripts (release automation)
├── .env.example      # Environment configuration template
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
<sanitized-name>-<ingest_token>@ingest.deva.email
```

Examples:
- `personal-finance-a7f3k9@ingest.deva.email`
- `legal-matters-b2j8m1@ingest.deva.email`

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
  getEventsForWatcher(watcherId: string): Promise<DevaEvent[]>;
  
  // Partial replay (since timestamp)
  getEventsSince(watcherId: string, timestamp: number): Promise<DevaEvent[]>;
  
  // Event log pagination
  query(options: {
    watcher_id: string,
    limit: number,
    offset: number,
    order: "ASC" | "DESC"
  }): Promise<DevaEvent[]>;
  
  // Performance queries
  countEvents(watcherId: string): Promise<number>;
  getLastEvent(watcherId: string): Promise<DevaEvent | null>;
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
