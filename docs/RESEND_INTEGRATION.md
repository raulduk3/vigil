# Resend Email Integration

Complete integration with [Resend](https://resend.com) for vigil.run email delivery.

## Domain Configuration

### Sending Domain: `vigil.run`

Outbound email addresses:
- `notifications@vigil.run` - Alerts and notifications
- `noreply@vigil.run` - Transactional (auth, password reset)
- `reports@vigil.run` - Scheduled reports and digests
- `system@vigil.run` - System notifications

### Ingestion Domain: `ingest.vigil.run`

Inbound email for watcher feeds:
- Format: `<watcher-name>-<token>@ingest.vigil.run`
- Example: `finance-alerts-abc123@ingest.vigil.run`

## DNS Records Required

### Resend (Sending)

Add these records in your DNS provider:

```
# SPF Record
TXT    vigil.run    "v=spf1 include:amazonses.com ~all"

# DKIM Record (get actual value from Resend dashboard)
TXT    resend._domainkey.vigil.run    <value from Resend>

# Return Path CNAME
CNAME  bounces.vigil.run    feedback-smtp.us-east-1.amazonses.com

# Custom tracking domain (optional)
CNAME  email.vigil.run    tracking.resend.com
```

### Cloudflare Email Routing (Ingestion)

```
# MX Records for ingest subdomain
MX    ingest.vigil.run    route1.mx.cloudflare.net    10
MX    ingest.vigil.run    route2.mx.cloudflare.net    20
MX    ingest.vigil.run    route3.mx.cloudflare.net    30

# SPF for ingest subdomain
TXT   ingest.vigil.run    "v=spf1 include:_spf.mx.cloudflare.net ~all"
```

## Environment Variables

```bash
# Required
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# Optional (defaults to vigil.run senders)
RESEND_FROM_EMAIL=notifications@vigil.run
RESEND_FROM_NAME=Vigil Alerts

# Webhook verification (from Resend dashboard)
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

## Webhook Setup

1. Go to [Resend Webhooks](https://resend.com/webhooks)
2. Create new webhook with URL: `https://api.vigil.run/api/webhooks/resend`
3. Select events:
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
   - `email.opened` (optional)
   - `email.clicked` (optional)
4. Copy signing secret to `RESEND_WEBHOOK_SECRET`

## Features

### Automatic Sender Selection

Email type determines sender address:
- Alerts → `notifications@vigil.run` (Vigil Alerts)
- Password Reset → `noreply@vigil.run` (Vigil)
- Reports/Digests → `reports@vigil.run` (Vigil Reports)

### Suppression List

Automatic suppression for:
- Hard bounces (invalid addresses)
- Spam complaints

Suppressed emails are logged and skipped on future sends.

### Email Statistics

Track delivery metrics:
- Sent count
- Delivered count
- Bounce count
- Complaint count
- Open rate (if tracking enabled)
- Click rate (if tracking enabled)

## Files

- `src/delivery/resend-config.ts` - Domain and sender configuration
- `src/delivery/resend-webhook.ts` - Webhook handler and suppression list
- `src/delivery/email.ts` - Core email sending functions
- `src/api/handlers/webhooks.ts` - Webhook HTTP endpoint
- `test/delivery/resend-webhook.test.ts` - Test suite (26 tests)

## API Endpoints

### POST /api/webhooks/resend

Receives Resend webhook events. No authentication required (verified by signature).

Headers:
- `svix-signature` - Webhook signature
- `svix-timestamp` - Request timestamp

Response:
```json
{
  "received": true,
  "event_type": "email.delivered",
  "email_id": "abc123",
  "action_taken": "logged"
}
```

## Testing

```bash
# Run delivery tests
bun test test/delivery

# Run just webhook tests
bun test test/delivery/resend-webhook.test.ts
```
