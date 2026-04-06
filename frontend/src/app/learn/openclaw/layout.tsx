import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'OpenClaw Skill',
  description: 'Install the Vigil skill for OpenClaw. One command to give your AI assistant full email access.',
  alternates: { canonical: 'https://vigil.run/learn/openclaw' },
  openGraph: {
    title: 'OpenClaw Skill | Vigil',
    description: 'Install the Vigil skill for OpenClaw. One command to give your AI assistant full email access.',
    url: 'https://vigil.run/learn/openclaw',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
