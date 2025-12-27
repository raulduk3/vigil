# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server (http://localhost:3000)
npm run build        # Production build
npm run typecheck    # TypeScript checking
npm run lint         # ESLint
```

## Architecture

### Display-Only Layer

The frontend is a **read-heavy display layer with no business logic**. All authoritative state lives in backend events.

- **Never** contains business logic or decision-making
- **Never** accesses database or event store directly
- **Never** emits events (only backend emits events)
- **Displays** derived projections from backend API
- **Submits** user actions via API (which create events in backend)

### Key Directories

```
src/
├── app/                # Next.js App Router pages
│   ├── auth/           # Login, register, password reset, OAuth callback
│   ├── dashboard/      # Main dashboard (protected)
│   ├── watchers/       # Watcher CRUD and detail pages
│   ├── account/        # Profile, security, billing
│   └── learn/          # Documentation pages
├── components/
│   ├── auth/           # OAuth buttons
│   └── system/         # Connection indicator
└── lib/
    ├── api/client.ts   # Singleton API client with auto token refresh
    ├── auth/context.tsx # Auth React Context + useAuth hook
    └── stripe/provider.tsx # Stripe Elements provider
```

### API Client (`src/lib/api/client.ts`)

Singleton pattern with automatic token management:

- Stores `access_token` and `refresh_token` in localStorage
- Automatic token refresh on 401 responses
- Type-safe methods organized by domain: auth, watchers, threads, events, billing

### Authentication Context (`src/lib/auth/context.tsx`)

React Context pattern:

- `AuthProvider` wraps entire app in `providers.tsx`
- `useAuth()` hook returns user state + login/logout/register methods
- `RequireAuth` component wraps protected pages

### Protected Routes Pattern

```typescript
export default function ProtectedPage() {
  return (
    <RequireAuth>
      <ProtectedContent />
    </RequireAuth>
  );
}
```

### State Management

- **Auth State**: React Context (AuthProvider at root)
- **UI State**: React useState per component
- **Server State**: Direct API calls (no React Query caching)
- **Zustand**: Available but currently unused

## Design System

### Tailwind Configuration (`tailwind.config.ts`)

Custom palette optimized for data presentation:

- **vigil**: Deep teal brand colors (primary: #0B1F2A)
- **status**: Muted ok/warning/critical/overdue colors
- **surface**: Page/raised/sunken hierarchy
- **shadows**: MacOS-inspired engraved/raised effects

### Component Classes (`globals.css`)

Pre-built classes: `.btn`, `.btn-primary`, `.input`, `.panel`, `.badge`, `.badge-warning`, `.notice`, `.table-base`, `.spinner`

### Design Philosophy

MacOS-inspired (early 2000s), brutalist, minimal, high data density. Eye-safe neutrals. No decorative elements.

## Backend API Contract

Frontend expects backend at `NEXT_PUBLIC_API_URL` (default: http://localhost:3001).

Key endpoints:
- `POST /api/auth/login` → JWT tokens
- `GET /api/watchers` → User's watchers
- `GET /api/watchers/:id/threads` → Threads for watcher
- `GET /api/watchers/:id/events` → Event log (paginated)
- `POST /api/billing/checkout` → Stripe checkout session URL

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
NEXT_PUBLIC_GITHUB_OAUTH_ENABLED=true
```

All `NEXT_PUBLIC_*` variables are exposed to browser.
