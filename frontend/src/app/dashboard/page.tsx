'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RequireAuth } from '@/lib/auth';
import { useRealtimeData } from '@/lib/hooks/use-realtime-data';
import { api, type Watcher, type Thread, type Action, type Memory } from '@/lib/api/client';
import {
  WatcherSidebar,
  InboxPanel,
  ControlPanel,
  SettingsModal,
  SkillsPanel,
} from '@/components/dashboard';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const watcherIdParam = searchParams.get('watcher');

  const { watchers, threads, isLoading, refresh } = useRealtimeData({
    pollInterval: 10000,
    enabled: true,
    pauseWhenHidden: true,
  });

  const [selectedWatcherId, setSelectedWatcherId] = useState<string | null>(watcherIdParam);
  const [settingsWatcher, setSettingsWatcher] = useState<Watcher | null>(null);
  const [localWatchers, setLocalWatchers] = useState<Watcher[]>([]);
  const [localThreads, setLocalThreads] = useState<Record<string, Thread[]>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [mobileTab, setMobileTab] = useState<'inbox' | 'chat' | 'activity' | 'skills'>('inbox');
  const [skillsOpen, setSkillsOpen] = useState(false);

  // Sync from realtime hook
  useEffect(() => {
    setLocalWatchers(watchers);
    setLocalThreads(threads);
  }, [watchers, threads]);

  // Auto-select first watcher
  useEffect(() => {
    if (!selectedWatcherId && localWatchers.length > 0) {
      const firstId = localWatchers[0].id;
      setSelectedWatcherId(firstId);
      router.replace(`/dashboard?watcher=${firstId}`);
    }
  }, [localWatchers, selectedWatcherId, router]);

  // Load actions + memories when watcher changes
  useEffect(() => {
    if (!selectedWatcherId) return;
    setActions([]);
    setMemories([]);
    Promise.all([
      api.getActions(selectedWatcherId),
      api.getMemories(selectedWatcherId),
    ]).then(([actRes, memRes]) => {
      setActions(actRes.actions || []);
      setMemories(memRes.memories || []);
    }).catch(() => {});
  }, [selectedWatcherId]);

  const handleSelectWatcher = useCallback((id: string) => {
    setSelectedWatcherId(id);
    router.replace(`/dashboard?watcher=${id}`);
  }, [router]);

  const handleWatcherUpdate = useCallback((updated: Watcher) => {
    setLocalWatchers((prev) => prev.map((w) => w.id === updated.id ? updated : w));
    if (settingsWatcher?.id === updated.id) {
      setSettingsWatcher(updated);
    }
  }, [settingsWatcher]);

  const handleWatcherDelete = useCallback((deletedId: string) => {
    setLocalWatchers((prev) => prev.filter((w) => w.id !== deletedId));
    setSettingsWatcher(null);
    if (selectedWatcherId === deletedId) {
      const remaining = localWatchers.filter((w) => w.id !== deletedId);
      if (remaining.length > 0) {
        handleSelectWatcher(remaining[0].id);
      } else {
        setSelectedWatcherId(null);
        router.replace('/dashboard');
      }
    }
  }, [selectedWatcherId, localWatchers, handleSelectWatcher, router]);

  const handleThreadStatusChange = useCallback((threadId: string, status: Thread['status']) => {
    if (!selectedWatcherId) return;
    setLocalThreads((prev) => {
      const watcherThreads = prev[selectedWatcherId] || [];
      return {
        ...prev,
        [selectedWatcherId]: watcherThreads.map((t) =>
          t.id === threadId ? { ...t, status } : t
        ),
      };
    });
  }, [selectedWatcherId]);

  const handleRefresh = useCallback(async () => {
    await refresh();
    if (selectedWatcherId) {
      const [actRes, memRes] = await Promise.all([
        api.getActions(selectedWatcherId),
        api.getMemories(selectedWatcherId),
      ]).catch(() => [{ actions: [] }, { memories: [] }]) as [{ actions: Action[] }, { memories: Memory[] }];
      setActions(actRes.actions || []);
      setMemories(memRes.memories || []);
    }
  }, [refresh, selectedWatcherId]);

  const selectedWatcher = localWatchers.find((w) => w.id === selectedWatcherId) ?? null;
  const selectedThreads = selectedWatcherId ? (localThreads[selectedWatcherId] || []) : [];

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-page">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-surface-raised shrink-0">
        <select
          className="flex-1 text-sm font-semibold bg-transparent border border-gray-200 rounded px-2 py-1.5"
          value={selectedWatcherId || ''}
          onChange={(e) => handleSelectWatcher(e.target.value)}
        >
          {localWatchers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        {selectedWatcher && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setSkillsOpen(true)}
              className="text-xs text-vigil-700 px-2 py-1.5 border border-vigil-200 rounded font-medium"
            >
              Skills
            </button>
            <button
              onClick={() => setSettingsWatcher(selectedWatcher)}
              className="text-xs text-gray-500 px-2 py-1.5 border border-gray-200 rounded"
            >
              Settings
            </button>
          </div>
        )}
      </div>

      {/* Left: Watcher Sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <WatcherSidebar
          watchers={localWatchers}
          threads={localThreads}
          selectedId={selectedWatcherId}
          onSelect={handleSelectWatcher}
          onSettings={setSettingsWatcher}
          onSkills={() => setSkillsOpen(true)}
        />
      </div>

      {/* Center: Inbox Panel — show on desktop always, on mobile only when inbox tab */}
      <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab !== 'inbox' ? 'hidden md:flex' : ''}`}>
        <InboxPanel
          watcher={selectedWatcher}
          threads={selectedThreads}
          isLoading={false}
          onRefresh={handleRefresh}
          onWatcherUpdate={handleWatcherUpdate}
          onThreadStatusChange={handleThreadStatusChange}
          memories={memories}
          onMemoriesChange={setMemories}
        />
      </div>

      {/* Right: Control Panel — show on desktop always, on mobile only when chat/activity tab */}
      <div className={`${mobileTab === 'inbox' ? 'hidden lg:flex' : mobileTab === 'chat' || mobileTab === 'activity' ? 'flex flex-1 lg:w-90 lg:flex-none' : 'hidden lg:flex'}`}>
        <ControlPanel
          watcherId={selectedWatcherId}
          threads={selectedThreads}
          actions={actions}
          memories={memories}
        />
      </div>

      {/* Mobile bottom tabs */}
      <div className="md:hidden flex border-t border-gray-200 bg-surface-raised shrink-0">
        <button
          onClick={() => setMobileTab('inbox')}
          className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${mobileTab === 'inbox' ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${mobileTab === 'chat' ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab('activity')}
          className={`flex-1 py-3 text-xs font-semibold text-center transition-colors ${mobileTab === 'activity' ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`}
        >
          Activity
        </button>
        <button
          onClick={() => setSkillsOpen(true)}
          className="flex-1 py-3 text-xs font-semibold text-center transition-colors text-vigil-700"
        >
          Skills
        </button>
      </div>

      {/* Skills Modal */}
      {skillsOpen && (
        <SkillsPanel
          watcher={selectedWatcher}
          onClose={() => setSkillsOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsWatcher && (
        <SettingsModal
          watcher={settingsWatcher}
          onClose={() => setSettingsWatcher(null)}
          onUpdate={handleWatcherUpdate}
          onDelete={handleWatcherDelete}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="h-screen flex items-center justify-center bg-surface-page">
            <span className="spinner" />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </RequireAuth>
  );
}
