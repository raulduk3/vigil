/**
 * Pricing — Cost passthrough + 5% margin
 *
 * Vigil bills actual LLM token cost + 5%. No flat rates.
 * BYOK users are free (they pay their own provider directly).
 *
 * Typical costs per invocation (gpt-4.1-mini):
 *   Email processing: ~$0.011
 *   Scheduled tick: ~$0.012
 *   Chat message: ~$0.006
 *
 * With 5% margin:
 *   Email: ~$0.0116
 *   Tick: ~$0.0126
 *   Chat: ~$0.0063
 */

// Average cost estimates for the pricing page (gpt-4.1-mini)
export const AVG_COST_PER_EMAIL = 0.012;   // ~1.2¢ per email (cost + 5%)
export const AVG_COST_PER_TICK = 0.013;     // ~1.3¢ per tick
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
