# Vigil

**An email agent that never sees your inbox.**

Forward emails to Vigil. It watches your threads, remembers context, and alerts you when something needs attention. No OAuth. No inbox access. No email content stored.

## How It Works

1. Set up a forwarding rule in your email client
2. Vigil receives your emails at `yourname@vigil.run`
3. An AI agent reads each email, tracks the conversation, and decides what to do
4. You get alerts when threads need your attention
5. Email content is processed in memory and never stored

## Architecture

- **Email ingestion:** Cloudflare Email Routing → Worker
- **Agent engine:** LLM-powered agent with semantic memory and configurable tools
- **Data store:** SQLite (metadata only, no email bodies)
- **Alerts:** Resend API
- **Frontend:** Next.js 14

See [docs/V2_ARCHITECTURE.md](docs/V2_ARCHITECTURE.md) for full technical spec.

## Development

```bash
cd backend
cp .env.example .env
bun install
bun run dev
```

## Status

V2 migration in progress. Branch: `v2-agent-architecture`.

## License

Proprietary. All rights reserved.
