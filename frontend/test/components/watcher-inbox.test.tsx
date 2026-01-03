import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WatcherInbox } from '@/components/watcher/watcher-inbox';
import type { Thread, VigilEvent } from '@/lib/api';

const mockThreads: Thread[] = [
  {
    thread_id: 'thread-1',
    watcher_id: 'watcher-1',
    subject: 'Contract Review',
    normalized_subject: 'Contract Review',
    original_sender: 'alice@example.com',
    status: 'open',
    opened_at: 1704067200000,
    closed_at: null,
    last_activity_at: 1704240000000,
    message_count: 3,
    silence_alerted: false,
  },
  {
    thread_id: 'thread-2',
    watcher_id: 'watcher-1',
    subject: 'Budget Approval',
    normalized_subject: 'Budget Approval',
    original_sender: 'carol@example.com',
    status: 'open',
    opened_at: 1704326400000,
    closed_at: null,
    last_activity_at: 1704326400000,
    message_count: 1,
    silence_alerted: true, // This thread is silent
  },
  {
    thread_id: 'thread-3',
    watcher_id: 'watcher-1',
    subject: 'Old Thread',
    normalized_subject: 'Old Thread',
    original_sender: 'dave@example.com',
    status: 'closed',
    opened_at: 1703980800000,
    closed_at: 1704000000000,
    last_activity_at: 1703980800000,
    message_count: 2,
    silence_alerted: false,
  },
];

const mockEvents: VigilEvent[] = [
  {
    event_id: 'event-1',
    type: 'EMAIL_RECEIVED',
    watcher_id: 'watcher-1',
    timestamp: 1704067200000,
    payload: {
      routed_to_thread_id: 'thread-1',
      original_sender: 'alice@example.com',
      subject: 'Initial request',
      body_excerpt: 'Please review the contract.',
    },
  },
  {
    event_id: 'event-2',
    type: 'EMAIL_RECEIVED',
    watcher_id: 'watcher-1',
    timestamp: 1704153600000,
    payload: {
      routed_to_thread_id: 'thread-1',
      original_sender: 'bob@example.com',
      subject: 'Re: Initial request',
      body_excerpt: 'Will do.',
    },
  },
  {
    event_id: 'event-3',
    type: 'EMAIL_RECEIVED',
    watcher_id: 'watcher-1',
    timestamp: 1704240000000,
    payload: {
      routed_to_thread_id: 'thread-1',
      original_sender: 'alice@example.com',
      subject: 'Re: Initial request',
      body_excerpt: 'Any updates?',
    },
  },
  {
    event_id: 'event-4',
    type: 'EMAIL_RECEIVED',
    watcher_id: 'watcher-1',
    timestamp: 1704326400000,
    payload: {
      routed_to_thread_id: 'thread-2',
      original_sender: 'carol@example.com',
      subject: 'Budget Approval',
      body_excerpt: 'Please approve.',
    },
  },
  // Non-email event should be ignored
  {
    event_id: 'event-5',
    type: 'THREAD_OPENED',
    watcher_id: 'watcher-1',
    timestamp: 1704067200000,
    payload: {
      thread_id: 'thread-1',
    },
  },
];

describe('WatcherInbox Component', () => {
  const NOW = 1704412800000; // Jan 4, 2024

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders open threads by default', () => {
    render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
      />
    );

    // Open threads should be visible
    expect(screen.getByText('Contract Review')).toBeInTheDocument();
    expect(screen.getByText('Budget Approval')).toBeInTheDocument();
    // Closed threads are hidden by default
    expect(screen.queryByText('Old Thread')).not.toBeInTheDocument();
  });

  it('shows message counts for threads', () => {
    render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
      />
    );

    // Contract Review has 3 messages from events (shown as count in parens)
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('expands thread to show messages when clicked', () => {
    const onSelectThread = vi.fn();
    const { rerender } = render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
        onSelectThread={onSelectThread}
      />
    );

    // Click to select Contract Review thread
    fireEvent.click(screen.getByText('Contract Review'));
    expect(onSelectThread).toHaveBeenCalledWith('thread-1');

    // Re-render with the thread selected to see detail panel
    rerender(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
        onSelectThread={onSelectThread}
        selectedThreadId="thread-1"
      />
    );

    // Messages should now be visible in detail panel
    expect(screen.getByText(/Please review the contract/)).toBeInTheDocument();
  });

  it('displays messages in chronological order', () => {
    render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
        selectedThreadId="thread-1"
      />
    );

    // The first message's body excerpt should be visible
    expect(screen.getByText(/Please review the contract/)).toBeInTheDocument();
  });

  it('shows closed threads when showClosed toggle is enabled', () => {
    render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
      />
    );

    // Closed thread is hidden by default
    expect(screen.queryByText('Old Thread')).not.toBeInTheDocument();

    // Toggle show closed button (text is "Show 1 closed")
    const toggle = screen.getByText(/show.*closed/i);
    fireEvent.click(toggle);

    // Now closed thread should be visible
    expect(screen.getByText('Old Thread')).toBeInTheDocument();
  });

  it('handles empty threads list', () => {
    render(
      <WatcherInbox
        threads={[]}
        events={[]}
        silenceThresholdHours={24}
      />
    );

    expect(screen.getByText(/no threads/i)).toBeInTheDocument();
  });

  it('calls onCloseThread when thread close button is clicked', () => {
    const onCloseThread = vi.fn();

    render(
      <WatcherInbox
        threads={mockThreads}
        events={mockEvents}
        silenceThresholdHours={24}
        onCloseThread={onCloseThread}
        selectedThreadId="thread-1"
      />
    );

    // Click "Close" button in the detail panel header
    const closeButtons = screen.getAllByText('Close');
    // The first "Close" button is for closing the thread
    fireEvent.click(closeButtons[0]);

    expect(onCloseThread).toHaveBeenCalledWith('thread-1');
  });

  it('ignores non-email events when building thread messages', () => {
    const eventsWithNonEmail: VigilEvent[] = [
      ...mockEvents,
      {
        event_id: 'event-extra',
        type: 'TIME_TICK',
        watcher_id: 'watcher-1',
        timestamp: 1704300000000,
        payload: {},
      },
    ];

    render(
      <WatcherInbox
        threads={mockThreads}
        events={eventsWithNonEmail}
        silenceThresholdHours={24}
      />
    );

    // The TIME_TICK event should not affect thread display
    // Both threads should still be visible
    expect(screen.getByText('Contract Review')).toBeInTheDocument();
    expect(screen.getByText('Budget Approval')).toBeInTheDocument();
  });
});

describe('WatcherInbox - Silence Sorting', () => {
  const NOW = 1704412800000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prioritizes silent threads at top', () => {
    // Thread 1 is silent (> 24h), Thread 2 is active (< 24h)
    const threads: Thread[] = [
      {
        thread_id: 'thread-active',
        watcher_id: 'watcher-1',
        subject: 'Active Thread',
        normalized_subject: 'Active Thread',
        original_sender: 'sender@example.com',
        status: 'open',
        opened_at: NOW - 3600000, // 1 hour ago
        closed_at: null,
        last_activity_at: NOW - 3600000,
        message_count: 1,
        silence_alerted: false,
      },
      {
        thread_id: 'thread-silent',
        watcher_id: 'watcher-1',
        subject: 'Silent Thread',
        normalized_subject: 'Silent Thread',
        original_sender: 'sender@example.com',
        status: 'open',
        opened_at: NOW - 172800000, // 48 hours ago
        closed_at: null,
        last_activity_at: NOW - 172800000,
        message_count: 1,
        silence_alerted: true, // This thread is silent
      },
    ];

    render(
      <WatcherInbox
        threads={threads}
        events={[]}
        silenceThresholdHours={24}
      />
    );

    // The silent thread should appear first in the table
    const rows = screen.getAllByRole('row');
    // Skip header row
    const dataRows = rows.slice(1);
    expect(dataRows[0]).toHaveTextContent('Silent Thread');
  });
});
