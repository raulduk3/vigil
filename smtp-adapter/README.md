# SMTP Adapter - DEVA Email Ingress

Lightweight, non-authoritative SMTP adapter for email ingestion. This component is a **transparent transport layer** with zero business logic.

## Purpose

Receives emails via SMTP and forwards them to the backend control plane for processing.

## Responsibilities

1. **Listen** for SMTP connections on configured port (default: 2525)
2. **Accept** email delivery
3. **Extract** watcher address from recipient (`<name>-<token>@ingest.deva.email`)
4. **Forward** raw email bytes to backend ingestion endpoint via HTTP POST

## Architecture

- **Network-routed** - Can run on same machine as backend but communicates over HTTP
- **Stateless** - No persistent storage
- **Non-authoritative** - Never makes decisions or applies business logic

## Network Configuration

The SMTP adapter forwards emails to the backend API.

**Configuration:** See `.env.example`

```bash
cp .env.example .env
```

**Key settings:**
- `SMTP_PORT` - Port to listen for SMTP connections (default: 2525)
- `BACKEND_API_URL` - Backend ingestion endpoint (e.g., `http://backend:3000`)
- `BACKEND_API_KEY` - Authentication key for backend

**Example setup:**
- SMTP Adapter listens on: `0.0.0.0:2525`
- Forwards to: `http://backend:3000/api/ingestion/email`
- External MX records point to: `smtp-adapter.yourdomain.com:2525`

## Email Flow

```
External Sender
    ↓
SMTP Server (Port 2525)
    ↓
Extract watcher address
    ↓
HTTP POST to backend
    ↓
Backend creates EMAIL_RECEIVED event
```

## Constraints

The SMTP adapter:
- ✅ **Forwards** raw email bytes
- ✅ **Routes** by email address only
- ❌ **Never stores** emails persistently
- ❌ **Never applies** business logic
- ❌ **Never emits** events (only backend does)
- ❌ **Never parses** email content for routing

Email delivery is **best-effort and advisory**.

## Status

**To be implemented**
