'use client';

import { useAuth, RequireAuth } from '@/lib/auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/layout';

function AccountLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/account', label: 'Profile' },
    { href: '/account/security', label: 'Security' },
    { href: '/account/billing', label: 'Billing' },
  ];

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">
      <AppHeader />

      {/* Main Content */}
      <main className="flex-1 w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            {/* Sidebar */}
            <aside className="w-full md:w-48 md:flex-shrink-0">
              <nav className="space-y-0.5">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-3 py-2 text-sm rounded ${
                        isActive
                          ? 'bg-surface-sunken text-gray-900 font-medium'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-surface-sunken'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* User Info */}
              <div className="mt-8 p-3 bg-surface-sunken rounded border border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Signed in as</p>
                <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Vigil</p>
        </div>
      </footer>
    </div>
  );
}

export default function AccountLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AccountLayout>{children}</AccountLayout>
    </RequireAuth>
  );
}
