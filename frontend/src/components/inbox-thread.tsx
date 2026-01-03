/**
 * InboxThread Component
 *
 * Displays a thread in inbox-style with expandable messages.
 * Each message can be moved to another thread when move handler is provided.
 *
 * Key features:
 * - Collapsible thread header with message count
 * - Chronological message list when expanded
 * - Move action for each message
 * - Neutral silence state indicator
 */

'use client';

import React, { useState } from 'react';
import { SilenceIndicator } from './silence-indicator';

export interface InboxMessage {
  email_id: string;
  sender: string;
  subject: string;
  timestamp: number;
  body_excerpt?: string;
}

export interface InboxThreadProps {
  threadId: string;
  subject: string;
  messages: InboxMessage[];
  status: 'open' | 'closed';
  lastActivityAt: number;
  silenceThresholdHours: number;
  defaultExpanded?: boolean;
  onMoveMessage?: (emailId: string, fromThreadId: string) => void;
  onClose?: (threadId: string) => void;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  if (isThisYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function InboxThread({
  threadId,
  subject,
  messages,
  status,
  lastActivityAt,
  silenceThresholdHours,
  defaultExpanded = false,
  onMoveMessage,
  onClose,
}: InboxThreadProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Sort messages chronologically (oldest first)
  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleMoveMessage = (emailId: string) => {
    onMoveMessage?.(emailId, threadId);
  };

  return (
    <div className="inbox-thread border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Thread Header - Always visible */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse thread' : 'Expand thread'}
        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Expand/Collapse Icon */}
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>

            {/* Subject */}
            <span className="font-medium text-gray-900 truncate">
              {subject || 'No subject'}
            </span>

            {/* Status badge */}
            {status === 'closed' && (
              <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded flex-shrink-0">
                closed
              </span>
            )}
          </div>

          {/* Right side: message count and silence state */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-gray-500">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </span>
            <SilenceIndicator
              lastActivityAt={lastActivityAt}
              status={status}
              thresholdHours={silenceThresholdHours}
              compact
            />
          </div>
        </div>
      </button>

      {/* Messages - Visible when expanded */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {sortedMessages.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 italic">
              No messages in this thread
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedMessages.map((message) => (
                <article
                  key={message.email_id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Sender and timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {message.sender}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </div>

                      {/* Subject if different from thread */}
                      {message.subject !== subject && (
                        <p className="text-sm text-gray-700 mb-1">
                          {message.subject}
                        </p>
                      )}

                      {/* Body excerpt */}
                      {message.body_excerpt && (
                        <p className="text-sm text-gray-500 line-clamp-2">
                          {message.body_excerpt}
                        </p>
                      )}
                    </div>

                    {/* Move action */}
                    {onMoveMessage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveMessage(message.email_id);
                        }}
                        aria-label={`Move message from ${message.sender}`}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                        title="Move to another thread"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Thread actions */}
          {status === 'open' && onClose && (
            <div className="p-3 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={() => onClose(threadId)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Mark as resolved
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default InboxThread;
