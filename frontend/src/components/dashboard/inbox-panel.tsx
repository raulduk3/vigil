'use client';

import { useState, useCallback } from 'react';
import type { Watcher, Thread, Memory } from '@/lib/api/client';
import { EmailRow } from './email-row';
import { EmailDetail } from './email-detail';
import { ReactivitySlider } from './reactivity-slider';
import { MemoryPanel } from './memory-panel';
import { ActivityLog } from './activity-log';
import { api } from '@/lib/api/client';
import { Term } from '@/components/ui/term';

type FilterStatus = 'all' | 'active' | 'watching' | 'ignored';
type MainTab = 'inbox' | 'activity' | 'memory';

interface InboxPanelProps {
  watcher: Watcher | null;
  threads: Thread[];
  isLoading: boolean;
  onRefresh: () => void;
  onWatcherUpdate: (updated: Watcher) => void;
  onThreadStatusChange: (threadId: string, status: Thread['status']) => void;
  memories: Memory[];
  onMemoriesChange: (memories: Memory[]) => void;
}

export function InboxPanel({
  watcher,
  threads,
  isLoading,
  onRefresh,
  onWatcherUpdate,
  onThreadStatusChange,
  memories,
  onMemoriesChange,
}: InboxPanelProps) {
  const [tab, setTab] = useState<MainTab>('inbox');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [savingReactivity, setSavingReactivity] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = threads.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const activeCount = threads.filter((t) => t.status === 'active' || t.status === 'watching').length;
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

  const mainTabs: { value: MainTab; label: string }[] = [
    { value: 'inbox', label: 'Inbox' },
    { value: 'activity', label: 'Activity' },
    { value: 'memory', label: 'Memory' },
  ];

  const filterTabs: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'watching', label: 'Watching' },
    { value: 'ignored', label: 'Ignored' },
  ];

  const header = (
    <div className="border-b border-gray-200 bg-surface-raised px-4 pt-3 pb-0 space-y-2.5">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 shrink-0">{watcher.name}</h2>
          <button
            onClick={() => { navigator.clipboard?.writeText(watcher.ingestion_address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-xs font-mono text-gray-400 hover:text-vigil-700 truncate transition-colors"
            title="Click to copy"
          >
            {copied ? 'Copied!' : watcher.ingestion_address}
          </button>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Main tabs */}
      <div className="flex gap-0.5">
        {mainTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
              tab === t.value
                ? 'border-vigil-900 text-vigil-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Inbox sub-controls */}
      {tab === 'inbox' && (
        <div className="space-y-2 pb-2">
          <ReactivitySlider
            value={watcher.reactivity ?? 3}
            onChange={handleReactivityChange}
            variant="compact"
            disabled={savingReactivity}
          />
          <div className="flex gap-0.5">
            {filterTabs.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  filter === f.value
                    ? 'bg-vigil-900 text-white font-medium'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {f.value === 'all' ? f.label : <Term>{f.label}</Term>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Split view when thread selected in inbox
  if (tab === 'inbox' && selectedThread) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Thread list - narrower */}
        <div className="w-64 shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">
          {header}
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
        <div className="flex-1 min-w-0 overflow-hidden">
          <EmailDetail
            thread={selectedThread}
            watcherId={watcher.id}
            onClose={() => setSelectedThreadId(null)}
            onStatusChange={onThreadStatusChange}
            onDelete={(id) => {
              setSelectedThreadId(null);
              onThreadStatusChange(id, 'ignored');
              onRefresh();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-page">
      {header}

      {tab === 'inbox' && (
        <>
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
                    ? 'Forward emails to your watcher address to get started. Check the watcher settings for your forwarding address.'
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

          {!isLoading && (
            <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400 bg-surface-raised">
              Showing {filtered.length} thread{filtered.length !== 1 ? 's' : ''} · {activeCount} active · {watchingCount} watching · {ignoredCount} ignored
            </div>
          )}
        </>
      )}

      {tab === 'activity' && (
        <ActivityLog watcherId={watcher.id} />
      )}

      {tab === 'memory' && (
        <MemoryPanel
          watcherId={watcher.id}
          memories={memories}
          onMemoriesChange={onMemoriesChange}
        />
      )}
    </div>
  );
}
