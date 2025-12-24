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
