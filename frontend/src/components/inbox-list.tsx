/**
 * InboxList Component
 *
 * Displays a list of threads in inbox-style with expandable messages.
 * Handles move dialog for moving messages between threads.
 *
 * Key features:
 * - Sorts threads: silent first, then by last activity
 * - Move message dialog with thread selection
 * - Create new thread option
 */

'use client';

import React, { useState } from 'react';
import { InboxThread, InboxMessage } from './inbox-thread';
import { getSilenceState, computeSilenceDuration } from '@/lib/silence';

export interface InboxListThread {
  thread_id: string;
  subject: string;
  status: 'open' | 'closed';
  last_activity_at: number;
  messages: InboxMessage[];
}

export interface InboxListProps {
  threads: InboxListThread[];
  silenceThresholdHours: number;
  onMoveMessage?: (emailId: string, fromThreadId: string, toThreadId: string) => void;
  onCreateThread?: (emailId: string, fromThreadId: string) => void;
  onCloseThread?: (threadId: string) => void;
}

interface MoveDialogState {
  isOpen: boolean;
  emailId: string | null;
  fromThreadId: string | null;
}

export function InboxList({
  threads,
  silenceThresholdHours,
  onMoveMessage,
  onCreateThread,
  onCloseThread,
}: InboxListProps) {
  const [moveDialog, setMoveDialog] = useState<MoveDialogState>({
    isOpen: false,
    emailId: null,
    fromThreadId: null,
  });

  const now = Date.now();

  // Sort threads: silent first (longest silence first), then active (most recent first)
  const sortedThreads = [...threads].sort((a, b) => {
    const stateA = getSilenceState({
      lastActivityAt: a.last_activity_at,
      status: a.status,
      thresholdHours: silenceThresholdHours,
      now,
    });
    const stateB = getSilenceState({
      lastActivityAt: b.last_activity_at,
      status: b.status,
      thresholdHours: silenceThresholdHours,
      now,
    });

    // Silent threads first
    if (stateA === 'silent' && stateB !== 'silent') return -1;
    if (stateA !== 'silent' && stateB === 'silent') return 1;

    // Within same state, sort by silence duration (longest first) or recency
    if (stateA === 'silent' && stateB === 'silent') {
      const durationA = computeSilenceDuration(a.last_activity_at, now);
      const durationB = computeSilenceDuration(b.last_activity_at, now);
      return durationB - durationA;
    }

    // Closed threads after open
    if (a.status === 'closed' && b.status !== 'closed') return 1;
    if (a.status !== 'closed' && b.status === 'closed') return -1;

    // Most recent first
    return b.last_activity_at - a.last_activity_at;
  });

  const handleMoveMessage = (emailId: string, fromThreadId: string) => {
    setMoveDialog({
      isOpen: true,
      emailId,
      fromThreadId,
    });
  };

  const handleSelectDestination = (toThreadId: string) => {
    if (moveDialog.emailId && moveDialog.fromThreadId && onMoveMessage) {
      onMoveMessage(moveDialog.emailId, moveDialog.fromThreadId, toThreadId);
    }
    setMoveDialog({ isOpen: false, emailId: null, fromThreadId: null });
  };

  const handleCreateNewThread = () => {
    if (moveDialog.emailId && moveDialog.fromThreadId && onCreateThread) {
      onCreateThread(moveDialog.emailId, moveDialog.fromThreadId);
    }
    setMoveDialog({ isOpen: false, emailId: null, fromThreadId: null });
  };

  const handleCloseDialog = () => {
    setMoveDialog({ isOpen: false, emailId: null, fromThreadId: null });
  };

  if (threads.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        No threads to display
      </div>
    );
  }

  // Get destination threads (excluding the source thread)
  const destinationThreads = sortedThreads.filter(
    t => t.thread_id !== moveDialog.fromThreadId && t.status === 'open'
  );

  return (
    <div className="inbox-list space-y-3">
      {sortedThreads.map((thread) => (
        <InboxThread
          key={thread.thread_id}
          threadId={thread.thread_id}
          subject={thread.subject}
          messages={thread.messages}
          status={thread.status}
          lastActivityAt={thread.last_activity_at}
          silenceThresholdHours={silenceThresholdHours}
          onMoveMessage={onMoveMessage ? handleMoveMessage : undefined}
          onClose={onCloseThread}
        />
      ))}

      {/* Move Message Dialog */}
      {moveDialog.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-dialog-title"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 id="move-dialog-title" className="text-lg font-semibold text-gray-900">
                Move message to...
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Select a destination thread or create a new one
              </p>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {destinationThreads.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  No other open threads available
                </p>
              ) : (
                <div className="space-y-2">
                  {destinationThreads.map((thread) => (
                    <button
                      key={thread.thread_id}
                      type="button"
                      onClick={() => handleSelectDestination(thread.thread_id)}
                      className="w-full text-left p-3 rounded border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900">
                        {thread.subject || 'No subject'}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {onCreateThread && (
                <button
                  type="button"
                  onClick={handleCreateNewThread}
                  className="w-full mt-4 p-3 rounded border-2 border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  + Create new thread
                </button>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={handleCloseDialog}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InboxList;
