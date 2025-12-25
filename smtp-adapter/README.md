# SMTP Adapter - Vigil Email Ingress

**Lightweight SMTP Server for Email Ingestion**

Non-authoritative SMTP adapter that receives emails and forwards them to the backend control plane. This component is a **transparent transport layer** with zero business logic.

## SDD Traceability

The [Software Design Document (SDD)](../docs/SDD.md) is the **authoritative source of truth** for all system requirements. This SMTP adapter implements the following requirements:

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| Email Reception | FR-5 (Email Ingestion) |
| Address Parsing | MR-BackendIngestion-1 (partial) |
| Backend Forwarding | MR-BackendIngestion-3 (deduplication key) |
| Stateless Design | FR-16 (Delegated Vigilance), CONS-1 (Events Source of Truth) |
| Infrastructure | IR-8, IR-9 |

See [SDD Section 5: Implementation Coverage Table](../docs/SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Implementation Coverage Contribution

This component contributes **~5%** of overall project implementation. The SMTP adapter is a transparent transport layer with zero business logic.

### Coverage by Category

| Category | SMTP Adapter Owns | Total in SDD | Coverage |
|----------|-------------------|--------------|----------|
| Feature Requirements (FR) | 1 of 22 | 22 | 5% |
| Module Requirements (MR) | 0 of 26 | 26 | 0% |
| Infrastructure (IR) | 2 of 24 | 24 | 8% |

### SMTP Adapter-Owned Requirements

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| FR-5 (transport) | Accept SMTP delivery | SMTP listener on port 25/587/2525 |
| IR-8 | SMTP Port Configuration | `SMTP_PORT` env variable |
| IR-9 | SMTP Forwarding Latency | < 1 second to backend |

### SMTP Adapter Forwards To (Backend Only)

```
External MTA
     │
     ↓ SMTP (port 25)
SMTP Adapter
     │
     ↓ HTTP POST /api/ingestion/email
Backend (Authoritative)
     │
     ├── Emits MESSAGE_RECEIVED event
     ├── Validates sender (allowlist)
     ├── Calls LLM Service
     └── Emits extraction events
```

### SMTP Adapter Does NOT:

- ❌ Emit events (backend does)
- ❌ Store emails
- ❌ Parse email content for routing
- ❌ Validate sender allowlists
- ❌ Call LLM service
- ❌ Make any business decisions

---

## Working with Agents

This section guides AI agents implementing discrete features within the SMTP adapter.

### Before Starting Any Feature

1. **Confirm the feature belongs in SMTP adapter** (most logic belongs in backend)
2. **Review IR-8, IR-9 requirements** for infrastructure constraints
3. **Understand the boundary:** Forward only, never process

### Feature Implementation Checklist

```
□ Confirm feature is transport-layer (not business logic)
□ Review SMTP RFC compliance requirements
□ Implement in src/
□ Test with mock SMTP client
□ Verify backend integration (HTTP POST)
□ Run `npm test`
```

### Discrete Feature Examples

| Feature | SDD Requirement | Files to Modify | Backend Contract |
|---------|-----------------|-----------------|------------------|
| SMTP listener | IR-8 | `src/server.ts` | None |
| Address parsing | FR-5 | `src/parser.ts` | `ingest_token` extraction |
| HTTP forwarding | IR-9 | `src/forwarder.ts` | `POST /api/ingestion/email` |
| TLS support | IR-14 | `src/server.ts` | None |
| Rate limiting | IR-7 (partial) | `src/server.ts` | Connection throttling |

### SMTP Server Pattern

```typescript
// src/server.ts
import { SMTPServer } from "smtp-server";

const server = new SMTPServer({
  onData(stream, session, callback) {
    // Collect raw email bytes
    const chunks: Buffer[] = [];
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end", async () => {
      const rawEmail = Buffer.concat(chunks).toString();
      const recipient = session.envelope.rcptTo[0].address;
      
      // Forward to backend (ONLY action we take)
      const result = await forwardToBackend(recipient, rawEmail);
      
      if (result.ok) {
        callback(null); // 250 OK
      } else {
        callback(new Error(result.error)); // 4xx/5xx
      }
    });
  },
});
```

### Forwarding Pattern

```typescript
// src/forwarder.ts
export async function forwardToBackend(
  recipientAddress: string,
  rawEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const ingestToken = parseIngestToken(recipientAddress);
  
  const response = await fetch(`${BACKEND_URL}/api/ingestion/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BACKEND_API_KEY}`,
    },
    body: JSON.stringify({
      ingest_token: ingestToken,
      recipient_address: recipientAddress,
      raw_email: rawEmail,
    }),
  });
  
  if (response.ok) {
    return { ok: true };
  }
  return { ok: false, error: await response.text() };
}
```

## Purpose

Receives emails via SMTP and forwards them to the backend for processing. The SMTP adapter is the entry point for email into the Vigil system.

## Responsibilities

1. **Listen** for SMTP connections on configured port (default: 2525)
2. **Accept** email delivery to `*@ingest.vigil.email` addresses
3. **Extract** watcher address from recipient (`<name>-<token>@ingest.vigil.email`)
4. **Validate** ingest_token format (basic syntax check)
5. **Forward** raw email bytes to backend ingestion endpoint via HTTP POST
6. **Report** delivery status back to sending MTA

## Architecture

- **Network-routed** - Communicates with backend over HTTP (not local function call)
- **Stateless** - No persistent storage, no message queuing
- **Non-authoritative** - Never makes decisions or applies business logic
- **Load-balanced** - Multiple instances can receive any email

## Email Flow

```
External Email Sender
    ↓
MX Record: ingest.vigil.email → SMTP Adapter(s)
    ↓
SMTP Adapter (Port 25/587/2525)
    ↓
Extract recipient: finance-a7f3k9@ingest.vigil.email
    ↓
Parse ingest_token: a7f3k9
    ↓
HTTP POST to Backend: /api/ingestion/email
    Body: { token: "a7f3k9", raw_email: "..." }
    ↓
Backend creates MESSAGE_RECEIVED event
    ↓
Backend orchestrates LLM extraction
    ↓
250 OK response to sending MTA
```

## Network Configuration

**Configuration:** See `.env.example`

```bash
cp .env.example .env
```

**Key Environment Variables:**
```bash
# SMTP Server
SMTP_PORT=2525
SMTP_HOST=0.0.0.0

# Backend Connection
BACKEND_API_URL=http://backend:3000
BACKEND_API_KEY=your-api-key

# TLS (Production)
TLS_CERT_PATH=/etc/ssl/certs/smtp.crt
TLS_KEY_PATH=/etc/ssl/private/smtp.key

# Limits
MAX_MESSAGE_SIZE_MB=25
CONNECTION_TIMEOUT_SEC=60
```

**Example Production Setup:**
- MX record: `ingest.vigil.email → smtp-01.vigil.email, smtp-02.vigil.email`
- SMTP Adapter listens on: `0.0.0.0:25` (standard SMTP)
- Forwards to: `http://backend-internal:3000/api/ingestion/email`
- TLS: STARTTLS on port 25, implicit TLS on port 465

## API Contract with Backend

### Request
```
POST /api/ingestion/email
Content-Type: application/json
Authorization: Bearer {BACKEND_API_KEY}

{
  "ingest_token": "a7f3k9",
  "recipient_address": "finance-a7f3k9@ingest.vigil.email",
  "raw_email": "From: alice@example.com\r\nTo: finance-a7f3k9@ingest.vigil.email\r\n..."
}
```

### Response
```
200 OK: Email accepted, MESSAGE_RECEIVED event created
400 Bad Request: Invalid email format
401 Unauthorized: Invalid API key
404 Not Found: Invalid ingest_token (watcher not found)
429 Too Many Requests: Rate limited
500 Internal Server Error: Backend processing failed
```

### SMTP Response Mapping
- `200 OK` → `250 2.0.0 OK: Message accepted`
- `400 Bad Request` → `550 5.7.1 Invalid message format`
- `404 Not Found` → `550 5.1.1 User unknown`
- `429 Rate Limited` → `451 4.7.1 Try again later`
- `500 Error` → `451 4.3.0 Internal error, try again`

## Constraints

The SMTP adapter:
- ✅ **Forwards** raw email bytes (preserves original)
- ✅ **Routes** by recipient address only
- ✅ **Reports** delivery status to sending MTA
- ❌ **Never stores** emails persistently
- ❌ **Never queues** messages (synchronous forwarding)
- ❌ **Never applies** business logic
- ❌ **Never emits** events (only backend emits events)
- ❌ **Never parses** email content for routing decisions
- ❌ **Never validates** sender (backend handles allowlists)

**Routing is determined solely by recipient address.** Email content is never examined.

## Message Non-Persistence

**Critical:** This adapter does NOT persist email content. Emails are forwarded synchronously to the backend, which:
1. Parses email for metadata (from, subject, headers)
2. Sends body to LLM service for extraction
3. Discards body after extraction events are created

**If a watcher misses an email** (e.g., watcher paused, sender not in allowlist, adapter down), the sender must **resend the email** and clearly label it as forwarded or resent. The system cannot recover missed emails.

**Rationale:** This constraint preserves state machine integrity and minimizes PII storage.

## SDD References

- **Feature Requirements:** FR-5 (Email Ingestion)
- **Infrastructure Requirements:** IR-2 (SMTP Port Configuration), IR-11 (TLS Encryption)
- **Module Requirements:** Documented in SYSTEM_DESIGN.md Section 4.1

## Structure

```
smtp-adapter/
├── src/
│   ├── main.ts           # SMTP server entry point
│   ├── server.ts         # SMTP connection handling
│   ├── forwarder.ts      # HTTP forwarding to backend
│   └── parser.ts         # Address parsing utilities
├── tests/
│   ├── server.test.ts
│   └── parser.test.ts
├── .env.example
├── Dockerfile
├── package.json
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Deployment

### Docker
```bash
docker build -t vigil-smtp-adapter .
docker run -p 2525:2525 vigil-smtp-adapter
```

### Production Checklist
- [ ] MX records configured for `ingest.vigil.email`
- [ ] TLS certificates installed
- [ ] SPF/DKIM/DMARC configured for outbound (error notifications)
- [ ] Rate limiting configured
- [ ] Health check endpoint available
- [ ] Multiple instances behind load balancer
- [ ] Firewall allows inbound port 25/587

### Health Check
```
GET /health
200 OK: {"status": "healthy", "backend_reachable": true}
503 Service Unavailable: {"status": "unhealthy", "error": "..."}
```

## Status

**To be implemented**

### Implementation Checklist
- [ ] SMTP server (Node.js smtp-server or Python aiosmtpd)
- [ ] Address parsing and token extraction
- [ ] HTTP forwarding to backend
- [ ] TLS/STARTTLS support
- [ ] Health check endpoint
- [ ] Docker deployment
- [ ] Rate limiting
- [ ] Connection timeout handling
