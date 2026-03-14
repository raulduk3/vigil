import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Blog',
  description: 'Thoughts on AI email agents, privacy, obligation tracking, and building Vigil.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
