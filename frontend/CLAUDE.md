# CLAUDE.md — Frontend

Development guidance for Claude Code when working with the Vigil frontend.

## Product

Vigil's frontend is a Next.js dashboard for managing email watchers, viewing threads, and reviewing agent activity. It is a display layer with no business logic. All state comes from the backend API.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (http://localhost:3000)
npm run build        # Production build
npm run typecheck    # TypeScript checking
npm run lint         # ESLint
```

## Architecture

### Display-Only Layer

- All state from backend API
- User actions → API → backend processes
- No event emission, no decision-making
- No direct database access

### Stack

Next.js 14 (App Router), Tailwind CSS, React Query for server state, JWT auth (localStorage).

### Directory Structure

```
src/
├── app/
│   ├── auth/           # Login, register, OAuth callback
│   ├── dashboard/      # Main dashboard
│   ├── watchers/       # Watcher management + detail views
│   ├── account/        # Profile, security, billing
│   └── learn/          # Documentation pages
├── components/
│   ├── auth/           # OAuth buttons
│   └── ui/             # Base components
└── lib/
    ├── api/client.ts   # API client (auto token refresh)
    ├── auth/context.tsx # Auth context + hooks
    └── stripe/         # Stripe provider (stub)
```

### Backend API Endpoints (V2)

```
# Auth (public)
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh

# Templates (public)
GET    /api/templates

# Watchers (authenticated)
GET    /api/watchers
POST   /api/watchers
GET    /api/watchers/:id
PUT    /api/watchers/:id
DELETE /api/watchers/:id
POST   /api/watchers/:id/invoke
GET    /api/watchers/:id/memory
GET    /api/watchers/:id/actions

# Threads (authenticated)
GET    /api/watchers/:watcherId/threads
GET    /api/watchers/:watcherId/threads/:threadId
POST   /api/watchers/:watcherId/threads/:threadId/close

# Ingestion (token auth)
POST   /api/ingest/:token
POST   /ingest/:token
```

## Key Pages

### Dashboard
Overview of all watchers: status, thread count, last activity, recent alerts.

### Watcher Detail
- **Threads tab** — active/watching/resolved threads with summaries, silence duration, email count
- **Activity tab** — agent action log (trigger, tool called, result, cost, duration)
- **Memory tab** — what the agent has learned about this email stream
- **Settings tab** — system prompt, tools, silence threshold, tick interval, notification channels

### Watcher Creation
Choose a template (general, or custom), set name, configure alert email. Backend generates ingest token and ingestion address.

### Setup Flow
After creating a watcher, show the user:
1. Their ingestion address (e.g. `your-watcher-abc123@vigil.run`)
2. Instructions to set up email forwarding in Gmail/Outlook/etc.
3. A test button to send a sample email

## Data Types

```typescript
// Thread display
interface Thread {
  id: string;
  subject: string;
  status: "active" | "watching" | "resolved" | "ignored";
  participants: string[];
  email_count: number;
  summary: string | null;
  last_activity: string;
  created_at: string;
}

// Action log entry
interface Action {
  id: string;
  trigger_type: "email_received" | "scheduled_tick";
  tool: string | null;
  tool_params: string | null;  // JSON
  result: "success" | "failed";
  context_tokens: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
}

// Watcher config
interface Watcher {
  id: string;
  name: string;
  ingest_token: string;
  ingestion_address: string;
  system_prompt: string;
  tools: string[];
  silence_hours: number;
  tick_interval: number;
  status: "active" | "paused" | "deleted";
  template_id: string | null;
  last_tick_at: string | null;
}

// Memory entry
interface Memory {
  id: string;
  content: string;
  importance: number;
  created_at: string;
}
```

## UI Guidelines

### Design System
Tailwind with custom palette:
- **vigil** — deep teal brand
- **status** — ok (green), warning (amber), critical (red)
- **surface** — page hierarchy neutrals

MacOS-inspired. Minimal. High data density. Eye-safe neutrals.

### Constraints
- No email bodies displayed (never stored)
- Thread summaries are agent-generated, not raw email content
- Cost/token usage shown per action for transparency
- Silence duration prominently displayed on active threads

## Auth Pattern

```typescript
// Auth context
const { user, loading, login, logout } = useAuth();

// Protected route
<RequireAuth>
  <DashboardContent />
</RequireAuth>

// API client with auto-refresh
const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL);
// Handles 401 → refresh → retry automatically
```

## Environment

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Vigil
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false
NEXT_PUBLIC_GITHUB_OAUTH_ENABLED=false
```

## What Does NOT Exist in V2

These V1 concepts are removed:
- ❌ Event sourcing / event replay
- ❌ Reminders / deadline extraction
- ❌ Urgency levels or escalation
- ❌ Conflict resolution
- ❌ Multi-thread email assignment
- ❌ Response time metrics
- ❌ Report generation
- ❌ WebSocket real-time updates
