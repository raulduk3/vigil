# Show HN: Vigil — An AI email agent that never touches your inbox

https://vigil.run

Vigil is an AI agent that reads your email, tracks obligations across conversations, and acts when something needs attention. It works through email forwarding — no OAuth, no inbox access, no stored email bodies.

**How it works:**

1. Set up a forwarding rule in Gmail/Outlook for the emails you want watched
2. Each email is analyzed by GPT-4.1: summary, urgency, obligations, deadlines
3. The agent tracks threads, builds memory, and alerts you when something needs action
4. Email bodies are processed and discarded. Only metadata and AI analysis are stored.

**What makes it different from Gmail's AI / Copilot / Superhuman:**

- No inbox access. Privacy by architecture, not policy. Vigil can't read your inbox because no connection exists.
- Proactive obligation tracking. It notices what's *missing* — threads that went quiet, confirmations that never arrived, deadlines approaching without activity.
- Developer API. Any AI agent system can query Vigil for email awareness. Your CRM bot, your support agent, your personal assistant.
- Extensible. Custom webhook tools fire when the agent reads a matching email. Connect to Slack, Jira, Notion, anything with an API.

**Pricing:** You pay the actual LLM token cost + 5% margin on emails, chat, and scheduled checks. About 0.25¢ per email on GPT-4.1-mini. Scheduled checks run on GPT-4.1-nano at ~0.07¢ each (smart-skipped when idle, ~$0.15/watcher/month). Bring your own API key and the whole thing is free. 50 free emails to start.

**Tech stack:** Bun + Hono backend, SQLite, Cloudflare Email Routing, Next.js on Vercel. Multi-model: GPT-4.1-mini (default), GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro.

I built this because I kept dropping email obligations. Someone would ask me something, I'd think "I'll respond later," and forget. Google and Microsoft help you read email faster. Nobody helps you track what you owe people and what they owe you.

The agent setup page for other AI systems: https://vigil.run/agent-setup.md

Happy to answer questions about the architecture, privacy model, or anything else.
