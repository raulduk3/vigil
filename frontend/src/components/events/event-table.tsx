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

function getEventCategory(type: string): string {
  // Account & User events
  if (type === 'ACCOUNT_CREATED' || type === 'USER_CREATED') return 'Account';
  
  // Watcher lifecycle events
  if (type.startsWith('WATCHER_') || type === 'POLICY_UPDATED') return 'Watcher';
  
  // Message events
  if (type === 'MESSAGE_RECEIVED' || type === 'MESSAGE_IGNORED' || type === 'MESSAGE_REJECTED') return 'Message';
  
  // Thread lifecycle events
  if (type.startsWith('THREAD_') || type.startsWith('MESSAGE_THREAD_')) return 'Thread';
  
  // LLM Extraction events
  if (type === 'EXTRACTION_COMPLETE' || type === 'HARD_DEADLINE_OBSERVED' || type === 'SOFT_DEADLINE_SIGNAL_OBSERVED' || 
      type === 'URGENCY_SIGNAL_OBSERVED' || type === 'CLOSURE_SIGNAL_OBSERVED') return 'Extraction';
  
  // Reminder events
  if (type.startsWith('REMINDER_')) return 'Reminder';
  
  // Alert/Notification events
  if (type.startsWith('ALERT_') || type === 'NOTIFICATION_SENT') return 'Alert';
  
  // State evaluation events
  if (type === 'URGENCY_STATE_CHANGED') return 'State';
  
  return 'System';
}

function getEventBadgeColor(category: string): string {
  switch (category) {
    case 'Watcher': return 'bg-blue-50 text-blue-700';
    case 'Message': return 'bg-purple-50 text-purple-700';
    case 'Thread': return 'bg-green-50 text-green-700';
    case 'Extraction': return 'bg-orange-50 text-orange-700';
    case 'Reminder': return 'bg-yellow-50 text-yellow-700';
    case 'Alert': return 'bg-red-50 text-red-700';
    case 'State': return 'bg-indigo-50 text-indigo-700';
    case 'Account': return 'bg-gray-50 text-gray-700';
    case 'System': return 'bg-gray-50 text-gray-600';
    default: return 'bg-gray-50 text-gray-600';
  }
}

function normalizeEventType(type: string): string {
  // Convert SNAKE_CASE to Title Case
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function getEventSummary(event: VigilEvent): string {
  const data = { ...event.payload, ...event } as Record<string, unknown>;
  
  switch (event.type) {
    // Message events
    case 'MESSAGE_RECEIVED':
      return String(data.subject || 'No subject');
    case 'MESSAGE_IGNORED':
      return `Ignored: ${String(data.reason || 'filtering rule')}`;
    case 'MESSAGE_REJECTED':
      return `Rejected: ${String(data.reason || 'not allowed')}`;
    
    // Extraction events
    case 'EXTRACTION_COMPLETE':
      const hasSignals = data.hard_deadline || data.soft_deadline_signals || data.urgency_signals || data.closure_signals;
      if (!hasSignals) {
        return 'No deadlines or signals detected';
      }
      const signals = [];
      if (data.hard_deadline) signals.push('hard deadline');
      if (data.soft_deadline_signals) signals.push('soft deadline');
      if (data.urgency_signals) signals.push('urgency');
      if (data.closure_signals) signals.push('closure');
      return `Extraction complete: ${signals.join(', ')}`;
    case 'HARD_DEADLINE_OBSERVED':
      return `Hard deadline: ${formatTimestamp(data.deadline_utc as number)}`;
    case 'SOFT_DEADLINE_SIGNAL_OBSERVED':
      return `Soft deadline: "${String(data.signal_text || '').slice(0, 40)}..."`;
    case 'URGENCY_SIGNAL_OBSERVED':
      return `Urgency: ${String(data.signal_type || 'urgent').replace('_', ' ')}`;
    case 'CLOSURE_SIGNAL_OBSERVED':
      return `Closure signal detected: "${String(data.signal_text || '').slice(0, 30)}..."`;
    
    // Thread events
    case 'THREAD_OPENED':
      return String(data.normalized_subject || 'New thread');
    case 'THREAD_ACTIVITY_OBSERVED':
      return `Activity from ${String(data.sender || 'participant')}`;
    case 'THREAD_CLOSED':
      return `Closed by ${String(data.closed_by || 'system')}`;
    case 'MESSAGE_THREAD_ASSOCIATED':
      return 'Message associated with thread';
    case 'MESSAGE_THREAD_DEACTIVATED':
      return 'Message deactivated from thread';
    case 'MESSAGE_THREAD_REACTIVATED':
      return 'Message reactivated in thread';
    
    // Watcher events
    case 'WATCHER_CREATED':
      return `Created: ${String(data.name || 'Watcher')}`;
    case 'WATCHER_ACTIVATED':
      return 'Watcher activated';
    case 'WATCHER_PAUSED':
      return `Paused${data.reason ? ': ' + String(data.reason) : ''}`;
    case 'WATCHER_RESUMED':
      return 'Watcher resumed';
    case 'WATCHER_UPDATED':
      return data.name ? `Name updated to: ${String(data.name)}` : 'Settings updated';
    case 'WATCHER_DELETED':
      return 'Watcher deleted';
    case 'POLICY_UPDATED':
      return 'Policy configuration updated';
    
    // Reminder events
    case 'REMINDER_CREATED':
    case 'REMINDER_MANUAL_CREATED':
      return `${String(data.reminder_type || 'reminder').replace('_', ' ')} - ${formatTimestamp(data.deadline_utc as number)}`;
    case 'REMINDER_EDITED':
      return 'Reminder updated';
    case 'REMINDER_EVALUATED':
      return `Urgency: ${String(data.urgency_state || 'ok')}`;
    case 'REMINDER_DISMISSED':
      return `Dismissed by ${String(data.dismissed_by || 'user')}`;
    case 'REMINDER_COMPLETED':
      return 'Marked as completed';
    case 'REMINDER_MERGED':
      return 'Merged with another reminder';
    
    // Alert events
    case 'ALERT_QUEUED':
      return `Alert queued: ${String(data.urgency || 'notification')}`;
    case 'ALERT_SENT':
      return `${String(data.channel_type || 'notification')} sent`;
    case 'ALERT_FAILED':
      return `Failed: ${String(data.error_message || 'unknown error').slice(0, 50)}`;
    
    // State events
    case 'URGENCY_STATE_CHANGED':
      return `${String(data.from_state || 'ok')} → ${String(data.to_state || 'warning')}`;
    
    // Account events
    case 'ACCOUNT_CREATED':
      return `Account: ${String(data.owner_email || 'owner')}`;
    case 'USER_CREATED':
      return `User: ${String(data.email || 'user')}`;
    
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
  const [groupByThread, setGroupByThread] = useState(true);
  const [flowPreset, setFlowPreset] = useState<boolean>(false);

  const categories = ['all', ...Array.from(new Set(events.map(e => getEventCategory(e.type))))];
  // Optional flow preset: limit to essential flow types
  const FLOW_TYPES = new Set<string> ([
    'MESSAGE_RECEIVED',
    'ROUTE_EXTRACTION_COMPLETE',
    'THREAD_OPENED',
    'THREAD_ACTIVITY_OBSERVED',
    'EXTRACTION_COMPLETE',
    'HARD_DEADLINE_OBSERVED',
    'SOFT_DEADLINE_SIGNAL_OBSERVED',
    'URGENCY_SIGNAL_OBSERVED',
    'CLOSURE_SIGNAL_OBSERVED',
    'THREAD_CLOSED',
  ]);

  const filteredByCategory = categoryFilter === 'all'
    ? events
    : events.filter(e => getEventCategory(e.type) === categoryFilter);

  const filteredEvents = flowPreset
    ? filteredByCategory.filter(e => FLOW_TYPES.has(e.type))
    : filteredByCategory;

  // Group events by thread for hierarchical display
  const groupedEvents = React.useMemo(() => {
    // When not grouping, show newest-first consistently
    if (!groupByThread) {
      return [...filteredEvents]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(e => ({ event: e, isNested: false, threadStart: false, threadEnd: false }));
    }

    const groups: Array<{ event: VigilEvent; isNested: boolean; threadStart?: boolean; threadEnd?: boolean }> = [];
    const threadMap = new Map<string, VigilEvent[]>();
    const nonThreadEvents: VigilEvent[] = [];

    // First pass: separate thread events from non-thread events
    filteredEvents.forEach(event => {
      if ((event as any).thread_id) {
        const tid = (event as any).thread_id as string;
        if (!threadMap.has(tid)) {
          threadMap.set(tid, []);
        }
        threadMap.get(tid)!.push(event);
      } else {
        nonThreadEvents.push(event);
      }
    });

    // Build thread groups: order internal events by flow preset or chronological
    const threadGroups = Array.from(threadMap.entries()).map(([threadId, evs]) => {
      const ordered = evs.slice().sort((a, b) => {
        if (flowPreset) {
          const weight = (t: string) => {
            switch (t) {
              case 'MESSAGE_RECEIVED': return 10;
              case 'ROUTE_EXTRACTION_COMPLETE': return 20;
              case 'THREAD_OPENED': return 30;
              case 'THREAD_ACTIVITY_OBSERVED': return 40;
              case 'EXTRACTION_COMPLETE': return 50;
              case 'HARD_DEADLINE_OBSERVED': return 51;
              case 'SOFT_DEADLINE_SIGNAL_OBSERVED': return 52;
              case 'URGENCY_SIGNAL_OBSERVED': return 53;
              case 'CLOSURE_SIGNAL_OBSERVED': return 54;
              case 'THREAD_CLOSED': return 60;
              default: return 100;
            }
          };
          const wa = weight(a.type);
          const wb = weight(b.type);
          if (wa !== wb) return wa - wb;
        }
        return a.timestamp - b.timestamp;
      });
      const lastTimestamp = Math.max(...ordered.map(e => e.timestamp));
      return { threadId, events: ordered, lastTimestamp };
    });

    // Interleave: sort by most recent activity first
    const allItems: Array<{ type: 'thread' | 'event'; timestamp: number; data: any }> = [
      ...threadGroups.map(g => ({ type: 'thread' as const, timestamp: g.lastTimestamp, data: g })),
      ...nonThreadEvents.map(e => ({ type: 'event' as const, timestamp: e.timestamp, data: e })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    // Build the final grouped structure
    allItems.forEach(item => {
      if (item.type === 'event') {
        groups.push({ event: item.data, isNested: false });
      } else {
        const threadGroup = item.data;
        threadGroup.events.forEach((event: VigilEvent, idx: number) => {
          groups.push({
            event,
            isNested: true,
            threadStart: idx === 0,
            threadEnd: idx === threadGroup.events.length - 1,
          });
        });
      }
    });

    return groups;
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
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={flowPreset}
              onChange={(e) => setFlowPreset(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-vigil-600 focus:ring-vigil-500"
            />
            Essential flow only
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
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
            {groupedEvents.map((item) => {
              const { event, isNested, threadStart, threadEnd } = item;
              const category = getEventCategory(event.type);
              const isExpanded = expandedRow === event.event_id;
              
              return (
                <React.Fragment key={event.event_id}>
                  <tr className={`hover:bg-gray-50 transition-colors ${isNested ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isNested && (
                          <div className="flex items-center">
                            <div className="w-6 flex items-center justify-center">
                              {threadStart && (
                                <div className="w-3 h-3 border-l-2 border-b-2 border-blue-300 rounded-bl" />
                              )}
                              {!threadStart && !threadEnd && (
                                <div className="w-px h-full bg-blue-300" />
                              )}
                              {threadEnd && (
                                <div className="w-3 h-3 border-l-2 border-t-2 border-blue-300 rounded-tl -mb-3" />
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-medium">
                            {formatRelativeTime(event.timestamp)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getEventBadgeColor(category)}`}>
                        {category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {threadStart && (
                          <span className="text-blue-600 text-xs font-mono">●</span>
                        )}
                        <span className="text-gray-900 text-sm">
                          {normalizeEventType(event.type)}
                        </span>
                      </div>
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
                    <tr className={isNested ? 'bg-blue-50/20' : 'bg-gray-50'}>
                      <td colSpan={5} className="px-4 py-4">
                        <div className={`space-y-2 ${isNested ? 'ml-10' : ''}`}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Event Details
                            </span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-gray-500 block mb-1">Event ID</span>
                              <code className="text-gray-900 font-mono text-xs">{event.event_id}</code>
                            </div>
                            <div>
                              <span className="text-gray-500 block mb-1">Watcher ID</span>
                              <code className="text-gray-900 font-mono text-xs">{event.watcher_id}</code>
                            </div>
                            {(event as any).thread_id && (
                              <div>
                                <span className="text-gray-500 block mb-1">Thread ID</span>
                                <code className="text-gray-900 font-mono text-xs">{(event as any).thread_id}</code>
                              </div>
                            )}
                          </div>
                          {Object.keys(event.payload || {}).length > 0 && (
                            <details className="mt-3">
                              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                View full payload
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
