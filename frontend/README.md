# Frontend - Vigil Web Application

**Next.js 14 Web Application with App Router**

User-facing web application providing authentication, account management, watcher dashboard, and **full user control over extracted reminders**.

## Key User Capabilities

The frontend enables complete user control for correcting automated extractions:

- **View active reminders** created automatically by the LLM
- **Edit, merge, or dismiss** any extraction (~10% error rate expected)
- **Reassign reminders** to different threads (portable semantic obligations)
- **Link emails to multiple threads** via soft associations
- **View and resolve conflicts** (duplicate reminders, deadline mismatches)
- **Monitor response times** and communication patterns
- **Override any automation** with persistent manual corrections

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Features

- **Authentication**: Email/password and OAuth (Google, GitHub)
- **Password Reset**: Secure token-based password recovery
- **Account Management**: Profile, security settings, billing
- **Stripe Integration**: Subscription management and payment
- **Dashboard**: Watcher overview and thread monitoring
- **Response Time Metrics**: Track when emails are sent, received, and responded to
- **Reminder Management**: Full control over extracted reminders
- **Conflict Resolution**: Review and resolve duplicate/conflicting reminders
- **Responsive**: Mobile-first design with Tailwind CSS

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Landing page
│   │   ├── layout.tsx         # Root layout
│   │   ├── providers.tsx      # Context providers
│   │   ├── auth/              # Auth pages
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   ├── reset-password/
│   │   │   └── callback/      # OAuth callback
│   │   ├── dashboard/         # Main dashboard
│   │   └── account/           # Account management
│   │       ├── page.tsx       # Profile
│   │       ├── security/      # Security settings
│   │       └── billing/       # Subscription & billing
│   ├── components/            # Reusable components
│   │   └── auth/
│   │       └── oauth-buttons.tsx
│   └── lib/                   # Core libraries
│       ├── api/               # API client
│       │   └── client.ts
│       ├── auth/              # Auth context
│       │   └── context.tsx
│       └── stripe/            # Stripe provider
│           └── provider.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Environment Variables

```bash
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001
BACKEND_URL=http://localhost:3001

# Stripe (client-side publishable key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# OAuth (display flags)
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
NEXT_PUBLIC_GITHUB_OAUTH_ENABLED=true

# App
NEXT_PUBLIC_APP_NAME=Vigil
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## SDD Traceability

The [Software Design Document (SDD)](../docs/SDD.md) is the **authoritative source of truth** for all system requirements. This frontend application implements the following requirements:

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| Dashboard | MR-Frontend-1, MR-Frontend-2, MR-Frontend-3 |
| Thread Display | FR-1, FR-2, FR-3, FR-4, FR-5 |
| Thread Management | FR-6, FR-6b, FR-6c, FR-9 |
| Reminder Management | User control over drafts, edits, merges, dismissals |
| Conflict Resolution | Duplicate detection, deadline mismatch flagging |
| Response Time Metrics | FR-17, FR-18, FR-19 |
| LLM Extraction Display | FR-7, FR-7a, FR-8, FR-10 |
| Report Generation | FR-15 |
| Watcher Configuration | FR-4, FR-5 |
| User Authentication | SEC-1, SEC-2, SEC-3 |
| Display-Only Principle | FR-16 (Delegated Vigilance), FR-20 (Expressly Constrained) |

See [SDD Section 5: Implementation Coverage Table](../docs/SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Response Time Monitoring

A key feature: visualizing communication velocity.

### Dashboard Metrics

```typescript
// Thread metrics displayed
{
  thread_id: "t_abc123",
  subject: "Q4 Report",
  status: "open",
  metrics: {
    hours_since_activity: 48,
    hours_until_deadline: 72,
    response_count: 5,
    avg_response_time_hours: 12,
    last_response_at: "2025-12-24T10:00:00Z"
  }
}
```

### Timeline View

```
┌─────────────────────────────────────────────────────────────┐
│  Thread Timeline: Q4 Report                                 │
├─────────────────────────────────────────────────────────────┤
│  Dec 20, 10:00 AM  │ Email sent by client@example.com       │
│       ↓            │                                        │
│  Dec 20, 2:00 PM   │ Response from you (4h response time)   │
│       ↓            │                                        │
│  Dec 21, 9:00 AM   │ Follow-up from client (19h later)      │
│       ↓            │                                        │
│  [48h silence]     │ ⚠️ Approaching silence threshold       │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Coverage Contribution

This component contributes **~15%** of overall project implementation. The frontend is a read-heavy display layer with no business logic.

### Coverage by Category

| Category | Frontend Owns | Total in SDD | Coverage |
|----------|---------------|--------------|----------|
| Feature Requirements (FR) | 3 of 22 | 22 | 14% |
| Module Requirements (MR) | 3 of 26 | 26 | 12% |
| Security Requirements (SEC) | 3 of 8 | 8 | 38% |
| Infrastructure (IR) | 0 of 24 | 24 | 0% |

### Frontend-Owned Requirements

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| MR-Frontend-1 | Thread List Retrieval | `GET /api/watchers/:id/threads` display |
| MR-Frontend-2 | Manual Thread Closure | `POST /api/threads/:id/close` action |
| MR-Frontend-3 | Event Log Display | Paginated event timeline |
| FR-14 (partial) | Event Log Inspection | UI rendering of events |
| FR-15 (partial) | Report Generation | On-demand report request UI |
| SEC-1/2/3 (client) | Authentication | Token storage, session management |

### Frontend Depends On (Backend-Provided)

```
Backend API (Required)
├── /api/auth/* → Authentication tokens
├── /api/watchers/* → Watcher state (from event replay)
├── /api/threads/* → Thread projections
├── /api/reminders/* → Reminder management (confirm, edit, dismiss, merge)
├── /api/conflicts/* → Conflict detection and resolution
└── /api/events/* → Event log data
```

---

## Reminder Management UI

The frontend provides complete control over extracted reminders:

### Reminder States & Actions

| State | User Actions Available |
|-------|----------------------|
| `active` | Edit, Merge, Dismiss, Reassign Thread |
| `dismissed` | View only (audit trail preserved) |
| `merged` | View only (merged into another reminder) |

Reminders are created in `active` state automatically. Users correct mistakes rather than confirming each extraction.

### Conflict Resolution Flow

```
1. Backend detects potential conflict (duplicate, deadline mismatch)
2. Conflict appears in user's review queue
3. User reviews both reminders side-by-side
4. User chooses: Keep Both, Merge, Dismiss One
5. Frontend calls /api/conflicts/:id/resolve
6. Resolution event persists the decision
```

### One Email, Multiple Concerns

When an email generates multiple extractions:

```
Email: "Please send the report by Friday and schedule a call for next week"
    ↓
Reminder 1: Hard deadline - "report by Friday" (active)
Reminder 2: Soft deadline - "call for next week" (active)
    ↓
User reviews if needed (~10% error rate)
    ↓
User can: Edit either, Merge into one, Dismiss either, Reassign to different thread
```

### Multi-Thread Assignment

Emails can belong to multiple threads through **soft associations**:

```typescript
// Add email to a thread
// POST /api/emails/:id/threads
{
  thread_id: "t_abc123",
  action: "add"  // Creates ACTIVE association
}

// Remove email from a thread (soft delete)
// POST /api/emails/:id/threads
{
  thread_id: "t_abc123",
  action: "remove"  // Marks association as INACTIVE
}
```

**Association Model:**
- Messages have **implications** on thread state (activity, silence, participants)
- Associations can be `ACTIVE` (affects calculations) or `INACTIVE` (hidden)
- Removing a message from a thread = marking association as inactive
- Original association preserved in event log for full traceability
- Same email can be active in multiple threads simultaneously

---

## Authentication Flow

### Email/Password Authentication

```
1. User submits login form
2. Frontend calls POST /api/auth/login
3. Backend validates credentials, returns JWT
4. Frontend stores tokens in localStorage
5. Subsequent requests include Authorization header
6. Token refresh handled automatically
```

### OAuth Authentication

```
1. User clicks OAuth button (Google/GitHub)
2. Frontend redirects to /api/auth/oauth/{provider}/start
3. Backend redirects to OAuth provider
4. User authenticates with provider
5. Provider redirects to /api/auth/oauth/{provider}/callback
6. Backend creates/links account, issues JWT
7. Backend redirects to frontend /auth/callback with tokens
8. Frontend stores tokens, redirects to dashboard
```

### Password Reset

```
1. User enters email on forgot-password page
2. Frontend calls POST /api/auth/password-reset/request
3. Backend sends email with reset link
4. User clicks link, lands on reset-password page
5. Frontend verifies token via POST /api/auth/password-reset/verify
6. User enters new password
7. Frontend calls POST /api/auth/password-reset/confirm
8. User redirected to login
```

## Stripe Integration

### Checkout Flow

```typescript
// Upgrade button click
const handleUpgrade = async (plan: string) => {
  const { url } = await api.createCheckoutSession(plan);
  window.location.href = url; // Redirect to Stripe Checkout
};
```

### Billing Portal

```typescript
// Manage subscription button
const handleManageBilling = async () => {
  const { url } = await api.createBillingPortalSession();
  window.location.href = url; // Redirect to Stripe Portal
};
```

## User & Account Management

The frontend handles **client-side authentication** but is **NOT the system of record**. All user data lives in the backend.

### Authentication Architecture

```
┌──────────────────┐     ┌──────────────────┐
│    Frontend      │     │     Backend       │
│  (React Context) │     │  (Authoritative)  │
├──────────────────┤     ├──────────────────┤
│ • Login form     │─────▶│ • User table      │
│ • Register form  │     │ • Account table   │
│ • Session cookie │◀─────│ • Password hashes │
│ • Token storage  │     │ • JWT signing     │
└──────────────────┘     └──────────────────┘
```

### Frontend Auth Responsibilities

| Responsibility | Frontend Handles | Backend Provides |
|----------------|------------------|------------------|
| Login UI | ✅ Form, validation, UX | JWT token on success |
| Registration UI | ✅ Form, validation, UX | Account/User creation |
| Token Storage | ✅ httpOnly cookies or localStorage | Token signing/validation |
| Session State | ✅ React context | Token expiry enforcement |
| OAuth Flow | ✅ Provider redirects | User creation from OAuth |
| Password Reset | ✅ Form UI | Email sending, token validation |
| Protected Routes | ✅ Client-side guards | 401/403 responses |

### Token Handling

```typescript
// Frontend stores JWT in httpOnly cookie (recommended)
// Or in memory/localStorage (less secure but simpler)

// Every API request includes token
const response = await fetch(`${API_URL}/api/watchers`, {
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  }
});

// Handle 401 - Token expired
if (response.status === 401) {
  const refreshed = await refreshToken();
  if (!refreshed) {
    redirectToLogin();
  }
}
```

### User Data the Frontend Displays

```typescript
// From JWT claims (decoded client-side for display only)
type JWTClaims = {
  user_id: string;
  account_id: string;
  email: string;
  role: "owner" | "member";
  exp: number;  // Expiry timestamp
};

// Frontend NEVER sees or stores:
// - password_hash
// - refresh_token
// - Other users' data
```

### Security Requirements (Frontend Portion)

| Requirement | Frontend Implementation |
|-------------|------------------------|
| SEC-1: Token Expiry | Detect 401, trigger refresh flow |
| SEC-2: Password Storage | Never store passwords; send to backend only |
| SEC-3: Session Security | httpOnly cookies, HTTPS only, SameSite=Strict |

---

## Working with Agents

This section guides AI agents implementing discrete features within the frontend.

### Before Starting Any Feature

1. **Identify if feature requires backend API** (most do)
2. **Check the SDD requirement** this UI feature implements
3. **Review the API contract** in backend README
4. **Understand data flow:** Backend → API → React Query → Component

### Feature Implementation Checklist

```
□ Identify SDD requirement (MR-Frontend-X, FR-X display)
□ Confirm backend API endpoint exists (or needs to be created first)
□ Create/update component in components/
□ Add API call in lib/api.ts
□ Create React Query hook in lib/hooks/
□ Add route/page in app/
□ Run `npm run typecheck && npm run lint`
□ Test with mock API responses
```

### Discrete Feature Examples

| Feature | SDD Requirement | Files to Create/Modify | Backend Dependency |
|---------|-----------------|------------------------|--------------------|
| Watcher list page | MR-Frontend-1 | `app/(dashboard)/watchers/page.tsx` | `GET /api/watchers` |
| Thread closure button | MR-Frontend-2 | `components/threads/CloseButton.tsx` | `POST /api/threads/:id/close` |
| Event log timeline | MR-Frontend-3 | `components/events/Timeline.tsx` | `GET /api/watchers/:id/events` |
| Urgency badge | FR-10 display | `components/ui/UrgencyBadge.tsx` | Urgency from thread data |
| Login form | SEC-1/2/3 | `app/(auth)/login/page.tsx` | `POST /api/auth/login` |

### Component Patterns

```typescript
// Pattern: Data fetching with React Query
"use client";
import { useQuery } from "@tanstack/react-query";
import { getWatcherThreads } from "@/lib/api";

export function ThreadList({ watcherId }: { watcherId: string }) {
  const { data: threads, isLoading, error } = useQuery({
    queryKey: ["threads", watcherId],
    queryFn: () => getWatcherThreads(watcherId),
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <ul>
      {threads.map(thread => (
        <ThreadCard key={thread.thread_id} thread={thread} />
      ))}
    </ul>
  );
}
```

### API Client Pattern

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getWatcherThreads(watcherId: string) {
  const res = await fetch(`${API_URL}/api/watchers/${watcherId}/threads`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<Thread[]>;
}
```

## Purpose

The frontend serves as the primary user interface for Vigil, providing:
- **Public pages** - Marketing splash, product information, onboarding
- **Authentication** - User registration, login, session management
- **Dashboard** - Watcher configuration and monitoring interface

The frontend is **not a system of record**—all authoritative state lives in backend events.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Deployment:** Vercel (serverless edge functions)
- **Styling:** Tailwind CSS
- **State Management:** React Query / SWR for server state
- **Authentication:** NextAuth.js or Auth0 integration

## Features

### Public Pages (Unauthenticated)
- **Splash/Landing Page** - Product overview, value proposition
- **Features** - Detailed capability descriptions
- **Pricing** - Plan comparison and selection
- **Documentation** - User guides and API reference

### Authentication Flow
- **Registration** - Email signup, account creation
- **Login** - Email/password, OAuth providers (Google, GitHub)
- **Password Reset** - Email-based recovery flow
- **Session Management** - JWT tokens, secure cookies

### User Dashboard (Authenticated)
- **Watcher List** - View all watchers for account
- **Watcher Creation** - Create new watchers with name and initial policy
- **Watcher Configuration** - Update policy (allowlists, thresholds, channels)
- **Thread Monitoring** - View open/closed threads per watcher (threads track conversations, NOT deadlines)
- **Urgency Display** - Visual indicators for warning/critical/overdue states (urgency from reminders, not threads)
- **Manual Thread Closure** - User-initiated thread resolution (closure is terminal)
- **Closed Thread Tracking** - View closed threads for confirmation and audit (excluded from reports by default)
- **Event Log** - Audit trail with full traceability (extraction events, metadata)
- **Alert History** - Notification delivery status
- **Reports** - On-demand and scheduled summary reports (open threads only by default)

### Key Display Principles
- **Threads vs Reminders:** Display thread state (silence, activity) separately from reminder state (urgency, deadlines)
- **No Email Bodies:** Dashboard shows metadata only (from, subject, received_at) - bodies are not stored
- **Extraction Visibility:** Show what the LLM detected (deadlines, signals) with source spans for transparency
- **Closed Thread Filter:** Allow users to filter and view closed threads for confirmation purposes

### Watcher Management
- **Activate/Pause/Resume** - Control watcher operational state
- **Notification Channels** - Configure email, webhook destinations
- **Sender Allowlists** - Manage approved sender addresses
- **Threshold Configuration** - Set warning/critical/silence hours

## Architecture

```
frontend/
├── app/                    # Next.js App Router
│   ├── (public)/          # Public pages (splash, features, pricing)
│   │   ├── page.tsx       # Landing/splash page
│   │   ├── features/
│   │   ├── pricing/
│   │   └── docs/
│   ├── (auth)/            # Authentication pages
│   │   ├── login/
│   │   ├── register/
│   │   └── reset-password/
│   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── watchers/
│   │   │   ├── page.tsx   # Watcher list
│   │   │   ├── new/       # Create watcher
│   │   │   └── [id]/      # Watcher detail/config
│   │   │       ├── threads/
│   │   │       ├── events/
│   │   │       └── settings/
│   │   └── account/       # User account settings
│   ├── api/               # API routes (Next.js serverless)
│   │   ├── auth/          # NextAuth endpoints
│   │   └── proxy/         # Backend API proxy (optional)
│   └── layout.tsx
├── components/            # Reusable UI components
│   ├── ui/               # Base components (Button, Card, etc.)
│   ├── watchers/         # Watcher-specific components
│   ├── threads/          # Thread display components
│   └── forms/            # Form components
├── lib/                   # Utility libraries
│   ├── api.ts            # Backend API client
│   ├── auth.ts           # Authentication utilities
│   └── hooks/            # Custom React hooks
├── public/               # Static assets
├── .env.example          # Environment configuration
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## API Integration

### Backend Communication
- **REST API** - HTTPS to backend control plane
- **WebSocket** - Optional real-time updates (thread state changes, alerts)
- **Authentication** - JWT bearer tokens in Authorization header

### Endpoints Used (Backend API)
```
POST   /api/auth/register        # User registration
POST   /api/auth/login           # User authentication
POST   /api/auth/refresh         # Token refresh

GET    /api/watchers             # List user's watchers
POST   /api/watchers             # Create new watcher
GET    /api/watchers/:id         # Get watcher details
PUT    /api/watchers/:id/policy  # Update watcher policy
POST   /api/watchers/:id/activate
POST   /api/watchers/:id/pause
POST   /api/watchers/:id/resume

GET    /api/watchers/:id/threads # Get threads for watcher
POST   /api/threads/:id/close    # Manually close thread

GET    /api/watchers/:id/events  # Get event log (paginated)
GET    /api/watchers/:id/alerts  # Get alert history
POST   /api/watchers/:id/reports # Generate on-demand report
```

## Network Configuration

**Configuration:** See `.env.example`

```bash
cp .env.example .env.local
```

**Key Environment Variables:**
```bash
# Backend API
# Development: keep pointing to your local backend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
# Production: https://api.vigil.run and wss://api.vigil.run/ws

# Authentication
# Development: http://localhost:3000
# Production: https://vigil.run
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# OAuth Providers (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

## Design Principles

### Reassurance-First
Reports and dashboards emphasize:
1. What is **resolved or stable** (green indicators)
2. What **appears to be on track** (neutral)
3. What **may require attention** (warnings last, not first)

This reduces alert fatigue and builds user confidence.

### Transparency & Traceability
All displayed information traces back to source events:
- Every thread status links to specific events
- Every alert links to the state transition that triggered it
- Every extracted signal shows verbatim evidence from email

### Progressive Disclosure
- Summary views by default (thread counts, urgency overview)
- Drill-down to details (event timeline, extraction evidence)
- Expert mode for power users (raw event log)

## Constraints

The frontend:
- ✅ **Displays** derived projections from backend API
- ✅ **Submits** user actions via API (which create events)
- ✅ **Handles** authentication and session management
- ❌ **Never contains** business logic or decision-making
- ❌ **Never accesses** database or event store directly
- ❌ **Never emits** events (only backend emits events)
- ❌ **Never calls** LLM service directly

**All authoritative changes flow through backend event creation.**

## Deployment

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Environment Setup
1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Set up custom domain (vigil.run)
4. Configure backend CORS to allow frontend origin

### Build Configuration
```json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production build locally
npm run start

# Type checking
npm run typecheck

# Linting
npm run lint
```

## SDD References

- **Feature Requirements:** FR-1 through FR-4 (Watcher Management), FR-13 (State Reconstruction), FR-14 (Event Log Inspection), FR-15 (Report Generation), FR-17 (Access Control)
- **Module Requirements:** MR-Frontend-1 through MR-Frontend-3
- **Security Requirements:** SEC-1 (Authentication), SEC-2 (Authorization), SEC-3 (Session Management)

## Status

**To be implemented**

### Implementation Checklist
- [ ] Project scaffolding (Next.js + Tailwind)
- [ ] Authentication flow (NextAuth.js)
- [ ] Public pages (splash, features, pricing)
- [ ] Dashboard layout and navigation
- [ ] Watcher CRUD operations
- [ ] Thread display with urgency indicators
- [ ] Event log with pagination
- [ ] Alert history display
- [ ] Report generation UI
- [ ] Real-time updates (WebSocket)

