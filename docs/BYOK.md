# BYOK (Bring Your Own Key)

Vigil is BYOK-first. You provide your own API keys from OpenAI, Anthropic, or Google. Vigil calls the provider APIs directly with your key. No proxy, no markup, no middleman.

## Adding Keys

**Dashboard:** Go to `/account/keys` and add your key for any supported provider.

**API:**
```bash
POST /api/account/keys
Content-Type: application/json
Authorization: Bearer <token>

{
  "provider": "openai",
  "key": "sk-..."
}
```

Supported providers: `openai`, `anthropic`, `google`.

## Per-Watcher Model Selection

Each watcher can use a different model. Set the model in watcher settings (dashboard or API). The watcher will use that model for all email triage and chat interactions.

Ticks (scheduled background checks) always use the cheapest available nano model regardless of watcher setting.

## Cost Transparency

Every LLM call logs:
- Model used
- Input and output token counts
- Estimated cost in dollars

All of this is visible in the dashboard per watcher, per email, and in aggregate. You always know exactly what you're spending.

## Security

- **Encryption at rest:** All API keys are encrypted with AES-256-GCM using the `ENCRYPTION_KEY` from your environment. Keys are decrypted only in memory at call time.
- **Never logged:** API keys never appear in logs, error messages, or API responses.
- **Never leave the server:** Keys are used server-side only. The frontend never sees raw keys.
- **You control access:** Delete a key anytime from the dashboard. It's immediately removed.
