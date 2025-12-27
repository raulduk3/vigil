'use client';

import React from 'react';
import type { VigilEvent } from '@/lib/api/client';

/**
 * Event metadata display utilities
 * Provides human-readable event information based on event type
 */

interface EventMetadata {
  label: string;
  description: string;
  details: Array<{ label: string; value: string }>;
}

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

  if (diff < 0) {
    // Future time
    const futureDiff = Math.abs(diff);
    const futureHours = Math.floor(futureDiff / 3600000);
    const futureDays = Math.floor(futureDiff / 86400000);
    if (futureDays > 0) return `in ${futureDays}d`;
    if (futureHours > 0) return `in ${futureHours}h`;
    return 'soon';
  }

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function truncate(str: string | undefined, length: number = 80): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getEventMetadata(event: VigilEvent): EventMetadata {
  // Events from the backend have all fields at the root level
  // The `payload` field in VigilEvent type is for any extra data
  // We use the event itself as the data source, falling back to payload
  const data = { ...event.payload, ...event } as Record<string, unknown>;

  // Default metadata
  const defaultMeta: EventMetadata = {
    label: event.type.replace(/_/g, ' '),
    description: 'Event recorded',
    details: [],
  };

  switch (event.type) {
    // Control Plane Events
    case 'ACCOUNT_CREATED':
      return {
        ...defaultMeta,
        label: 'Account Created',
        description: `New account created for ${data.owner_email || 'user'}`,
        details: [
          { label: 'Owner', value: String(data.owner_email || 'N/A') },
          { label: 'Account ID', value: truncate(String(data.account_id || ''), 12) },
        ],
      };

    case 'USER_CREATED':
      return {
        ...defaultMeta,
        label: 'User Created',
        description: `User ${data.email} added`,
        details: [
          { label: 'Email', value: String(data.email || 'N/A') },
          { label: 'Role', value: String(data.role || 'member') },
        ],
      };

    case 'WATCHER_CREATED':
      return {
        ...defaultMeta,
        label: 'Watcher Created',
        description: `Watcher "${data.name}" created`,
        details: [
          { label: 'Name', value: String(data.name || 'Unnamed') },
        ],
      };

    case 'WATCHER_ACTIVATED':
      return {
        ...defaultMeta,
        label: 'Watcher Activated',
        description: 'Monitoring started',
        details: [],
      };

    case 'WATCHER_PAUSED':
      return {
        ...defaultMeta,
        label: 'Watcher Paused',
        description: data.reason ? `Paused: ${data.reason}` : 'Monitoring paused',
        details: data.reason ? [{ label: 'Reason', value: String(data.reason) }] : [],
      };

    case 'WATCHER_RESUMED':
      return {
        ...defaultMeta,
        label: 'Watcher Resumed',
        description: 'Monitoring resumed',
        details: [],
      };

    case 'WATCHER_DELETED':
      return {
        ...defaultMeta,
        label: 'Watcher Deleted',
        description: 'Watcher permanently deleted',
        details: [],
      };

    case 'WATCHER_UPDATED':
      return {
        ...defaultMeta,
        label: 'Watcher Updated',
        description: data.name ? `Renamed to "${data.name}"` : 'Settings updated',
        details: data.name ? [{ label: 'New Name', value: String(data.name) }] : [],
      };

    case 'POLICY_UPDATED':
      const policy = data.policy as Record<string, unknown> | undefined;
      const channelCount = Array.isArray(policy?.notification_channels) 
        ? policy.notification_channels.length 
        : 0;
      return {
        ...defaultMeta,
        label: 'Policy Updated',
        description: 'Watcher policy configuration changed',
        details: [
          { label: 'Silence Threshold', value: `${policy?.silence_threshold_hours || 72}h` },
          { label: 'Channels', value: String(channelCount) },
        ],
      };

    // Message Events
    case 'MESSAGE_RECEIVED':
      return {
        ...defaultMeta,
        label: 'Message Received',
        description: truncate(String(data.subject || 'No subject'), 60),
        details: [
          { label: 'From', value: truncate(String(data.sender || 'Unknown'), 40) },
          { label: 'Subject', value: truncate(String(data.subject || 'No subject'), 50) },
          { label: 'Sent', value: formatTimestamp(data.sent_at as number) },
          ...(data.pii_detected ? [{ label: 'PII', value: 'Detected & redacted' }] : []),
        ],
      };

    case 'MESSAGE_ROUTED':
      return {
        ...defaultMeta,
        label: 'Message Routed',
        description: data.routed_to_thread_id ? 'Routed to existing thread' : 'New thread created',
        details: [
          { label: 'Confidence', value: String(data.confidence || 'N/A') },
          ...(data.evidence ? [{ label: 'Evidence', value: truncate(String(data.evidence), 60) }] : []),
        ],
      };

    // LLM Extraction Events
    case 'HARD_DEADLINE_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Hard Deadline Detected',
        description: `Deadline: ${formatTimestamp(data.deadline_utc as number)}`,
        details: [
          { label: 'Deadline', value: formatTimestamp(data.deadline_utc as number) },
          { label: 'Text', value: `"${truncate(String(data.deadline_text || ''), 50)}"` },
          { label: 'Confidence', value: String(data.confidence || 'N/A') },
          { label: 'Binding', value: data.binding ? 'Yes' : 'No' },
        ],
      };

    case 'SOFT_DEADLINE_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Soft Deadline Signal',
        description: `"${truncate(String(data.signal_text || ''), 40)}"`,
        details: [
          { label: 'Signal', value: `"${truncate(String(data.signal_text || ''), 50)}"` },
          { label: 'Est. Horizon', value: `~${data.estimated_horizon_hours || 0}h` },
          { label: 'Confidence', value: String(data.confidence || 'N/A') },
        ],
      };

    case 'URGENCY_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Urgency Signal',
        description: `${String(data.signal_type || 'signal').replace('_', ' ')} detected`,
        details: [
          { label: 'Type', value: String(data.signal_type || 'N/A').replace('_', ' ') },
          { label: 'Signal', value: `"${truncate(String(data.signal_text || ''), 50)}"` },
          { label: 'Confidence', value: String(data.confidence || 'N/A') },
        ],
      };

    case 'CLOSURE_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Closure Signal',
        description: `${String(data.closure_type || 'closure')} resolution detected`,
        details: [
          { label: 'Type', value: String(data.closure_type || 'N/A') },
          { label: 'Evidence', value: `"${truncate(String(data.source_span || ''), 50)}"` },
        ],
      };

    // Thread Events
    case 'THREAD_OPENED':
      return {
        ...defaultMeta,
        label: 'Thread Opened',
        description: data.normalized_subject 
          ? `"${truncate(String(data.normalized_subject), 40)}"` 
          : 'New thread started',
        details: [
          ...(data.normalized_subject ? [{ label: 'Subject', value: truncate(String(data.normalized_subject), 50) }] : []),
          ...(data.original_sender ? [{ label: 'From', value: truncate(String(data.original_sender), 40) }] : []),
          { label: 'Trigger', value: String(data.trigger_type || 'hard_deadline').replace('_', ' ') },
        ],
      };

    case 'THREAD_ACTIVITY_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Thread Activity',
        description: `Activity from ${truncate(String(data.sender || 'unknown'), 30)}`,
        details: [
          { label: 'From', value: truncate(String(data.sender || 'Unknown'), 40) },
          { label: 'Activity At', value: formatTimestamp(data.activity_at as number) },
        ],
      };

    case 'THREAD_CLOSED':
      return {
        ...defaultMeta,
        label: 'Thread Closed',
        description: data.closed_by === 'user_action' ? 'Manually closed by user' : 'Auto-closed from evidence',
        details: [
          { label: 'Closed By', value: data.closed_by === 'user_action' ? 'User' : 'System' },
          ...(data.closure_reason ? [{ label: 'Reason', value: String(data.closure_reason) }] : []),
        ],
      };

    // Reminder Events
    case 'REMINDER_EVALUATED':
      const urgencyLevel = data.urgency_level || data.urgency_state;
      return {
        ...defaultMeta,
        label: 'Urgency Evaluated',
        description: `Status: ${String(urgencyLevel || 'ok')}`,
        details: [
          { label: 'Urgency', value: String(urgencyLevel || 'ok') },
          ...(data.hours_until_deadline != null ? [{ label: 'Until Deadline', value: `${Number(data.hours_until_deadline).toFixed(1)}h` }] : []),
          ...(data.hours_since_activity != null ? [{ label: 'Since Activity', value: `${Number(data.hours_since_activity).toFixed(1)}h` }] : []),
        ],
      };

    case 'REMINDER_GENERATED':
      return {
        ...defaultMeta,
        label: 'Reminder Generated',
        description: `${String(data.reminder_type || 'reminder').replace('_', ' ')} reminder`,
        details: [
          { label: 'Type', value: String(data.reminder_type || 'N/A').replace('_', ' ') },
          { label: 'Binding', value: data.binding ? 'Yes' : 'No' },
        ],
      };

    // Alert Events
    case 'ALERT_QUEUED':
      return {
        ...defaultMeta,
        label: 'Alert Queued',
        description: `${String(data.urgency_state || 'alert')} alert ready`,
        details: [
          { label: 'Urgency', value: String(data.urgency_state || 'N/A') },
          { label: 'Channels', value: String(Array.isArray(data.channels) ? data.channels.length : 0) },
        ],
      };

    case 'ALERT_SENT':
      return {
        ...defaultMeta,
        label: 'Alert Sent',
        description: `Delivered via ${String(data.channel_type || 'notification')}`,
        details: [
          { label: 'Channel', value: String(data.channel_type || 'N/A') },
          { label: 'Destination', value: truncate(String(data.destination || 'N/A'), 30) },
        ],
      };

    case 'ALERT_FAILED':
      return {
        ...defaultMeta,
        label: 'Alert Failed',
        description: `Delivery failed: ${truncate(String(data.error || 'Unknown error'), 40)}`,
        details: [
          { label: 'Error', value: truncate(String(data.error || 'Unknown'), 60) },
          { label: 'Channel', value: String(data.channel_type || 'N/A') },
        ],
      };

    // Time Events
    case 'TIME_TICK':
      return {
        ...defaultMeta,
        label: 'Time Tick',
        description: 'Scheduled urgency re-evaluation',
        details: [],
      };

    // Report Events  
    case 'REPORT_GENERATED':
      return {
        ...defaultMeta,
        label: 'Report Generated',
        description: `${String(data.report_type || 'Summary')} report created`,
        details: [
          { label: 'Type', value: String(data.report_type || 'summary') },
          { label: 'Period', value: String(data.period || 'N/A') },
        ],
      };

    case 'REPORT_SENT':
      return {
        ...defaultMeta,
        label: 'Report Sent',
        description: `Report delivered to ${data.recipient || 'recipient'}`,
        details: [
          { label: 'Recipient', value: truncate(String(data.recipient || 'N/A'), 40) },
        ],
      };

    default:
      return defaultMeta;
  }
}

interface EventDisplayProps {
  event: VigilEvent;
  compact?: boolean;
}

export function EventDisplay({ event, compact = false }: EventDisplayProps) {
  const meta = getEventMetadata(event);

  if (compact) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-gray-900">{meta.label}</span>
          <span className="text-xs text-gray-500">{formatRelativeTime(event.timestamp)}</span>
        </div>
        <p className="text-sm text-gray-600">{meta.description}</p>
        {meta.details.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
            {meta.details.map((detail, i) => (
              <span key={i}>{detail.label}: {detail.value}</span>
            ))}
          </div>
        )}
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Raw data</summary>
          <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-x-auto text-gray-700">
            {JSON.stringify(event, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-sm text-gray-900">{meta.label}</span>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>
      <p className="text-sm text-gray-700 mb-2">{meta.description}</p>
      
      {meta.details.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-3">
          {meta.details.map((detail, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-gray-400">{detail.label}:</span>
              <span>{detail.value}</span>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Raw data</summary>
        <pre className="mt-2 text-xs bg-white rounded p-2 overflow-x-auto border border-gray-200 text-gray-700">
          {JSON.stringify(event, null, 2)}
        </pre>
      </details>
    </div>
  );
}

interface EventListProps {
  events: VigilEvent[];
  compact?: boolean;
  maxHeight?: string;
  emptyMessage?: string;
}

export function EventList({ 
  events, 
  compact = false, 
  maxHeight = '600px',
  emptyMessage = 'No events yet'
}: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">{emptyMessage}</div>
    );
  }

  if (compact) {
    return (
      <div className={`divide-y divide-gray-100 overflow-y-auto`} style={{ maxHeight }}>
        {events.map(event => (
          <div key={event.event_id} className="px-4">
            <EventDisplay event={event} compact />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`p-4 space-y-3 overflow-y-auto`} style={{ maxHeight }}>
      {events.map(event => (
        <EventDisplay key={event.event_id} event={event} />
      ))}
    </div>
  );
}
