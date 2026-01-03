'use client';

import { useState, useMemo } from 'react';
import type { Thread, Reminder, VigilEvent } from '@/lib/api';
import { formatReminderType, formatFriendlyDate, formatConfidence } from '@/lib/format';

// ============================================================================
// Types
// ============================================================================

export type SelectionType = 'thread' | 'reminder' | 'signal' | 'message';

export interface Selection {
  type: SelectionType;
  id: string;
}

interface DetailPanelProps {
  selection: Selection | null;
  threads: Thread[];
  reminders: Reminder[];
  events: VigilEvent[];
  watcherId: string;
  onClose: () => void;
  onDismissReminder?: (reminderId: string) => Promise<void>;
  onCloseThread?: (threadId: string) => Promise<void>;
}

// Event types that represent operations
const OPERATION_EVENT_TYPES = [
  'THREAD_CREATED',
  'THREAD_CLOSED',
  'THREAD_REOPENED',
  'REMINDER_CREATED',
  'REMINDER_DISMISSED',
  'REMINDER_MERGED',
  'REMINDER_REASSIGNED',
  'EMAIL_RECEIVED',
  'EMAIL_ROUTED',
  'HARD_DEADLINE_EXTRACTED',
  'SOFT_DEADLINE_EXTRACTED',
  'URGENCY_SIGNAL_EXTRACTED',
  'CLOSURE_SIGNAL_EXTRACTED',
  'SIGNAL_GROUPED',
  'NOTIFICATION_SENT',
  'NOTIFICATION_SCHEDULED',
];

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    const futureHours = Math.floor(absDiff / 3600000);
    const futureDays = Math.floor(absDiff / 86400000);
    if (futureDays > 0) return `in ${futureDays}d`;
    if (futureHours > 0) return `in ${futureHours}h`;
    return `in ${Math.floor(absDiff / 60000)}m`;
  }

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    'THREAD_CREATED': 'Thread Created',
    'THREAD_CLOSED': 'Thread Closed',
    'THREAD_REOPENED': 'Thread Reopened',
    'REMINDER_CREATED': 'Reminder Created',
    'REMINDER_DISMISSED': 'Reminder Dismissed',
    'REMINDER_MERGED': 'Reminder Merged',
    'REMINDER_REASSIGNED': 'Reminder Moved',
    'EMAIL_RECEIVED': 'Email Received',
    'EMAIL_ROUTED': 'Email Routed',
    'HARD_DEADLINE_EXTRACTED': 'Hard Deadline Detected',
    'SOFT_DEADLINE_EXTRACTED': 'Soft Deadline Detected',
    'URGENCY_SIGNAL_EXTRACTED': 'Urgency Signal Detected',
    'CLOSURE_SIGNAL_EXTRACTED': 'Closure Signal Detected',
    'SIGNAL_GROUPED': 'Signals Grouped',
    'NOTIFICATION_SENT': 'Notification Sent',
    'NOTIFICATION_SCHEDULED': 'Notification Scheduled',
  };
  return map[type] || type.replace(/_/g, ' ').toLowerCase();
}

function getEventIcon(type: string): React.ReactNode {
  if (type.includes('THREAD')) {
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  if (type.includes('REMINDER')) {
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    );
  }
  if (type.includes('EMAIL')) {
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
    );
  }
  if (type.includes('DEADLINE') || type.includes('SIGNAL')) {
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    );
  }
  if (type.includes('NOTIFICATION')) {
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
    </svg>
  );
}

function getEventColorClass(type: string): string {
  if (type.includes('CREATED') || type.includes('REOPENED')) return 'text-green-600 bg-green-50';
  if (type.includes('CLOSED') || type.includes('DISMISSED')) return 'text-gray-600 bg-gray-100';
  if (type.includes('HARD_DEADLINE')) return 'text-red-600 bg-red-50';
  if (type.includes('SOFT_DEADLINE')) return 'text-amber-600 bg-amber-50';
  if (type.includes('URGENCY')) return 'text-orange-600 bg-orange-50';
  if (type.includes('CLOSURE')) return 'text-green-600 bg-green-50';
  if (type.includes('EMAIL')) return 'text-blue-600 bg-blue-50';
  if (type.includes('NOTIFICATION')) return 'text-purple-600 bg-purple-50';
  return 'text-gray-600 bg-gray-50';
}

function getEventField(event: VigilEvent, field: string): unknown {
  const payload = event.payload as Record<string, unknown> | undefined;
  const root = event as unknown as Record<string, unknown>;
  return payload?.[field] ?? root?.[field];
}

function calculateReminderUrgency(deadline_utc: number | null): 'ok' | 'warning' | 'critical' | 'overdue' {
  if (!deadline_utc) return 'ok';
  const now = Date.now();
  const hoursUntilDeadline = (deadline_utc - now) / (1000 * 60 * 60);
  if (hoursUntilDeadline < 0) return 'overdue';
  if (hoursUntilDeadline < 2) return 'critical';
  if (hoursUntilDeadline < 24) return 'warning';
  return 'ok';
}

// ============================================================================
// Icons
// ============================================================================

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ============================================================================
// Thread Detail View
// ============================================================================

interface ThreadDetailProps {
  thread: Thread;
  reminders: Reminder[];
  events: VigilEvent[];
  watcherId: string;
  onCloseThread?: (threadId: string) => Promise<void>;
}

function ThreadDetail({ thread, reminders, events, watcherId, onCloseThread }: ThreadDetailProps) {
  const threadReminders = reminders.filter(r => r.thread_id === thread.thread_id);
  const activeReminders = threadReminders.filter(r => r.status === 'active');
  const dismissedReminders = threadReminders.filter(r => r.status === 'dismissed');

  // Get all events related to this thread (by thread_id or routed_to_thread_id)
  const threadEvents = useMemo(() => {
    return events.filter(e => {
      const threadId = getEventField(e, 'thread_id');
      const routedToThread = getEventField(e, 'routed_to_thread_id');
      return threadId === thread.thread_id || routedToThread === thread.thread_id;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [events, thread.thread_id]);

  // Get messages for this thread
  const threadMessages = useMemo(() => {
    return threadEvents.filter(e => e.type === 'EMAIL_RECEIVED');
  }, [threadEvents]);

  // Calculate next deadline from reminders (if any)
  const nextDeadline = activeReminders
    .filter(r => r.deadline_utc)
    .sort((a, b) => (a.deadline_utc || 0) - (b.deadline_utc || 0))[0]?.deadline_utc;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">
            {thread.subject}
          </h3>
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
            thread.status === 'open'
              ? (thread.silence_alerted ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200')
              : 'bg-gray-100 text-gray-600 border-gray-200'
          }`}>
            {thread.status === 'open' ? (thread.silence_alerted ? 'SILENT' : 'OPEN') : 'CLOSED'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            thread.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {thread.status}
          </span>
          {activeReminders.length > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{activeReminders.length} active reminder{activeReminders.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Key Dates Section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Timeline</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <dt className="text-xs text-gray-500 mb-1">Opened</dt>
            <dd className="text-sm font-medium text-gray-900">{formatFriendlyDate(thread.opened_at)}</dd>
            <dd className="text-xs text-gray-500">{formatRelativeTime(thread.opened_at)}</dd>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <dt className="text-xs text-gray-500 mb-1">Last Activity</dt>
            <dd className="text-sm font-medium text-gray-900">{formatFriendlyDate(thread.last_activity_at)}</dd>
            <dd className="text-xs text-gray-500">{formatRelativeTime(thread.last_activity_at)}</dd>
          </div>
          {nextDeadline && (
            <div className={`p-3 rounded-lg col-span-1 sm:col-span-2 ${
              calculateReminderUrgency(nextDeadline) === 'overdue' ? 'bg-red-50' :
              calculateReminderUrgency(nextDeadline) === 'critical' ? 'bg-orange-50' :
              calculateReminderUrgency(nextDeadline) === 'warning' ? 'bg-amber-50' : 'bg-green-50'
            }`}>
              <dt className="text-xs text-gray-600 mb-1">Next Deadline</dt>
              <dd className="text-sm font-semibold text-gray-900">{formatFriendlyDate(nextDeadline)}</dd>
              <dd className="text-xs text-gray-600">{formatRelativeTime(nextDeadline)}</dd>
            </div>
          )}
        </div>
      </div>

      {/* Active Reminders */}
      {activeReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Active Reminders ({activeReminders.length})
          </h4>
          <div className="space-y-2">
            {activeReminders
              .sort((a, b) => (a.deadline_utc || Infinity) - (b.deadline_utc || Infinity))
              .map(r => {
                const urgency = calculateReminderUrgency(r.deadline_utc);
                return (
                  <div key={r.reminder_id} className={`p-3 border rounded-lg ${
                    urgency === 'overdue' ? 'border-red-200 bg-red-50/50' :
                    urgency === 'critical' ? 'border-orange-200 bg-orange-50/50' :
                    urgency === 'warning' ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {r.name || r.description || r.source_span || formatReminderType(r.reminder_type)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatReminderType(r.reminder_type)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        urgency === 'overdue' ? 'bg-red-100 text-red-700' :
                        urgency === 'critical' ? 'bg-orange-100 text-orange-700' :
                        urgency === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {urgency}
                      </span>
                    </div>
                    {r.deadline_utc && (
                      <p className="text-xs text-gray-600 mt-2">
                        <span className="font-medium">Due:</span> {formatFriendlyDate(r.deadline_utc)} ({formatRelativeTime(r.deadline_utc)})
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Dismissed Reminders (collapsed) */}
      {dismissedReminders.length > 0 && (
        <details className="group">
          <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600">
            Dismissed ({dismissedReminders.length})
          </summary>
          <div className="mt-2 space-y-1">
            {dismissedReminders.slice(0, 5).map(r => (
              <div key={r.reminder_id} className="p-2 bg-gray-50 rounded text-sm text-gray-500 line-through">
                {r.description || r.source_span || formatReminderType(r.reminder_type)}
              </div>
            ))}
            {dismissedReminders.length > 5 && (
              <p className="text-xs text-gray-400">+ {dismissedReminders.length - 5} more</p>
            )}
          </div>
        </details>
      )}

      {/* Recent Messages (collapsed) */}
      {threadMessages.length > 0 && (
        <details className="group">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700">
            Recent Messages
          </summary>
          <div className="mt-2 space-y-2">
            {threadMessages.slice(0, 5).map(msg => {
              const sender = String(getEventField(msg, 'original_sender') || getEventField(msg, 'sender') || 'Unknown');
              const subject = String(getEventField(msg, 'subject') || 'No subject');
              return (
                <div key={msg.event_id} className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 truncate">{subject}</p>
                  <p className="text-xs text-gray-500">From: {sender.split('<')[0].trim()}</p>
                  <p className="text-xs text-gray-400">{formatRelativeTime(msg.timestamp)}</p>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Activity Timeline */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Activity History
        </h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {threadEvents.slice(0, 15).map(event => (
            <OperationItem key={event.event_id} event={event} />
          ))}
          {threadEvents.length === 0 && (
            <p className="text-sm text-gray-500 italic">No activity recorded</p>
          )}
          {threadEvents.length > 15 && (
            <p className="text-xs text-gray-400 text-center pt-2">
              More events available
            </p>
          )}
        </div>
      </div>

      {/* Technical Details (collapsed) */}
      <details className="group">
        <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600">
          Technical Details
        </summary>
        <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2 text-xs">
          <div>
            <span className="text-gray-500">Thread ID:</span>
            <span className="ml-2 font-mono text-gray-700 break-all">{thread.thread_id}</span>
          </div>
          <div>
            <span className="text-gray-500">Watcher ID:</span>
            <span className="ml-2 font-mono text-gray-700 break-all">{thread.watcher_id}</span>
          </div>
        </div>
      </details>

      {/* Actions */}
      {thread.status === 'open' && onCloseThread && (
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => onCloseThread(thread.thread_id)}
            className="btn btn-secondary w-full text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Close Thread
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Reminder Detail View
// ============================================================================

interface ReminderDetailProps {
  reminder: Reminder;
  thread?: Thread;
  events: VigilEvent[];
  watcherId: string;
  onDismissReminder?: (reminderId: string) => Promise<void>;
}

function ReminderDetail({ reminder, thread, events, onDismissReminder }: ReminderDetailProps) {
  const urgency = calculateReminderUrgency(reminder.deadline_utc);
  
  // Get signals that belong to this reminder
  const relatedSignals = useMemo(() => {
    if (!reminder.grouped_signal_ids?.length) {
      if (reminder.extraction_event_id) {
        const signal = events.find(e => e.event_id === reminder.extraction_event_id);
        return signal ? [signal] : [];
      }
      return [];
    }
    return events.filter(e => reminder.grouped_signal_ids?.includes(e.event_id));
  }, [events, reminder]);

  // Get related events (creation, modifications, etc.)
  const reminderEvents = useMemo(() => {
    return events.filter(e => {
      const reminderId = getEventField(e, 'reminder_id');
      return reminderId === reminder.reminder_id;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [events, reminder.reminder_id]);

  // Get source email if available
  const sourceEmail = useMemo(() => {
    if (!reminder.email_id) return null;
    return events.find(e => 
      e.type === 'EMAIL_RECEIVED' && 
      getEventField(e, 'email_id') === reminder.email_id
    );
  }, [events, reminder.email_id]);

  const urgencyColors = {
    ok: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    critical: 'bg-orange-100 text-orange-800 border-orange-200',
    overdue: 'bg-red-100 text-red-900 border-red-200',
  };

  const statusColors = {
    active: 'bg-blue-100 text-blue-700',
    dismissed: 'bg-gray-100 text-gray-600',
    merged: 'bg-purple-100 text-purple-700',
  };

  // Calculate deadline countdown
  const deadlineInfo = useMemo(() => {
    if (!reminder.deadline_utc) return null;
    const now = Date.now();
    const deadline = reminder.deadline_utc;
    const diff = deadline - now;
    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      isPast: diff < 0,
      days,
      hours,
      minutes,
      totalHours: Math.floor(absDiff / (1000 * 60 * 60)),
    };
  }, [reminder.deadline_utc]);

  return (
    <div className="space-y-6">
      {/* Header with urgency badge */}
      <div className="pb-4 border-b border-gray-200">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${urgencyColors[urgency]}`}>
            {urgency === 'overdue' ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : urgency === 'critical' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 leading-tight">
              {reminder.name || reminder.description || reminder.source_span || formatReminderType(reminder.reminder_type)}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[reminder.status]}`}>
                {reminder.status}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${urgencyColors[urgency]}`}>
                {urgency.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {formatReminderType(reminder.reminder_type)}
              </span>
              {reminder.confidence && (
                <span className="text-xs text-gray-500">
                  • {formatConfidence(reminder.confidence)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deadline Countdown - prominently displayed */}
      {reminder.deadline_utc && deadlineInfo && (
        <div className={`p-4 rounded-lg border-2 ${
          urgency === 'overdue' ? 'bg-red-50 border-red-200' :
          urgency === 'critical' ? 'bg-orange-50 border-orange-200' :
          urgency === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {deadlineInfo.isPast ? 'Overdue by' : 'Time Remaining'}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              deadlineInfo.isPast ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-700'
            }`}>
              {formatFriendlyDate(reminder.deadline_utc)}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            {deadlineInfo.days > 0 && (
              <>
                <span className={`text-3xl font-bold ${
                  urgency === 'overdue' ? 'text-red-700' :
                  urgency === 'critical' ? 'text-orange-700' :
                  urgency === 'warning' ? 'text-amber-700' : 'text-green-700'
                }`}>{deadlineInfo.days}</span>
                <span className="text-sm text-gray-600 mr-2">days</span>
              </>
            )}
            <span className={`${deadlineInfo.days > 0 ? 'text-xl' : 'text-3xl'} font-bold ${
              urgency === 'overdue' ? 'text-red-700' :
              urgency === 'critical' ? 'text-orange-700' :
              urgency === 'warning' ? 'text-amber-700' : 'text-green-700'
            }`}>{deadlineInfo.hours}</span>
            <span className="text-sm text-gray-600 mr-2">hrs</span>
            <span className={`${deadlineInfo.days > 0 ? 'text-lg' : 'text-xl'} font-bold ${
              urgency === 'overdue' ? 'text-red-700' :
              urgency === 'critical' ? 'text-orange-700' :
              urgency === 'warning' ? 'text-amber-700' : 'text-green-700'
            }`}>{deadlineInfo.minutes}</span>
            <span className="text-sm text-gray-600">min</span>
          </div>
        </div>
      )}

      {/* Source Quote - extracted text that created this reminder */}
      {reminder.source_span && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Source Text
          </h4>
          <blockquote className="p-4 bg-blue-50 border-l-4 border-blue-400 text-sm text-gray-800 italic rounded-r-lg">
            "{reminder.source_span}"
          </blockquote>
        </div>
      )}

      {/* Source Email Info */}
      {sourceEmail && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Source Email</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm text-gray-700">
                {String(getEventField(sourceEmail, 'original_sender') || getEventField(sourceEmail, 'sender') || 'Unknown')}
              </span>
            </div>
            {String(getEventField(sourceEmail, 'subject') || '') && (
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-700">{String(getEventField(sourceEmail, 'subject') || '')}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Received {formatFriendlyDate(sourceEmail.timestamp)}
            </div>
          </div>
        </div>
      )}

      {/* Thread Reference */}
      {thread && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Part of Thread</h4>
          <p className="text-sm font-medium text-gray-900 truncate">{thread.subject}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded ${
              thread.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {thread.status}
            </span>
          </div>
        </div>
      )}

      {/* Grouped Signals */}
      {relatedSignals.length > 0 && (
        <details className="group" open>
          <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-gray-900 py-2">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Extracted Signals ({relatedSignals.length})
            </span>
            <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="space-y-2 mt-3">
            {relatedSignals.map(signal => {
              const sourceSpan = String(
                getEventField(signal, 'source_span') ||
                getEventField(signal, 'signal_text') ||
                getEventField(signal, 'deadline_text') ||
                ''
              );
              const confidence = getEventField(signal, 'confidence') as string | undefined;
              const deadlineUtc = getEventField(signal, 'deadline_utc') as number | undefined;
              return (
                <div key={signal.event_id} className="p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEventColorClass(signal.type)}`}>
                      {formatEventType(signal.type)}
                    </span>
                    {confidence && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {formatConfidence(confidence)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatRelativeTime(signal.timestamp)}
                    </span>
                  </div>
                  {sourceSpan && (
                    <p className="text-xs text-gray-600 italic mb-2">"{sourceSpan}"</p>
                  )}
                  {deadlineUtc && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Deadline:</span> {formatFriendlyDate(deadlineUtc)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</dt>
          <dd className="mt-1 text-gray-900">{formatFriendlyDate(reminder.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created By</dt>
          <dd className="mt-1 text-gray-900">{reminder.created_by || 'System (Auto-extracted)'}</dd>
        </div>
      </div>

      {/* History */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-gray-900 py-2">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History ({reminderEvents.length})
          </span>
          <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="space-y-2 max-h-48 overflow-y-auto mt-3">
          {reminderEvents.length > 0 ? (
            reminderEvents.map(event => (
              <OperationItem key={event.event_id} event={event} />
            ))
          ) : (
            <p className="text-sm text-gray-500 italic py-2">No history recorded</p>
          )}
        </div>
      </details>

      {/* Technical Details - collapsed */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
          Technical Details
        </summary>
        <div className="mt-2 p-3 bg-gray-50 rounded space-y-1 font-mono text-gray-600">
          <div className="break-all">
            <span className="text-gray-500">Reminder ID:</span>
            <span className="ml-2">{reminder.reminder_id}</span>
          </div>
          {reminder.thread_id && (
            <div className="break-all">
              <span className="text-gray-500">Thread ID:</span>
              <span className="ml-2">{reminder.thread_id}</span>
            </div>
          )}
          {reminder.email_id && (
            <div className="break-all">
              <span className="text-gray-500">Email ID:</span>
              <span className="ml-2">{reminder.email_id}</span>
            </div>
          )}
          {reminder.extraction_event_id && (
            <div className="break-all">
              <span className="text-gray-500">Extraction Event:</span>
              <span className="ml-2">{reminder.extraction_event_id}</span>
            </div>
          )}
          {reminder.grouped_signal_ids && reminder.grouped_signal_ids.length > 0 && (
            <div className="break-all">
              <span className="text-gray-500">Grouped Signals:</span>
              <span className="ml-2">{reminder.grouped_signal_ids.length} signals</span>
            </div>
          )}
        </div>
      </details>

      {/* Actions */}
      {reminder.status === 'active' && onDismissReminder && (
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => onDismissReminder(reminder.reminder_id)}
            className="btn btn-secondary w-full text-sm text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Dismiss Reminder
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Signal Detail View
// ============================================================================

interface SignalDetailProps {
  signal: VigilEvent;
  reminder?: Reminder;
  message?: VigilEvent;
  thread?: Thread;
}

function SignalDetail({ signal, reminder, message, thread }: SignalDetailProps) {
  const sourceSpan = String(
    getEventField(signal, 'source_span') ||
    getEventField(signal, 'signal_text') ||
    getEventField(signal, 'deadline_text') ||
    ''
  );
  const confidence = getEventField(signal, 'confidence') as string | undefined;
  const deadlineUtc = getEventField(signal, 'deadline_utc') as number | undefined;
  const sender = message ? String(
    getEventField(message, 'original_sender') ||
    getEventField(message, 'sender') ||
    ''
  ) : null;
  const subject = message ? String(getEventField(message, 'subject') || '') : null;

  // Determine signal category for styling
  const isDeadlineSignal = signal.type.includes('DEADLINE');
  const isUrgencySignal = signal.type.includes('URGENCY') || signal.type.includes('FOLLOWUP') || signal.type.includes('QUESTION');

  // Calculate urgency for deadline signals
  const deadlineUrgency = useMemo(() => {
    if (!deadlineUtc) return null;
    const now = Date.now();
    const diff = deadlineUtc - now;
    const hoursLeft = diff / (1000 * 60 * 60);
    if (diff < 0) return 'overdue';
    if (hoursLeft < 24) return 'critical';
    if (hoursLeft < 72) return 'warning';
    return 'ok';
  }, [deadlineUtc]);

  return (
    <div className="space-y-6">
      {/* Header with signal type icon */}
      <div className="pb-4 border-b border-gray-200">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${getEventColorClass(signal.type)}`}>
            {isDeadlineSignal ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ) : isUrgencySignal ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              {formatEventType(signal.type)}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {confidence && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                  {formatConfidence(confidence)}
                </span>
              )}
              {deadlineUrgency && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  deadlineUrgency === 'overdue' ? 'bg-red-100 text-red-700' :
                  deadlineUrgency === 'critical' ? 'bg-orange-100 text-orange-700' :
                  deadlineUrgency === 'warning' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {deadlineUrgency.toUpperCase()}
                </span>
              )}
              <span className="text-xs text-gray-500">
                Detected {formatRelativeTime(signal.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Deadline Countdown for deadline signals */}
      {deadlineUtc && deadlineUrgency && (
        <div className={`p-4 rounded-lg border-2 ${
          deadlineUrgency === 'overdue' ? 'bg-red-50 border-red-200' :
          deadlineUrgency === 'critical' ? 'bg-orange-50 border-orange-200' :
          deadlineUrgency === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {signal.type.includes('HARD') ? 'Hard Deadline' : 'Soft Deadline'}
            </span>
            <span className={`text-xs font-medium ${
              deadlineUrgency === 'overdue' ? 'text-red-700' : 'text-gray-600'
            }`}>
              {deadlineUrgency === 'overdue' ? 'OVERDUE' : formatRelativeTime(deadlineUtc)}
            </span>
          </div>
          <p className={`text-lg font-bold ${
            deadlineUrgency === 'overdue' ? 'text-red-700' :
            deadlineUrgency === 'critical' ? 'text-orange-700' :
            deadlineUrgency === 'warning' ? 'text-amber-700' : 'text-green-700'
          }`}>
            {formatFriendlyDate(deadlineUtc)}
          </p>
        </div>
      )}

      {/* Source Quote - prominently displayed */}
      {sourceSpan && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Detected Text
          </h4>
          <blockquote className={`p-4 border-l-4 text-sm text-gray-800 italic rounded-r-lg ${
            isDeadlineSignal ? 'bg-blue-50 border-blue-400' :
            isUrgencySignal ? 'bg-orange-50 border-orange-400' :
            'bg-amber-50 border-amber-400'
          }`}>
            "{sourceSpan}"
          </blockquote>
        </div>
      )}

      {/* Source Message */}
      {message && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">From Email</h4>
          <div className="space-y-2">
            {sender && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm text-gray-700">{sender}</span>
              </div>
            )}
            {subject && (
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-700 line-clamp-2">{subject}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Received {formatFriendlyDate(message.timestamp)}
            </div>
          </div>
        </div>
      )}

      {/* Associated Reminder */}
      {reminder && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Created Reminder</h4>
          <p className="text-sm font-medium text-gray-900">
            {reminder.name || reminder.description || reminder.source_span || formatReminderType(reminder.reminder_type)}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span className={`px-2 py-0.5 rounded ${
              reminder.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {reminder.status}
            </span>
            <span className="text-gray-500">{formatReminderType(reminder.reminder_type)}</span>
            {reminder.deadline_utc && (
              <span className="text-gray-500">
                Due {formatRelativeTime(reminder.deadline_utc)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Associated Thread */}
      {thread && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Part of Thread</h4>
          <p className="text-sm font-medium text-gray-900 truncate">{thread.subject}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded ${
              thread.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {thread.status}
            </span>
          </div>
        </div>
      )}

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Detected</dt>
          <dd className="mt-1 text-gray-900">{formatFriendlyDate(signal.timestamp)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Signal Type</dt>
          <dd className="mt-1 text-gray-900">
            {isDeadlineSignal ? 'Deadline' : isUrgencySignal ? 'Urgency' : 'Other'}
          </dd>
        </div>
      </div>

      {/* Technical Details - collapsed */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
          Technical Details
        </summary>
        <div className="mt-2 p-3 bg-gray-50 rounded space-y-1 font-mono text-gray-600">
          <div className="break-all">
            <span className="text-gray-500">Event ID:</span>
            <span className="ml-2">{signal.event_id}</span>
          </div>
          <div className="break-all">
            <span className="text-gray-500">Event Type:</span>
            <span className="ml-2">{signal.type}</span>
          </div>
          <div className="break-all">
            <span className="text-gray-500">Watcher ID:</span>
            <span className="ml-2">{signal.watcher_id}</span>
          </div>
          {signal.payload && Object.keys(signal.payload).length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-gray-500">Raw Payload:</span>
              <pre className="mt-1 text-xs overflow-auto max-h-32">
                {JSON.stringify(signal.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// ============================================================================
// Message Detail View
// ============================================================================

interface MessageDetailProps {
  message: VigilEvent;
  thread?: Thread;
  extractedSignals: VigilEvent[];
}

function MessageDetail({ message, thread, extractedSignals }: MessageDetailProps) {
  const sender = String(
    getEventField(message, 'original_sender') ||
    getEventField(message, 'sender') ||
    'Unknown'
  );
  const subject = String(getEventField(message, 'subject') || 'No subject');
  const emailId = String(getEventField(message, 'email_id') || '');
  const messageId = String(getEventField(message, 'message_id') || '');
  
  // Extract additional metadata
  const recipients = getEventField(message, 'recipients') as string[] | undefined;
  const cc = getEventField(message, 'cc') as string[] | undefined;
  const labels = getEventField(message, 'labels') as string[] | undefined;

  // Group signals by type
  const signalsByType = useMemo(() => {
    const groups: Record<string, VigilEvent[]> = {};
    extractedSignals.forEach(signal => {
      const category = signal.type.includes('DEADLINE') ? 'Deadlines' :
                       signal.type.includes('URGENCY') ? 'Urgency Signals' :
                       signal.type.includes('FOLLOWUP') ? 'Follow-ups' :
                       signal.type.includes('QUESTION') ? 'Questions' : 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(signal);
    });
    return groups;
  }, [extractedSignals]);

  return (
    <div className="space-y-6">
      {/* Header with email icon */}
      <div className="pb-4 border-b border-gray-200">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 leading-tight">
              {subject}
            </h3>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span className="text-gray-500">From:</span>
              <span className="font-medium text-gray-700 truncate">{sender}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Email Details Card */}
      <div className="p-4 bg-gray-50 rounded-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Received</span>
            <p className="mt-1 text-gray-900">{formatFriendlyDate(message.timestamp)}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time Ago</span>
            <p className="mt-1 text-gray-900">{formatRelativeTime(message.timestamp)}</p>
          </div>
        </div>
        
        {/* Recipients */}
        {recipients && recipients.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">To</span>
            <p className="mt-1 text-sm text-gray-700 truncate">{recipients.join(', ')}</p>
          </div>
        )}
        
        {/* CC */}
        {cc && cc.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">CC</span>
            <p className="mt-1 text-sm text-gray-700 truncate">{cc.join(', ')}</p>
          </div>
        )}

        {/* Labels */}
        {labels && labels.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Labels</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {labels.map((label, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Extraction Summary */}
      {extractedSignals.length > 0 && (
        <div className={`p-4 rounded-lg border-2 ${
          extractedSignals.some(s => s.type.includes('DEADLINE')) ? 'bg-blue-50 border-blue-200' :
          extractedSignals.some(s => s.type.includes('URGENCY')) ? 'bg-orange-50 border-orange-200' :
          'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="font-medium text-gray-800">
              {extractedSignals.length} signal{extractedSignals.length !== 1 ? 's' : ''} extracted
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(signalsByType).map(([type, signals]) => (
              <span key={type} className="px-2 py-1 bg-white/50 rounded text-xs text-gray-700">
                {signals.length} {type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Associated Thread */}
      {thread && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Routed to Thread</h4>
          <p className="text-sm font-medium text-gray-900 truncate">{thread.subject}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded ${
              thread.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {thread.status}
            </span>
          </div>
        </div>
      )}

      {/* Extracted Signals Detail */}
      {extractedSignals.length > 0 && (
        <details className="group" open>
          <summary className="flex items-center justify-between cursor-pointer text-sm font-semibold text-gray-900 py-2">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Extracted Signals ({extractedSignals.length})
            </span>
            <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="space-y-2 mt-3">
            {extractedSignals.map(signal => {
              const sourceSpan = String(
                getEventField(signal, 'source_span') ||
                getEventField(signal, 'signal_text') ||
                getEventField(signal, 'deadline_text') ||
                ''
              );
              const confidence = getEventField(signal, 'confidence') as string | undefined;
              const deadlineUtc = getEventField(signal, 'deadline_utc') as number | undefined;
              return (
                <div key={signal.event_id} className="p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEventColorClass(signal.type)}`}>
                      {formatEventType(signal.type)}
                    </span>
                    {confidence && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {formatConfidence(confidence)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatRelativeTime(signal.timestamp)}
                    </span>
                  </div>
                  {sourceSpan && (
                    <p className="text-xs text-gray-600 italic mb-2">"{sourceSpan}"</p>
                  )}
                  {deadlineUtc && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Deadline:</span> {formatFriendlyDate(deadlineUtc)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Technical Details - collapsed */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
          Technical Details
        </summary>
        <div className="mt-2 p-3 bg-gray-50 rounded space-y-1 font-mono text-gray-600">
          <div className="break-all">
            <span className="text-gray-500">Event ID:</span>
            <span className="ml-2">{message.event_id}</span>
          </div>
          {emailId && (
            <div className="break-all">
              <span className="text-gray-500">Email ID:</span>
              <span className="ml-2">{emailId}</span>
            </div>
          )}
          {messageId && (
            <div className="break-all">
              <span className="text-gray-500">Message ID:</span>
              <span className="ml-2">{messageId}</span>
            </div>
          )}
          <div className="break-all">
            <span className="text-gray-500">Watcher ID:</span>
            <span className="ml-2">{message.watcher_id}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

// ============================================================================
// Operation Item (for history)
// ============================================================================

interface OperationItemProps {
  event: VigilEvent;
}

function OperationItem({ event }: OperationItemProps) {
  const colorClass = getEventColorClass(event.type);

  // Build description based on event type
  let description = '';
  switch (event.type) {
    case 'EMAIL_RECEIVED': {
      const sender = String(getEventField(event, 'original_sender') || getEventField(event, 'sender') || 'Unknown');
      description = `From ${sender.split('@')[0]}`;
      break;
    }
    case 'THREAD_CREATED':
      description = 'New conversation started';
      break;
    case 'REMINDER_CREATED':
      description = String(getEventField(event, 'description') || 'Reminder added');
      break;
    case 'REMINDER_DISMISSED':
      description = String(getEventField(event, 'dismiss_reason') || 'Dismissed');
      break;
    case 'HARD_DEADLINE_EXTRACTED':
    case 'SOFT_DEADLINE_EXTRACTED': {
      const span = String(getEventField(event, 'source_span') || getEventField(event, 'deadline_text') || '');
      description = span.slice(0, 60) + (span.length > 60 ? '...' : '');
      break;
    }
    case 'URGENCY_SIGNAL_EXTRACTED': {
      const signal = String(getEventField(event, 'signal_text') || getEventField(event, 'source_span') || '');
      description = signal.slice(0, 60) + (signal.length > 60 ? '...' : '');
      break;
    }
    default:
      description = formatEventType(event.type);
  }

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded hover:bg-gray-50">
      <div className={`p-1.5 rounded ${colorClass}`}>
        {getEventIcon(event.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{formatEventType(event.type)}</p>
        {description && (
          <p className="text-xs text-gray-500 truncate">{description}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">
        {formatRelativeTime(event.timestamp)}
      </span>
    </div>
  );
}

// ============================================================================
// Main Detail Panel
// ============================================================================

export function DetailPanel({
  selection,
  threads,
  reminders,
  events,
  watcherId,
  onClose,
  onDismissReminder,
  onCloseThread,
}: DetailPanelProps) {
  if (!selection) return null;

  // Find the selected entity
  let content: React.ReactNode = null;
  let title = '';

  switch (selection.type) {
    case 'thread': {
      const thread = threads.find(t => t.thread_id === selection.id);
      if (thread) {
        title = 'Thread Details';
        content = (
          <ThreadDetail
            thread={thread}
            reminders={reminders}
            events={events}
            watcherId={watcherId}
            onCloseThread={onCloseThread}
          />
        );
      }
      break;
    }
    case 'reminder': {
      const reminder = reminders.find(r => r.reminder_id === selection.id);
      if (reminder) {
        title = 'Reminder Details';
        const thread = threads.find(t => t.thread_id === reminder.thread_id);
        content = (
          <ReminderDetail
            reminder={reminder}
            thread={thread}
            events={events}
            watcherId={watcherId}
            onDismissReminder={onDismissReminder}
          />
        );
      }
      break;
    }
    case 'signal': {
      const signal = events.find(e => e.event_id === selection.id);
      if (signal) {
        title = 'Signal Details';
        // Find related entities
        const emailId = getEventField(signal, 'email_id') as string | undefined;
        const message = emailId ? events.find(e => getEventField(e, 'email_id') === emailId && e.type === 'EMAIL_RECEIVED') : undefined;
        const reminder = reminders.find(r => 
          r.grouped_signal_ids?.includes(signal.event_id) ||
          r.extraction_event_id === signal.event_id
        );
        const thread = reminder ? threads.find(t => t.thread_id === reminder.thread_id) : undefined;
        content = (
          <SignalDetail
            signal={signal}
            reminder={reminder}
            message={message}
            thread={thread}
          />
        );
      }
      break;
    }
    case 'message': {
      const message = events.find(e => e.event_id === selection.id && e.type === 'EMAIL_RECEIVED');
      if (message) {
        title = 'Message Details';
        const emailId = getEventField(message, 'email_id') as string;
        const threadId = getEventField(message, 'routed_to_thread_id') as string | undefined;
        const thread = threadId ? threads.find(t => t.thread_id === threadId) : undefined;
        const extractedSignals = events.filter(e => 
          getEventField(e, 'email_id') === emailId &&
          ['HARD_DEADLINE_EXTRACTED', 'SOFT_DEADLINE_EXTRACTED', 'URGENCY_SIGNAL_EXTRACTED', 'CLOSURE_SIGNAL_EXTRACTED'].includes(e.type)
        );
        content = (
          <MessageDetail
            message={message}
            thread={thread}
            extractedSignals={extractedSignals}
          />
        );
      }
      break;
    }
  }

  if (!content) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <p>Item not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {content}
      </div>
    </div>
  );
}

export default DetailPanel;
