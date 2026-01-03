/**
 * WatcherInbox Component
 *
 * Table-based inbox for the watcher detail page.
 * Displays threads in a familiar email inbox table format.
 *
 * Key features:
 * - Table layout like Gmail/Outlook
 * - Silent threads highlighted at top
 * - Click to select thread (shown in side panel)
 * - Quick close action
 */

'use client';

import React, { useState, useMemo } from 'react';
import type { Thread, VigilEvent } from '@/lib/api';
import { getSilenceState, computeSilenceDuration, formatSilenceDuration } from '@/lib/silence';

export interface WatcherInboxProps {
  threads: Thread[];
  events: VigilEvent[];
  silenceThresholdHours: number;
  selectedThreadId?: string | null;
  onSelectThread?: (threadId: string | null) => void;
  onCloseThread?: (threadId: string) => void;
}

export interface ThreadWithMeta extends Thread {
  participants: string[];
  messageCount: number;
  latestSender: string;
  emails: Array<{
    email_id: string;
    sender: string;
    subject: string;
    timestamp: number;
    body_excerpt?: string;
  }>;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function WatcherInbox({
  threads,
  events,
  silenceThresholdHours,
  selectedThreadId,
  onSelectThread,
  onCloseThread,
}: WatcherInboxProps) {
  const [showClosed, setShowClosed] = useState(false);

  // Build thread metadata from events
  const threadsWithMeta = useMemo(() => {
    // Build email_id to thread_id mapping
    const emailToThread = new Map<string, string>();
    for (const event of events) {
      if (event.type === 'THREAD_OPENED' || event.type === 'THREAD_EMAIL_ADDED') {
        const data = { ...event.payload, ...event } as Record<string, unknown>;
        const threadId = String(data.thread_id || '');
        const emailId = String(data.email_id || '');
        if (threadId && emailId) {
          emailToThread.set(emailId, threadId);
        }
      }
    }

    // Group senders and emails by thread
    const sendersByThread = new Map<string, Set<string>>();
    const messageCountByThread = new Map<string, number>();
    const latestSenderByThread = new Map<string, { sender: string; timestamp: number }>();
    const emailsByThread = new Map<string, Array<{ email_id: string; sender: string; subject: string; timestamp: number; body_excerpt?: string }>>();

    for (const event of events) {
      if (event.type === 'EMAIL_RECEIVED') {
        const data = { ...event.payload, ...event } as Record<string, unknown>;
        const emailId = String(data.email_id || event.event_id || '');
        const sender = String(data.original_sender || data.sender || 'Unknown');
        const subject = String(data.subject || 'No subject');
        const bodyExcerpt = data.body_excerpt ? String(data.body_excerpt) : undefined;
        
        let threadId = emailToThread.get(emailId);
        if (!threadId) {
          threadId = String(data.routed_to_thread_id || data.thread_id || '');
        }

        if (threadId) {
          // Track senders
          const senders = sendersByThread.get(threadId) || new Set();
          senders.add(sender);
          sendersByThread.set(threadId, senders);

          // Track message count
          messageCountByThread.set(threadId, (messageCountByThread.get(threadId) || 0) + 1);

          // Track latest sender
          const existing = latestSenderByThread.get(threadId);
          if (!existing || event.timestamp > existing.timestamp) {
            latestSenderByThread.set(threadId, { sender, timestamp: event.timestamp });
          }

          // Track emails for thread detail view
          const emails = emailsByThread.get(threadId) || [];
          emails.push({ email_id: emailId, sender, subject, timestamp: event.timestamp, body_excerpt: bodyExcerpt });
          emailsByThread.set(threadId, emails);
        }
      }
    }

    return threads.map((thread): ThreadWithMeta => {
      const emails = emailsByThread.get(thread.thread_id) || [];
      // Sort emails chronologically (oldest first)
      emails.sort((a, b) => a.timestamp - b.timestamp);
      
      return {
        ...thread,
        participants: Array.from(sendersByThread.get(thread.thread_id) || []),
        messageCount: messageCountByThread.get(thread.thread_id) || thread.message_count || 0,
        latestSender: latestSenderByThread.get(thread.thread_id)?.sender || '',
        emails,
      };
    });
  }, [threads, events]);

  // Sort threads: silent first, then by last activity
  const sortedThreads = useMemo(() => {
    const now = Date.now();
    return [...threadsWithMeta]
      .filter(t => showClosed || t.status === 'open')
      .sort((a, b) => {
        // Closed threads last
        if (a.status === 'closed' && b.status !== 'closed') return 1;
        if (a.status !== 'closed' && b.status === 'closed') return -1;

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

        // Within same state, sort by silence duration or recency
        if (stateA === 'silent' && stateB === 'silent') {
          return computeSilenceDuration(a.last_activity_at, now) - computeSilenceDuration(b.last_activity_at, now);
        }

        // Most recent first
        return b.last_activity_at - a.last_activity_at;
      });
  }, [threadsWithMeta, silenceThresholdHours, showClosed]);

  const closedCount = threadsWithMeta.filter(t => t.status === 'closed').length;

  // Find the selected thread data
  const selectedThread = selectedThreadId 
    ? threadsWithMeta.find(t => t.thread_id === selectedThreadId) 
    : null;

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm">No threads yet</p>
      </div>
    );
  }

  return (
    <div className="watcher-inbox flex h-full">
      {/* Thread List (Left Panel) */}
      <div className={`flex flex-col ${selectedThread ? 'w-1/2 border-r border-gray-200' : 'w-full'} transition-all duration-200`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {sortedThreads.length} thread{sortedThreads.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {closedCount > 0 && (
              <button
                onClick={() => setShowClosed(!showClosed)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showClosed ? 'Hide' : 'Show'} {closedCount} closed
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sr-only">
              <tr>
                <th>Status</th>
                <th>Sender</th>
                <th>Subject</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedThreads.map((thread) => {
                const silenceState = getSilenceState({
                  lastActivityAt: thread.last_activity_at,
                  status: thread.status,
                  thresholdHours: silenceThresholdHours,
                });
                const isSilent = silenceState === 'silent';
                const isActive = thread.thread_id === selectedThreadId;
                const isClosed = thread.status === 'closed';

                return (
                  <tr
                    key={thread.thread_id}
                    onClick={() => onSelectThread?.(thread.thread_id)}
                    className={`
                      group cursor-pointer transition-colors
                      ${isActive ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}
                      ${isSilent && !isClosed && !isActive ? 'bg-amber-50/50' : ''}
                      ${isClosed ? 'opacity-60' : ''}
                    `}
                  >
                    {/* Silence indicator */}
                    <td className="w-8 py-3 pl-3">
                      {isSilent && !isClosed && (
                        <span 
                          className="inline-block w-2 h-2 rounded-full bg-amber-400" 
                          title={`Silent for ${formatSilenceDuration(computeSilenceDuration(thread.last_activity_at))}`}
                        />
                      )}
                      {isClosed && (
                        <span className="text-xs text-gray-400">✓</span>
                      )}
                    </td>

                    {/* Sender/Participants */}
                    <td className="w-40 py-3 pr-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0"
                          title={thread.latestSender || thread.participants[0] || 'Unknown'}
                        >
                          {getInitials(thread.latestSender || thread.participants[0] || 'U')}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm truncate ${!isClosed ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                            {thread.participants.length > 0 
                              ? thread.participants.map(p => p.split('@')[0]).slice(0, 2).join(', ')
                              : 'Unknown'
                            }
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Subject */}
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`truncate text-sm ${!isClosed ? 'text-gray-900' : 'text-gray-500'}`}>
                          {thread.subject || 'No subject'}
                        </span>
                        {thread.messageCount > 1 && (
                          <span className="flex-shrink-0 text-xs text-gray-400">
                            ({thread.messageCount})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="w-20 py-3 pr-3 text-right">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatRelativeTime(thread.last_activity_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Thread Detail (Right Panel) */}
      {selectedThread && (
        <div className="w-1/2 flex flex-col overflow-hidden">
          {/* Detail Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-gray-900 truncate">
                {selectedThread.subject || 'No subject'}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">
                  {selectedThread.messageCount} message{selectedThread.messageCount !== 1 ? 's' : ''}
                </span>
                {selectedThread.status === 'open' && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className={`text-xs ${getSilenceState({ lastActivityAt: selectedThread.last_activity_at, status: selectedThread.status, thresholdHours: silenceThresholdHours }) === 'silent' ? 'text-amber-600' : 'text-gray-500'}`}>
                      {formatSilenceDuration(computeSilenceDuration(selectedThread.last_activity_at))} since last activity
                    </span>
                  </>
                )}
                {selectedThread.status === 'closed' && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-gray-500">Closed</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              {selectedThread.status === 'open' && onCloseThread && (
                <button
                  onClick={() => onCloseThread(selectedThread.thread_id)}
                  className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded transition-colors"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => onSelectThread?.(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Close panel"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50">
            {selectedThread.emails.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-8">
                No messages in this thread
              </div>
            ) : (
              selectedThread.emails.map((email, index) => (
                <div 
                  key={email.email_id}
                  className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {getInitials(email.sender)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {email.sender.split('@')[0]}
                          <span className="text-gray-400 font-normal">@{email.sender.split('@')[1]}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(email.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">#{index + 1}</span>
                  </div>
                  {email.subject !== selectedThread.subject && (
                    <div className="text-sm text-gray-700 mb-2">
                      <strong>Subject:</strong> {email.subject}
                    </div>
                  )}
                  {email.body_excerpt && (
                    <div className="text-sm text-gray-600 whitespace-pre-wrap">
                      {email.body_excerpt}
                    </div>
                  )}
                  {!email.body_excerpt && (
                    <div className="text-sm text-gray-400 italic">
                      No preview available
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatcherInbox;
