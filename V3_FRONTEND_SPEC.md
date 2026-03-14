# Vigil V3 Frontend Spec

## Vision
Three-column email command center. Think Linear meets Superhuman. The user sees their watchers, their email inbox as Vigil sees it, and a control panel to interact with the agent directly. Everything is auditable, everything is controllable.

## Architecture

### Route: `/dashboard` → Three-Column Layout (full viewport height, no scroll on outer container)

```
┌──────────────┬────────────────────────────────┬──────────────────────┐
│  WATCHERS    │         INBOX                  │   CONTROL PANEL      │
│  (240px)     │         (flex-1)               │   (360px)            │
│              │                                │                      │
│  ● Work  [3]│  ┌─────────────────────────┐   │  ┌──────────────┐   │
│  ○ Personal  │  │ 🔴 Alliant debit card   │   │  │ Agent Chat   │   │
│              │  │ Alerts@alliant... · 2m   │   │  │              │   │
│  + New       │  ├─────────────────────────┤   │  │ You: What    │   │
│              │  │ 🟡 Your Scheduled Pay... │   │  │ threads need │   │
│              │  │ discover@... · 15m       │   │  │ attention?   │   │
│  ──────────  │  ├─────────────────────────┤   │  │              │   │
│  Settings    │  │ ⬜ LinkedIn connect      │   │  │ Agent: You   │   │
│  Account     │  │ invitations@... · 1h     │   │  │ have 2 act.. │   │
│              │  │ ignored                  │   │  │              │   │
│              │  └─────────────────────────┘   │  │ [input____]  │   │
│              │                                │  └──────────────┘   │
│              │  Showing 28 emails · 3 active  │                      │
│              │                                │  ┌──────────────┐   │
│              │                                │  │ Quick Stats  │   │
│              │                                │  │ 3 active     │   │
│              │                                │  │ 8 watching   │   │
│              │                                │  │ 17 ignored   │   │
│              │                                │  └──────────────┘   │
└──────────────┴────────────────────────────────┴──────────────────────┘
```

### Column 1: Watcher Sidebar (240px fixed)
- List of all watchers with status dot (green=active, yellow=paused)
- Show unread/active thread count badge per watcher
- Click to select watcher → loads its inbox in column 2
- "+ New Watcher" button at bottom
- Gear icon → Settings modal
- Currently selected watcher highlighted

### Column 2: Inbox Panel (flex-1, scrollable)
- **Header bar**: Watcher name, reactivity slider (compact horizontal), filter buttons (All | Active | Watching | Ignored)
- **Email list**: Each row shows:
  - Urgency indicator (colored dot: 🔴 high, 🟡 normal, ⚪ low)
  - Subject line (bold if active/unread)
  - From address (truncated)
  - Relative time (2m ago, 1h ago)
  - Thread status badge (small pill: active/watching/resolved/ignored)
  - Agent's one-line summary below the subject (smaller, gray text)
- **Click on email** → Expands inline or opens detail view showing:
  - Full email analysis (summary, intent, urgency, entities)
  - Thread history (other emails in same thread)
  - Agent actions taken on this email
  - Ability to change thread status
  - Memory associated with this thread
- **Sort**: Most recent first by default
- **Footer**: "Showing X emails · Y active · Z ignored"

### Column 3: Control Panel (360px fixed, scrollable)
- **Agent Chat** (top half): 
  - Chat interface to talk to the watcher's agent
  - Uses the existing `POST /api/watchers/:id/invoke` endpoint with `query` parameter
  - Show agent response as formatted text
  - Input field at bottom with send button
  - Chat history persists during session (client-side state)
- **Quick Stats** (below chat):
  - Active threads count
  - Watching threads count  
  - Memories stored
  - Alerts sent (last 24h)
  - Total cost (last 24h)
- **Memories Panel** (collapsible):
  - List of agent memories with importance badges
  - Ability to add/edit/delete memories inline
  - Mark as obsolete toggle

### Settings Modal (triggered from sidebar gear icon or watcher header)
- Overlay modal, not a separate page
- Tabs: General | Prompt | Channels
- **General**: Name, reactivity slider (full version with descriptions), silence hours, tick interval, tools toggles
- **Prompt**: Full-height textarea for system prompt, with "Reset to default" button
- **Channels**: Alert destinations (email/webhook), add/remove/toggle
- **Danger Zone**: Delete watcher (with confirmation)

## Design System

Use the existing Vigil design tokens (globals.css). The aesthetic is:
- Early 2000s macOS sensibility with modern restraint
- Muted, functional colors. Not decorative.
- Data density over whitespace
- `panel` class for raised cards, `bg-surface-sunken` for recessed areas
- Badges: `badge-ok` (green), `badge-warning` (yellow), `badge-neutral` (gray), `badge-critical` (red), `badge-inactive` (dimmed)
- Buttons: `btn btn-primary`, `btn btn-secondary`, `btn btn-ghost`, `btn btn-danger`
- Inputs: `input` class
- Tables: `table-base`, `table-header`, `table-cell`, `table-row`
- Font: system font stack (already configured)
- Shadows: `shadow-panel`, `shadow-raised`, `shadow-engraved`

## Component Structure

```
src/
  app/
    dashboard/
      page.tsx          → Main three-column layout (WatcherShell)
    watchers/
      new/page.tsx      → Keep as-is (create watcher flow)
  components/
    dashboard/
      watcher-sidebar.tsx    → Column 1
      inbox-panel.tsx        → Column 2
      email-row.tsx          → Single email in inbox list
      email-detail.tsx       → Expanded email view
      control-panel.tsx      → Column 3
      agent-chat.tsx         → Chat interface within control panel
      stats-card.tsx         → Quick stats widget
      memory-panel.tsx       → Memory list with CRUD
      reactivity-slider.tsx  → Compact + full slider (moved from watcher page)
      settings-modal.tsx     → Settings overlay
```

## API Client Updates

The existing `api` client in `src/lib/api/client.ts` has all needed endpoints:
- `getWatchers()` → sidebar
- `getThreads(watcherId)` → inbox (threads contain email data)
- `getActions(watcherId)` → activity/stats
- `getMemories(watcherId)` → memory panel
- `invokeWatcher(watcherId)` → needs update to accept `{ query: string }` and return agent response
- `updateWatcher()` → settings

**Important**: The invoke endpoint currently returns `{ invoked: true }` but doesn't return the agent's response. For the chat to work, we need to either:
1. Make invoke synchronous (wait for agent response and return it) — PREFERRED for MVP
2. Or poll for the latest action after invoking

For MVP, update the backend invoke handler to wait for the agent response and return it. The `invokeAgent` function in `engine.ts` already returns the parsed response.

## Key Behaviors

1. **URL state**: Selected watcher stored in URL query param (`?watcher=<id>`) so it persists on refresh
2. **Auto-refresh**: Poll for new emails every 30 seconds (use existing `useRealtimeData` hook pattern)
3. **Keyboard shortcuts**: 
   - `j/k` to navigate email list
   - `e` to ignore selected email
   - `/` to focus chat input
4. **Responsive**: On mobile (<768px), show only inbox panel with hamburger to toggle sidebar. Control panel accessible via bottom sheet or tab.

## What to Remove/Replace

- The current `dashboard/page.tsx` is replaced entirely by the three-column layout
- The current `watchers/[id]/page.tsx` is NO LONGER the main interaction point. Its functionality is absorbed into the three-column dashboard. Keep the file but redirect to dashboard with `?watcher=<id>`.
- Remove unused timeline components (`timeline.tsx`, `timeline-export.tsx`)
- Remove learn pages for now (they can come back later)

## What NOT to Touch

- Auth system (login/register/callback) — works fine
- API client base (`request()` function, token handling) — works fine  
- `globals.css` design tokens — keep and use them
- Backend API endpoints — only modify invoke to return response
- Account/billing pages — keep as-is

## Build Verification

After all changes:
1. `cd frontend && npm run build` must succeed with zero errors
2. All existing API client methods must still be exported
3. Auth flow must still work (login → dashboard redirect)
