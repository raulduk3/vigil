import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Pricing — 1¢ Per Email',
  description: 'One cent per email processed. Half a cent per alert. No subscriptions, no tiers, no limits. AI cost included.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
