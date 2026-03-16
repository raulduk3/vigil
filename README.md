# Vigil

**An autonomous email agent. Forward your email. Vigil handles the rest.**

Vigil reads your email 24/7, remembers every conversation, and only interrupts you when something actually needs your attention. No inbox access. No email bodies stored. About 0.25¢ per email on the default model (GPT-4.1-mini), or self-host it for free.

## What it does

- Reads and analyzes every forwarded email (summary, intent, urgency, entities)
- Groups emails into conversation threads automatically
- Builds persistent memory across all emails (sender patterns, deadlines, preferences)
- Alerts you only when something genuinely needs action (deadline approaching, thread gone cold, obligation detected)
- Fires webhooks, sends notifications, or triggers any API you connect
- Each watcher runs its own agent with its own prompt, memory, and tools

## Architecture

```
Your email → forwarding rule → Cloudflare Worker → Vigil Backend → Agent → You
```

- **Backend**: Bun + Hono, SQLite, multi-model agent engine (GPT-4.1, Gemini, Claude)
- **Frontend**: Next.js, three-panel dashboard
- **Email**: Cloudflare Email Routing + Workers
- **Alerts**: Resend API
- **Billing**: Stripe metered usage
- **Extension**: Chrome sidepanel for setup and watcher management

## Self-hosting

```bash
# Backend
cd backend
bun install
cp .env.example .env  # Add your OpenAI key, JWT secrets, etc.
bun run src/index.ts

# Frontend
cd frontend
npm install
npm run dev
```

You need:
- An OpenAI API key (or Anthropic/Google for other models)
- A domain with Cloudflare email routing (for receiving forwarded email)
- Resend API key (for sending alert emails)

See [CLAUDE.md](CLAUDE.md) for full setup details.

## Hosted version

**[vigil.run](https://vigil.run)** — managed service, no setup required.

- 50 emails free to start
- ~0.25¢ per email after that (GPT-4.1-mini + 5% margin)
- Chrome extension for 30-second Gmail/Outlook setup
- No credit card to start

## Project structure

```
vigil.run/
├── backend/              # Bun + Hono API server
│   ├── src/agent/        # Engine, tools, memory, prompts
│   ├── src/api/          # Routes + handlers (56 endpoints)
│   ├── src/auth/         # JWT + OAuth (Google, GitHub)
│   ├── src/db/           # SQLite client + schema
│   └── src/ingestion/    # Email pipeline
├── frontend/             # Next.js dashboard (27 pages)
├── chrome-extension/     # Sidepanel: setup, chat, overview
├── cloudflare-worker/    # Email ingestion worker
└── docs/                 # Architecture docs
```

## License

**Business Source License 1.1** (BSL)

Source code is available. You can read it, modify it, self-host it for personal or internal business use, and contribute back.

You cannot use it to run a competing hosted email monitoring service.

After 4 years from each release, the code converts to Apache 2.0.

See [LICENSE](LICENSE) for the full terms.

## Contributing

Contributions welcome. Bug fixes, feature improvements, documentation, and integrations are all appreciated. By contributing, you agree that your contributions are licensed under the same BSL 1.1 terms.

## Contact

- Website: [vigil.run](https://vigil.run)
- Email: ricky@vigil.run
- Author: [Richard Álvarez](https://richardalvarez.info)
