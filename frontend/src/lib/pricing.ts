export const PRICE_PER_EMAIL = 0.01;
export const ALERT_DELIVERY_COST = 0.005;

export function calculateMonthlyEstimate(
  emailsPerDay: number,
  alertsPerDay: number,
): number {
  const days = 30;
  return (emailsPerDay * days * PRICE_PER_EMAIL) + (alertsPerDay * days * ALERT_DELIVERY_COST);
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}
