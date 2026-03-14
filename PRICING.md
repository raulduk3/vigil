# Vigil Payment Model

## Overview

Vigil is entirely pay-per-use. No tiers, no subscriptions, no monthly minimums. Users pay for what they use.

## Revenue Per Invocation

Each time the agent processes an email, runs a scheduled tick, or handles a chat query:

```
Total cost = Platform fee + Token cost (with 20% markup)
```

### Platform Fee
- **$0.001** per agent invocation (email, tick, or chat)
- Covers: server compute, Cloudflare email routing, SQLite storage, Resend delivery infrastructure, engineering

### Token Markup
- **20%** on top of provider base rates
- Applied to both input and output tokens

### Alert Delivery
- **$0.005** per alert email sent via Resend

## Model Pricing (per 1K tokens, includes 20% markup)

| Model | Provider | Input | Output | Tier |
|-------|----------|-------|--------|------|
| GPT-4.1 Nano | OpenAI | $0.00012 | $0.00048 | nano |
| GPT-4o Mini | OpenAI | $0.00018 | $0.00072 | mini |
| Gemini 2.5 Flash | Google | $0.00018 | $0.00072 | mini |
| GPT-4.1 Mini | OpenAI | $0.00048 | $0.00192 | mini |
| Claude Haiku 4 | Anthropic | $0.00096 | $0.0048 | mini |
| Gemini 2.5 Pro | Google | $0.0015 | $0.012 | standard |
| GPT-4.1 | OpenAI | $0.0024 | $0.0096 | standard |
| GPT-4o | OpenAI | $0.003 | $0.012 | standard |
| Claude Sonnet 4 | Anthropic | $0.0036 | $0.018 | standard |

## Revenue Breakdown (50 emails/day, GPT-4.1 Mini)

Per email:
- Platform fee: $0.001
- Token cost (~1500 tokens): ~$0.00048 input + ~$0.00192 output ≈ $0.0005
- **Total per email: ~$0.0015**

Monthly (50/day × 30 days = 1,500 emails):
- Platform fees: $1.50
- Token revenue: ~$0.75
- Alert revenue (est. 2 alerts/day): ~$0.30
- **Monthly total: ~$2.55**

Revenue split:
- Platform fee: 59%
- Token markup: 29%
- Alert delivery: 12%

## What's Free

- Unlimited watchers
- Unlimited threads and memory
- Full audit trail
- Agent chat
- Obligation tracking
- Webhook integrations
- Model selection (9 models)
- Reactivity control
- Account, auth, dashboard

## Infrastructure Costs

- DigitalOcean droplet: $6/month (1 vCPU, 2GB RAM)
- Cloudflare: Free (email routing + DNS)
- Resend: Free tier (100 emails/day), then $20/month
- Vercel: Free tier for frontend
- Domain: ~$12/year

Break-even at current infra: ~4 active users at 50 emails/day each.
