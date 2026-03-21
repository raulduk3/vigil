# CLAUDE.md — Frontend

Development guidance for the Vigil frontend.

## Product

Vigil's frontend is a dashboard for managing watchers, viewing threads, and reviewing agent activity. It's a display layer — all business logic lives in the backend agent engine.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run typecheck
npm run lint
```

## What the Frontend Does

- Auth (login, register, OAuth callback)
- Watcher management (create, configure, pause/resume)
- Thread viewer (conversations grouped by agent, silence tracking)
- Agent activity log (tool calls, decisions, costs)
- Memory inspector (what the agent remembers per watcher)
- Alert history (what was sent, when, to whom)

## What the Frontend Does NOT Do

- No business logic or decision-making
- No direct database access
- No LLM calls
- No event emission — all mutations go through backend API

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS (custom palette: vigil teal, status colors)
- React Query for server state
- JWT auth (access + refresh tokens in localStorage)

## Key Pages

```
app/
├── page.tsx                    # Landing
├── auth/
│   ├── login/                  # Email/password login
│   ├── register/               # Account creation
│   └── callback/               # OAuth redirect handler
├── dashboard/                  # Overview: all watchers, recent activity
├── watchers/
│   ├── page.tsx                # Watcher list
│   ├── new/                    # Create watcher (pick template, name, prompt)
│   └── [id]/
│       ├── page.tsx            # Watcher detail (threads, stats)
│       ├── threads/            # Thread list + detail
│       ├── memory/             # Agent memory viewer
│       ├── activity/           # Actions log (tool calls, costs)
│       └── settings/           # Prompt, tools, channels, silence threshold
└── account/
    ├── page.tsx                # Profile
    ├── security/               # Password, sessions

```

## Backend API (what the frontend consumes)

```
# Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me

# Watchers
GET    /api/watchers
POST   /api/watchers
GET    /api/watchers/:id
PUT    /api/watchers/:id
DELETE /api/watchers/:id
POST   /api/watchers/:id/invoke    # Manual agent trigger
GET    /api/watchers/:id/memory    # Agent memories
GET    /api/watchers/:id/actions   # Action audit log

# Threads
GET    /api/watchers/:wid/threads
GET    /api/watchers/:wid/threads/:tid
POST   /api/watchers/:wid/threads/:tid/close

# Templates
GET    /api/templates
```

## Data Types

```typescript
type Watcher = {
  id: string;
  name: string;
  ingest_token: string;
  ingestion_address: string;       // e.g. "name-token@vigil.run"
  system_prompt: string;
  tools: string[];                 // ["send_alert", "update_thread", ...]
  silence_hours: number;
  tick_interval: number;           // minutes
  status: "active" | "paused" | "deleted";
  template_id: string | null;
  last_tick_at: string | null;
  created_at: string;
};

type Thread = {
  id: string;
  subject: string | null;
  participants: string[];
  status: "active" | "watching" | "resolved" | "ignored";
  email_count: number;
  summary: string | null;
  first_seen: string;
  last_activity: string;
};

type Action = {
  id: string;
  trigger_type: "email_received" | "scheduled_tick" | "user_query";
  tool: string | null;
  tool_params: object | null;
  result: "success" | "failed";
  decision: string | null;         // agent's email analysis
  memory_delta: string | null;
  context_tokens: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
};

type Memory = {
  id: string;
  content: string;
  importance: number;              // 1-5
  obsolete: boolean;
  created_at: string;
};
```

## Design Principles

- **Reassurance-first:** Show what's resolved and stable before what needs attention
- **Transparency:** Every alert traces to a tool call, every tool call to an agent decision
- **Progressive disclosure:** Summary → detail → raw log
- **High data density:** MacOS-inspired, minimal chrome, eye-safe neutrals

## Environment

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001    # Backend
NEXT_PUBLIC_APP_NAME=Vigil
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Deployment

Vercel. Connect repo, set env vars, deploy. Custom domain: `vigil.run`.
Backend CORS must include the frontend origin.
