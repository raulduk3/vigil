'use client';

import { useState, useCallback } from 'react';
import type { Watcher, Thread } from '@/lib/api/client';
import { EmailRow } from './email-row';
import { EmailDetail } from './email-detail';
import { ReactivitySlider } from './reactivity-slider';
import { api } from '@/lib/api/client';

type FilterStatus = 'all' | 'active' | 'watching' | 'ignored';

interface InboxPanelProps {
  watcher: Watcher | null;
  threads: Thread[];
  isLoading: boolean;
  onRefresh: () => void;
  onWatcherUpdate: (updated: Watcher) => void;
  onThreadStatusChange: (threadId: string, status: Thread['status']) => void;
}

export function InboxPanel({
  watcher,
  threads,
  isLoading,
  onRefresh,
  onWatcherUpdate,
  onThreadStatusChange,
}: InboxPanelProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [savingReactivity, setSavingReactivity] = useState(false);

  const filtered = threads.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const activeCount = threads.filter((t) => t.status === 'active').length;
  const watchingCount = threads.filter((t) => t.status === 'watching').length;
  const ignoredCount = threads.filter((t) => t.status === 'ignored').length;

  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;

  const handleReactivityChange = useCallback(async (val: number) => {
    if (!watcher) return;
    setSavingReactivity(true);
    try {
      const res = await api.updateWatcher(watcher.id, { reactivity: val });
      onWatcherUpdate(res.watcher);
    } catch {
      // ignore
    } finally {
      setSavingReactivity(false);
    }
  }, [watcher, onWatcherUpdate]);

  if (!watcher) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-page">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Select a watcher</p>
          <p className="text-xs text-gray-400">Choose a watcher from the sidebar to view its inbox.</p>
        </div>
      </div>
    );
  }

  // Split view: show detail on right when thread selected
  if (selectedThread) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Thread list - narrower */}
        <div className="w-64 shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">
          <InboxHeader
            watcher={watcher}
            filter={filter}
            onFilter={setFilter}
            onRefresh={onRefresh}
            savingReactivity={savingReactivity}
            onReactivityChange={handleReactivityChange}
          />
          <div className="flex-1 overflow-y-auto">
            {filtered.map((thread) => (
              <EmailRow
                key={thread.id}
                thread={thread}
                isSelected={thread.id === selectedThreadId}
                onClick={() => setSelectedThreadId(thread.id)}
              />
            ))}
          </div>
        </div>
        {/* Detail view */}
        <div className="flex-1 overflow-hidden">
          <EmailDetail
            thread={selectedThread}
            watcherId={watcher.id}
            onClose={() => setSelectedThreadId(null)}
            onStatusChange={onThreadStatusChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-page">
      <InboxHeader
        watcher={watcher}
        filter={filter}
        onFilter={setFilter}
        onRefresh={onRefresh}
        savingReactivity={savingReactivity}
        onReactivityChange={handleReactivityChange}
      />

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <span className="spinner" />
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No {filter !== 'all' ? filter : ''} threads</div>
            <div className="empty-state-description">
              {filter === 'all'
                ? 'Forward emails to your watcher address to start.'
                : `No threads with status "${filter}".`}
            </div>
          </div>
        )}
        {!isLoading && filtered.map((thread) => (
          <EmailRow
            key={thread.id}
            thread={thread}
            isSelected={false}
            onClick={() => setSelectedThreadId(thread.id)}
          />
        ))}
      </div>

      {/* Footer */}
      {!isLoading && (
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400 bg-surface-raised">
          Showing {filtered.length} thread{filtered.length !== 1 ? 's' : ''} · {activeCount} active · {watchingCount} watching · {ignoredCount} ignored
        </div>
      )}
    </div>
  );
}

interface InboxHeaderProps {
  watcher: Watcher;
  filter: FilterStatus;
  onFilter: (f: FilterStatus) => void;
  onRefresh: () => void;
  savingReactivity: boolean;
  onReactivityChange: (val: number) => void;
}

function InboxHeader({ watcher, filter, onFilter, onRefresh, savingReactivity, onReactivityChange }: InboxHeaderProps) {
  const filters: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'watching', label: 'Watching' },
    { value: 'ignored', label: 'Ignored' },
  ];

  return (
    <div className="border-b border-gray-200 bg-surface-raised px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2 justify-between">
        <h2 className="text-sm font-semibold text-gray-900 truncate">{watcher.name}</h2>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Compact reactivity slider */}
      <ReactivitySlider
        value={watcher.reactivity ?? 3}
        onChange={onReactivityChange}
        variant="compact"
        disabled={savingReactivity}
      />

      {/* Filter tabs */}
      <div className="flex gap-0.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilter(f.value)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              filter === f.value
                ? 'bg-vigil-900 text-white font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
