# Vigil Email Ingestion Worker

Cloudflare Worker that receives emails from Cloudflare Email Routing and forwards them to the Vigil backend.

## Setup

### 1. Install Dependencies

```bash
cd cloudflare-worker
npm install
```

### 2. Configure Wrangler

Login to Cloudflare:
```bash
npx wrangler login
```

### 3. Deploy

```bash
npm run deploy
```

### 4. Configure Email Routing

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Go to **Email** → **Email Routing**
4. Enable Email Routing (adds MX records automatically)
5. Go to **Routing rules** → **Catch-all address**
6. Configure:
   - **Action**: Send to a Worker
   - **Destination**: `vigil-email-ingest`

### 5. Test

Send an email to `{your-watcher-token}@ingest.email.yourdomain.com`

Check worker logs:
```bash
npm run tail
```

## Development

Run locally (HTTP only, no email):
```bash
npm run dev
```

Test the HTTP endpoint:
```bash
curl http://localhost:8787/health
```

## Environment Variables

Set in `wrangler.toml` or via Cloudflare Dashboard:

| Variable | Description | Default |
|----------|-------------|---------|
| `VIGIL_API_URL` | Backend API URL | `https://api.vigil.run` |

## Email Address Format

Users forward emails to:
```
{ingest_token}@vigil.run
```

The worker extracts the token from the local part and POSTs the raw email to:
```
POST {VIGIL_API_URL}/ingest/{token}
```
