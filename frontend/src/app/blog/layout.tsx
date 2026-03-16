import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Blog',
  description: 'Thoughts on AI email agents, privacy, obligation tracking, and building Vigil.',
  alternates: { canonical: 'https://vigil.run/blog' },
  openGraph: {
    title: 'Blog | Vigil',
    description: 'Thoughts on AI email agents, privacy, obligation tracking, and building Vigil.',
    url: 'https://vigil.run/blog',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
