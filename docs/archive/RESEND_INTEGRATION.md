# Resend Email Integration

Vigil uses [Resend](https://resend.com) for outbound alert delivery.

## Domain

**Verified domain:** `vigil.run`

**Sending address:** `notifications@vigil.run` (configured via `RESEND_FROM_EMAIL`)

DNS records (SPF, DKIM, return path) configured in Cloudflare for `vigil.run`. Verified in Resend dashboard.

## How Alerts Get Sent

1. Agent engine invokes `send_alert` tool with subject/body/urgency
2. Tool handler (`src/agent/tools.ts`) calls Resend API
3. Email sent from `Vigil <notifications@vigil.run>` to account owner
4. Also sent to any configured email channels on the watcher

## Environment

```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@vigil.run
```

## Alert Email Format

HTML email with:
- Watcher name in header
- Urgency-colored border (red=high, blue=normal, gray=low)
- Agent-written alert body
- Footer with urgency level

Template in `src/agent/tools.ts` → `buildAlertHtml()`.

## Email Routing (Inbound)

Inbound email (`*@vigil.run`) is handled by **Cloudflare Email Routing**, not Resend.

```
Inbound:  *@vigil.run → Cloudflare MX → Worker → Backend
Outbound: Backend → Resend API → notifications@vigil.run → User's inbox
```

## Future

- Webhook events (bounce/complaint tracking)
- Suppression list for hard bounces
- Additional sender addresses (noreply@, reports@)
- Delivery status tracking in actions table
