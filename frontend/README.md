# Frontend - DEVA Web UI

Read-heavy inspection and control interface for DEVA vigilance system.

## Purpose

Provides a dashboard for users to monitor threads, review alerts, and configure watchers. The frontend is **not a system of record**—all authoritative state lives in backend events.

## Responsibilities

### Display (Read-Heavy)
- Thread status, due boundaries, and urgency levels
- Alert history and notification delivery status
- Extracted signals (deadlines, risks, closures) with evidence
- Timeline of email activity per thread
- Watcher configuration and policy settings

### User Actions
- **Manual thread closure** - User can explicitly close threads
- **Watcher management** - Pause/resume watchers, update policies
- **Notification preferences** - Configure alert channels and recipients
- **Report generation** - Request on-demand reports

## Architecture

- **Communicates with backend** via REST API (and optional WebSocket)
- **Network-routed** - Configured via environment variables
- **Displays projections** - not authoritative state
- **All mutations** flow through backend event creation

### Network Configuration

**Configuration:** See `.env.example`

```bash
cp .env.example .env
```

**Key settings:**
- `VITE_API_URL` - Backend API URL (e.g., `http://localhost:3000`)
- `VITE_WS_URL` - WebSocket URL for real-time updates (optional)

**Example:**
- Frontend runs on: `http://localhost:5173`
- Calls backend at: `http://backend:3000/api`

## Design Principles

### Reassurance-First
Reports and dashboards emphasize:
1. What is **resolved or stable**
2. What **appears to be on track**
3. What **may require attention** (last, not first)

This reduces alert fatigue and builds confidence.

### Transparency
All displayed information is traceable:
- Every thread status links to specific events
- Every alert links to the state transition that triggered it
- Every extracted signal shows verbatim evidence from email

## Constraints

The frontend:
- ✅ **Displays** derived projections from backend API
- ✅ **Submits** user actions via API (which create events)
- ❌ **Never contains** business logic
- ❌ **Never accesses** database directly
- ❌ **Never emits** events (only backend does)

**All authoritative changes flow through backend event creation.**

## Status

**To be implemented**
