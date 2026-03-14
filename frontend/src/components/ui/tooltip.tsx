'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  term: string;
  children: React.ReactNode;
}

export function Tooltip({ term, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const show = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className="inline"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
      >
        <span className="border-b border-dotted border-gray-400 cursor-help">{children}</span>
      </span>
      {visible && mounted && createPortal(
        <div
          style={{ position: 'absolute', top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)' }}
          className="z-[9999] w-64 rounded bg-gray-900 px-3 py-2 text-xs text-gray-100 shadow-lg pointer-events-none whitespace-normal text-center"
        >
          {term}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>,
        document.body
      )}
    </>
  );
}
