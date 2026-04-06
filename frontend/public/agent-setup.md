# Vigil — Agent Setup

Connect any AI agent to Vigil's email intelligence in under 2 minutes.

## What you need

1. A Vigil account — [sign up free](https://vigil.run/auth/register)
2. An API key — get one at [vigil.run/account/developer](https://vigil.run/account/developer)
3. A watcher — created automatically when you sign up

## Quick start

```bash
# Check your watcher status
curl -s https://api.vigil.run/api/watchers \
  -H "Authorization: Bearer vk_YOUR_KEY" | jq .

# Ask the agent a question
curl -s https://api.vigil.run/api/watchers/WATCHER_ID/invoke \
  -H "Authorization: Bearer vk_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "What needs my attention right now?"}'
```

## Available endpoints

| Endpoint | What it does |
|----------|-------------|
| `GET /api/watchers` | List your watchers |
| `GET /api/watchers/:id/threads` | Email threads with triage status |
| `POST /api/watchers/:id/invoke` | Chat with the agent (has full email context) |
| `GET /api/watchers/:id/memory` | What the agent remembers about your correspondences |
| `GET /api/watchers/:id/actions` | Actions the agent has taken |
| `GET /api/usage` | Cost and usage breakdown |

## Resources

- **CLI wrapper:** [vigil.run/vigil.sh](https://vigil.run/vigil.sh)
- **LLM context:** [vigil.run/llms.txt](https://vigil.run/llms.txt)

Any agent that can make HTTP calls can use Vigil: LangChain, CrewAI, AutoGen, Claude tool use, or plain cURL.

## How it works

Vigil never connects to your inbox. You set up email forwarding (or use the [Chrome extension](https://vigil.run/extension) for one-click Gmail/Outlook setup). Forwarded emails are triaged by an AI agent that maintains persistent memory across all your conversations. The agent tracks threads, detects obligations, and surfaces what matters.

## Auth

All endpoints require `Authorization: Bearer vk_...` header. Keys are scoped to your account.

## Docs

- [Watchers](https://vigil.run/learn/watchers) — configuring what the agent watches
- [Email setup](https://vigil.run/learn/email-ingestion) — forwarding configuration
- [The agent](https://vigil.run/learn/agent) — how triage and memory work
- [Integrations](https://vigil.run/learn/integrations) — framework examples
- [Security](https://vigil.run/learn/security) — privacy model and data handling

## Source

[github.com/raulduk3/vigil](https://github.com/raulduk3/vigil) (BSL 1.1)
