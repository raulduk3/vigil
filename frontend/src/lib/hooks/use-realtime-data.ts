/**
 * Real-time data polling hook for V2
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type Watcher, type Thread } from '@/lib/api/client';

export interface RealtimeDataState {
  watchers: Watcher[];
  threads: Record<string, Thread[]>;
  isLoading: boolean;
  hasNewData: boolean;
  error: string | null;
  lastUpdated: number | null;
}

interface UseRealtimeDataOptions {
  pollInterval?: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
}

export function useRealtimeData(options: UseRealtimeDataOptions = {}) {
  const {
    pollInterval = 10000,
    enabled = true,
    pauseWhenHidden = true,
  } = options;

  const [state, setState] = useState<RealtimeDataState>({
    watchers: [],
    threads: {},
    isLoading: true,
    hasNewData: false,
    error: null,
    lastUpdated: null,
  });

  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const previousDataRef = useRef<string | null>(null);
  const fetchInProgressRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    if (enabled) fetchData(true);
    return () => { isMountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (fetchInProgressRef.current) return;
    if (!isInitialLoad && !isMountedRef.current) return;

    fetchInProgressRef.current = true;
    if (!isInitialLoad) setIsPolling(true);

    try {
      const result = await api.getWatchers();
      const watcherList = result.watchers || [];

      if (!isMountedRef.current) { fetchInProgressRef.current = false; return; }

      const threadPromises = watcherList.map(async (watcher) => {
        try {
          const result = await api.getThreads(watcher.id);
          return { watcherId: watcher.id, threads: result.threads || [] };
        } catch {
          return { watcherId: watcher.id, threads: [] };
        }
      });

      const threadResults = await Promise.all(threadPromises);
      const threadData: Record<string, Thread[]> = {};
      for (const { watcherId, threads } of threadResults) {
        threadData[watcherId] = threads;
      }

      if (!isMountedRef.current) { fetchInProgressRef.current = false; return; }

      const currentData = JSON.stringify({ watchers: watcherList, threads: threadData });
      const hasNewData = previousDataRef.current !== null && previousDataRef.current !== currentData;
      previousDataRef.current = currentData;

      setState({
        watchers: watcherList,
        threads: threadData,
        isLoading: false,
        hasNewData,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      if (!isMountedRef.current) { fetchInProgressRef.current = false; return; }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      }));
    } finally {
      fetchInProgressRef.current = false;
      setIsPolling(false);
    }
  }, []);

  const clearNewDataIndicator = useCallback(() => {
    setState((prev) => ({ ...prev, hasNewData: false }));
  }, []);

  const refresh = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const startPolling = () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => fetchData(false), pollInterval);
    };

    const stopPolling = () => {
      if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };

    const handleVisibilityChange = () => {
      if (!pauseWhenHidden) return;
      if (document.visibilityState === 'visible') { fetchData(false); startPolling(); }
      else stopPolling();
    };

    startPolling();
    if (pauseWhenHidden) document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, pollInterval, pauseWhenHidden, fetchData]);

  return { ...state, isPolling, refresh, clearNewDataIndicator };
}
