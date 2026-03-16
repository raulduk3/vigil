# Vigil Pricing

## Model

Every LLM call is billed at actual token cost + 5% margin. That's it. No platform fees. No per-alert charges. No hidden markup.

BYOK users (bring your own API key) pay nothing. They use their own OpenAI, Anthropic, or Google key and Vigil charges zero.

## Real Per-Invocation Costs (with 5% margin)

Based on actual MODEL_CATALOG rates. Typical email: ~4000 input tokens, ~400 output tokens.

| Model | Provider | Per Email | Per Chat | Per Tick* |
|-------|----------|-----------|----------|-----------|
| GPT-4.1 Nano | OpenAI | ~0.06¢ | ~0.07¢ | ~0.07¢ |
| GPT-4o Mini | OpenAI | ~0.09¢ | ~0.11¢ | — |
| Gemini 2.5 Flash | Google | ~0.09¢ | ~0.11¢ | — |
| GPT-4.1 Mini | OpenAI | **~0.25¢** | ~0.30¢ | — |
| Claude Haiku 4 | Anthropic | ~0.50¢ | ~0.59¢ | — |
| Gemini 2.5 Pro | Google | ~0.95¢ | ~1.00¢ | — |
| GPT-4.1 | OpenAI | ~1.18¢ | ~1.43¢ | — |
| GPT-4o | OpenAI | ~1.47¢ | ~1.79¢ | — |
| Claude Sonnet 4 | Anthropic | ~1.89¢ | ~2.21¢ | — |

*Ticks always run on GPT-4.1 Nano regardless of watcher model.

## Monthly Estimates

500 emails/month, hourly ticks (smart-skipped when idle), 50 chat messages.

| Model | Emails | Ticks | Chat | Total |
|-------|--------|-------|------|-------|
| GPT-4.1 Mini (default) | $1.25 | $0.15 | $0.15 | **~$1.55** |
| GPT-4.1 | $5.88 | $0.15 | $0.71 | **~$6.74** |
| Claude Sonnet 4 | $9.45 | $0.15 | $1.10 | **~$10.70** |

Tick costs assume ~720/month with ~80% smart-skipped = ~144 actual ticks × $0.001 = ~$0.15.

## What's Free

- Unlimited watchers, threads, memory
- Full audit trail of every agent decision
- Agent chat interface
- Chrome extension
- Developer API
- Custom webhook tools and skills
- Model selection (9 models, 3 providers)
- Reactivity and memory sensitivity controls
- Daily and weekly digests
- Alert delivery (via Resend)

## Free Trial

50 emails, one-time. No credit card required. After that: add billing or BYOK.

## Infrastructure

- DigitalOcean: $6/month
- Cloudflare: Free (email routing + DNS)
- Resend: Free tier (100 emails/day)
- Vercel: Free tier for frontend

Break-even: ~4 active users at 500 emails/month on GPT-4.1 Mini.
