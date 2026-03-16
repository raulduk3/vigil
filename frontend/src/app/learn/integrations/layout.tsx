import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'API & Integrations',
  description: 'REST API, webhooks, custom tools, and developer integration guides for Vigil.',
  alternates: { canonical: 'https://vigil.run/learn/integrations' },
  openGraph: {
    title: 'API & Integrations | Vigil Docs',
    description: 'REST API, webhooks, custom tools, and developer integration guides for Vigil.',
    url: 'https://vigil.run/learn/integrations',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
