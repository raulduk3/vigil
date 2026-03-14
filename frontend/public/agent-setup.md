# Vigil — Email Agent Setup

Point any AI agent system (OpenClaw, LangChain, CrewAI, etc.) at this file to give it email awareness.

## What This Does

Vigil monitors email on behalf of your users (or you). Forward emails to a Vigil watcher address. An AI agent reads each one, tracks obligations, remembers context, and takes action via tools (alerts, webhooks, custom integrations).

This file tells your agent how to connect.

## Quick Setup (OpenClaw)

Run these commands:

```bash
# Create the skill directory
mkdir -p ~/.openclaw/skills/vigil/scripts

# Download the skill files
curl -s https://vigil.run/SKILL.md -o ~/.openclaw/skills/vigil/SKILL.md
curl -s https://vigil.run/vigil.sh -o ~/.openclaw/skills/vigil/scripts/vigil.sh
chmod +x ~/.openclaw/skills/vigil/scripts/vigil.sh
```

Then edit `~/.openclaw/skills/vigil/scripts/vigil.sh` and set your API key and watcher ID at the top.

Get your API key at: https://vigil.run/account/developer
Get your watcher ID from the dashboard URL.

## Quick Setup (Any Agent)

Your agent needs two things:

1. **API Key** — `Authorization: Bearer vk_...`
2. **Watcher ID** — the UUID of the watcher to query

Then call these endpoints:

| What | Method | Endpoint |
|------|--------|----------|
| Check inbox | GET | `/api/watchers/{id}/threads` |
| Check obligations | POST | `/api/watchers/{id}/invoke` with `{"message": "What needs attention?"}` |
| Chat with agent | POST | `/api/watchers/{id}/invoke` with `{"message": "your command"}` |
| Get memories | GET | `/api/watchers/{id}/memory` |
| Get actions | GET | `/api/watchers/{id}/actions` |
| Account usage | GET | `/api/usage` |
| List custom tools | GET | `/api/watchers/{id}/tools` |

Base URL: `https://api.vigil.run`

## Chat Commands

Through the chat endpoint, your agent can control Vigil with natural language:

- "What emails need my attention?" — summarizes obligations
- "Ignore all emails from github.com" — ignores threads + adds rule
- "Resolve the payment thread" — closes a thread
- "Never alert me about receipts" — adds persistent rule
- "Be more aggressive about deadlines" — modifies agent behavior
- "Fire the Slack webhook when a client mentions a deadline" — configures tool behavior

## Custom Tools

Vigil agents can fire webhooks to any system. Create custom tools via the API or dashboard:

```bash
# Create a custom tool
curl -X POST https://api.vigil.run/api/watchers/{id}/tools \
  -H "Authorization: Bearer vk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "notify_slack",
    "description": "Send a message to Slack when something needs attention",
    "webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "parameter_schema": {
      "message": {"type": "string", "description": "What to send"},
      "urgency": {"type": "string", "description": "low, normal, or high"}
    }
  }'
```

The agent sees custom tools alongside built-in tools and uses them based on your prompt. When it decides to fire `notify_slack`, Vigil POSTs structured data to your webhook:

```json
{
  "event": "tool_execution",
  "tool": "notify_slack",
  "watcher": {"id": "...", "name": "Work"},
  "params": {"message": "Client deadline tomorrow", "urgency": "high"},
  "timestamp": "2026-03-14T..."
}
```

## Webhook Payload Format

All webhooks (built-in and custom) receive:

```json
{
  "event": "tool_execution",
  "tool": "tool_name",
  "watcher": {"id": "watcher_id", "name": "Watcher Name"},
  "thread": {"id": "thread_id", "subject": "Email Subject", "status": "active"},
  "email": {"from": "sender@example.com", "subject": "...", "received_at": "..."},
  "params": { ... },
  "timestamp": "ISO-8601"
}
```

Verify authenticity with the `X-Vigil-Signature` HMAC-SHA256 header.

## Getting Started

1. Sign up at https://vigil.run/auth/register
2. Create a watcher (give it a name and prompt)
3. Set up email forwarding to your watcher address
4. Create an API key at https://vigil.run/account/developer
5. Connect your agent using the setup above

## Pricing

Pay per use. No subscriptions.
- $0.001 platform fee per invocation
- Token cost varies by model (9 models, 3 providers)
- $0.005 per alert email sent
- 50 free emails to start

Full pricing: https://vigil.run/pricing
