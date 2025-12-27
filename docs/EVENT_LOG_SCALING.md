# Event Log Scaling Strategy

## Overview
This document outlines the approach for efficiently displaying and managing event logs, particularly for threads with 100+ events and watchers with 1000+ events.

## Frontend Optimizations (Implemented)

### 1. Table-Based Display
**Component:** `/frontend/src/components/events/event-table.tsx`

Replaced the verbose card-based event display with a compact table format:
- **Columns:** Time (relative + absolute), Category, Event Type, Summary, Actions
- **Expandable Rows:** Click "Details" to see full event payload
- **Category Filtering:** Filter by Watcher, Message, Thread, Extraction, Reminder, Alert, etc.
- **Space Efficiency:** Shows 10-20x more events in the same viewport

### 2. Pagination
**Implementation:** Watcher detail page loads 100 events initially, with "Load More" button

```typescript
// Load initial events
const events = await api.getEvents(watcherId, { limit: 100 });

// Load more using oldest timestamp
const moreEvents = await api.getEvents(watcherId, { 
  limit: 100, 
  before: oldestEvent.timestamp 
});
```

**Benefits:**
- Reduces initial load time
- Prevents browser memory issues with 1000+ events
- Uses cursor-based pagination (timestamp) for consistency

### 3. Smart Summaries
Each event type has a custom summary for quick scanning:
- `MESSAGE_RECEIVED`: Shows subject line
- `HARD_DEADLINE_OBSERVED`: Shows deadline time
- `SOFT_DEADLINE_SIGNAL_OBSERVED`: Shows signal text preview
- `THREAD_OPENED`: Shows normalized subject
- Etc.

## Backend Considerations (Recommendations)

### Current State
- Events stored in PostgreSQL event store
- Full event history retained indefinitely
- No aggregation or projections currently implemented

### Scaling Challenges
1. **1000+ events per thread is unusual** - Most threads should close within 10-50 events
   - If seeing 1000+ regularly, may indicate:
     - Thread detection not working (emails not grouping properly)
     - Threads never closing (missing closure signals)
     - High-frequency monitoring emails being treated as separate events

2. **Memory concerns** - Loading 1000+ full events into browser memory is suboptimal

### Recommended Optimizations

#### 1. Event Projections (Backend)
Create read-optimized views for common queries:

```sql
-- Thread summary projection
CREATE TABLE thread_projections AS
SELECT 
  thread_id,
  watcher_id,
  message_count,
  last_activity_timestamp,
  current_urgency,
  deadline_utc,
  status,
  urgency_transitions JSONB -- Array of {timestamp, from, to}
FROM (
  -- Aggregate from event_store
);
```

**Benefits:**
- Reduces query complexity
- Pre-computes frequently accessed data (message count, urgency timeline)
- Serves dashboard/list views without scanning full event log

#### 2. Event Archiving
For closed threads older than 90 days:
- Move detailed events to cold storage (S3, compressed JSON)
- Keep only projection/summary in hot database
- Provide "Load Full History" option for archived threads

#### 3. Event Sampling
For very long threads, send sampled events to frontend:
```typescript
// Send every Nth event, but always include:
// - First event (THREAD_OPENED)
// - Last event
// - Urgency transitions
// - Deadline observations
// - Alerts sent
```

#### 4. Query Optimization
**Current API:** `GET /watchers/:id/events?limit=100&before=<timestamp>`

**Optimized API:**
```typescript
// Add type filtering
GET /watchers/:id/events?limit=100&type=ALERT_SENT,URGENCY_SIGNAL_OBSERVED

// Add category filtering
GET /watchers/:id/events?limit=100&category=alerts

// Add thread filtering
GET /watchers/:id/threads/:threadId/events?limit=100
```

**Database indexes:**
```sql
CREATE INDEX idx_events_watcher_timestamp ON event_store(watcher_id, timestamp DESC);
CREATE INDEX idx_events_thread_timestamp ON event_store(thread_id, timestamp DESC);
CREATE INDEX idx_events_type ON event_store(event_type);
```

#### 5. Monitoring & Alerts
Add observability for unusual patterns:
- Alert when thread exceeds 100 events
- Alert when thread stays open > 7 days
- Dashboard showing avg events per thread by watcher
- Identify watchers with abnormal event volumes

## Virtual Scrolling (Future)
For truly massive event logs (1000+ in one view), consider:
- React Window or React Virtual for windowed rendering
- Only render visible rows (~20-30 at a time)
- Maintains scroll performance regardless of dataset size

## Usage
```typescript
// Simple table with all events
<EventTable events={events} />

// Table with pagination
<EventTable 
  events={events} 
  onLoadMore={handleLoadMore}
  hasMore={hasMoreEvents}
  isLoading={loadingMore}
/>

// With filtering
// User can filter by category using built-in filter bar
```

## Metrics to Monitor
1. **P95 event count per thread** - Should be < 50 for healthy system
2. **Threads with 100+ events** - Should be < 1% of total threads
3. **Average events per thread** - Should be 10-20 for typical use case
4. **Watcher event volume** - Identify high-volume watchers needing tuning

## Next Steps
1. ✅ Implement table-based UI with pagination (DONE)
2. ⏳ Add backend event projections for thread summaries
3. ⏳ Implement event type filtering in API
4. ⏳ Add monitoring dashboard for event volume metrics
5. ⏳ Investigate why some threads have 1000+ events (thread detection issue?)
