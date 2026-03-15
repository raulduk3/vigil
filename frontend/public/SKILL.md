---
name: vigil
description: Query and control Vigil email watchers via API. Check inbox, obligations, threads, memories, tools, and chat with the agent. Use when asked about email, deadlines, obligations, or anything the email agent monitors.
---

# Vigil — Email Agent

API: `https://api.vigil.run`
Auth: `Authorization: Bearer <your-api-key>`

Get your API key at: https://vigil.run/account/developer
Get your watcher ID from the dashboard URL.

## Setup

```bash
curl -s https://vigil.run/vigil.sh -o vigil.sh
chmod +x vigil.sh
# Edit vigil.sh: set VK and WATCHER at the top
```

## Commands

| Command | Description |
|---------|-------------|
| `./vigil.sh status` | Inbox overview: email count, alerts, costs, active threads |
| `./vigil.sh emails [n]` | List recent emails with triage status (default 10) |
| `./vigil.sh threads [status]` | List threads by status: active, watching, ignored, resolved |
| `./vigil.sh obligations` | Ask the agent what needs attention right now |
| `./vigil.sh chat "message"` | Talk to the agent (can take actions, add rules, modify behavior) |
| `./vigil.sh usage` | Full cost and usage breakdown |
| `./vigil.sh memories` | List agent memories with importance levels |
| `./vigil.sh tools` | List custom webhook tools configured on the watcher |

## API Endpoints

All endpoints use `Authorization: Bearer vk_...`

### Watchers
- `GET /api/watchers` — list watchers
- `POST /api/watchers` — create watcher `{ name, system_prompt }`
- `GET /api/watchers/:id` — watcher detail
- `PATCH /api/watchers/:id` — update watcher `{ system_prompt, model, ... }`

### Threads
- `GET /api/watchers/:id/threads` — list email threads
- `GET /api/watchers/:id/threads/:threadId` — thread detail

### Agent
- `POST /api/watchers/:id/invoke` — chat `{ message: "..." }`
- `GET /api/watchers/:id/memory` — agent memories
- `GET /api/watchers/:id/actions` — action history

### Account
- `GET /api/usage` — cost and usage
- `GET /api/keys` — API keys

## Integration

Works with any system that can make HTTP calls: LangChain, CrewAI, AutoGen, MCP, cron jobs, custom scripts.

Full docs: https://vigil.run/learn/integrations
