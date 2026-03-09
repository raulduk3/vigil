# Vigil Frontend

Next.js 14 dashboard for Vigil email oversight.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

## What It Does

- **Dashboard** — overview of all watchers (status, thread counts, recent alerts)
- **Watcher management** — create, configure, pause/resume watchers
- **Thread viewer** — browse conversation threads, summaries, silence durations
- **Activity log** — see every agent decision (tool calls, costs, durations)
- **Memory viewer** — inspect what the agent has learned
- **Auth** — email/password registration and login (OAuth scaffolded)

## Stack

Next.js 14 (App Router), Tailwind CSS, React Query, JWT auth.

## Environment

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Vigil
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Project Structure

```
src/
├── app/
│   ├── auth/           # Login, register
│   ├── dashboard/      # Main dashboard
│   ├── watchers/       # Watcher CRUD + detail views
│   └── account/        # Profile, billing
├── components/
│   ├── auth/           # OAuth buttons
│   └── ui/             # Shared components
└── lib/
    ├── api/client.ts   # Backend API client
    └── auth/context.tsx # Auth provider
```

## Development

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run typecheck    # Type check
npm run lint         # Lint
```

## Status

Dashboard and auth pages exist from V1 but need updating to match V2 backend API. See `CLAUDE.md` for current API contracts and data types.
