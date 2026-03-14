export const PLATFORM_FEE_PER_INVOCATION = 0.005;
export const ALERT_DELIVERY_COST = 0.005;
export const DEFAULT_ESTIMATE_ASSUMPTIONS = {
  daysPerMonth: 30,
  inputTokensPerInvocation: 900,
  outputTokensPerInvocation: 120,
};

export type PricingModel = {
  id: string;
  label: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  inputCostPer1k: number;
  outputCostPer1k: number;
  description: string;
  isDefault?: boolean;
};

export const PRICING_MODELS: PricingModel[] = [
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'OpenAI',
    inputCostPer1k: 0.0024,
    outputCostPer1k: 0.0096,
    description: 'Recommended. Strong reasoning, reliable triage.',
    isDefault: true,
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    inputCostPer1k: 0.0015,
    outputCostPer1k: 0.012,
    description: 'High accuracy, good value.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
    description: 'Multimodal, strong analysis.',
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
    inputCostPer1k: 0.0036,
    outputCostPer1k: 0.018,
    description: 'Best reasoning and judgment.',
  },
];

export function getPricingModel(id: string): PricingModel {
  return PRICING_MODELS.find(m => m.id === id) ?? PRICING_MODELS[0];
}

export function calculateMonthlyEstimate(
  emailsPerDay: number,
  alertsPerDay: number,
  modelId: string
): number {
  const model = getPricingModel(modelId);
  const { daysPerMonth, inputTokensPerInvocation, outputTokensPerInvocation } = DEFAULT_ESTIMATE_ASSUMPTIONS;

  const totalEmails = emailsPerDay * daysPerMonth;
  const totalAlerts = alertsPerDay * daysPerMonth;

  const tokenCostPerEmail =
    (inputTokensPerInvocation / 1000) * model.inputCostPer1k +
    (outputTokensPerInvocation / 1000) * model.outputCostPer1k;

  const perEmailCost = PLATFORM_FEE_PER_INVOCATION + tokenCostPerEmail;

  return (totalEmails * perEmailCost) + (totalAlerts * ALERT_DELIVERY_COST);
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatUsdRate(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
