import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Watchers',
  description: 'Create AI agents with custom prompts, tools, and memory for email monitoring.',
  alternates: { canonical: 'https://vigil.run/learn/watchers' },
  openGraph: {
    title: 'Watchers | Vigil Docs',
    description: 'Create AI agents with custom prompts, tools, and memory for email monitoring.',
    url: 'https://vigil.run/learn/watchers',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
