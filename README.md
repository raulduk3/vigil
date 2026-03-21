# Vigil

Open source AI email triage agent. Self-hosted, bring your own API key. Built as a research project exploring multi-model classification pipelines and LLM cost optimization.

Forward emails to Vigil. The agent reads each one, tracks conversation threads, builds persistent memory, and decides what to do. Most of the time it thinks and remembers quietly. Occasionally it alerts you when something genuinely requires attention. No inbox access. No email bodies stored.

See [white-doc.pdf](./white-doc.pdf) for a detailed write-up of the architecture and research findings.

## How it works

```
Your email → forwarding rule → Cloudflare Worker → Backend Agent → Memory + Tools → You
```

1. Set a forwarding rule in Gmail/Outlook to your Vigil address
2. Each email is received by a Cloudflare Worker and forwarded to the backend
3. The agent engine runs an 8-step invocation loop: load context → retrieve memories → get threads → parse email → build prompt → LLM call → execute tools → log
4. The agent decides: remember something, update a thread, send an alert, fire a webhook, or do nothing
5. Email body is discarded after processing. Only a SHA-256 hash is stored

## Architecture

| Layer | Stack |
|-------|-------|
| **Email ingestion** | Cloudflare Email Routing → Worker → `/ingest/:token` |
| **Backend** | Bun + Hono + SQLite |
| **Agent engine** | Multi-model (GPT-4.1, Gemini, Claude), JSON mode, 8-step loop |
| **Memory** | SQLite FTS5, BM25 ranking, time-decay scoring |
| **Thread detection** | In-Reply-To header + subject normalization |
| **Pre-screen gate** | Nano model classifies email before full triage |
| **Alerts** | Resend API |
| **Frontend** | Next.js 14, three-panel dashboard |
| **Extension** | Chrome sidepanel for setup and watcher management |

### Agent output schema

Every agent invocation produces:

```json
{
  "email_analysis": { "summary": "...", "intent": "...", "urgency": 1-5, "entities": [] },
  "memory_append": "...",
  "thread_updates": [{ "thread_id": "...", "status": "...", "summary": "..." }],
  "actions": [{ "tool": "send_alert", "params": {} }]
}
```

### Model economics

The pipeline uses multiple models by task complexity:

| Stage | Model | Typical cost |
|-------|-------|-------------|
| Pre-screen gate | gpt-4.1-nano | ~$0.0001/email |
| Full triage | gpt-4.1-mini | ~$0.0025/email |
| Scheduled tick | gpt-4.1-nano | ~$0.0007/tick |
| Chat / query | gpt-4.1-mini | ~$0.0011/message |
| Alternative | Gemini Flash / Claude Haiku | comparable |

Using BYOK (bring your own OpenAI/Anthropic/Google key), the entire system runs at direct API cost with no markup.

## Self-hosting

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Node.js ≥ 18 (for frontend)
- A domain with [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- OpenAI API key (or Anthropic / Google for alternative models)
- Resend API key (for outbound alert emails)

### Backend

```bash
cd backend
bun install
cp .env.example .env
# Fill in: OPENAI_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL
bun run src/index.ts
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Fill in: NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev
```

### Cloudflare Worker

```bash
cd cloudflare-worker
# Edit wrangler.toml: set BACKEND_URL to your backend endpoint
npx wrangler deploy
```

Configure Cloudflare Email Routing to send to your worker. The worker forwards raw MIME to `BACKEND_URL/ingest/:token`. Each watcher has a unique ingest token generated on creation.

### Environment variables

**Backend** (`.env`):
```
PORT=3001
SQLITE_PATH=./data/vigil.db
JWT_SECRET=
JWT_REFRESH_SECRET=
OPENAI_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Project structure

```
vigil/
├── backend/
│   ├── src/agent/          # Engine, tools, memory, prompts
│   │   ├── engine.ts       # 8-step invocation loop
│   │   ├── tools.ts        # send_alert, update_thread, ignore_thread, webhook
│   │   ├── memory.ts       # FTS5 search, BM25 ranking, time decay
│   │   └── prompts.ts      # System + trigger prompt construction
│   ├── src/api/            # Hono REST handlers (56 endpoints)
│   ├── src/auth/           # JWT + OAuth (Google, GitHub)
│   ├── src/db/             # SQLite client + schema
│   └── src/ingestion/      # Email pipeline, body prep, MIME parsing
├── frontend/               # Next.js 14 dashboard (App Router)
├── chrome-extension/       # Sidepanel: setup, chat, watcher overview
├── cloudflare-worker/      # MX-level email ingestion
├── backend/promptfoo/      # LLM eval suite (promptfoo)
└── docs/                   # Architecture notes
```

## Research notes

The main areas of interest explored in this project:

- **Multi-model routing**: cheap nano/mini models for classification, heavier models only for complex reasoning
- **Pre-screen gate**: a single nano call before full triage eliminates ~40% of LLM spend on clearly ignorable email
- **Memory retrieval**: BM25 + time-decay for per-watcher context retrieval without embeddings
- **Thread detection**: heuristic-based grouping (In-Reply-To + normalized subject) without ML
- **Cost transparency**: every token, model call, and dollar is logged and visible in the dashboard

See `backend/promptfoo/` for the eval suite used to benchmark triage quality across models.

## License

**Business Source License 1.1** — source available, self-hosting permitted, no competing hosted service.

Converts to Apache 2.0 four years from each release date.

## Author

[Richard Álvarez](https://richardalvarez.info)
