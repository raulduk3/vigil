/**
 * ThreadList Component
 *
 * Displays a list of threads prioritized by silence state.
 * Order: Silent threads first, then recently resolved, then active.
 *
 * Key principles:
 * - Prioritize silent threads (the primary user question: "Where is communication silent?")
 * - Use neutral language throughout
 * - No deadline or urgency indicators
 */

import React from 'react';
import { computeSilenceDuration, getSilenceState } from '@/lib/silence';
import { SilenceIndicator } from './silence-indicator';

export interface ThreadListItem {
  thread_id: string;
  watcher_id: string;
  subject: string;
  status: 'open' | 'closed';
  last_activity_at: number;
  first_message_at: number;
  message_count: number;
  deadline?: number; // Ignored - not displayed
}

export interface ThreadListProps {
  threads: ThreadListItem[];
  silenceThresholdHours: number;
  onThreadClick?: (threadId: string, watcherId: string) => void;
}

type SortCategory = 'silent' | 'recently-resolved' | 'active';

function categorizeThread(
  thread: ThreadListItem,
  thresholdHours: number,
  now: number
): SortCategory {
  if (thread.status === 'closed') {
    return 'recently-resolved';
  }

  const state = getSilenceState({
    lastActivityAt: thread.last_activity_at,
    status: thread.status,
    thresholdHours,
    now,
  });

  return state === 'silent' ? 'silent' : 'active';
}

function sortThreads(
  threads: ThreadListItem[],
  thresholdHours: number,
  now: number
): ThreadListItem[] {
  const categoryOrder: Record<SortCategory, number> = {
    silent: 0,
    'recently-resolved': 1,
    active: 2,
  };

  return [...threads].sort((a, b) => {
    const categoryA = categorizeThread(a, thresholdHours, now);
    const categoryB = categorizeThread(b, thresholdHours, now);

    // First sort by category
    if (categoryA !== categoryB) {
      return categoryOrder[categoryA] - categoryOrder[categoryB];
    }

    // Within same category, sort by silence duration (longest first for silent)
    if (categoryA === 'silent') {
      const durationA = computeSilenceDuration(a.last_activity_at, now);
      const durationB = computeSilenceDuration(b.last_activity_at, now);
      return durationB - durationA; // Longest silence first
    }

    // For other categories, most recent activity first
    return b.last_activity_at - a.last_activity_at;
  });
}

export function ThreadList({
  threads,
  silenceThresholdHours,
  onThreadClick,
}: ThreadListProps) {
  const now = Date.now();

  if (threads.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No threads to display
      </div>
    );
  }

  const sortedThreads = sortThreads(threads, silenceThresholdHours, now);

  return (
    <ol className="thread-list divide-y divide-gray-100" role="list">
      {sortedThreads.map((thread) => {
        const category = categorizeThread(thread, silenceThresholdHours, now);

        return (
          <li
            key={thread.thread_id}
            className="thread-list-item py-3"
          >
            <button
              type="button"
              onClick={() => onThreadClick?.(thread.thread_id, thread.watcher_id)}
              className="w-full text-left hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {thread.subject || 'No subject'}
                    </span>
                    {thread.status === 'closed' && (
                      <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
                        closed
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <SilenceIndicator
                      lastActivityAt={thread.last_activity_at}
                      status={thread.status}
                      thresholdHours={silenceThresholdHours}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                  {thread.message_count} message{thread.message_count !== 1 ? 's' : ''}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default ThreadList;
