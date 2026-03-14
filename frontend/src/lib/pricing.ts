export const PRICE_PER_EMAIL = 0.005;

export function calculateMonthlyEstimate(
  emailsPerMonth: number,
): number {
  return emailsPerMonth * PRICE_PER_EMAIL;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}
