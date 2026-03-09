# Vigil Email Ingestion Worker

Cloudflare Worker that receives inbound email via Cloudflare Email Routing and forwards raw MIME to the Vigil backend.

## How It Works

1. User's Gmail/Outlook forwards to `*@vigil.run`
2. Cloudflare Email Routing catches all `@vigil.run` mail via MX records
3. Worker receives raw MIME email
4. Worker POSTs raw email to `{VIGIL_API_URL}/ingest/{local-part}`
5. Backend parses MIME (via `postal-mime`), extracts token from local part, invokes agent

## Email Address Format

Watcher addresses look like: `name-TOKEN@vigil.run`

Example: `ricky-personal-watch-9uw05nk7@vigil.run`

The backend extracts the token suffix (`9uw05nk7`) from the full local part.

## Setup

### 1. Deploy Worker

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
```

### 2. Configure Email Routing

1. Cloudflare Dashboard → your domain → Email → Email Routing
2. Enable Email Routing (auto-adds MX records)
3. Routing rules → Catch-all → Send to Worker → `vigil-email-ingest`

### 3. Set Environment Variable

In `wrangler.toml` or Cloudflare Dashboard:

```
VIGIL_API_URL = "https://api.vigil.run"
```

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/health` | GET | Health check (returns API URL config) |
| `/test?token=TOKEN` | POST | Simulate email ingestion (forwards body as raw MIME) |
| `/` | GET | Service info |

## Development

```bash
npm run dev     # Local HTTP server (port 8787, no email handler)
npm run tail    # Stream live worker logs
```

## What the Worker Sends

```
POST {VIGIL_API_URL}/ingest/{full-local-part}
Content-Type: text/plain; charset=utf-8
X-Cloudflare-Email-From: sender@example.com
X-Cloudflare-Email-To: name-token@vigil.run
X-Cloudflare-Email-Size: 1234
User-Agent: Vigil-Cloudflare-Worker/1.0

<raw RFC 822 MIME email>
```

## Error Handling

Worker never rejects emails (avoids bounces). On failure, it logs the error and accepts silently. Backend errors are logged but don't bounce back to the original sender.
