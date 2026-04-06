# Contributing to Vigil

## Dev Environment

### Backend

```bash
cd backend
bun install
cp .env.example .env
# Fill in required vars (see .env.example)
bun run dev              # Dev server on port 4000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev              # Dev server on port 3000
```

## Code Style

- TypeScript strict mode throughout
- No file over 1,000 lines. If it's getting long, split it.
- Backend uses Bun + Hono + SQLite
- Frontend uses Next.js 14 (App Router), no business logic in frontend
- All mutations go through the backend API

## Testing

**Backend:**
```bash
cd backend
bun run scripts/test-e2e.ts
```

**Frontend:**
```bash
cd frontend
npm run typecheck
npm run build
```

## PR Process

1. Fork the repo
2. Create a feature branch from `main`
3. Make your changes
4. Run tests (backend e2e + frontend typecheck/build)
5. Open a PR against `main`
6. Describe what you changed and why

## Project Layout

See [README.md](README.md#project-structure) for the full structure. Key areas:

- `backend/src/agent/` — Agent engine, tools, memory, prompts
- `backend/src/api/` — REST handlers
- `backend/src/ingestion/` — Email pipeline
- `frontend/` — Next.js dashboard
- `cloudflare-worker/` — Email ingestion worker
