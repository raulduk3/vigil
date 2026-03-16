/**
 * Model catalog for the frontend.
 *
 * costPerEmail is calculated from actual MODEL_CATALOG rates in engine.ts:
 *   ~4000 input tokens + ~400 output tokens per email, with 5% margin.
 *   Formula: ((4000/1000) * inputRate + (400/1000) * outputRate) * 1.05
 */

export const ALLOWED_MODEL_IDS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-haiku-4',
  'claude-sonnet-4',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
] as const;

export type AllowedModelId = typeof ALLOWED_MODEL_IDS[number];

export const DEFAULT_MODEL_ID: AllowedModelId = 'gpt-4.1-mini';

export const MODEL_OPTIONS: Array<{
  id: AllowedModelId;
  label: string;
  provider: string;
  costPerEmail: string;
  speed: string;
  quality: string;
  default?: boolean;
}> = [
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    provider: 'OpenAI',
    costPerEmail: '~0.06¢',
    speed: 'Very fast',
    quality: 'Cheapest — used for scheduled checks',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    costPerEmail: '~0.09¢',
    speed: 'Very fast',
    quality: 'Very low cost, good for simple triage',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    costPerEmail: '~0.09¢',
    speed: 'Very fast',
    quality: 'Google mini — low cost, good throughput',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    costPerEmail: '~0.25¢',
    speed: 'Fast',
    quality: 'Default — balanced cost and quality',
    default: true,
  },
  {
    id: 'claude-haiku-4',
    label: 'Claude Haiku 4',
    provider: 'Anthropic',
    costPerEmail: '~0.50¢',
    speed: 'Very fast',
    quality: 'Anthropic mini — fast and capable',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    costPerEmail: '~0.95¢',
    speed: 'Fast',
    quality: 'Google flagship — strong reasoning',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'OpenAI',
    costPerEmail: '~1.18¢',
    speed: 'Fast',
    quality: 'Stronger reasoning for harder workflows',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    costPerEmail: '~1.5¢',
    speed: 'Fast',
    quality: 'Strong general analysis',
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
    costPerEmail: '~1.9¢',
    speed: 'Fast',
    quality: 'Anthropic flagship — top reasoning quality',
  },
];

export function normalizeModelId(model: string | null | undefined): AllowedModelId {
  if (model && ALLOWED_MODEL_IDS.includes(model as AllowedModelId)) {
    return model as AllowedModelId;
  }

  return DEFAULT_MODEL_ID;
}
