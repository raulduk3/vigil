import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Pricing — Actual AI Cost + 5%',
  description: 'Pay the real LLM token cost plus a 5% margin. Bring your own API key and Vigil is free. 50 free emails to start.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
