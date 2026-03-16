# Model Routing Recommendations

Vigil processes four trigger types with different complexity and failure-cost profiles.
This document maps each to the appropriate model tier.

---

## Current Assignments (engine.ts)

| Trigger | Current Model | Source |
|---------|--------------|--------|
| `email_received` | `watcher.model \|\| VIGIL_MODEL \|\| gpt-4.1-mini` | engine.ts:401 |
| `scheduled_tick` | `gpt-4.1-nano` (hardcoded for cost) | engine.ts:400 |
| `user_chat` | `watcher.model \|\| VIGIL_MODEL \|\| gpt-4.1` | engine.ts:278 |
| `weekly_digest` | Same as email_received | engine.ts:~401 |

---

## Trigger-by-Trigger Analysis

### `email_received` — Medium complexity, highest failure cost

The core triage job. Requires:
- Correct JSON structure (all fields present)
- Urgency calibration (receipts ≠ security alerts)
- No hallucinated source_quotes
- Verbatim entity extraction (amounts, dates, account numbers)
- Reasonable memory discipline (median importance ≤ 3)

**Failure modes on nano/small models:**
- Invalid or partial JSON
- source_quote values invented rather than copied
- Receipts classified as high urgency
- 4-5 memories stored per routine email

**Recommendation:**

| Content Type | Minimum Model | Rationale |
|---|---|---|
| Routine (receipts, newsletters, shipping) | `gpt-4.1-nano` | Low stakes, simple pattern |
| Person-to-person (questions, requests) | `gpt-4.1-mini` | Needs intent detection |
| Financial with specific amounts | `gpt-4.1-mini` | Verbatim extraction required |
| Security alerts | `gpt-4.1` or `claude-haiku-4` | High failure cost; wrong call = missed breach |
| Ambiguous / complex threads | `gpt-4.1` | Context reasoning required |

**Current assignment** (`gpt-4.1-mini`) is appropriate for general use.
Consider routing security-tagged emails to `gpt-4.1`.

---

### `scheduled_tick` — Low complexity, low failure cost

Reviews active threads for silence + upcoming deadlines. Mostly summary tasks.
No new emails, no verbatim extraction required.

**Failure modes:** Over-alerting on non-overdue threads. Hallucinating thread summaries.

**Recommendation:** `gpt-4.1-nano` ✅ (current assignment is correct)

The tick prompt is heavily structured with clear criteria. Nano handles this well.
Upgrade to `gpt-4.1-mini` only if tests show consistent over-alerting on nano.

---

### `weekly_digest` — Medium complexity

Summarizes a week of activity into a readable alert. Requires synthesis across
multiple threads and memories but no strict JSON field requirements (it writes
an email body via `send_alert`).

**Failure modes:** Poor prose quality, missing key threads, hallucinating stats.

**Recommendation:** `gpt-4.1-mini` — slightly better prose than nano at low cost.
For users who care about digest quality, `gpt-4.1` is worth the premium.

---

### `user_chat` — Highest complexity

Conversational. Must:
- Identify intent (query vs. action)
- Emit `[[action:...]]` blocks correctly when user says "ignore X" / "resolve Y"
- Reference real thread IDs, not invented ones
- Answer factual questions from memory context

**Failure modes:** Missing action blocks, wrong thread IDs, hallucinated answers.

**Recommendation:** `gpt-4.1` ✅ (current assignment is correct)

Do NOT use nano/mini for chat — action block parsing fails too often on smaller
models. `claude-haiku-4` is a good cost-effective alternative if Anthropic keys
are configured. `gpt-4.1-mini` may work for pure query chat (no action blocks)
but is unreliable for action execution.

---

## Cost vs. Quality Trade-offs

| Model | Input $/1K | Output $/1K | JSON Reliability | Entity Accuracy | Chat Quality |
|---|---|---|---|---|---|
| gpt-4.1-nano | $0.0001 | $0.0004 | Fair | Low | Poor |
| gpt-4.1-mini | $0.0004 | $0.0016 | Good | Good | Fair |
| gpt-4.1 | $0.002 | $0.008 | Excellent | Excellent | Excellent |
| claude-haiku-4 | $0.0008 | $0.004 | Good | Good | Good |
| gemini-2.5-flash | $0.00015 | $0.0006 | Good | Good | Fair |

_Pricing is actual provider rates (no markup). Engine.ts applies 5% margin at billing time._

---

## Recommended Routing Logic

```typescript
// In engine.ts invokeAgent() — suggested model selection
const model =
    trigger.type === "scheduled_tick"
        ? "gpt-4.1-nano"
        : trigger.type === "user_chat"
        ? (watcher.model || process.env.VIGIL_MODEL || "gpt-4.1")
        : isSecurityEmail(emailSubject)    // future: tag high-stakes emails
        ? "gpt-4.1"
        : (watcher.model || process.env.VIGIL_MODEL || "gpt-4.1-mini");
```

---

## Running the Evaluation

```bash
# Email triage + tick tests across 5 models
cd promptfoo && npx promptfoo eval

# Chat mode tests
cd promptfoo && npx promptfoo eval --config promptfooconfig.chat.yaml

# View results in browser
cd promptfoo && npx promptfoo view
```

Results are written to `promptfoo/results/`. Compare pass rates across models
to identify which triggers are safe to downgrade.

**Target pass thresholds:**
- `valid-json`: 100% on all models (any failure is a hard bug)
- `required-fields`: 100% on all models
- `no-hallucinated-quotes`: ≥ 95% (some models occasionally hallucinate short phrases)
- `urgency-calibration`: ≥ 95%
- `alert-budget`: 100% on receipt/newsletter/spam types
- `reasonable-memory`: ≥ 90% (nano tends to over-store)
