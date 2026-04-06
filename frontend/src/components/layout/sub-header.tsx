'use client';

import Link from 'next/link';
import React from 'react';

interface SubHeaderProps {
  /** Title of the page/section */
  title: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Optional back link */
  backHref?: string;
  /** Optional back label */
  backLabel?: string;
  /** Content to render on the right side (actions, badges, etc.) */
  rightContent?: React.ReactNode;
}

export function SubHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  rightContent,
}: SubHeaderProps) {
  return (
    <div className="bg-surface-raised border-b border-gray-200">
      <div className="site-shell">
        <div className="flex items-center justify-between gap-4 py-5 min-h-18">
          {/* Left: Back link + title */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4 mb-2">
              {backHref && (
                <>
                  <Link
                    href={backHref}
                    className="text-base text-gray-600 hover:text-gray-900 whitespace-nowrap"
                  >
                    ← {backLabel}
                  </Link>
                  <div className="w-px h-5 bg-gray-200" />
                </>
              )}
              <h1 className="text-xl font-semibold text-gray-900 truncate">
                {title}
              </h1>
            </div>
            {subtitle && (
              <p className="text-base text-gray-500 truncate">
                {subtitle}
              </p>
            )}
          </div>

          {/* Right: Actions/badges */}
          {rightContent && (
            <div className="flex items-center gap-3 flex-shrink-0">
              {rightContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
