---
name: vigil
description: Query and control Vigil email watchers via API key. Check inbox, obligations, threads, memories, tools, and chat with the agent. Use when the user asks about email, obligations, deadlines, or anything Vigil watches.
metadata:
  openclaw:
    emoji: "👁️"
---

# Vigil Integration

Manage Vigil email watchers from OpenClaw. Authenticated via API key (`vk_`).

## Setup

1. **Install the skill** (symlink recommended so updates pull automatically):
   ```bash
   ln -s /path/to/vigil/skills/openclaw ~/.openclaw/skills/vigil
   ```

2. **Set environment variables** (add to your shell profile or OpenClaw config):
   ```bash
   export VIGIL_API_KEY="vk_your_key_here"       # Required — get from https://vigil.run/settings
   export VIGIL_API_URL="https://api.vigil.run"   # Optional — defaults to https://api.vigil.run
   export VIGIL_WATCHER_ID="your-watcher-uuid"    # Optional — auto-detects first watcher
   ```

## Commands

| Command | Description |
|---------|-------------|
| `vigil.sh status` | Inbox overview: email count, alerts, costs, active/watching threads |
| `vigil.sh emails [n]` | List recent emails with triage status (default 10) |
| `vigil.sh threads [status]` | List threads by status: active, watching, ignored, resolved |
| `vigil.sh obligations` | Ask the agent what needs attention right now |
| `vigil.sh chat "message"` | Talk to the Vigil agent (can take actions, add rules) |
| `vigil.sh usage` | Full cost and usage breakdown |
| `vigil.sh memories` | List agent memories with importance levels |
| `vigil.sh tools` | List custom tools configured on the watcher |
| `vigil.sh models` | List available AI models |
| `vigil.sh config` | Show all watcher configurations |
| `vigil.sh set-model <id> <model>` | Change a watcher's AI model |
| `vigil.sh flush [watcher_id]` | Flush all threads, emails, and memories |

Script path: `~/.openclaw/skills/vigil/scripts/vigil.sh`

## When to use

- "Check my email" / "Any new emails?" → `vigil.sh status` or `vigil.sh emails`
- "What obligations do I have?" → `vigil.sh obligations`
- "Tell Vigil to ignore GitHub" → `vigil.sh chat "ignore all GitHub emails"`
- "How much has Vigil cost?" → `vigil.sh usage`
- "What does Vigil remember?" → `vigil.sh memories`
- "What tools are set up?" → `vigil.sh tools`
- "What models can Vigil use?" → `vigil.sh models`
- "Show watcher config" → `vigil.sh config`
- "Switch watcher to gpt-4o" → `vigil.sh set-model <watcher_id> gpt-4o`

## Chat commands through Vigil

The chat endpoint can take actions:
- "Ignore emails from X" → ignores threads + adds persistent rule
- "Resolve the payment thread" → changes thread status
- "Never alert me about receipts" → adds behavioral rule
- "Be more aggressive about deadlines" → modifies agent prompt
