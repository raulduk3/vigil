'use client';

import Link from 'next/link';
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

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const isOnDashboard = pathname === '/dashboard';
  const isOnAccount = pathname?.startsWith('/account');
  const isOnBilling = pathname === '/account/billing';

  return (
    <header className="bg-surface-raised border-b border-gray-200">
      {/* Main header row */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-center h-18">
          {/* Left side: Logo and optional back/title */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
            <HeaderLogo />
            
            {/* Show back button when provided - desktop only */}
            {backHref && (
              <>
                <div className="w-px h-6 bg-gray-200 hidden sm:block" />
                <Link href={backHref} className="text-base text-gray-600 hover:text-gray-900 whitespace-nowrap hidden sm:block">
                  ← {backLabel}
                </Link>
              </>
            )}
            
            {/* Show title when provided - desktop only */}
            {title && (
              <>
                <div className="w-px h-6 bg-gray-200 hidden sm:block" />
                <div className="min-w-0 hidden sm:block">
                  <h1 className="text-base font-medium text-gray-900 truncate max-w-xs md:max-w-md">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-gray-500 truncate max-w-xs md:max-w-md">{subtitle}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right side: Connection indicator (desktop) + Sign out */}
          <div className="flex items-center gap-4 sm:gap-5 flex-shrink-0">
            {rightContent}
            
            {showNav && (
              <div className="flex items-center gap-4 sm:gap-5">
                {/* Connection indicator - desktop only */}
                <div className="hidden sm:block">
                  <ConnectionIndicator />
                </div>
                
                {/* Desktop navigation links */}
                <nav className="hidden sm:flex items-center gap-5">
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

                {/* Mobile: Sign out button only */}
                <button
                  onClick={handleLogout}
                  className="sm:hidden text-base text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile subheader: Navigation pages */}
      {showNav && (
        <div className="sm:hidden border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-6">
            <nav className="flex items-center gap-1.5 py-2.5 overflow-x-auto">
              <Link 
                href="/dashboard" 
                className={`px-3.5 py-2 rounded-md text-base font-medium transition-colors whitespace-nowrap ${
                  isOnDashboard 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Dashboard
              </Link>
              
              <Link 
                href="/account" 
                className={`px-3.5 py-2 rounded-md text-base font-medium transition-colors whitespace-nowrap ${
                  isOnAccount && !isOnBilling
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Account
              </Link>
              
              <Link 
                href="/account/billing" 
                className={`px-3.5 py-2 rounded-md text-base font-medium transition-colors whitespace-nowrap ${
                  isOnBilling
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Billing
              </Link>

              {/* Show back link in mobile subheader when provided */}
              {backHref && (
                <>
                  <div className="w-px h-5 bg-gray-200 mx-1.5" />
                  <Link 
                    href={backHref} 
                    className="px-3.5 py-2 rounded-md text-base text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    ← {backLabel}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
