# Model Catalog

Vigil supports 9 models across three providers and four tiers.

## Full Catalog

| Model ID | Label | Provider | Tier | Input ($/1K tok) | Output ($/1K tok) | Max Tokens |
|----------|-------|----------|------|-------------------|-------------------|------------|
| `gpt-4.1-nano` | GPT-4.1 Nano | OpenAI | nano | $0.0001 | $0.0004 | 1,024 |
| `gpt-4.1-mini` | GPT-4.1 Mini | OpenAI | mini | $0.0004 | $0.0016 | 1,024 |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI | mini | $0.00015 | $0.0006 | 1,024 |
| `gpt-4.1` | GPT-4.1 | OpenAI | standard | $0.002 | $0.008 | 2,048 |
| `gpt-4o` | GPT-4o | OpenAI | standard | $0.0025 | $0.01 | 2,048 |
| `claude-haiku-4` | Claude Haiku 4 | Anthropic | mini | $0.0008 | $0.004 | 1,024 |
| `claude-sonnet-4` | Claude Sonnet 4 | Anthropic | standard | $0.003 | $0.015 | 2,048 |
| `gemini-2.5-flash` | Gemini 2.5 Flash | Google | mini | $0.00015 | $0.0006 | 1,024 |
| `gemini-2.5-pro` | Gemini 2.5 Pro | Google | standard | $0.00125 | $0.01 | 2,048 |

## Tiers

- **Nano**: Cheapest. Used for pre-screen gate and scheduled ticks. ~$0.0001/email.
- **Mini**: Balanced cost and quality. Good default for most watchers. ~$0.001-0.004/email.
- **Standard**: Full reasoning capability. Best for complex analysis or high-stakes email. ~$0.008-0.015/email.
- **Pro**: Reserved for future models.

## Multi-Model Pipeline

Vigil doesn't use one model for everything. The pipeline adapts by task:

1. **Scheduled ticks** always use `gpt-4.1-nano` (cheapest, runs every 5 minutes)
2. **Pre-screen gate**: A nano call classifies the email before full triage. If clearly ignorable, processing stops. This eliminates ~40% of LLM spend.
3. **Full triage**: Uses the watcher's configured model

### Classification vs. Full Agent

Mini and nano tier models use a **classification pipeline**: the model outputs a structured classification (urgency, intent, category), then deterministic logic maps that to actions. This is cheaper and more predictable.

Standard and pro tier models use the **full agent prompt** and decide actions directly, with access to the complete tool set.

## Choosing a Model

| Use Case | Recommended Tier | Why |
|----------|-----------------|-----|
| High-volume, low-stakes (newsletters, notifications) | nano/mini | Cheap, fast, good enough |
| General email triage | mini | Best balance of cost and quality |
| Important/complex email (contracts, legal, financial) | standard | Full reasoning, better judgment |
| Budget-conscious | nano pre-screen + mini triage | Default pipeline, lowest cost |

## Per-Watcher Selection

Each watcher can use a different model. Set it in watcher settings. You can run a cheap nano watcher for newsletters and a standard watcher for work email simultaneously.

Change the model anytime. It takes effect on the next email.
