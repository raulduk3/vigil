import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'The Agent',
  description: 'How Vigil analyzes emails, builds memory, tracks obligations, and decides when to alert.',
  alternates: { canonical: 'https://vigil.run/learn/agent' },
  openGraph: {
    title: 'The Agent | Vigil Docs',
    description: 'How Vigil analyzes emails, builds memory, tracks obligations, and decides when to alert.',
    url: 'https://vigil.run/learn/agent',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
