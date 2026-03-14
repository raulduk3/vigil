import { GLOSSARY } from '@/lib/glossary';
import { Tooltip } from './tooltip';

export function Term({ children }: { children: string }) {
  const tip = GLOSSARY[children.toLowerCase()];
  if (!tip) return <>{children}</>;
  return <Tooltip term={tip}>{children}</Tooltip>;
}
