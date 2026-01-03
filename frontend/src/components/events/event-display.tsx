'use client';

import React from 'react';
import type { VigilEvent } from '@/lib/api/client';
import { formatReminderType, formatFriendlyDate, formatUrgencyState } from '@/lib/format';

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

  // Default metadata with user-friendly fallback label
  const friendlyDefaultLabel = event.type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
    
  const defaultMeta: EventMetadata = {
    label: friendlyDefaultLabel,
    description: 'Event recorded',
    details: [],
  };

  switch (event.type) {
    // Control Plane Events
    case 'ACCOUNT_CREATED':
      return {
        ...defaultMeta,
        label: 'Account Created',
        description: `New account for ${data.owner_email || 'user'}`,
        details: [
          { label: 'Owner', value: String(data.owner_email || 'N/A') },
        ],
      };

    case 'USER_CREATED':
      return {
        ...defaultMeta,
        label: 'Team Member Added',
        description: `${data.email} joined`,
        details: [
          { label: 'Email', value: String(data.email || 'N/A') },
          { label: 'Role', value: String(data.role || 'member') },
        ],
      };

    case 'WATCHER_CREATED':
      return {
        ...defaultMeta,
        label: 'Watcher Created',
        description: `"${data.name}" is ready to monitor emails`,
        details: [
          { label: 'Name', value: String(data.name || 'Unnamed') },
        ],
      };

    case 'WATCHER_ACTIVATED':
      return {
        ...defaultMeta,
        label: 'Monitoring Started',
        description: 'Now watching for emails',
        details: [],
      };

    case 'WATCHER_PAUSED':
      return {
        ...defaultMeta,
        label: 'Monitoring Paused',
        description: data.reason ? String(data.reason) : 'Temporarily stopped',
        details: data.reason ? [{ label: 'Reason', value: String(data.reason) }] : [],
      };

    case 'WATCHER_RESUMED':
      return {
        ...defaultMeta,
        label: 'Monitoring Resumed',
        description: 'Back to watching emails',
        details: [],
      };

    case 'WATCHER_DELETED':
      return {
        ...defaultMeta,
        label: 'Watcher Deleted',
        description: 'Permanently removed',
        details: [],
      };

    case 'WATCHER_UPDATED':
      return {
        ...defaultMeta,
        label: 'Settings Updated',
        description: data.name ? `Renamed to "${data.name}"` : 'Configuration changed',
        details: data.name ? [{ label: 'New Name', value: String(data.name) }] : [],
      };

    case 'WATCHER_RENAMED':
      return {
        ...defaultMeta,
        label: 'Watcher Renamed',
        description: data.new_name ? `Now called "${data.new_name}"` : 'Name changed',
        details: [
          ...(data.old_name ? [{ label: 'Previously', value: String(data.old_name) }] : []),
          ...(data.new_name ? [{ label: 'Now', value: String(data.new_name) }] : []),
        ],
      };

    case 'POLICY_UPDATED':
      return {
        ...defaultMeta,
        label: 'Notification Settings Changed',
        description: 'Alert preferences updated',
        details: [],
      };

    // Extraction Events
    case 'EXTRACTION_STARTED':
      return {
        ...defaultMeta,
        label: 'Analysis Started',
        description: 'Processing email for deadlines and signals',
        details: [],
      };

    case 'EXTRACTION_COMPLETED':
      const findings = Number(data.findings_count) || 0;
      return {
        ...defaultMeta,
        label: 'Analysis Complete',
        description: findings > 0 ? `Found ${findings} signal${findings === 1 ? '' : 's'}` : 'No signals found',
        details: [
          ...(data.processing_time_ms ? [{ label: 'Time', value: `${Number(data.processing_time_ms).toFixed(0)}ms` }] : []),
        ],
      };

    // Message Events
    case 'EMAIL_RECEIVED':
      return {
        ...defaultMeta,
        label: 'Email Received',
        description: truncate(String(data.subject || 'No subject'), 60),
        details: [
          { label: 'From', value: truncate(String(data.original_sender || data.sender || 'Unknown'), 40) },
          ...(data.pii_detected ? [{ label: 'Privacy', value: 'Personal info redacted' }] : []),
        ],
      };

    case 'MESSAGE_ROUTED':
      const routeAction = data.routed_to_thread_id ? 'Added to conversation' : 'Started new conversation';
      return {
        ...defaultMeta,
        label: 'Email Routed',
        description: routeAction,
        details: [
          ...(data.match_confidence ? [{ label: 'Confidence', value: String(data.match_confidence) }] : []),
        ],
      };

    // LLM Extraction Events - User-friendly names
    case 'HARD_DEADLINE_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Deadline Found',
        description: `Due: ${formatTimestamp(data.deadline_utc as number)}`,
        details: [
          { label: 'Due Date', value: formatTimestamp(data.deadline_utc as number) },
          ...(data.deadline_text ? [{ label: 'From', value: `"${truncate(String(data.deadline_text), 50)}"` }] : []),
        ],
      };

    case 'SOFT_DEADLINE_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Timeline Detected',
        description: data.estimated_horizon_hours 
          ? `Approximately ${data.estimated_horizon_hours} hours`
          : 'Flexible timeline mentioned',
        details: [
          ...(data.signal_text ? [{ label: 'Text', value: `"${truncate(String(data.signal_text), 50)}"` }] : []),
        ],
      };

    case 'URGENCY_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Urgency Detected',
        description: String(data.signal_type || 'Urgent request').replace(/_/g, ' '),
        details: [
          ...(data.signal_text ? [{ label: 'Text', value: `"${truncate(String(data.signal_text), 50)}"` }] : []),
        ],
      };

    case 'CLOSURE_SIGNAL_OBSERVED':
      return {
        ...defaultMeta,
        label: 'Resolution Detected',
        description: `${String(data.closure_type || 'resolved').replace(/_/g, ' ')} found`,
        details: [
          ...(data.source_span ? [{ label: 'Evidence', value: `"${truncate(String(data.source_span), 50)}"` }] : []),
        ],
      };

    // Thread Events - User-friendly names
    case 'THREAD_OPENED':
      return {
        ...defaultMeta,
        label: 'Conversation Started',
        description: data.normalized_subject 
          ? `"${truncate(String(data.normalized_subject), 40)}"` 
          : 'New conversation tracking',
        details: [
          ...(data.original_sender ? [{ label: 'From', value: truncate(String(data.original_sender), 40) }] : []),
        ],
      };

    case 'THREAD_ACTIVITY_OBSERVED':
      const senderName = String(data.original_sender || data.sender || '').split('@')[0] || 'Someone';
      return {
        ...defaultMeta,
        label: 'New Activity',
        description: `Reply from ${senderName}`,
        details: [
          { label: 'From', value: truncate(String(data.original_sender || data.sender || 'Unknown'), 40) },
        ],
      };

    case 'THREAD_CLOSED':
      return {
        ...defaultMeta,
        label: 'Conversation Resolved',
        description: data.closed_by === 'user_action' ? 'Marked as done by you' : 'Automatically resolved',
        details: [
          ...(data.closure_reason ? [{ label: 'Reason', value: String(data.closure_reason) }] : []),
        ],
      };

    // Reminder Events - User-friendly status names
    case 'REMINDER_EVALUATED':
      const urgencyLevel = data.urgency_level || data.urgency_state;
      const evaluatedType = data.reminder_type as 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual' | undefined;
      const statusLabels: Record<string, string> = {
        'ok': '✅ On Track',
        'warning': '⚠️ Due Soon',
        'critical': '🔴 Urgent',
        'overdue': '❗ Overdue',
      };
      const statusDesc = statusLabels[String(urgencyLevel)] || formatUrgencyState(String(urgencyLevel || 'ok'));
      return {
        ...defaultMeta,
        label: 'Status Check',
        description: `${evaluatedType ? formatReminderType(evaluatedType) : 'Reminder'}: ${statusDesc}`,
        details: [
          ...(data.hours_until_deadline != null ? [{ label: 'Time Left', value: `${Number(data.hours_until_deadline).toFixed(0)}h` }] : []),
        ],
      };

    case 'REMINDER_GENERATED':
      const generatedType = data.reminder_type as 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual' | undefined;
      return {
        ...defaultMeta,
        label: 'Reminder Created',
        description: `Tracking ${generatedType ? formatReminderType(generatedType) : 'deadline'}`,
        details: [],
      };

    case 'REMINDER_CREATED':
      const createdReminderType = data.reminder_type as 'hard_deadline' | 'soft_deadline' | 'urgency_signal' | 'manual' | undefined;
      return {
        ...defaultMeta,
        label: `${createdReminderType ? formatReminderType(createdReminderType) : 'Reminder'} Added`,
        description: data.description ? String(data.description) : (data.deadline_utc ? `Due ${formatFriendlyDate(Number(data.deadline_utc))}` : 'New reminder'),
        details: [
          ...(data.source_span ? [{ label: 'From', value: `"${truncate(String(data.source_span), 50)}"` }] : []),
        ],
      };

    case 'REMINDER_DISMISSED':
      return {
        ...defaultMeta,
        label: 'Reminder Dismissed',
        description: data.reason ? String(data.reason) : 'Marked as handled',
        details: [],
      };

    case 'REMINDER_MERGED':
      return {
        ...defaultMeta,
        label: 'Reminders Combined',
        description: 'Duplicate reminders merged together',
        details: [],
      };

    // Alert Events - User-friendly notification labels
    case 'ALERT_QUEUED':
      return {
        ...defaultMeta,
        label: 'Notification Preparing',
        description: 'Alert being prepared for delivery',
        details: [],
      };

    case 'ALERT_SENT':
      const channelType = String(data.channel_type || 'email');
      const channelLabels: Record<string, string> = {
        'email': 'Email sent',
        'webhook': 'Webhook delivered',
        'slack': 'Slack notification sent',
      };
      return {
        ...defaultMeta,
        label: 'Notification Sent',
        description: channelLabels[channelType] || `${channelType} notification sent`,
        details: [
          ...(data.destination ? [{ label: 'To', value: truncate(String(data.destination), 30) }] : []),
        ],
      };

    case 'ALERT_FAILED':
      return {
        ...defaultMeta,
        label: 'Notification Failed',
        description: `Could not deliver: ${truncate(String(data.error || 'Unknown error'), 40)}`,
        details: [
          { label: 'Issue', value: truncate(String(data.error || 'Unknown'), 50) },
        ],
      };

    // Time Events - Hide technical details
    case 'TIME_TICK':
      return {
        ...defaultMeta,
        label: 'Scheduled Check',
        description: 'System status update',
        details: [],
      };

    case 'URGENCY_EVALUATED':
      const evalUrgency = data.urgency_state || data.current_urgency;
      return {
        ...defaultMeta,
        label: 'Urgency Check',
        description: evalUrgency ? formatUrgencyState(String(evalUrgency)) : 'Status evaluated',
        details: [
          ...(data.hours_until_deadline ? [{ label: 'Time Left', value: `${Number(data.hours_until_deadline).toFixed(0)}h` }] : []),
        ],
      };

    // Report Events - Friendly labels
    case 'REPORT_GENERATED':
      return {
        ...defaultMeta,
        label: 'Report Ready',
        description: `${String(data.report_type || 'Summary')} report created`,
        details: [],
      };

    case 'REPORT_SENT':
      return {
        ...defaultMeta,
        label: 'Report Delivered',
        description: `Sent to ${data.recipient || 'your email'}`,
        details: [],
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
