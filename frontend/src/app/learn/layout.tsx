'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PublicHeader } from '@/components/layout';

const PAGES = [
  { href: '/learn/watchers', label: 'Watchers' },
  { href: '/learn/email-ingestion', label: 'Email Ingestion' },
  { href: '/learn/agent', label: 'The Agent' },
  { href: '/learn/memory', label: 'Memory System' },
  { href: '/learn/architecture', label: 'Architecture' },
  { href: '/learn/security', label: 'Security & Privacy' },
  { href: '/learn/api', label: 'API Reference' },
];

function PageNav({ currentPath }: { currentPath: string }) {
  const currentIdx = PAGES.findIndex(p => p.href === currentPath);
  const prev = currentIdx > 0 ? PAGES[currentIdx - 1] : null;
  const next = currentIdx < PAGES.length - 1 ? PAGES[currentIdx + 1] : null;

  return (
    <div className="flex items-center justify-between mt-14 pt-6 border-t border-gray-200">
      {prev ? (
        <Link href={prev.href} className="text-sm text-gray-500 hover:text-vigil-700 transition-colors">
          ← {prev.label}
        </Link>
      ) : <span />}
      {next ? (
        <Link href={next.href} className="text-sm text-gray-500 hover:text-vigil-700 transition-colors">
          {next.label} →
        </Link>
      ) : <span />}
    </div>
  );
}

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />
      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex gap-10">
            {/* Sidebar ToC */}
            <aside className="hidden lg:block shrink-0 w-56">
              <div className="sticky top-24">
                <div className="panel p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                    Documentation
                  </p>
                  <nav className="flex flex-col gap-0.5">
                    {PAGES.map((page) => {
                      const isActive = pathname === page.href;
                      return (
                        <Link
                          key={page.href}
                          href={page.href}
                          className={`flex items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-vigil-50 text-vigil-900 font-medium'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <span>{page.label}</span>
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-vigil-600" />}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0 max-w-3xl">
              {/* Mobile ToC */}
              <div className="lg:hidden mb-8">
                <details className="panel p-4">
                  <summary className="text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer">
                    Documentation Pages
                  </summary>
                  <nav className="mt-3 flex flex-col gap-1">
                    {PAGES.map((page) => (
                      <Link
                        key={page.href}
                        href={page.href}
                        className={`px-2.5 py-1.5 text-sm rounded ${
                          pathname === page.href
                            ? 'bg-vigil-50 text-vigil-900 font-medium'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {page.label}
                      </Link>
                    ))}
                  </nav>
                </details>
              </div>

              <div className="learn-content">
                {children}
              </div>

              <PageNav currentPath={pathname} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-10">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
              <p className="text-sm text-gray-500">An AI agent that reads your email and acts on it.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
              <ul className="space-y-2 text-sm text-gray-500">
                {PAGES.map((page) => (
                  <li key={page.href}>
                    <Link href={page.href} className="hover:text-gray-700">{page.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/" className="hover:text-gray-700">Home</Link></li>
                <li><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></li>
                <li><Link href="/auth/register" className="hover:text-gray-700">Sign up</Link></li>
                <li><Link href="/auth/login" className="hover:text-gray-700">Sign in</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 mt-8 pt-8 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Vigil. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
