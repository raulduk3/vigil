# Vigil

Open source, self-hosted AI email triage agent. Bring your own API key from OpenAI, Anthropic, or Google. Pick any model per watcher. You pay your provider directly, no markup.

Forward emails to Vigil. The agent reads each one, tracks conversation threads, builds persistent memory, and decides what to do. Most of the time it thinks and remembers quietly. When something genuinely requires your attention, it alerts you. No inbox access. No email bodies stored.

## Quick Start

Get running in under 5 minutes:

```bash
# Clone
git clone https://github.com/rickyalvarez/vigil.git
cd vigil

# Backend
cd backend
bun install
cp .env.example .env
# Fill in: JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, RESEND_API_KEY
# Generate secrets: openssl rand -base64 32
bun run dev

# Frontend (new terminal)
cd frontend
npm install
cp .env.local.example .env.local
npm run dev

# Open http://localhost:3000, create an account, add your API key, create a watcher
```

For email ingestion, deploy the Cloudflare Worker (see [Self-hosting](#self-hosting)).

## How It Works

```
Your email → forwarding rule → Cloudflare Worker → Backend Agent → Memory + Tools → You
```

1. Set a forwarding rule in Gmail/Outlook to your Vigil address
2. Cloudflare Worker receives the email and forwards raw MIME to the backend
3. The agent runs an 8-step invocation loop: load context → retrieve memories → get threads → parse email → build prompt → LLM call → execute tools → log
4. The agent decides: remember something, update a thread, send an alert, fire a webhook, or do nothing
5. Email body is discarded after processing. Only a SHA-256 hash is stored

## Models

Vigil supports 9 models across three providers. Pick any model per watcher.

| Model | Provider | Tier | ~Cost/Email | Max Tokens |
|-------|----------|------|-------------|------------|
| GPT-4.1 Nano | OpenAI | nano | $0.0001 | 1,024 |
| GPT-4.1 Mini | OpenAI | mini | $0.0025 | 1,024 |
| GPT-4o Mini | OpenAI | mini | $0.0006 | 1,024 |
| GPT-4.1 | OpenAI | standard | $0.008 | 2,048 |
| GPT-4o | OpenAI | standard | $0.010 | 2,048 |
| Claude Haiku 4 | Anthropic | mini | $0.004 | 1,024 |
| Claude Sonnet 4 | Anthropic | standard | $0.015 | 2,048 |
| Gemini 2.5 Flash | Google | mini | $0.0006 | 1,024 |
| Gemini 2.5 Pro | Google | standard | $0.010 | 2,048 |

Costs are approximate per-email at direct API rates. The multi-model pipeline uses a nano pre-screen gate before full triage, eliminating ~40% of LLM spend on ignorable email.

See [docs/MODELS.md](docs/MODELS.md) for the full breakdown.

## BYOK (Bring Your Own Key)

Vigil is BYOK-first. You bring your own OpenAI, Anthropic, or Google API key. Every watcher can use a different model from any provider.

- **Add keys** in the dashboard at `/account/keys` or via API (`POST /api/account/keys`)
- **Pick a model** per watcher in the watcher settings
- **Keys encrypted** at rest with AES-256-GCM. Never logged, never leave the server.
- **Full cost transparency**: every token, model call, and dollar is logged and visible in the dashboard
- **You pay your provider directly**. No middleman, no markup.

See [docs/BYOK.md](docs/BYOK.md) for details.

## Architecture

| Layer | Stack |
|-------|-------|
| **Email ingestion** | Cloudflare Email Routing → Worker → `/ingest/:token` |
| **Backend** | Bun + Hono + SQLite |
| **Agent engine** | Multi-model (OpenAI, Anthropic, Google), JSON mode, 8-step loop |
| **Memory** | SQLite FTS5, BM25 ranking, time-decay scoring |
| **Thread detection** | In-Reply-To header + subject normalization |
| **Pre-screen gate** | Nano model classifies email before full triage |
| **Alerts** | Resend API |
| **Frontend** | Next.js 14, three-panel dashboard |
| **Extension** | Chrome sidepanel for setup and watcher management |

### Agent Output Schema

Every agent invocation produces:

```json
{
  "email_analysis": { "summary": "...", "intent": "...", "urgency": 1-5, "entities": [] },
  "memory_append": "...",
  "thread_updates": [{ "thread_id": "...", "status": "...", "summary": "..." }],
  "actions": [{ "tool": "send_alert", "params": {} }]
}
```

### Pipeline

Mini/nano tier models use a classification pipeline: the model classifies the email, then deterministic logic maps classifications to actions (alerts, thread updates, memory). Standard/pro tier models use the full agent prompt and decide actions directly.

Ticks (scheduled checks) always use the cheapest nano model. Email triage and chat use the watcher's configured model.

## Self-hosting

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Node.js ≥ 18 (for frontend)
- A domain with [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- At least one API key: OpenAI, Anthropic, or Google
- [Resend](https://resend.com) API key (for outbound alert emails)

### Backend

```bash
cd backend
bun install
cp .env.example .env
# Required: JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL
bun run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev
```

### Cloudflare Worker

```bash
cd cloudflare-worker
# Edit wrangler.toml: set BACKEND_URL to your backend endpoint
npx wrangler deploy
```

Configure Cloudflare Email Routing to send to your worker. The worker forwards raw MIME to `BACKEND_URL/ingest/:token`. Each watcher has a unique ingest token generated on creation.

### Docker

```bash
docker compose up
```

See [docker-compose.yml](docker-compose.yml) for the full configuration.

### Environment Variables

See `backend/.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Auth token signing |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key for BYOK secrets |
| `RESEND_API_KEY` | Yes | Outbound alert emails |
| `RESEND_FROM_EMAIL` | Yes | From address for alerts |
| `VIGIL_MODEL` | No | Default model (default: `gpt-4.1-mini`) |
| `PORT` | No | Backend port (default: `4000`) |

## Project Structure

```
vigil/
├── backend/
│   ├── src/agent/          # Engine, tools, memory, prompts
│   │   ├── engine.ts       # 8-step invocation loop
│   │   ├── tools.ts        # send_alert, update_thread, ignore_thread, webhook
│   │   ├── memory.ts       # FTS5 search, BM25 ranking, time decay
│   │   └── prompts.ts      # System + trigger prompt construction
│   ├── src/api/            # Hono REST handlers
│   ├── src/auth/           # JWT + OAuth (Google, GitHub)
│   ├── src/db/             # SQLite client + schema
│   └── src/ingestion/      # Email pipeline, body prep, MIME parsing
├── frontend/               # Next.js 14 dashboard (App Router)
├── chrome-extension/       # Sidepanel: setup, chat, watcher overview
├── cloudflare-worker/      # MX-level email ingestion
├── skills/openclaw/        # OpenClaw agent skill
├── backend/promptfoo/      # LLM eval suite (promptfoo)
└── docs/                   # Architecture and reference docs
```

## OpenClaw Integration

Vigil ships with an [OpenClaw](https://openclaw.com) skill for querying watchers, threads, and memories from your assistant. See the `skills/openclaw/` directory for the skill definition and setup instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## License

**Business Source License 1.1** — source available, self-hosting permitted, no competing hosted service.

Converts to Apache 2.0 four years from each release date.

## Author

[Richard Álvarez](https://richardalvarez.info)
