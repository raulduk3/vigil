---
name: vigil
description: Query and control Vigil email watchers. Check inbox, obligations, threads, memories, custom tools. Use when the user asks about email, deadlines, obligations, or anything their email agent monitors.
metadata:
  openclaw:
    emoji: "👁️"
---

# Vigil — Email Agent

API: `https://api.vigil.run`
Auth: `Authorization: Bearer <your-api-key>`

Get your API key at: https://vigil.run/account/developer
Get your watcher ID from the dashboard URL.

## Setup

Edit `scripts/vigil.sh` and set `VK` and `WATCHER` at the top.

## Commands

| Command | Description |
|---------|-------------|
| `vigil.sh status` | Inbox overview: emails, alerts, costs, active threads |
| `vigil.sh emails [n]` | List recent emails with triage status (default 10) |
| `vigil.sh threads [status]` | List threads by status: active, watching, ignored, resolved |
| `vigil.sh obligations` | Ask the agent what needs attention right now |
| `vigil.sh chat "message"` | Talk to the agent — can take actions, add rules, change behavior |
| `vigil.sh usage` | Full cost and usage breakdown |
| `vigil.sh memories` | List agent memories with importance levels |
| `vigil.sh tools` | List custom tools configured on the watcher |

Script path: `~/.openclaw/skills/vigil/scripts/vigil.sh`

## When to use

- "Check my email" / "Any new emails?" → `vigil.sh status`
- "What obligations do I have?" / "Am I forgetting anything?" → `vigil.sh obligations`
- "Tell Vigil to ignore GitHub" → `vigil.sh chat "ignore all GitHub emails"`
- "How much has Vigil cost?" → `vigil.sh usage`
- "What does Vigil remember?" → `vigil.sh memories`
- "What tools are set up?" → `vigil.sh tools`

## Full docs

https://vigil.run/learn/integrations
https://vigil.run/learn/actions
