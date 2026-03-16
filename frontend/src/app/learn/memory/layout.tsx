import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Memory System',
  description: 'How Vigil builds persistent context across emails with FTS5 search and BM25 ranking.',
  alternates: { canonical: 'https://vigil.run/learn/memory' },
  openGraph: {
    title: 'Memory System | Vigil Docs',
    description: 'How Vigil builds persistent context across emails with FTS5 search and BM25 ranking.',
    url: 'https://vigil.run/learn/memory',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
