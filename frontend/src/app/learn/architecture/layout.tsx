import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Architecture',
  description: 'Data flow, privacy model, and technical architecture of the Vigil email agent system.',
  alternates: { canonical: 'https://vigil.run/learn/architecture' },
  openGraph: {
    title: 'Architecture | Vigil Docs',
    description: 'Data flow, privacy model, and technical architecture of the Vigil email agent system.',
    url: 'https://vigil.run/learn/architecture',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
