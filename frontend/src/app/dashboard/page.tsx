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
    <div className="h-screen flex overflow-hidden">
      {/* Left: Watcher Sidebar (240px) */}
      <WatcherSidebar
        watchers={localWatchers}
        threads={localThreads}
        selectedId={selectedWatcherId}
        onSelect={handleSelectWatcher}
        onSettings={setSettingsWatcher}
      />

      {/* Center: Inbox Panel (flex-1) */}
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

      {/* Right: Control Panel (360px) */}
      <ControlPanel
        watcherId={selectedWatcherId}
        threads={selectedThreads}
        actions={actions}
        memories={memories}
      />

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
