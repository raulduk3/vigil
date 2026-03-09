import Link from 'next/link';
import { TableOfContents } from '@/components/learn/TableOfContents';
import { PublicHeader } from '@/components/layout';

const learnNavLinks = [
  { href: '/learn/watchers', label: 'Watchers' },
  { href: '/learn/email-ingestion', label: 'Email' },
  { href: '/learn/agent', label: 'Agent' },
  { href: '/learn/memory', label: 'Memory' },
  { href: '/learn/architecture', label: 'Architecture' },
  { href: '/learn/security', label: 'Security' },
];

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader navLinks={learnNavLinks} />

      <main className="pt-14">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_240px] gap-8 lg:gap-12">
            <div className="min-w-0 learn-content">
              {children}
            </div>
            <TableOfContents />
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-surface-page mt-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-x-4 gap-y-2 md:gap-x-6 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">Home</Link>
            <Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link>
            <Link href="/learn/email-ingestion" className="hover:text-gray-700">Email</Link>
            <Link href="/learn/agent" className="hover:text-gray-700">Agent</Link>
            <Link href="/learn/memory" className="hover:text-gray-700">Memory</Link>
            <Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link>
            <Link href="/learn/security" className="hover:text-gray-700">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
