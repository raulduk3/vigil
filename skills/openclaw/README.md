# Vigil OpenClaw Skill

An [OpenClaw](https://openclaw.com) skill for managing [Vigil](https://vigil.run) email watchers from your AI assistant.

## What is this?

This skill lets your OpenClaw agent check email, query obligations, manage threads, and configure watchers through natural language. When you say "check my email," OpenClaw knows to call Vigil.

## Installation

Symlink this directory into your OpenClaw skills folder:

```bash
ln -s /path/to/vigil/skills/openclaw ~/.openclaw/skills/vigil
```

Or copy it:

```bash
cp -r /path/to/vigil/skills/openclaw ~/.openclaw/skills/vigil
```

## Configuration

Set these environment variables (e.g. in `~/.zshrc` or `~/.bashrc`):

```bash
# Required — your Vigil API key
export VIGIL_API_KEY="vk_your_key_here"

# Optional — API base URL (default: https://api.vigil.run)
export VIGIL_API_URL="https://api.vigil.run"

# Optional — default watcher ID (auto-detects first watcher if not set)
export VIGIL_WATCHER_ID="your-watcher-uuid"
```

Get your API key at [vigil.run/settings](https://vigil.run/settings).

## Usage Examples

### Check inbox status
```
vigil.sh status
```
Shows email count, costs, active threads, and watching threads.

### List recent emails
```
vigil.sh emails      # last 10
vigil.sh emails 25   # last 25
```

### View threads by status
```
vigil.sh threads active
vigil.sh threads watching
vigil.sh threads ignored
```

### Ask what needs attention
```
vigil.sh obligations
```

### Talk to the agent
```
vigil.sh chat "ignore emails from noreply@github.com"
vigil.sh chat "be more aggressive about deadline alerts"
```

### View costs
```
vigil.sh usage
```

### Manage memories
```
vigil.sh memories
```

### List tools
```
vigil.sh tools
```

### List available models
```
vigil.sh models
```

### Show watcher configuration
```
vigil.sh config
```

### Change a watcher's model
```
vigil.sh set-model <watcher_id> gpt-4o
```

### Flush watcher data
```
vigil.sh flush              # flush default watcher
vigil.sh flush <watcher_id> # flush specific watcher
```

## Docs

- [Vigil Documentation](https://vigil.run/docs)
- [OpenClaw Skills](https://openclaw.com/docs/skills)
