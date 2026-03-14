export const PLATFORM_FEE_PER_INVOCATION = 0.001;
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
  tier: 'nano' | 'mini' | 'standard';
  inputCostPer1k: number;
  outputCostPer1k: number;
  description: string;
  isDefault?: boolean;
};

export const PRICING_MODELS: PricingModel[] = [
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    provider: 'OpenAI',
    tier: 'nano',
    inputCostPer1k: 0.00012,
    outputCostPer1k: 0.00048,
    description: 'Lowest-cost triage and lightweight classification.',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    tier: 'mini',
    inputCostPer1k: 0.00018,
    outputCostPer1k: 0.00072,
    description: 'Fast, inexpensive general-purpose monitoring.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier: 'mini',
    inputCostPer1k: 0.00018,
    outputCostPer1k: 0.00072,
    description: 'Low-cost alternative with strong speed.',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    tier: 'mini',
    inputCostPer1k: 0.00048,
    outputCostPer1k: 0.00192,
    description: 'Default balance of price, speed, and judgment.',
    isDefault: true,
  },
  {
    id: 'claude-haiku-4',
    label: 'Claude Haiku 4',
    provider: 'Anthropic',
    tier: 'mini',
    inputCostPer1k: 0.00096,
    outputCostPer1k: 0.0048,
    description: 'Faster Anthropic option for concise reasoning.',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'standard',
    inputCostPer1k: 0.0015,
    outputCostPer1k: 0.012,
    description: 'Higher-accuracy model for heavier analysis.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'OpenAI',
    tier: 'standard',
    inputCostPer1k: 0.0024,
    outputCostPer1k: 0.0096,
    description: 'Stronger reasoning for complex email workflows.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'standard',
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
    description: 'High-quality analysis with OpenAI pricing.',
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
    tier: 'standard',
    inputCostPer1k: 0.0036,
    outputCostPer1k: 0.018,
    description: 'Best for nuanced judgment and harder decisions.',
  },
];

export function getPricingModel(modelId: string): PricingModel {
  return PRICING_MODELS.find((model) => model.id === modelId) ?? PRICING_MODELS.find((model) => model.isDefault) ?? PRICING_MODELS[0]!;
}

export function calculateTokenCostPerInvocation(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getPricingModel(modelId);
  return (inputTokens / 1000) * model.inputCostPer1k + (outputTokens / 1000) * model.outputCostPer1k;
}

export function calculateInvocationCost(modelId: string, inputTokens: number, outputTokens: number): number {
  return PLATFORM_FEE_PER_INVOCATION + calculateTokenCostPerInvocation(modelId, inputTokens, outputTokens);
}

export function calculateMonthlyEstimate({
  modelId,
  emailsPerDay,
  alertsPerDay,
  inputTokensPerInvocation,
  outputTokensPerInvocation,
  daysPerMonth = DEFAULT_ESTIMATE_ASSUMPTIONS.daysPerMonth,
}: {
  modelId: string;
  emailsPerDay: number;
  alertsPerDay: number;
  inputTokensPerInvocation: number;
  outputTokensPerInvocation: number;
  daysPerMonth?: number;
}) {
  const invocationsPerMonth = emailsPerDay * daysPerMonth;
  const alertsPerMonth = alertsPerDay * daysPerMonth;
  const platformCost = invocationsPerMonth * PLATFORM_FEE_PER_INVOCATION;
  const tokenCost = invocationsPerMonth * calculateTokenCostPerInvocation(modelId, inputTokensPerInvocation, outputTokensPerInvocation);
  const alertCost = alertsPerMonth * ALERT_DELIVERY_COST;
  const totalCost = platformCost + tokenCost + alertCost;

  return {
    invocationsPerMonth,
    alertsPerMonth,
    platformCost,
    tokenCost,
    alertCost,
    totalCost,
  };
}

export function formatUsd(amount: number): string {
  if (amount >= 1) {
    return `$${amount.toFixed(2)}`;
  }

  if (amount >= 0.01) {
    return `$${amount.toFixed(3)}`;
  }

  return `$${amount.toFixed(4)}`;
}

export function formatUsdRate(amount: number): string {
  if (amount >= 0.01) {
    return `$${amount.toFixed(3)}`;
  }

  return `$${amount.toFixed(5)}`;
}
