# Usage Tracking & Spend Cap — Implementation Spec

## Goal

Full LLM usage transparency and cost control on the billing page. Users should see exactly what they're paying for, per-model token breakdown, daily cost trends, and be able to set a hard monthly spend cap that pauses processing when hit.

## 1. Database Changes (backend/src/db/client.ts migrations)

### New table: `usage_events`
Denormalized event log for fast aggregation. One row per billable event.

```sql
CREATE TABLE IF NOT EXISTS usage_events (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  watcher_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,  -- 'email_triage', 'pre_screen', 'tick', 'chat', 'digest', 'alert_delivery'
  model           TEXT,           -- 'gpt-4.1', 'gpt-4.1-nano', etc. NULL for non-LLM events
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  raw_cost_usd    REAL DEFAULT 0, -- pre-margin LLM cost
  billed_cost_usd REAL DEFAULT 0, -- post-margin (what Stripe sees)
  trigger_ref     TEXT,           -- email_id or action_id for traceability
  metadata        TEXT,           -- JSON: {from, subject, gate_status, etc.}
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_usage_events_account ON usage_events(account_id, created_at);
CREATE INDEX idx_usage_events_watcher ON usage_events(watcher_id, created_at);
```

### Alter `accounts` table
```sql
ALTER TABLE accounts ADD COLUMN monthly_spend_cap REAL DEFAULT NULL;
-- NULL = no cap (unlimited). Value in USD.
```

## 2. Backend: Usage Event Logging

### New file: `backend/src/billing/events.ts`

```typescript
export function logUsageEvent(params: {
  accountId: string;
  watcherId: string;
  eventType: 'email_triage' | 'pre_screen' | 'tick' | 'chat' | 'digest' | 'alert_delivery';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  rawCostUsd: number;
  billedCostUsd: number;
  triggerRef?: string;
  metadata?: Record<string, unknown>;
}): void
```

Call this from:
- `orchestrator.ts` — pre_screen events (already logs to actions, add usage_events)
- `engine.ts` — email_triage, tick, chat events (after LLM call, before billing)
- `digest.ts` — digest events

This is the **single source of truth** for billing display. The `actions` table remains for agent behavior debugging.

## 3. Backend: Spend Cap Enforcement

### In `billing/usage.ts`, new function:

```typescript
export function isSpendCapReached(accountId: string): boolean
```

- Query `usage_events` for current month's `SUM(billed_cost_usd)`
- Compare against `accounts.monthly_spend_cap`
- Returns `true` if cap is set and exceeded

### Enforcement points:
- `orchestrator.ts`: before pre-screen gate, check cap. If reached, return `{success: false, capReached: true}`
- `engine.ts`: before LLM call (belt and suspenders)
- Frontend shows a clear banner when cap is hit

### New API endpoint: `PATCH /api/account/spend-cap`
```json
// Request
{ "monthly_spend_cap": 5.00 }  // null to remove cap
// Response
{ "monthly_spend_cap": 5.00 }
```

## 4. Backend: Detailed Usage API

### New endpoint: `GET /api/usage/detailed`

Query params: `?period=month&offset=0` (offset in months, 0 = current)

Response:
```json
{
  "period": "2026-03",
  "total_billed": 1.78,
  "total_raw": 1.70,
  "spend_cap": 5.00,
  "spend_cap_pct": 35.6,
  "by_model": [
    { "model": "gpt-4.1", "input_tokens": 50000, "output_tokens": 8000, "raw_cost": 1.20, "billed_cost": 1.26, "events": 45 },
    { "model": "gpt-4.1-nano", "input_tokens": 30000, "output_tokens": 2000, "raw_cost": 0.004, "billed_cost": 0.0042, "events": 200 }
  ],
  "by_event_type": [
    { "type": "email_triage", "count": 45, "billed_cost": 1.26 },
    { "type": "pre_screen", "count": 200, "billed_cost": 0.0042 },
    { "type": "tick", "count": 30, "billed_cost": 0.01 },
    { "type": "chat", "count": 5, "billed_cost": 0.09 }
  ],
  "by_day": [
    { "date": "2026-03-17", "billed_cost": 0.05, "events": 12 },
    { "date": "2026-03-16", "billed_cost": 1.73, "events": 233 }
  ],
  "by_watcher": [
    { "watcher_id": "...", "watcher_name": "RÁ Prime", "billed_cost": 1.70, "events": 230 },
    { "watcher_id": "...", "watcher_name": "Bills", "billed_cost": 0.08, "events": 15 }
  ]
}
```

### Backfill: On first request, populate `usage_events` from existing `actions` table data so historical data appears.

## 5. Frontend: Billing Page Rebuild

### File: `frontend/src/app/account/billing/page.tsx`

Replace the current simple page with a comprehensive usage dashboard:

**Section 1: Billing Status** (keep existing card, add spend cap)
- Payment method status (existing)
- Monthly spend cap with inline edit (slider or input, $0.50 increments, $0.50 min)
- Progress bar: current spend / cap with color coding (green < 50%, yellow 50-80%, red 80-100%)

**Section 2: This Month Summary**
- Large number: total billed this month
- Sub-stats: total events, emails processed, emails pre-screened, alerts sent
- "Compared to last month" delta if data exists

**Section 3: Cost by Model** (table)
- Columns: Model, Tier, Events, Input Tokens, Output Tokens, Raw Cost, Billed Cost
- Sort by billed cost desc
- Show token counts formatted (e.g., "50.2K")

**Section 4: Cost by Event Type** (horizontal bar chart or table)
- email_triage, pre_screen, tick, chat, digest, alert_delivery
- Each with count and cost

**Section 5: Daily Cost Trend** (simple bar chart)
- Last 30 days, one bar per day
- Spend cap shown as a horizontal line if set
- Use a lightweight chart (CSS bars, no chart library needed)

**Section 6: Per-Watcher Breakdown** (existing, enhanced)
- Add model and token columns

### New API client methods:
```typescript
async getDetailedUsage(period?: string, offset?: number): Promise<DetailedUsage>
async updateSpendCap(cap: number | null): Promise<{ monthly_spend_cap: number | null }>
```

## 6. Edge Cases

- Spend cap reached mid-email: pre-screen still runs (it's cheap), but if it returns "active"/"watched", check cap before invoking full triage. If cap hit, store email as `processed=FALSE` with analysis `{gate_status: "cap_reached"}`.
- Spend cap set to $0: effectively pauses all processing. Show clear warning.
- BYOK users: spend cap applies to platform costs only (alert delivery, etc). LLM costs are $0 for them.
- Cap reset: monthly, same as usage_month tracking (first of month UTC).

## 7. Files to Modify

### Backend (on server at /opt/vigil/backend/src/):
- `db/client.ts` — add migration for `usage_events` table and `accounts.monthly_spend_cap`
- `billing/events.ts` — NEW: usage event logging
- `billing/usage.ts` — add `isSpendCapReached()`
- `billing/constants.ts` — add `DEFAULT_SPEND_CAP`
- `ingestion/orchestrator.ts` — add cap check, log usage events
- `agent/engine.ts` — log usage events, add cap check
- `agent/digest.ts` — log usage events
- `api/router.ts` — add `/usage/detailed` and `/account/spend-cap` routes
- `api/handlers/billing.ts` — add detailed usage and spend cap handlers

### Frontend (local at ~/Dev/websites/vigil.run/frontend/src/):
- `app/account/billing/page.tsx` — full rebuild
- `lib/api/client.ts` — add new API methods

## 8. Testing

After implementation:
1. Set spend cap to $0.01 via API
2. Send a test email — should be blocked with cap_reached
3. Remove cap (set null)
4. Send email — should process normally
5. Check /api/usage/detailed returns correct aggregations
6. Verify frontend renders all sections
