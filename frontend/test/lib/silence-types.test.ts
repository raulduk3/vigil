import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Thread, VigilEvent } from '@/lib/api/client';
import {
  toSilenceThread,
  toTimelineObservation,
  computeSilenceSummary,
  SilenceThread,
} from '@/lib/silence-types';

describe('toSilenceThread', () => {
  const NOW = 1704153600000;
  const THRESHOLD = 24;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts backend Thread to SilenceThread', () => {
    const thread: Thread = {
      thread_id: 'thread-1',
      watcher_id: 'watcher-1',
      subject: 'Test subject',
      normalized_subject: 'Test subject',
      original_sender: 'sender@example.com',
      status: 'open',
      opened_at: NOW - 86400000,
      closed_at: null,
      last_activity_at: NOW - 3600000, // 1 hour ago
      message_count: 5,
      silence_alerted: false,
    };

    const result = toSilenceThread(thread, THRESHOLD, NOW);

    expect(result.thread_id).toBe('thread-1');
    expect(result.subject).toBe('Test subject');
    expect(result.silence_state).toBe('active');
  });

  it('computes silence_state as silent when beyond threshold', () => {
    const thread: Thread = {
      thread_id: 'thread-1',
      watcher_id: 'watcher-1',
      subject: 'Silent thread',
      normalized_subject: 'Silent thread',
      original_sender: 'sender@example.com',
      status: 'open',
      opened_at: NOW - 86400000 * 5,
      closed_at: null,
      last_activity_at: NOW - 86400000 * 2, // 2 days ago
      message_count: 3,
      silence_alerted: true,
    };

    const result = toSilenceThread(thread, THRESHOLD, NOW);

    expect(result.silence_state).toBe('silent');
    expect(result.silence_duration_ms).toBeGreaterThan(86400000);
  });

  it('computes silence_state as active for closed threads', () => {
    const thread: Thread = {
      thread_id: 'thread-1',
      watcher_id: 'watcher-1',
      subject: 'Closed thread',
      normalized_subject: 'Closed thread',
      original_sender: 'sender@example.com',
      status: 'closed',
      opened_at: NOW - 86400000 * 10,
      closed_at: NOW - 86400000 * 5,
      last_activity_at: NOW - 86400000 * 5, // 5 days ago
      message_count: 10,
      silence_alerted: false,
    };

    const result = toSilenceThread(thread, THRESHOLD, NOW);

    // Closed threads are never "silent" - they're resolved
    expect(result.silence_state).toBe('active');
  });
});

describe('toTimelineObservation', () => {
  it('converts EMAIL_RECEIVED to neutral observation', () => {
    const event: VigilEvent = {
      event_id: 'evt-1',
      type: 'EMAIL_RECEIVED',
      watcher_id: 'watcher-1',
      timestamp: 1704067200000,
      payload: {
        original_sender: 'sender@example.com',
        subject: 'Test email',
      },
    };

    const result = toTimelineObservation(event);

    expect(result.type).toBe('EMAIL_RECEIVED');
    expect(result.description).toBe('Message received');
    expect(result.source).toBe('sender@example.com');
    expect(result.id).toBe('evt-1');
  });

  it('converts THREAD_CLOSED to neutral observation', () => {
    const event: VigilEvent = {
      event_id: 'evt-2',
      type: 'THREAD_CLOSED',
      watcher_id: 'watcher-1',
      timestamp: 1704067200000,
      payload: { thread_id: 'thread-1' },
    };

    const result = toTimelineObservation(event);

    expect(result.description).toBe('Thread closed');
    expect(result.source).toBeUndefined();
  });

  it('handles unknown event types gracefully', () => {
    const event: VigilEvent = {
      event_id: 'evt-3',
      type: 'UNKNOWN_EVENT_TYPE',
      watcher_id: 'watcher-1',
      timestamp: 1704067200000,
      payload: {},
    };

    const result = toTimelineObservation(event);

    expect(result.description).toBe('unknown event type');
  });
});

describe('computeSilenceSummary', () => {
  it('computes correct summary for mixed threads', () => {
    const threads: SilenceThread[] = [
      {
        thread_id: '1',
        watcher_id: 'w1',
        subject: 'Active 1',
        status: 'open',
        opened_at: 0,
        last_activity_at: Date.now() - 3600000,
        message_count: 1,
        silence_state: 'active',
        silence_duration_ms: 3600000,
      },
      {
        thread_id: '2',
        watcher_id: 'w1',
        subject: 'Silent 1',
        status: 'open',
        opened_at: 0,
        last_activity_at: Date.now() - 86400000 * 3,
        message_count: 2,
        silence_state: 'silent',
        silence_duration_ms: 86400000 * 3,
      },
      {
        thread_id: '3',
        watcher_id: 'w1',
        subject: 'Closed 1',
        status: 'closed',
        opened_at: 0,
        last_activity_at: Date.now() - 86400000,
        message_count: 3,
        silence_state: 'active',
        silence_duration_ms: 86400000,
      },
    ];

    const summary = computeSilenceSummary(threads);

    expect(summary.total_threads).toBe(3);
    expect(summary.silent_threads).toBe(1);
    expect(summary.active_threads).toBe(1);
    expect(summary.closed_threads).toBe(1);
  });

  it('returns zeros for empty thread list', () => {
    const summary = computeSilenceSummary([]);

    expect(summary.total_threads).toBe(0);
    expect(summary.silent_threads).toBe(0);
    expect(summary.active_threads).toBe(0);
    expect(summary.closed_threads).toBe(0);
  });
});
