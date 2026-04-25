# PRODUCT.md — Vigil

## What It Is

Vigil is a headless email intelligence service. Forward emails to a watcher. The watcher reads them, builds memory, tracks threads, and answers questions. BYOK for cost isolation. API-first so other agents can consume it.

## Who It's For

Anyone who needs AI to process email at scale and surface what matters. MSPs tracking technician-client correspondence. Executives monitoring vendor communications. Operations teams watching compliance threads. Agent platforms (like OpenClaw) that need email intelligence as a capability.

## What It Does

1. **Ingest** — Forward emails from any provider to a watcher's address. Watcher processes them, discards the body, keeps only what it learned.
2. **Remember** — Persistent memory per watcher. Tracks people, patterns, response times, obligations, tone. Searchable via BM25 + FTS5.
3. **Report** — Automated daily/weekly digests. On-demand summaries. The watcher tells you what matters without you asking.
4. **Chat** — Ask the watcher questions about what it's seen. "How fast is Jake responding to Acme?" "What's the status of the permit application?" "Summarize last week's vendor issues."

## What It Doesn't Do

- Replace your inbox
- Send emails on your behalf
- Require inbox access or OAuth to your email provider
- Store email bodies (only memory, analysis, and hashes)

## Architecture

```
Email → Cloudflare Worker → Backend API → Agent Engine → Memory + Threads
                                              ↕
                                         Chat / Digest / Query
                                              ↕
                                    Dashboard (simple read view)
                                    API (for other agents)
```

**Watcher** = an ingestion point with its own email address, memory, threads, and model config. Each watcher has its own BYOK key and token budget. Cost isolation is per-watcher.

## API Surface

| Endpoint | Purpose |
|---|---|
| `POST /ingest/:token` | Receive forwarded email |
| `GET /watchers` | List watchers |
| `POST /watchers` | Create watcher |
| `POST /watchers/:id/invoke` | Chat with a watcher |
| `GET /watchers/:id/digest` | Get summary/report |
| `GET /watchers/:id/memory` | Read watcher memory |
| `GET /watchers/:watcherId/threads` | List email threads |
| `GET /health` | Service health check |

Auth: API key (`vk_` prefix) for programmatic access. Magic link email for dashboard login. No passwords.

## Frontend

A simple dashboard for end users who receive digests and want to dig deeper.

1. **Watchers list** — your watchers, their status, email count, last activity
2. **Watcher detail** — threads, memory, recent actions, cost
3. **Chat** — talk to the watcher about what it knows
4. **Digests** — read generated reports

End users also interact through:
- **Email digests** — daily/weekly summaries delivered to their inbox
- **Alert emails** — urgent items surface automatically with one-click thread actions
- **Thread action links** — HMAC-signed, no login required to acknowledge or resolve

The dashboard supplements the email-delivered intelligence. Most users should be able to get value without ever logging in.

## Models

BYOK. Pick any supported model per watcher. Nano for cheap bulk processing, standard for deep analysis. Provider SDKs for OpenAI, Anthropic, Google.

## Integration

Other agents create and query watchers via API. OpenClaw can spin up a watcher, give a user the forwarding address, and query the watcher's intelligence without burning its own token budget on email processing.

## Constraints

- Email bodies are never persisted
- Agent decides what to remember
- Tools are the only way the agent affects the outside world
- Frontend is read-only display — all mutations go through the API
