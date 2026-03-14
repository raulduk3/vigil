import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Privacy & Data',
  description: 'What Vigil stores, what it discards, and how your data is protected. Email bodies never stored. No inbox access required.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
