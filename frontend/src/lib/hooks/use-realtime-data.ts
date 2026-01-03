/**
 * Real-time data polling hook
 * 
 * Provides automatic polling for dashboard data with:
 * - Configurable poll interval
 * - Automatic pause when tab is hidden
 * - Loading and error states
 * - Manual refresh capability
 * - New data detection
 * - SMOOTH updates without jitter (uses refs for transient state)
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
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Whether to poll automatically (default: true) */
  enabled?: boolean;
  /** Whether to pause polling when tab is hidden (default: true) */
  pauseWhenHidden?: boolean;
}

export function useRealtimeData(options: UseRealtimeDataOptions = {}) {
  const {
    pollInterval = 5000,
    enabled = true,
    pauseWhenHidden = true,
  } = options;

  // Main data state - only updated when data actually changes
  const [state, setState] = useState<RealtimeDataState>({
    watchers: [],
    threads: {},
    isLoading: true,
    hasNewData: false,
    error: null,
    lastUpdated: null,
  });

  // Separate polling state to isolate re-renders
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const previousDataRef = useRef<string | null>(null);
  const fetchInProgressRef = useRef(false);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    
    if (enabled) {
      fetchData(true);
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async (isInitialLoad = false) => {
    // Prevent concurrent fetches
    if (fetchInProgressRef.current) {
      return;
    }
    
    if (!isInitialLoad && !isMountedRef.current) {
      return;
    }

    fetchInProgressRef.current = true;
    
    // Only set polling state, don't touch data state yet
    if (!isInitialLoad) {
      setIsPolling(true);
    }

    try {
      // Fetch watchers
      const result = await api.getWatchers();
      const watcherList = result.watchers || [];

      if (!isMountedRef.current) {
        fetchInProgressRef.current = false;
        return;
      }

      // Fetch threads for each watcher in parallel for speed
      const threadPromises = watcherList.map(async (watcher) => {
        const result = await api.getThreads(watcher.watcher_id);
        return { watcherId: watcher.watcher_id, threads: result.threads || [] };
      });

      const threadResults = await Promise.all(threadPromises);
      const threadData: Record<string, Thread[]> = {};
      for (const { watcherId, threads } of threadResults) {
        threadData[watcherId] = threads || [];
      }

      if (!isMountedRef.current) {
        fetchInProgressRef.current = false;
        return;
      }

      // Detect if data changed
      const currentData = JSON.stringify({ watchers: watcherList, threads: threadData });
      const hasNewData = previousDataRef.current !== null && previousDataRef.current !== currentData;
      previousDataRef.current = currentData;

      // Single state update with all data
      setState({
        watchers: watcherList,
        threads: threadData,
        isLoading: false,
        hasNewData,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      if (!isMountedRef.current) {
        fetchInProgressRef.current = false;
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data';

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
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

  // Polling setup
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const startPolling = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
      pollTimerRef.current = window.setInterval(() => {
        fetchData(false);
      }, pollInterval);
    };

    const stopPolling = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (!pauseWhenHidden) return;

      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh immediately and resume polling
        fetchData(false);
        startPolling();
      } else {
        // Tab became hidden - pause polling
        stopPolling();
      }
    };

    // Start polling
    startPolling();

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopPolling();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled, pollInterval, pauseWhenHidden, fetchData]);

  return {
    ...state,
    isPolling,
    refresh,
    clearNewDataIndicator,
  };
}
