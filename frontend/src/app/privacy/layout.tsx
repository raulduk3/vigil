import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Privacy & Data',
  description: 'What Vigil stores, what it discards, and how your data is protected. Email bodies never stored. No inbox access required.',
  alternates: { canonical: 'https://vigil.run/privacy' },
  openGraph: {
    title: 'Privacy & Data | Vigil',
    description: 'Email bodies processed in memory and discarded. SHA-256 hash only. No OAuth. No inbox access.',
    url: 'https://vigil.run/privacy',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
