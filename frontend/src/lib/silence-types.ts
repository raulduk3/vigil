/**
 * Silence Monitoring Types
 *
 * UI-focused types for the silence monitoring model.
 * These types map from backend API types to silence-focused representations.
 *
 * Key principle: The backend may expose urgency, deadlines, etc., but the UI
 * focuses solely on silence state and activity timestamps.
 */

import type { Thread, Watcher, WatcherPolicy, VigilEvent } from './api/client';
import { getSilenceState, SilenceState } from './silence';

/**
 * Thread representation for silence monitoring UI.
 * Derived from backend Thread type but focused on silence state.
 */
export interface SilenceThread {
  thread_id: string;
  watcher_id: string;
  subject: string;
  status: 'open' | 'closed';
  opened_at: number;
  last_activity_at: number;
  message_count: number;
  silence_state: SilenceState;
  silence_duration_ms: number;
}

/**
 * Convert backend Thread to SilenceThread.
 * Strips deadline/urgency and computes silence state.
 */
export function toSilenceThread(
  thread: Thread,
  silenceThresholdHours: number,
  now: number = Date.now()
): SilenceThread {
  const silenceState = getSilenceState({
    lastActivityAt: thread.last_activity_at,
    status: thread.status,
    thresholdHours: silenceThresholdHours,
    now,
  });

  // Compute duration in ms
  const normalizedTimestamp =
    thread.last_activity_at < 1000000000000
      ? thread.last_activity_at * 1000
      : thread.last_activity_at;
  const silenceDuration = Math.max(0, now - normalizedTimestamp);

  return {
    thread_id: thread.thread_id,
    watcher_id: thread.watcher_id,
    subject: thread.subject,
    status: thread.status,
    opened_at: thread.opened_at,
    last_activity_at: thread.last_activity_at,
    message_count: thread.message_count,
    silence_state: silenceState,
    silence_duration_ms: silenceDuration,
  };
}

/**
 * Extract silence-relevant policy from full WatcherPolicy.
 * UI only needs silence_threshold_hours for its calculations.
 */
export interface SilencePolicy {
  silence_threshold_hours: number;
  timezone?: string;
}

export function toSilencePolicy(policy: WatcherPolicy): SilencePolicy {
  return {
    silence_threshold_hours: policy.silence_threshold_hours,
    timezone: policy.timezone,
  };
}

/**
 * Silence-focused event types.
 * These are the event types relevant to silence monitoring.
 */
export const SILENCE_RELEVANT_EVENT_TYPES = [
  'EMAIL_RECEIVED',
  'THREAD_OPENED',
  'THREAD_EMAIL_ADDED',
  'THREAD_CLOSED',
] as const;

export type SilenceRelevantEventType = typeof SILENCE_RELEVANT_EVENT_TYPES[number];

/**
 * Timeline event representation for export.
 * Neutral, factual representation of an observation.
 */
export interface TimelineObservation {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  source?: string;
}

/**
 * Convert backend VigilEvent to TimelineObservation.
 */
export function toTimelineObservation(event: VigilEvent): TimelineObservation {
  const payload = event.payload || {};

  // Extract human-readable description based on event type
  let description: string;
  let source: string | undefined;

  switch (event.type) {
    case 'EMAIL_RECEIVED':
      description = 'Message received';
      source = (payload.original_sender as string) || (payload.sender as string);
      break;
    case 'THREAD_OPENED':
      description = 'Thread opened';
      break;
    case 'THREAD_EMAIL_ADDED':
      description = 'Message added to thread';
      source = (payload.sender as string);
      break;
    case 'THREAD_CLOSED':
      description = 'Thread closed';
      break;
    default:
      description = event.type.replace(/_/g, ' ').toLowerCase();
  }

  return {
    id: event.event_id,
    type: event.type,
    timestamp: event.timestamp,
    description,
    source,
  };
}

/**
 * Dashboard summary for silence monitoring.
 */
export interface SilenceSummary {
  total_threads: number;
  silent_threads: number;
  active_threads: number;
  closed_threads: number;
}

export function computeSilenceSummary(
  threads: SilenceThread[]
): SilenceSummary {
  const open = threads.filter(t => t.status === 'open');
  const silent = open.filter(t => t.silence_state === 'silent');
  const active = open.filter(t => t.silence_state === 'active');
  const closed = threads.filter(t => t.status === 'closed');

  return {
    total_threads: threads.length,
    silent_threads: silent.length,
    active_threads: active.length,
    closed_threads: closed.length,
  };
}
