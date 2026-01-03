import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline, TimelineEvent } from '@/components/timeline';

const mockEvents: TimelineEvent[] = [
  {
    id: 'evt-1',
    type: 'EMAIL_RECEIVED',
    timestamp: 1704067200000, // 2024-01-01 00:00:00 UTC
    description: 'Message received',
    source: 'sender@example.com',
  },
  {
    id: 'evt-2',
    type: 'THREAD_OPENED',
    timestamp: 1704067260000, // 2024-01-01 00:01:00 UTC
    description: 'Thread opened',
  },
  {
    id: 'evt-3',
    type: 'SILENCE_STARTED',
    timestamp: 1704153600000, // 2024-01-02 00:00:00 UTC
    description: 'Silence period started',
  },
];

describe('Timeline Component', () => {
  it('renders events in chronological order', () => {
    render(<Timeline events={mockEvents} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);

    // First event should be EMAIL_RECEIVED (earliest)
    expect(items[0]).toHaveTextContent('Message received');
  });

  it('displays event type for each entry', () => {
    render(<Timeline events={mockEvents} />);

    expect(screen.getByText('EMAIL_RECEIVED')).toBeInTheDocument();
    expect(screen.getByText('THREAD_OPENED')).toBeInTheDocument();
    expect(screen.getByText('SILENCE_STARTED')).toBeInTheDocument();
  });

  it('displays timestamp for each event', () => {
    render(<Timeline events={mockEvents} />);

    // Check that timestamps are rendered (format may vary)
    const items = screen.getAllByRole('listitem');
    items.forEach(item => {
      expect(item.querySelector('time')).toBeInTheDocument();
    });
  });

  it('displays source when provided', () => {
    render(<Timeline events={mockEvents} />);

    expect(screen.getByText('sender@example.com')).toBeInTheDocument();
  });

  it('handles empty event list gracefully', () => {
    render(<Timeline events={[]} />);

    expect(screen.getByText('No events recorded')).toBeInTheDocument();
  });

  it('uses neutral, factual labels without judgment', () => {
    render(<Timeline events={mockEvents} />);

    // Should NOT contain alarming language
    const timelineText = screen.getByRole('list').textContent || '';
    expect(timelineText).not.toContain('overdue');
    expect(timelineText).not.toContain('late');
    expect(timelineText).not.toContain('missed');
    expect(timelineText).not.toContain('failed');
    expect(timelineText).not.toContain('urgent');
  });

  it('maintains linear, immutable presentation order', () => {
    const unorderedEvents: TimelineEvent[] = [
      { id: 'evt-3', type: 'C', timestamp: 3000, description: 'Third' },
      { id: 'evt-1', type: 'A', timestamp: 1000, description: 'First' },
      { id: 'evt-2', type: 'B', timestamp: 2000, description: 'Second' },
    ];

    render(<Timeline events={unorderedEvents} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('First');
    expect(items[1]).toHaveTextContent('Second');
    expect(items[2]).toHaveTextContent('Third');
  });
});

describe('Timeline - Export Compatibility', () => {
  it('renders without interactive elements for export view', () => {
    render(<Timeline events={mockEvents} exportMode />);

    // Should not have any buttons or links in export mode
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('displays all events without truncation in export mode', () => {
    const manyEvents = Array.from({ length: 50 }, (_, i) => ({
      id: `evt-${i}`,
      type: 'EVENT',
      timestamp: 1704067200000 + i * 60000,
      description: `Event ${i}`,
    }));

    render(<Timeline events={manyEvents} exportMode />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(50);
  });
});
