'use client';

import { useState } from 'react';

interface TooltipProps {
  term: string;
  children: React.ReactNode;
}

export function Tooltip({ term, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="border-b border-dotted border-gray-400 cursor-help">{children}</span>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-100 shadow-lg pointer-events-none whitespace-normal text-center">
          {term}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
