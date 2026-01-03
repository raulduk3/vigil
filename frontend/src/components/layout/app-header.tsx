'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ConnectionIndicator } from '@/components/system/connection-indicator';
import { HeaderLogo } from './header-logo';

interface AppHeaderProps {
  /** Optional back link - if provided, shows a back button */
  backHref?: string;
  /** Optional back label - defaults to "Back" */
  backLabel?: string;
  /** Optional title to show next to the logo (for subpages) */
  title?: string;
  /** Optional subtitle to show below the title */
  subtitle?: string;
  /** Whether to show the full navigation (default: true) */
  showNav?: boolean;
  /** Additional content to render on the right side before navigation */
  rightContent?: React.ReactNode;
}

export function AppHeader({
  backHref,
  backLabel = 'Back',
  title,
  subtitle,
  showNav = true,
  rightContent,
}: AppHeaderProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const isOnDashboard = pathname === '/dashboard';
  const isOnAccount = pathname?.startsWith('/account');
  const isOnBilling = pathname === '/account/billing';

  return (
    <header className="bg-surface-raised border-b border-gray-200 sticky top-0 z-50">
      {/* Main header row */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-18">
          {/* Left side: Logo and optional back/title */}
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
            <HeaderLogo />

            {/* Show back button when provided - all screen sizes */}
            {backHref && (
              <>
                <div className="w-px h-5 sm:h-6 bg-gray-200" />
                <Link
                  href={backHref}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 whitespace-nowrap"
                >
                  <span className="sm:hidden">←</span>
                  <span className="hidden sm:inline">← {backLabel}</span>
                </Link>
              </>
            )}

            {/* Show title when provided - hidden on mobile unless no nav */}
            {title && !backHref && (
              <>
                <div className="w-px h-5 sm:h-6 bg-gray-200 hidden sm:block" />
                <div className="min-w-0 hidden sm:block">
                  <h1 className="text-base font-medium text-gray-900 truncate max-w-xs md:max-w-md">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-gray-500 truncate max-w-xs md:max-w-md">{subtitle}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right side: Connection indicator + Navigation */}
          <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
            {rightContent}

            {showNav && (
              <>
                {/* Connection indicator - always visible but smaller on mobile */}
                <div className="hidden sm:block">
                  <ConnectionIndicator />
                </div>

                {/* Desktop navigation links */}
                <nav className="hidden md:flex items-center gap-5">
                  <div className="w-px h-6 bg-gray-200" />

                  <Link
                    href="/dashboard"
                    className={`text-base transition-colors whitespace-nowrap ${
                      isOnDashboard
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Dashboard
                  </Link>

                  <Link
                    href="/account"
                    className={`text-base transition-colors whitespace-nowrap ${
                      isOnAccount && !isOnBilling
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Account
                  </Link>

                  <Link
                    href="/account/billing"
                    className={`text-base transition-colors whitespace-nowrap ${
                      isOnBilling
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Billing
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="text-base text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
                  >
                    Sign out
                  </button>
                </nav>

                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  aria-label="Toggle menu"
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {showNav && mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-surface-raised">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <nav className="space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
                  isOnDashboard
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Dashboard
              </Link>

              <Link
                href="/account"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
                  isOnAccount && !isOnBilling
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Account
              </Link>

              <Link
                href="/account/billing"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
                  isOnBilling
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Billing
              </Link>

              <div className="border-t border-gray-100 my-2" />

              {/* Connection status in mobile menu */}
              <div className="px-3 py-2">
                <ConnectionIndicator />
              </div>

              <div className="border-t border-gray-100 my-2" />

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="block w-full text-left px-3 py-2.5 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile subheader with back link when provided (only if no dropdown menu) */}
      {showNav && backHref && !mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4">
            <div className="py-2.5">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
