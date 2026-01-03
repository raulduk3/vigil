'use client';

import React, { useState } from 'react';
import type { VigilEvent } from '@/lib/api/client';

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatRelativeTime(ts: number | undefined): string {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Events that are meaningful to end users (shown in simplified view)
// System/technical events are hidden by default
const USER_FRIENDLY_EVENTS = new Set<string>([
  // Email activity
  'EMAIL_RECEIVED',
  // What was found in emails
  'HARD_DEADLINE_OBSERVED',
  'SOFT_DEADLINE_SIGNAL_OBSERVED',
  'URGENCY_SIGNAL_OBSERVED',
  'CLOSURE_SIGNAL_OBSERVED',
  // Thread lifecycle (conversations)
  'THREAD_OPENED',
  'THREAD_ACTIVITY_OBSERVED',
  'THREAD_CLOSED',
  // Notifications
  'ALERT_SENT',
  'ALERT_FAILED',
  // Manual actions
  'REMINDER_DISMISSED',
  'REMINDER_COMPLETED',
  // Urgency changes - only show meaningful state changes
  'URGENCY_STATE_CHANGED',
  // User-initiated watcher actions
  'WATCHER_CREATED',
  'WATCHER_PAUSED',
  'WATCHER_RESUMED',
]);

// User-friendly category names
function getEventCategory(type: string): string {
  // Email activity
  if (type === 'EMAIL_RECEIVED' || type === 'MESSAGE_IGNORED' || type === 'MESSAGE_REJECTED') return 'Email';
  
  // What was detected/found
  if (type === 'EXTRACTION_COMPLETE' || type === 'HARD_DEADLINE_OBSERVED' || type === 'SOFT_DEADLINE_SIGNAL_OBSERVED' || 
      type === 'URGENCY_SIGNAL_OBSERVED' || type === 'CLOSURE_SIGNAL_OBSERVED') return 'Detection';
  
  // Thread lifecycle (conversations)
  if (type.startsWith('THREAD_') || type.startsWith('MESSAGE_THREAD_')) return 'Conversation';
  
  // Notifications
  if (type.startsWith('ALERT_') || type === 'NOTIFICATION_SENT') return 'Notification';
  
  // Urgency status
  if (type === 'URGENCY_STATE_CHANGED' || type.startsWith('REMINDER_')) return 'Status';
  
  // Settings/config events (less important for users)
  if (type.startsWith('WATCHER_') || type === 'POLICY_UPDATED') return 'Settings';
  
  // Account events (less important for daily use)
  if (type === 'ACCOUNT_CREATED' || type === 'USER_CREATED') return 'Account';
  
  return 'System';
}

function getEventBadgeColor(category: string): string {
  switch (category) {
    case 'Email': return 'bg-purple-50 text-purple-700';
    case 'Detection': return 'bg-amber-50 text-amber-700';
    case 'Conversation': return 'bg-blue-50 text-blue-700';
    case 'Notification': return 'bg-red-50 text-red-700';
    case 'Status': return 'bg-green-50 text-green-700';
    case 'Settings': return 'bg-slate-50 text-slate-600';
    case 'Account': return 'bg-gray-50 text-gray-600';
    case 'System': return 'bg-gray-50 text-gray-500';
    default: return 'bg-gray-50 text-gray-500';
  }
}

function normalizeEventType(type: string): string {
  // Map technical event types to user-friendly names
  const friendlyNames: Record<string, string> = {
    'EMAIL_RECEIVED': 'Email Received',
    'MESSAGE_IGNORED': 'Email Ignored',
    'MESSAGE_REJECTED': 'Email Rejected',
    'EXTRACTION_COMPLETE': 'Analysis Complete',
    'HARD_DEADLINE_OBSERVED': 'Deadline Found',
    'SOFT_DEADLINE_SIGNAL_OBSERVED': 'Timeline Detected',
    'URGENCY_SIGNAL_OBSERVED': 'Urgency Detected',
    'CLOSURE_SIGNAL_OBSERVED': 'Resolution Detected',
    'THREAD_OPENED': 'Conversation Started',
    'THREAD_ACTIVITY_OBSERVED': 'New Activity',
    'THREAD_CLOSED': 'Conversation Resolved',
    'ALERT_QUEUED': 'Alert Preparing',
    'ALERT_SENT': 'Notification Sent',
    'ALERT_FAILED': 'Notification Failed',
    'REMINDER_EVALUATED': 'Status Check',
    'REMINDER_DISMISSED': 'Dismissed',
    'REMINDER_COMPLETED': 'Completed',
    'URGENCY_STATE_CHANGED': 'Urgency Changed',
    'WATCHER_CREATED': 'Watcher Created',
    'WATCHER_ACTIVATED': 'Watcher Started',
    'WATCHER_PAUSED': 'Watcher Paused',
    'WATCHER_RESUMED': 'Watcher Resumed',
    'WATCHER_DELETED': 'Watcher Deleted',
    'POLICY_UPDATED': 'Settings Changed',
  };
  
  if (friendlyNames[type]) {
    return friendlyNames[type];
  }
  
  // Fallback: Convert SNAKE_CASE to Title Case
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function getEventSummary(event: VigilEvent): string {
  const data = { ...event.payload, ...event } as Record<string, unknown>;
  
  switch (event.type) {
    // Email events - focus on what the email is about
    case 'EMAIL_RECEIVED':
      return String(data.subject || 'New email received');
    case 'MESSAGE_IGNORED':
      return `Skipped: ${String(data.reason || 'not in allowlist')}`;
    case 'MESSAGE_REJECTED':
      return `Blocked: ${String(data.reason || 'sender not allowed')}`;
    
    // Detection events - focus on what was found
    case 'EXTRACTION_COMPLETE':
      const hasSignals = data.hard_deadline || data.soft_deadline_signals || data.urgency_signals || data.closure_signals;
      if (!hasSignals) {
        return 'No action items detected';
      }
      const items = [];
      if (data.hard_deadline) items.push('deadline');
      if (data.soft_deadline_signals) items.push('timeline');
      if (data.urgency_signals) items.push('urgent request');
      if (data.closure_signals) items.push('resolution');
      return `Found: ${items.join(', ')}`;
    case 'HARD_DEADLINE_OBSERVED':
      return `Due: ${formatTimestamp(data.deadline_utc as number)}`;
    case 'SOFT_DEADLINE_SIGNAL_OBSERVED':
      const horizon = data.estimated_horizon_hours as number;
      return horizon ? `Timeline: ~${horizon} hours` : 'Flexible timeline mentioned';
    case 'URGENCY_SIGNAL_OBSERVED':
      const signalType = String(data.signal_type || 'request').replace(/_/g, ' ');
      return `${signalType.charAt(0).toUpperCase() + signalType.slice(1)}`;
    case 'CLOSURE_SIGNAL_OBSERVED':
      const closureType = String(data.closure_type || 'resolved');
      return closureType === 'resolved' ? 'Issue resolved' : `${closureType} detected`;
    
    // Conversation events - focus on what happened
    case 'THREAD_OPENED':
      return String(data.normalized_subject || 'New conversation');
    case 'THREAD_ACTIVITY_OBSERVED':
      const sender = String(data.original_sender || data.sender || '').split('@')[0] || 'Someone';
      return `Reply from ${sender}`;
    case 'THREAD_CLOSED':
      return data.closed_by === 'user_action' ? 'Marked as resolved' : 'Auto-resolved';
    case 'MESSAGE_THREAD_ASSOCIATED':
      return 'Added to conversation';
    case 'MESSAGE_THREAD_DEACTIVATED':
      return 'Removed from conversation';
    case 'MESSAGE_THREAD_REACTIVATED':
      return 'Re-added to conversation';
    
    // Settings events - be concise
    case 'WATCHER_CREATED':
      return `"${String(data.name || 'Watcher')}" created`;
    case 'WATCHER_ACTIVATED':
      return 'Monitoring started';
    case 'WATCHER_PAUSED':
      return data.reason ? String(data.reason) : 'Monitoring paused';
    case 'WATCHER_RESUMED':
      return 'Monitoring resumed';
    case 'WATCHER_UPDATED':
      return data.name ? `Renamed to "${String(data.name)}"` : 'Settings updated';
    case 'WATCHER_DELETED':
      return 'Permanently deleted';
    case 'POLICY_UPDATED':
      return 'Notification settings updated';
    
    // Status events - focus on the urgency level
    case 'REMINDER_CREATED':
    case 'REMINDER_MANUAL_CREATED':
      // Show friendly title instead of raw deadline
      const reminderDesc = data.description ? String(data.description) : 
                          data.deadline_utc ? `Due ${formatTimestamp(data.deadline_utc as number)}` :
                          'Reminder created';
      return reminderDesc;
    case 'REMINDER_EDITED':
      return 'Updated';
    case 'REMINDER_EVALUATED':
      const state = String(data.urgency_state || 'ok');
      const stateLabels: Record<string, string> = {
        'ok': '✓ On track',
        'warning': '⚠ Approaching deadline',
        'critical': '🔴 Deadline soon',
        'overdue': '❗ Overdue',
      };
      return stateLabels[state] || state;
    case 'REMINDER_DISMISSED':
      return 'Dismissed';
    case 'REMINDER_COMPLETED':
      return 'Completed';
    case 'REMINDER_MERGED':
      return 'Combined with another';
    
    // Notification events - focus on outcome
    case 'ALERT_QUEUED':
      return 'Preparing notification...';
    case 'ALERT_SENT':
      const channelType = String(data.channel_type || 'email');
      return channelType === 'email' ? 'Email sent' : `${channelType} notification sent`;
    case 'ALERT_FAILED':
      return `Could not send: ${String(data.error_message || 'unknown issue').slice(0, 40)}`;
    
    // Urgency changes - be clear about the change
    case 'URGENCY_STATE_CHANGED':
      const fromState = String(data.from_state || 'ok');
      const toState = String(data.to_state || 'warning');
      const urgencyLabels: Record<string, string> = {
        'ok': 'On track',
        'warning': 'Warning',
        'critical': 'Critical',
        'overdue': 'Overdue',
      };
      return `${urgencyLabels[fromState] || fromState} → ${urgencyLabels[toState] || toState}`;
    
    // Account events
    case 'ACCOUNT_CREATED':
      return 'Account created';
    case 'USER_CREATED':
      return `${String(data.email || 'User')} added`;
    
    default:
      return event.type.replace(/_/g, ' ').toLowerCase();
  }
}

interface EventTableProps {
  events: VigilEvent[];
  emptyMessage?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

export function EventTable({ 
  events, 
  emptyMessage = 'No events yet',
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: EventTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // Default to simple chronological view (no grouping)
  const [groupByThread, setGroupByThread] = useState(false);
  // Default to simplified view (user-friendly events only)
  const [showAllEvents, setShowAllEvents] = useState<boolean>(false);

  // Get categories from filtered events for consistent filtering
  const filteredByViewMode = showAllEvents 
    ? events 
    : events.filter(e => USER_FRIENDLY_EVENTS.has(e.type));
  const categories = ['all', ...Array.from(new Set(filteredByViewMode.map(e => getEventCategory(e.type))))];

  const filteredByCategory = categoryFilter === 'all'
    ? filteredByViewMode
    : filteredByViewMode.filter(e => getEventCategory(e.type) === categoryFilter);

  const filteredEvents = filteredByCategory;

  // Simple event ordering - newest first by default
  // Optional grouping by thread (off by default for simpler view)
  const displayEvents = React.useMemo(() => {
    // Simple chronological order (newest first) - the default
    if (!groupByThread) {
      return [...filteredEvents]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(e => ({ event: e, isGrouped: false }));
    }

    // When grouping is enabled, lightly group by thread but keep it simple
    const result: Array<{ event: VigilEvent; isGrouped: boolean }> = [];
    const seen = new Set<string>();
    
    // Sort all events newest first
    const sorted = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);
    
    sorted.forEach(event => {
      const threadId = (event as any).thread_id as string | undefined;
      
      if (!threadId) {
        // Non-thread events just go in order
        result.push({ event, isGrouped: false });
      } else if (!seen.has(threadId)) {
        // First time seeing this thread - add all events for this thread together
        seen.add(threadId);
        const threadEvents = sorted
          .filter(e => (e as any).thread_id === threadId)
          .sort((a, b) => b.timestamp - a.timestamp); // newest first within thread too
        
        threadEvents.forEach(te => {
          result.push({ event: te, isGrouped: threadEvents.length > 1 });
        });
      }
      // Skip events we've already added as part of a thread group
    });

    return result;
  }, [filteredEvents, groupByThread]);

  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">{emptyMessage}</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filter:</span>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                categoryFilter === cat
                  ? 'bg-vigil-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer" title="Show technical system events">
            <input
              type="checkbox"
              checked={showAllEvents}
              onChange={(e) => {
                setShowAllEvents(e.target.checked);
                // Reset category filter when switching views
                setCategoryFilter('all');
              }}
              className="w-4 h-4 rounded border-gray-300 text-vigil-600 focus:ring-vigil-500"
            />
            Show all events
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer" title="Group related events by conversation">
            <input
              type="checkbox"
              checked={groupByThread}
              onChange={(e) => setGroupByThread(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-vigil-600 focus:ring-vigil-500"
            />
            Group by thread
          </label>
          <span className="text-xs text-gray-500">
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Summary
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {displayEvents.map((item) => {
              const { event, isGrouped } = item;
              const category = getEventCategory(event.type);
              const isExpanded = expandedRow === event.event_id;
              
              return (
                <React.Fragment key={event.event_id}>
                  <tr className={`hover:bg-gray-50 transition-colors ${isGrouped ? 'bg-blue-50/20' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-medium">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getEventBadgeColor(category)}`}>
                        {category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-900 text-sm">
                        {normalizeEventType(event.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700 line-clamp-2">
                        {getEventSummary(event)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : event.event_id)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Details
                            </span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-gray-500 block mb-1">Event ID</span>
                              <code className="text-gray-900 font-mono text-xs break-all">{event.event_id}</code>
                            </div>
                            {(event as any).thread_id && (
                              <div>
                                <span className="text-gray-500 block mb-1">Conversation ID</span>
                                <code className="text-gray-900 font-mono text-xs break-all">{(event as any).thread_id}</code>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-500 block mb-1">Exact Time</span>
                              <span className="text-gray-900">{new Date(event.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                          {Object.keys(event.payload || {}).length > 0 && (
                            <details className="mt-3">
                              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                Technical details
                              </summary>
                              <pre className="mt-2 p-3 bg-white rounded border border-gray-200 text-xs overflow-x-auto">
                                {JSON.stringify(event.payload, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {hasMore && onLoadMore && (
        <div className="px-4 py-3 border-t border-gray-200 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="btn btn-secondary text-sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            ) : (
              'Load More Events'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
