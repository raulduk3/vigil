# CLAUDE.md

Development guidance for Claude Code when working with the Vigil frontend.

## Product Focus

Vigil delivers **one capability: provable silence tracking for email threads**.

The frontend displays:
- Watcher status and configuration
- Thread list with silence duration
- Alert history
- Evidence timelines

The frontend **never**:
- Contains business logic
- Accesses database directly
- Emits events
- Infers deadlines or urgency

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server (http://localhost:3000)
npm run build        # Production build
npm run typecheck    # TypeScript checking
npm run lint         # ESLint
```

## Architecture

### Display-Only Layer

The frontend is a **read-heavy display layer with no business logic**.

- All state from backend API
- User actions → API → backend emits events
- No event emission
- No decision-making

### Key Directories

```
src/
├── app/                # Next.js App Router pages
│   ├── auth/           # Login, register, OAuth callback
│   ├── dashboard/      # Main dashboard
│   ├── watchers/       # Watcher management
│   ├── account/        # Profile, security, billing
│   └── learn/          # Documentation
├── components/
│   ├── auth/           # OAuth buttons
│   ├── events/         # Event display
│   └── system/         # Connection indicator
└── lib/
    ├── api/client.ts   # API client
    ├── auth/context.tsx # Auth context
    └── stripe/provider.tsx # Stripe provider
```

### API Client

Singleton with automatic token management:
- `access_token` / `refresh_token` in localStorage
- Auto refresh on 401
- Type-safe domain methods

### Authentication

React Context pattern:
- `AuthProvider` at root
- `useAuth()` hook
- `RequireAuth` component

### Protected Routes

```typescript
export default function Page() {
  return (
    <RequireAuth>
      <Content />
    </RequireAuth>
  );
}
```

## UI Guidelines

### Thread Display

```typescript
// Thread shows silence tracking, not deadlines
type ThreadDisplay = {
  thread_id: string;
  status: "open" | "closed";
  last_activity_at: number;
  hours_silent: number;
  threshold_exceeded: boolean;
  participants: string[];
};
// NO: deadline_utc, urgency_level, reminder_ids
```

### Alert Display

```typescript
// Alerts for silence threshold only
type AlertDisplay = {
  alert_id: string;
  thread_id: string;
  hours_silent: number;
  threshold_hours: number;
  sent_at: number;
};
// NO: urgency_level, deadline alerts
```

## Design System

### Tailwind Config

Custom palette:
- **vigil**: Deep teal brand
- **status**: ok/warning/critical/overdue
- **surface**: Page hierarchy

### Component Classes

`globals.css`: `.btn`, `.input`, `.panel`, `.badge`, `.table-base`

### Philosophy

MacOS-inspired, minimal, high data density. Eye-safe neutrals.
