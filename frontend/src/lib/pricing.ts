/**
 * Pricing — Cost passthrough + 5% margin
 *
 * Vigil bills actual LLM token cost + 5%. No flat rates.
 * BYOK users are free (they pay their own provider directly).
 *
 * Real costs per invocation (from MODEL_CATALOG in engine.ts):
 *   Email (gpt-4.1, ~4K in + ~400 out): ~$0.01120 raw → ~$0.01176 billed
 *   Tick (gpt-4.1-nano, ~5K in + ~300 out):  ~$0.00062 raw → ~$0.00065 billed
 *   Chat (gpt-4.1, ~6K in + ~200 out):  ~$0.01020 raw → ~$0.01071 billed
 */

// Average cost estimates (gpt-4.1 default, with 5% margin)
export const AVG_COST_PER_EMAIL = 0.012;    // ~1.2¢ per email
export const AVG_COST_PER_TICK = 0.00065;   // ~0.065¢ per tick (nano)
export const AVG_COST_PER_CHAT = 0.011;     // ~1.1¢ per chat message
export const MARGIN = 0.05;

export function estimateMonthly(
  emailsPerMonth: number,
  ticksPerDay: number = 24,  // default: hourly ticks
): number {
  const emailCost = emailsPerMonth * AVG_COST_PER_EMAIL;
  const tickCost = ticksPerDay * 30 * AVG_COST_PER_TICK;
  return emailCost + tickCost;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}
