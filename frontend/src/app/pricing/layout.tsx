import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Vigil pricing: actual AI token cost + 5% margin. 9 models, 3 providers. BYOK is free. 50 emails free to start.',
  alternates: { canonical: 'https://vigil.run/pricing' },
  openGraph: {
    title: 'Pricing | Vigil',
    description: 'Pay actual AI cost + 5%. From 0.06¢/email on Nano to 1.9¢ on Claude Sonnet. BYOK is free.',
    url: 'https://vigil.run/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
