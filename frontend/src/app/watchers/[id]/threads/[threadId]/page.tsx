'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, type Thread, type VigilEvent, type Watcher } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { EventTable } from '@/components/events/event-table';
import { AppHeader, SubHeader } from '@/components/layout';

// Event type categories
const EXTRACTION_EVENT_TYPES = [
  'HARD_DEADLINE_OBSERVED',
  'SOFT_DEADLINE_SIGNAL_OBSERVED',
  'URGENCY_SIGNAL_OBSERVED',
  'CLOSURE_SIGNAL_OBSERVED',
];

const REMINDER_EVENT_TYPES = [
  'REMINDER_GENERATED',
  'REMINDER_EVALUATED',
];

const ALERT_EVENT_TYPES = [
  'ALERT_QUEUED',
  'ALERT_SENT',
  'ALERT_FAILED',
];

const THREAD_LIFECYCLE_TYPES = [
  'THREAD_OPENED',
  'THREAD_UPDATED',
  'THREAD_CLOSED',
];

type UrgencyLevel = 'ok' | 'warning' | 'critical' | 'overdue';

interface UrgencyTransition {
  timestamp: number;
  from: UrgencyLevel | null;
  to: UrgencyLevel;
  event_id: string;
  hours_until_deadline: number | null;
  hours_since_activity: number;
}

function ThreadDetailContent() {
  const params = useParams();
  const router = useRouter();
  const watcherId = params.id as string;
  const threadId = params.threadId as string;

  const [thread, setThread] = useState<Thread | null>(null);
  const [watcher, setWatcher] = useState<Watcher | null>(null);
  const [events, setEvents] = useState<VigilEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'events'>('overview');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [watcherResult, threadResult, eventsResult] = await Promise.all([
        api.getWatcher(watcherId),
        api.getThread(watcherId, threadId),
        api.getThreadEvents(watcherId, threadId),
      ]);
      setWatcher(watcherResult.watcher);
      setThread(threadResult.thread);
      setEvents(eventsResult.events.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      console.error('Failed to fetch thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setIsLoading(false);
    }
  }, [watcherId, threadId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCloseThread = async () => {
    if (!thread || thread.status === 'closed') return;
    setIsClosing(true);
    try {
      await api.closeThread(watcherId, threadId);
      await fetchData();
    } catch (err) {
      console.error('Failed to close thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to close thread');
    } finally {
      setIsClosing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatRelative = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (diff < 0) {
      // Future date
      const absDiff = Math.abs(diff);
      const futureHours = Math.floor(absDiff / 3600000);
      const futureDays = Math.floor(absDiff / 86400000);
      if (futureDays > 0) return `in ${futureDays}d`;
      if (futureHours > 0) return `in ${futureHours}h`;
      return `in ${Math.floor(absDiff / 60000)}m`;
    }

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getUrgencyBadgeClass = (urgency: string) => {
    const classes: Record<string, string> = {
      ok: 'badge-ok',
      warning: 'badge-warning',
      critical: 'badge-critical',
      overdue: 'badge-overdue',
    };
    return classes[urgency] || 'badge-neutral';
  };

  const getEventTypeClass = (type: string) => {
    if (EXTRACTION_EVENT_TYPES.includes(type)) return 'text-blue-600';
    if (REMINDER_EVENT_TYPES.includes(type)) return 'text-amber-600';
    if (ALERT_EVENT_TYPES.includes(type)) return 'text-red-600';
    if (THREAD_LIFECYCLE_TYPES.includes(type)) return 'text-green-600';
    return 'text-gray-600';
  };

  // Extract urgency transitions from events
  const getUrgencyTimeline = (): UrgencyTransition[] => {
    const transitions: UrgencyTransition[] = [];
    let previousUrgency: UrgencyLevel | null = null;

    // Sort events by timestamp ascending for timeline
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of sortedEvents) {
      const payload = event.payload as Record<string, unknown>;

      if (event.type === 'THREAD_OPENED') {
        transitions.push({
          timestamp: event.timestamp,
          from: null,
          to: 'ok',
          event_id: event.event_id,
          hours_until_deadline: null,
          hours_since_activity: 0,
        });
        previousUrgency = 'ok';
      } else if (event.type === 'REMINDER_EVALUATED') {
        const newUrgency = payload.urgency_state as UrgencyLevel;
        if (newUrgency && newUrgency !== previousUrgency) {
          transitions.push({
            timestamp: event.timestamp,
            from: previousUrgency,
            to: newUrgency,
            event_id: event.event_id,
            hours_until_deadline: payload.hours_until_deadline as number | null,
            hours_since_activity: payload.hours_since_activity as number || 0,
          });
          previousUrgency = newUrgency;
        }
      } else if (event.type === 'REMINDER_GENERATED') {
        const newUrgency = payload.urgency_level as UrgencyLevel;
        if (newUrgency && newUrgency !== previousUrgency) {
          transitions.push({
            timestamp: event.timestamp,
            from: previousUrgency,
            to: newUrgency,
            event_id: event.event_id,
            hours_until_deadline: null,
            hours_since_activity: 0,
          });
          previousUrgency = newUrgency;
        }
      }
    }

    return transitions.reverse(); // Most recent first
  };

  // Filter events by category
  const extractionEvents = events.filter(e => EXTRACTION_EVENT_TYPES.includes(e.type));
  const reminderEvents = events.filter(e => REMINDER_EVENT_TYPES.includes(e.type));
  const alertEvents = events.filter(e => ALERT_EVENT_TYPES.includes(e.type));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader backHref={`/watchers/${watcherId}`} />
        <div className="flex items-center justify-center py-20">
          <span className="spinner mr-3" />
          <span className="text-sm text-gray-600">Loading thread...</span>
        </div>
      </div>
    );
  }

  if (!thread || !watcher) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader backHref={`/watchers/${watcherId}`} />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Thread not found</h2>
            <p className="text-gray-600 mt-2">{error || 'The thread you are looking for does not exist.'}</p>
            <Link href={`/watchers/${watcherId}`} className="text-blue-600 hover:text-blue-700 mt-4 block">
              Back to watcher
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const urgencyTimeline = getUrgencyTimeline();

  // Build action buttons for header
  const headerActions = (
    <div className="flex items-center gap-3">
      <span className={`badge ${getUrgencyBadgeClass(thread.urgency)}`}>
        {thread.urgency}
      </span>
      <span className={`badge ${thread.status === 'open' ? 'badge-ok' : 'badge-neutral'}`}>
        {thread.status}
      </span>
      {thread.status === 'open' && (
        <button
          onClick={handleCloseThread}
          disabled={isClosing}
          className="btn btn-secondary text-sm"
        >
          {isClosing ? 'Closing...' : 'Close Thread'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <SubHeader
        backHref={`/watchers/${watcherId}`}
        backLabel={watcher.name}
        title={thread.subject || 'No subject'}
        subtitle={`Watcher: ${watcher.name}`}
        rightContent={headerActions}
      />

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-6xl mx-auto px-6 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface-raised border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'timeline'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Urgency Timeline ({urgencyTimeline.length})
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'events'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Events ({events.length})
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Current Status */}
            <div className="panel">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Current Status</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <div className="data-label mb-1">Urgency</div>
                    <span className={`badge ${getUrgencyBadgeClass(thread.urgency)}`}>
                      {thread.urgency}
                    </span>
                  </div>
                  <div>
                    <div className="data-label mb-1">Status</div>
                    <span className={`badge ${thread.status === 'open' ? 'badge-ok' : 'badge-neutral'}`}>
                      {thread.status}
                    </span>
                  </div>
                  <div>
                    <div className="data-label mb-1">Messages</div>
                    <div className="data-value">{thread.message_count}</div>
                  </div>
                  <div>
                    <div className="data-label mb-1">Last Activity</div>
                    <div className="data-value">{formatRelative(thread.last_activity_at)}</div>
                  </div>
                </div>
                {thread.deadline && (
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="data-label mb-1">Deadline</div>
                    <div className="flex items-center gap-3">
                      <span className="data-value">{formatDate(thread.deadline)}</span>
                      <span className="text-sm text-gray-500">({formatRelative(thread.deadline)})</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Extraction Events */}
            <div className="panel">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Extracted Information ({extractionEvents.length})</h2>
                <p className="text-sm text-gray-500 mt-1">Deadlines, urgency signals, and closure signals detected from emails</p>
              </div>
              {extractionEvents.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {extractionEvents.map(event => {
                    const payload = event.payload as Record<string, unknown>;
                    return (
                      <div key={event.event_id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono text-sm ${getEventTypeClass(event.type)}`}>
                                {event.type.replace(/_/g, ' ')}
                              </span>
                              {payload.binding === true && (
                                <span className="badge badge-warning text-2xs">Binding</span>
                              )}
                              {Boolean(payload.confidence) && (
                                <span className="badge badge-neutral text-2xs">{String(payload.confidence)}</span>
                              )}
                            </div>
                            {event.type === 'HARD_DEADLINE_OBSERVED' && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-900 font-medium">
                                  Deadline: {payload.deadline_utc ? formatDate(payload.deadline_utc as number) : 'Unknown'}
                                </p>
                                {Boolean(payload.deadline_text) && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    &ldquo;{String(payload.deadline_text)}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                            {event.type === 'SOFT_DEADLINE_SIGNAL_OBSERVED' && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-900">
                                  Estimated horizon: {String(payload.estimated_horizon_hours)}h
                                </p>
                                {Boolean(payload.signal_text) && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    &ldquo;{String(payload.signal_text)}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                            {event.type === 'URGENCY_SIGNAL_OBSERVED' && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-900">
                                  Signal type: {String(payload.signal_type)}
                                </p>
                                {Boolean(payload.signal_text) && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    &ldquo;{String(payload.signal_text)}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                            {event.type === 'CLOSURE_SIGNAL_OBSERVED' && (
                              <div className="mt-2">
                                <p className="text-sm text-gray-900">
                                  Closure type: {String(payload.closure_type)}
                                </p>
                                {Boolean(payload.source_span) && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    &ldquo;{String(payload.source_span)}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-4">
                            {formatRelative(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No extraction events yet. Deadlines and signals will appear here when detected.
                </div>
              )}
            </div>

            {/* Reminders */}
            <div className="panel">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Reminders ({reminderEvents.length})</h2>
                <p className="text-sm text-gray-500 mt-1">Generated reminders and evaluations for this thread</p>
              </div>
              {reminderEvents.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {reminderEvents.map(event => {
                    const payload = event.payload as Record<string, unknown>;
                    return (
                      <div key={event.event_id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono text-sm ${getEventTypeClass(event.type)}`}>
                                {event.type.replace(/_/g, ' ')}
                              </span>
                              {Boolean(payload.urgency_level) && (
                                <span className={`badge ${getUrgencyBadgeClass(payload.urgency_level as string)}`}>
                                  {String(payload.urgency_level)}
                                </span>
                              )}
                              {Boolean(payload.urgency_state) && (
                                <span className={`badge ${getUrgencyBadgeClass(payload.urgency_state as string)}`}>
                                  {String(payload.urgency_state)}
                                </span>
                              )}
                            </div>
                            {event.type === 'REMINDER_GENERATED' && (
                              <div className="mt-2 text-sm text-gray-600">
                                <span>Type: {String(payload.reminder_type)}</span>
                                {payload.binding === true && <span className="ml-3">Binding: Yes</span>}
                              </div>
                            )}
                            {event.type === 'REMINDER_EVALUATED' && (
                              <div className="mt-2 text-sm text-gray-600">
                                {payload.hours_until_deadline != null && (
                                  <span>Hours until deadline: {String(payload.hours_until_deadline)}</span>
                                )}
                                {payload.hours_since_activity != null && (
                                  <span className="ml-3">Hours since activity: {String(payload.hours_since_activity)}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-4">
                            {formatRelative(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No reminders generated yet. Reminders appear when urgency transitions occur.
                </div>
              )}
            </div>

            {/* Alerts */}
            {alertEvents.length > 0 && (
              <div className="panel">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Alerts ({alertEvents.length})</h2>
                  <p className="text-sm text-gray-500 mt-1">Notifications sent for this thread</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {alertEvents.map(event => {
                    const payload = event.payload as Record<string, unknown>;
                    return (
                      <div key={event.event_id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-mono text-sm ${getEventTypeClass(event.type)}`}>
                                {event.type.replace(/_/g, ' ')}
                              </span>
                              {Boolean(payload.urgency_state) && (
                                <span className={`badge ${getUrgencyBadgeClass(payload.urgency_state as string)}`}>
                                  {String(payload.urgency_state)}
                                </span>
                              )}
                            </div>
                            {Array.isArray(payload.channels) && payload.channels.length > 0 && (
                              <div className="mt-1 text-sm text-gray-600">
                                Channels: {(payload.channels as Array<{ type: string }>).map((c) => c.type).join(', ')}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-4">
                            {formatRelative(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="panel">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Urgency Timeline</h2>
              <p className="text-sm text-gray-500 mt-1">State transitions over time (most recent first)</p>
            </div>
            {urgencyTimeline.length > 0 ? (
              <div className="p-4">
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />

                  <div className="space-y-6">
                    {urgencyTimeline.map((transition, index) => (
                      <div key={transition.event_id} className="relative flex items-start gap-4">
                        {/* Timeline dot */}
                        <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center
                          ${transition.to === 'ok' ? 'bg-status-ok/20' : ''}
                          ${transition.to === 'warning' ? 'bg-status-warning/20' : ''}
                          ${transition.to === 'critical' ? 'bg-status-critical/20' : ''}
                          ${transition.to === 'overdue' ? 'bg-status-overdue/20' : ''}
                        `}>
                          <div className={`w-3 h-3 rounded-full
                            ${transition.to === 'ok' ? 'bg-status-ok' : ''}
                            ${transition.to === 'warning' ? 'bg-status-warning' : ''}
                            ${transition.to === 'critical' ? 'bg-status-critical' : ''}
                            ${transition.to === 'overdue' ? 'bg-status-overdue' : ''}
                          `} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2 mb-1">
                            {transition.from && (
                              <>
                                <span className={`badge ${getUrgencyBadgeClass(transition.from)}`}>
                                  {transition.from}
                                </span>
                                <span className="text-gray-400">→</span>
                              </>
                            )}
                            <span className={`badge ${getUrgencyBadgeClass(transition.to)}`}>
                              {transition.to}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {formatDate(transition.timestamp)}
                          </p>
                          {(transition.hours_until_deadline !== null || transition.hours_since_activity > 0) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {transition.hours_until_deadline !== null && (
                                <span>Hours until deadline: {transition.hours_until_deadline.toFixed(1)}</span>
                              )}
                              {transition.hours_since_activity > 0 && (
                                <span className="ml-3">Hours since activity: {transition.hours_since_activity.toFixed(1)}</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No urgency transitions recorded yet.
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="panel">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">All Events</h2>
              <p className="text-sm text-gray-500 mt-1">Complete event history for this thread</p>
            </div>
            <EventTable 
              events={events} 
              emptyMessage="No events yet. Events will appear here as the thread is updated." 
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default function ThreadDetailPage() {
  return (
    <RequireAuth>
      <ThreadDetailContent />
    </RequireAuth>
  );
}
