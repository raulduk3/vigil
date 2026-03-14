export const ALLOWED_MODEL_IDS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini',
] as const;

export type AllowedModelId = typeof ALLOWED_MODEL_IDS[number];

export const DEFAULT_MODEL_ID: AllowedModelId = 'gpt-4.1-mini';

export const MODEL_OPTIONS: Array<{
  id: AllowedModelId;
  label: string;
  costPer1M: string;
  costPerEmail: string;
  speed: string;
  quality: string;
  default?: boolean;
}> = [
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    costPer1M: '$0.40',
    costPerEmail: '~$0.001',
    speed: 'Fast',
    quality: 'Default — balanced cost and quality',
    default: true,
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    costPer1M: '$3.00',
    costPerEmail: '~$0.003',
    speed: 'Fast',
    quality: 'Stronger reasoning for harder workflows',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    costPer1M: '$0.15',
    costPerEmail: '~$0.001',
    speed: 'Very fast',
    quality: 'Lowest cost, good for simple triage',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    costPer1M: '$2.50',
    costPerEmail: '~$0.003',
    speed: 'Fast',
    quality: 'Strong general analysis',
  },
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    costPer1M: '$0.10',
    costPerEmail: '~$0.001',
    speed: 'Very fast',
    quality: 'Cheapest option for lightweight monitoring',
  },
];

export function normalizeModelId(model: string | null | undefined): AllowedModelId {
  if (model && ALLOWED_MODEL_IDS.includes(model as AllowedModelId)) {
    return model as AllowedModelId;
  }

  return DEFAULT_MODEL_ID;
}