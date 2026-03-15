'use client';

import Link from 'next/link';
import type { Watcher, Thread } from '@/lib/api/client';

interface WatcherSidebarProps {
  watchers: Watcher[];
  threads: Record<string, Thread[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSettings: (watcher: Watcher) => void;
  onSkills?: () => void;
}

function statusDot(status: Watcher['status']) {
  if (status === 'active') return 'bg-status-ok';
  if (status === 'paused') return 'bg-status-warning';
  return 'bg-gray-400';
}

export function WatcherSidebar({
  watchers,
  threads,
  selectedId,
  onSelect,
  onSettings,
  onSkills,
}: WatcherSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-vigil-900 w-60 shrink-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-vigil-300">Watchers</h2>
      </div>

      {/* Watcher list */}
      <div className="flex-1 overflow-y-auto py-1">
        {watchers.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-gray-500 mb-3">No watchers yet</p>
            <a href="/watchers/new" className="btn btn-primary text-xs px-4 py-2">Create your first watcher</a>
          </div>
        )}
        {watchers.map((watcher) => {
          const watcherThreads = threads[watcher.id] || [];
          const activeCount = watcherThreads.filter((t) => t.status === 'active' || t.status === 'watching').length;
          const isSelected = watcher.id === selectedId;

          return (
            <div
              key={watcher.id}
              className={`group flex items-center gap-2.5 px-3 py-2 mx-1 rounded cursor-pointer transition-colors duration-75 ${
                isSelected ? 'bg-vigil-800' : 'hover:bg-vigil-800/60'
              }`}
              onClick={() => onSelect(watcher.id)}
            >
              {/* Status dot */}
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${statusDot(watcher.status)}`}
              />

              {/* Name */}
              <span
                className={`flex-1 text-sm truncate ${
                  isSelected ? 'text-white font-medium' : 'text-gray-300'
                }`}
              >
                {watcher.name}
              </span>

              {/* Active thread badge */}
              {activeCount > 0 && (
                <span className="shrink-0 text-xs font-semibold text-white bg-status-critical/80 rounded-full w-4 h-4 flex items-center justify-center tabular-nums">
                  {activeCount > 9 ? '9+' : activeCount}
                </span>
              )}

              {/* Gear icon — shown on hover or when selected */}
              <button
                onClick={(e) => { e.stopPropagation(); onSettings(watcher); }}
                className={`shrink-0 p-0.5 rounded transition-opacity ${
                  isSelected ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                } text-gray-400 hover:text-white`}
                title="Settings"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-vigil-800 px-3 py-3 space-y-1">
        <Link
          href="/watchers/new"
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-vigil-300 hover:text-white hover:bg-vigil-800/60 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Watcher
        </Link>
        {onSkills && (
          <button
            onClick={onSkills}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-vigil-300 hover:text-white hover:bg-vigil-800/60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Skills
          </button>
        )}
        <Link
          href="/account"
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-vigil-400 hover:text-white hover:bg-vigil-800/60 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Account
        </Link>
      </div>
    </div>
  );
}
