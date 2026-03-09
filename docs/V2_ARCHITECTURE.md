# Vigil V2 — Agent Architecture

**Date:** 2026-03-09
**Status:** Migration spec, pre-implementation
**Branch:** `v2-agent-architecture`

## Philosophy

V1 was an event-sourced state machine. Correct, deterministic, and over-engineered.
V2 is an agent. It reads email, remembers context, and acts.

The ends stay. The middle gets replaced.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Email       │────▶│  Cloudflare  │────▶│  API Server     │
│  (forwarded) │     │  Worker      │     │  (Hono/Bun)     │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Agent Engine    │
                                          │                  │
                                          │  1. Load context │
                                          │  2. Run LLM      │
                                          │  3. Execute tools │
                                          │  4. Save memory   │
                                          └────────┬────────┘
                                                   │
                              ┌─────────────┬──────┴──────┬──────────────┐
                              ▼             ▼             ▼              ▼
                         ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
                         │ SQLite  │  │ Memory   │  │ Resend   │  │ Webhooks │
                         │ (data)  │  │ (*.md)   │  │ (alerts) │  │ (tools)  │
                         └─────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Data Model

### SQLite Schema

```sql
-- Watcher: a configured agent watching a stream of forwarded email
CREATE TABLE watchers (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  ingest_token    TEXT UNIQUE NOT NULL,
  system_prompt   TEXT NOT NULL,
  tools           TEXT NOT NULL DEFAULT '["send_alert"]',  -- JSON array of enabled tool names
  silence_hours   INTEGER DEFAULT 48,
  tick_interval   INTEGER DEFAULT 60,  -- minutes between scheduled checks
  status          TEXT DEFAULT 'active',  -- active | paused | deleted
  template_id     TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Thread: a group of related emails
CREATE TABLE threads (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  subject         TEXT,
  participants    TEXT,  -- JSON array
  status          TEXT DEFAULT 'active',  -- active | watching | resolved | ignored
  first_seen      TIMESTAMP,
  last_activity   TIMESTAMP,
  email_count     INTEGER DEFAULT 0,
  summary         TEXT,  -- agent-written, updated each email
  flags           TEXT,  -- JSON object for agent-set metadata
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email metadata: NO body stored
CREATE TABLE emails (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  thread_id       TEXT REFERENCES threads(id),
  message_id      TEXT,  -- from email headers
  from_addr       TEXT,
  to_addr         TEXT,
  subject         TEXT,
  received_at     TIMESTAMP,
  body_hash       TEXT,  -- SHA-256 proof of receipt, no content
  analysis        TEXT,  -- JSON: agent's extraction (summary, intent, entities)
  processed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Action log: what the agent did and why
CREATE TABLE actions (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  thread_id       TEXT,
  trigger         TEXT NOT NULL,  -- email_received | scheduled_tick | user_query
  email_id        TEXT,
  decision        TEXT,  -- agent's reasoning
  tool            TEXT,  -- tool name used
  tool_params     TEXT,  -- JSON
  result          TEXT,  -- success | failed | skipped
  error           TEXT,
  memory_delta    TEXT,  -- what agent appended to memory
  context_tokens  INTEGER,
  cost_usd        REAL,
  duration_ms     INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification channels per watcher
CREATE TABLE channels (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  type            TEXT NOT NULL,  -- email | webhook
  destination     TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE
);

-- User accounts (keep existing auth model)
CREATE TABLE accounts (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  password_hash   TEXT,
  oauth_provider  TEXT,
  oauth_id        TEXT,
  plan            TEXT DEFAULT 'free',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Agent Memory (per watcher)

Stored as markdown files in `data/watchers/{id}/memory.md`

```markdown
## Learned Preferences
- [agent writes what it learns about user behavior]

## Active Threads
- [running notes on open threads]

## Resolved
- [brief notes on closed items, compacted periodically]
```

Memory lifecycle:
1. Agent reads full memory before each invocation
2. Agent appends notes after each invocation
3. When memory exceeds 8K tokens: agent runs compaction (summarize, drop resolved items >30 days)
4. Old memory archived to `memory-archive-{date}.md`

## Agent Engine

### Invocation Flow

```typescript
async function invokeAgent(watcher: Watcher, trigger: InvocationTrigger): Promise<void> {
  // 1. Load context
  const config = await loadWatcherConfig(watcher.id);
  const memory = await readMemory(watcher.id);
  const recentThreads = await getActiveThreads(watcher.id, { limit: 20 });

  let emailContext = '';
  if (trigger.type === 'email_received') {
    const thread = await getOrCreateThread(trigger.email);
    const recentEmails = await getThreadEmails(thread.id, { limit: 5 });
    emailContext = formatEmailContext(trigger.email, recentEmails);
  }

  // 2. Build prompt
  const messages = [
    { role: 'system', content: buildSystemPrompt(config, memory, recentThreads) },
    { role: 'user', content: buildTriggerPrompt(trigger, emailContext) }
  ];

  // 3. Run LLM (structured output)
  const response = await llm.chat({
    model: 'gpt-4o-mini',
    messages,
    response_format: agentResponseSchema
  });

  // 4. Parse response
  const { actions, memory_append, thread_updates } = response;

  // 5. Execute tools
  for (const action of actions) {
    await executeTool(action.tool, action.params, watcher);
  }

  // 6. Save state
  if (memory_append) await appendMemory(watcher.id, memory_append);
  if (thread_updates) await updateThreads(thread_updates);

  // 7. Log invocation
  await logInvocation({ watcher, trigger, actions, memory_append, response });
}
```

### Agent Response Schema

```typescript
interface AgentResponse {
  actions: Array<{
    tool: string;
    params: Record<string, any>;
    reasoning: string;
  }>;
  memory_append: string | null;    // markdown to add to memory
  thread_updates: Array<{
    thread_id: string;
    status?: 'active' | 'watching' | 'resolved' | 'ignored';
    summary?: string;
    flags?: Record<string, any>;
  }> | null;
  email_analysis: {
    summary: string;
    intent: string;
    urgency: 'low' | 'normal' | 'high';
    entities: string[];
  } | null;
}
```

### Tools

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  requiresApproval: boolean;
  handler: (params: any, ctx: WatcherContext) => Promise<ToolResult>;
}

// Built-in tools
const BUILTIN_TOOLS: Tool[] = [
  {
    name: 'send_alert',
    description: 'Send an alert email to the watcher owner',
    parameters: { subject: 'string', body: 'string', urgency: 'low|normal|high' },
    requiresApproval: false,
    handler: sendAlertHandler  // uses existing Resend delivery
  },
  {
    name: 'send_reply',
    description: 'Reply to an email thread on behalf of the user',
    parameters: { thread_id: 'string', body: 'string' },
    requiresApproval: true,  // always requires user approval
    handler: sendReplyHandler
  },
  {
    name: 'update_thread',
    description: 'Update thread status or summary',
    parameters: { thread_id: 'string', status: 'string', summary: 'string' },
    requiresApproval: false,
    handler: updateThreadHandler
  },
  {
    name: 'ignore_thread',
    description: 'Mark a thread as not worth watching',
    parameters: { thread_id: 'string', reason: 'string' },
    requiresApproval: false,
    handler: ignoreThreadHandler
  },
  {
    name: 'webhook',
    description: 'Send data to a configured webhook URL',
    parameters: { url: 'string', payload: 'object' },
    requiresApproval: false,
    handler: webhookHandler
  }
];

// Custom tools: user-defined webhooks with schema
interface CustomTool {
  name: string;
  description: string;
  webhook_url: string;
  parameters: JSONSchema;
}
```

### Template Watchers

```typescript
interface WatcherTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  silenceHours: number;
  tickIntervalMinutes: number;
  exampleMemory: string;  // seeds the agent's memory style
}

const TEMPLATES: WatcherTemplate[] = [
  {
    id: 'vendor-followup',
    name: 'Vendor Follow-up',
    description: 'Watch vendor/supplier emails. Alert when requests go unanswered.',
    systemPrompt: `You monitor vendor communications. Track invoices, POs, and requests.
Alert the user when a vendor asks for something and hasn't received a response.
Note payment amounts and due dates when you see them.`,
    tools: ['send_alert', 'update_thread', 'ignore_thread'],
    silenceHours: 48,
    tickIntervalMinutes: 60,
    exampleMemory: `## Active Threads\n- No active threads yet.\n`
  },
  {
    id: 'client-comms',
    name: 'Client Communications',
    description: 'Track client threads. Flag cold conversations.',
    systemPrompt: `You monitor client communications. Track project discussions and requests.
Alert when a client thread goes cold or when action items surface.
Summarize long threads concisely.`,
    tools: ['send_alert', 'update_thread', 'ignore_thread', 'webhook'],
    silenceHours: 72,
    tickIntervalMinutes: 120,
    exampleMemory: `## Active Threads\n- No active threads yet.\n`
  },
  {
    id: 'recruiter-filter',
    name: 'Recruiter Filter',
    description: 'Filter recruiter emails. Only surface relevant opportunities.',
    systemPrompt: `You filter recruiter/hiring emails. Most are noise.
Only alert the user for roles that match their criteria (they'll tell you in preferences).
Ignore mass outreach and generic pitches.`,
    tools: ['send_alert', 'ignore_thread'],
    silenceHours: 0,  // no silence tracking needed
    tickIntervalMinutes: 0,  // no scheduled ticks
    exampleMemory: `## Preferences\n- User hasn't set preferences yet. Ask on first alert.\n`
  },
  {
    id: 'blank',
    name: 'Custom Watcher',
    description: 'Start from scratch. Define your own prompt and tools.',
    systemPrompt: `You are an email monitoring agent. The user will configure your behavior.`,
    tools: ['send_alert', 'update_thread', 'ignore_thread'],
    silenceHours: 48,
    tickIntervalMinutes: 60,
    exampleMemory: ``
  }
];
```

## API Routes

```
POST   /api/ingest/:token          — Cloudflare worker sends parsed email here
GET    /api/watchers                — list user's watchers
POST   /api/watchers                — create watcher (from template or custom)
GET    /api/watchers/:id            — watcher detail + config
PUT    /api/watchers/:id            — update config/prompt/tools
DELETE /api/watchers/:id            — soft delete
GET    /api/watchers/:id/threads    — list threads for watcher
GET    /api/watchers/:id/threads/:tid — thread detail + emails + actions
GET    /api/watchers/:id/actions    — action history (what agent did)
GET    /api/watchers/:id/memory     — read agent memory (debug/transparency)
POST   /api/watchers/:id/invoke     — manually trigger agent (for testing)
GET    /api/templates               — list available templates

// Auth (keep existing)
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/oauth/:provider
GET    /api/auth/oauth/:provider/callback
```

## Scheduled Ticks

Replace the event-sourced TIME_TICK with a simple cron:

```typescript
// Run every N minutes per watcher config
async function scheduledTick(): Promise<void> {
  const watchers = await getActiveWatchers();
  const now = Date.now();

  for (const watcher of watchers) {
    const msSinceLastTick = now - (watcher.lastTickAt || 0);
    if (msSinceLastTick >= watcher.tickIntervalMinutes * 60 * 1000) {
      await invokeAgent(watcher, { type: 'scheduled_tick', timestamp: now });
    }
  }
}

// Single cron entry: runs every 5 minutes, each watcher has its own interval
```

## Privacy Model

| Data | Stored? | Notes |
|------|---------|-------|
| Email body | ❌ Never | Processed in memory, discarded after LLM call |
| Email metadata | ✅ | From, to, subject, date, message-id |
| Body hash | ✅ | SHA-256 proof of receipt |
| LLM analysis | ✅ | Summary, intent, entities |
| Agent memory | ✅ | Agent's own notes in markdown |
| Thread summaries | ✅ | Agent-written, updated per email |

## Migration Plan

### Phase 1: Database (Day 1)
- [ ] Create SQLite schema (replace Postgres)
- [ ] Write migration script for any existing data
- [ ] Update db/ module: pg → better-sqlite3 or bun:sqlite

### Phase 2: Agent Engine (Day 1-2)
- [ ] Create `backend/src/agent/engine.ts` — invocation flow
- [ ] Create `backend/src/agent/tools.ts` — tool registry + handlers
- [ ] Create `backend/src/agent/memory.ts` — read/write/compact
- [ ] Create `backend/src/agent/prompts.ts` — system prompt builder
- [ ] Create `backend/src/agent/schema.ts` — response schema
- [ ] Expand LLM module for structured agent calls

### Phase 3: Rewire Ingestion (Day 2)
- [ ] Update orchestrator: event emission → agent invocation
- [ ] Thread detection stays (headers-based matching is good)
- [ ] Remove all event store writes

### Phase 4: API + Frontend (Day 2-3)
- [ ] Update API handlers for new data model
- [ ] Replace events endpoint with actions endpoint
- [ ] Update frontend thread views for agent-generated data
- [ ] Add template picker to watcher creation flow
- [ ] Add memory viewer (debug/transparency page)

### Phase 5: Templates + Polish (Day 3)
- [ ] Create template configs
- [ ] Add scheduled tick cron
- [ ] Memory compaction logic
- [ ] Test end-to-end: forward email → agent processes → alert sent

### Cleanup
- [ ] Delete `backend/src/events/` entirely
- [ ] Delete `backend/src/watcher/` (runtime, silence-tracker)
- [ ] Delete `backend/src/scheduler/`
- [ ] Remove `pg` and `stripe` from dependencies
- [ ] Add `better-sqlite3` or use `bun:sqlite`
- [ ] Update README.md
- [ ] Update frontend silence components → agent status components

## Dependencies (V2)

```json
{
  "dependencies": {
    "hono": "^4.11.3",
    "jsonwebtoken": "^9.0.2",
    "openai": "^4.x",
    "better-sqlite3": "^11.x"
  }
}
```

Removed: `pg`, `stripe`, `bcrypt`
Added: `openai` (or anthropic SDK), `better-sqlite3`

## File Structure (V2)

```
vigil/
├── cloudflare-worker/          # KEEP: email ingestion
│   └── src/index.ts
├── backend/
│   └── src/
│       ├── index.ts            # KEEP: app entry
│       ├── logger.ts           # KEEP
│       ├── agent/              # NEW: replaces events + watcher
│       │   ├── engine.ts       # invocation flow
│       │   ├── tools.ts        # tool registry + built-ins
│       │   ├── memory.ts       # read/write/compact
│       │   ├── prompts.ts      # system prompt builder
│       │   └── schema.ts       # response types
│       ├── api/                # REWIRE: new handlers
│       │   ├── router.ts
│       │   └── handlers/
│       │       ├── auth.ts     # KEEP
│       │       ├── watchers.ts # REWIRE
│       │       ├── threads.ts  # REWIRE
│       │       ├── actions.ts  # NEW (replaces events.ts)
│       │       ├── templates.ts# NEW
│       │       └── health.ts   # KEEP
│       ├── auth/               # KEEP: jwt + oauth + middleware
│       ├── db/                 # REWIRE: pg → sqlite
│       │   ├── client.ts
│       │   └── schema.sql
│       ├── delivery/           # KEEP: resend + templates
│       ├── ingestion/          # REWIRE: orchestrator → agent
│       │   ├── index.ts
│       │   └── orchestrator.ts
│       └── templates/          # NEW: watcher templates
│           ├── vendor-followup.json
│           ├── client-comms.json
│           ├── recruiter-filter.json
│           └── blank.json
├── frontend/                   # KEEP: shell + pages, update data layer
├── data/                       # NEW: runtime data
│   └── watchers/
│       └── {id}/
│           └── memory.md
└── docs/
    ├── V2_ARCHITECTURE.md      # THIS FILE
    ├── SDD.md                  # UPDATE
    └── SYSTEM_DESIGN.md        # SUPERSEDED by this doc
```

## Addendum: Semantic Memory (added 2026-03-09 04:28)

### Why

Loading full memory into context doesn't scale. A watcher running for months accumulates hundreds of entries. Most are irrelevant to any given email. Dumping everything wastes tokens, increases cost, and dilutes agent attention.

### Design

Embed memory chunks at write time. Retrieve by similarity at read time. Only relevant memories enter the context window.

### Memory Table (replaces memory.md for scaled watchers)

```sql
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  content         TEXT NOT NULL,
  embedding       BLOB,
  importance      INTEGER DEFAULT 3,  -- agent self-rates 1-5
  last_accessed   TIMESTAMP,
  obsolete        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memories_watcher ON memories(watcher_id, obsolete);
```

### Write Path

1. Agent returns `memory_append` string
2. Split into chunks (one per bullet/paragraph)
3. Embed each chunk (text-embedding-3-small)
4. INSERT into memories table with vector

### Read Path

1. New email arrives (or tick fires)
2. Embed: email subject + sender + first 200 chars of body
3. Vector similarity search against watcher's non-obsolete memories
4. Return top K results (default K=8) sorted by score
5. Weight by: similarity * importance * recency_decay
6. Format for context: "[score] memory content"

### Context Budget

Memory section drops from 2,000 tokens (full file) to ~500 tokens (top 8 relevant chunks). Total context budget drops to ~5,850 tokens worst case.

### Scaling Strategy

- Under 50 memory entries: load all (simple, no embeddings needed)
- Over 50 entries: semantic retrieval
- Pruning: drop obsolete + low-importance + never-accessed entries older than 90 days
- Agent can mark memories obsolete: "this is no longer true"

### Embedding Cost

text-embedding-3-small: $0.02 per 1M tokens. One memory chunk is ~50 tokens. 1,000 memories = 50K tokens = $0.001 to embed. Retrieval query is one embedding call per invocation. Negligible.
