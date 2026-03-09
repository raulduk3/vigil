# Vigil Frontend

Next.js 14 dashboard for Vigil's email oversight agent.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

## What This Is

A display layer for managing Vigil watchers, viewing email threads, and reviewing agent decisions. All business logic lives in the backend.

### Pages

- **Dashboard** — overview of all watchers and recent agent activity
- **Watchers** — create, configure, and monitor email watchers
- **Threads** — view conversations the agent is tracking
- **Memory** — inspect what the agent remembers per watcher
- **Activity** — audit log of every agent invocation (tools called, cost, duration)
- **Settings** — system prompt, tools, notification channels, silence thresholds

### Auth

Email/password with JWT. OAuth scaffolding exists (Google, GitHub) but isn't wired yet.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- React Query (server state)
- TypeScript

## Environment

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Vigil
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Deployment

Vercel. Set env vars, connect repo, deploy.

## Status

Needs rebuild to match V2 backend. See `CLAUDE.md` for current API surface and data types.
