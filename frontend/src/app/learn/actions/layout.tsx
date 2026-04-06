import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Actions & Tools',
  description: 'Built-in and custom tools: alerts, thread management, and webhooks.',
  alternates: { canonical: 'https://vigil.run/learn/actions' },
  openGraph: {
    title: 'Actions & Tools | Vigil Docs',
    description: 'Built-in and custom tools: alerts, thread management, and webhooks.',
    url: 'https://vigil.run/learn/actions',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
