/**
 * Timeline Component
 *
 * Displays a chronological, factual record of events.
 * Designed for neutral presentation without interpretation or judgment.
 *
 * Key principles:
 * - Linear, chronological order (oldest first)
 * - No collapsing, summarizing, or interpretation
 * - Each event displays: type, timestamp, source (if available)
 * - Export mode removes interactive elements for clean printing/sharing
 */

import React from 'react';

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: number;
  description?: string;
  source?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
  exportMode?: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function Timeline({ events, exportMode = false }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No events recorded
      </div>
    );
  }

  // Sort events chronologically (oldest first) for linear presentation
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <ol className="timeline-list" role="list">
      {sortedEvents.map((event) => (
        <li
          key={event.id}
          className={`timeline-item ${exportMode ? 'timeline-item-export' : ''}`}
        >
          <div className="timeline-item-header">
            <span className="timeline-event-type">{event.type}</span>
            <time
              className="timeline-timestamp"
              dateTime={new Date(event.timestamp).toISOString()}
            >
              {formatTimestamp(event.timestamp)}
            </time>
          </div>

          {event.description && (
            <p className="timeline-description">{event.description}</p>
          )}

          {event.source && (
            <span className="timeline-source">{event.source}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
