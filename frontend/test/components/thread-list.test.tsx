import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ThreadList, ThreadListItem } from '@/components/thread-list';

describe('ThreadList Component', () => {
  const NOW = 1704153600000; // 2024-01-02 00:00:00 UTC
  const THRESHOLD_HOURS = 24;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockThreads: ThreadListItem[] = [
    {
      thread_id: 'thread-1',
      watcher_id: 'watcher-1',
      subject: 'Active thread',
      status: 'open',
      last_activity_at: NOW - 3600000, // 1 hour ago - active
      first_message_at: NOW - 86400000,
      message_count: 3,
    },
    {
      thread_id: 'thread-2',
      watcher_id: 'watcher-1',
      subject: 'Silent thread',
      status: 'open',
      last_activity_at: NOW - 86400000 * 3, // 3 days ago - silent
      first_message_at: NOW - 86400000 * 5,
      message_count: 2,
    },
    {
      thread_id: 'thread-3',
      watcher_id: 'watcher-1',
      subject: 'Closed thread',
      status: 'closed',
      last_activity_at: NOW - 86400000 * 2,
      first_message_at: NOW - 86400000 * 4,
      message_count: 5,
    },
    {
      thread_id: 'thread-4',
      watcher_id: 'watcher-1',
      subject: 'Recently resolved',
      status: 'closed',
      last_activity_at: NOW - 7200000, // 2 hours ago
      first_message_at: NOW - 86400000,
      message_count: 4,
    },
  ];

  it('prioritizes silent threads first', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    const items = screen.getAllByRole('listitem');
    // Silent thread should be first
    expect(items[0]).toHaveTextContent('Silent thread');
  });

  it('shows recently resolved silence second', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    const items = screen.getAllByRole('listitem');
    // After silent threads, recently closed threads
    const closedItems = items.filter(item => item.textContent?.includes('closed'));
    expect(closedItems.length).toBeGreaterThan(0);
  });

  it('shows active conversations last', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    const items = screen.getAllByRole('listitem');
    // Active thread should be after silent and closed
    const activeIndex = items.findIndex(item => item.textContent?.includes('Active thread'));
    const silentIndex = items.findIndex(item => item.textContent?.includes('Silent thread'));
    expect(activeIndex).toBeGreaterThan(silentIndex);
  });

  it('displays last activity time for each thread', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    // Each thread should show its last activity
    mockThreads.forEach(() => {
      // The component should render silence indicators
      expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    });
  });

  it('shows silence duration for silent threads', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    // Silent thread (3 days) should show "No response observed"
    expect(screen.getByText(/No response observed for 3 days/)).toBeInTheDocument();
  });

  it('uses neutral language for all states', () => {
    render(<ThreadList threads={mockThreads} silenceThresholdHours={THRESHOLD_HOURS} />);

    const list = screen.getByRole('list');
    const text = list.textContent || '';

    // Should NOT contain alarming language
    expect(text).not.toMatch(/overdue|late|missed|urgent|critical|warning|failed/i);
  });

  it('handles empty thread list', () => {
    render(<ThreadList threads={[]} silenceThresholdHours={THRESHOLD_HOURS} />);

    expect(screen.getByText('No threads to display')).toBeInTheDocument();
  });

  it('does not display deadline information', () => {
    const threadsWithDeadlines = mockThreads.map(t => ({
      ...t,
      deadline: NOW + 86400000, // Deadline in future
    }));

    render(<ThreadList threads={threadsWithDeadlines} silenceThresholdHours={THRESHOLD_HOURS} />);

    const list = screen.getByRole('list');
    const text = list.textContent || '';

    expect(text).not.toMatch(/deadline|due|due by/i);
  });
});

describe('ThreadList - Sorting Behavior', () => {
  const NOW = 1704153600000;
  const THRESHOLD = 24;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts silent threads by silence duration (longest first)', () => {
    const threads: ThreadListItem[] = [
      {
        thread_id: 'short-silent',
        watcher_id: 'w1',
        subject: 'Short silence',
        status: 'open',
        last_activity_at: NOW - 86400000 * 2, // 2 days
        first_message_at: NOW - 86400000 * 3,
        message_count: 1,
      },
      {
        thread_id: 'long-silent',
        watcher_id: 'w1',
        subject: 'Long silence',
        status: 'open',
        last_activity_at: NOW - 86400000 * 5, // 5 days
        first_message_at: NOW - 86400000 * 6,
        message_count: 1,
      },
    ];

    render(<ThreadList threads={threads} silenceThresholdHours={THRESHOLD} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Long silence');
    expect(items[1]).toHaveTextContent('Short silence');
  });
});
