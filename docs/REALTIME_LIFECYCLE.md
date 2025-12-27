# Real-Time Event Lifecycle Implementation

## Overview

This document describes the complete end-to-end event lifecycle in Vigil, from email ingestion through extraction, persistence, and real-time UI updates.

---

## Complete Event Flow

### Phase 1: Email Ingestion & Validation
**Location:** `backend/src/index.ts` → `POST /ingest/:token`

1. **Email arrives** at ingest endpoint
2. **Usage check** - Verify subscription hasn't exceeded limits
3. **Parse email** via orchestrator:
   - Extract headers (From, To, Subject, Message-ID, References, In-Reply-To)
   - Extract body text (plain text + HTML fallback)
   - Determine `sent_at` (original send time) vs `ingested_at` (Vigil receipt time)
4. **Validate sender** - Check against watcher's allowlist
5. **Deduplicate** - Check if Message-ID already processed
6. **Emit:** `MESSAGE_RECEIVED` event (always, even if sender blocked)

**Event Payload:**
```typescript
{
  event_id: "evt-xyz",
  type: "MESSAGE_RECEIVED",
  watcher_id: "wch-123",
  timestamp: 1703635200000,
  payload: {
    message_id: "<abc@example.com>",
    from: "sender@example.com",
    to: ["watcher-abc123@vigil.com"],
    subject: "Project deadline update",
    body: "The deadline has been moved...",
    sent_at: 1703635000000,
    ingested_at: 1703635200000,
    headers: { ... }
  }
}
```

---

### Phase 2: LLM Routing & Signal Extraction
**Location:** `backend/src/llm/router.ts` → `backend/src/llm/extractor.ts`

7. **Route email** - Determine which signals MIGHT be present using regex patterns:
   - Hard deadlines: "by EOD", "before 5pm", "due Monday"
   - Soft deadlines: "soon", "ASAP", "when you get a chance"
   - Urgency markers: "URGENT", "high priority", "escalation"
   - Closure signals: "resolved", "completed", "closing this out"

8. **Run extractors** (only for flagged signal types - saves LLM costs):
   ```typescript
   if (routing.extract_deadline) {
     // Call OpenAI to extract hard deadline with UTC timestamp
     deadline = await extractDeadline(email);
   }
   if (routing.extract_urgency) {
     // Call OpenAI to detect urgency level
     urgency = await extractUrgency(email);
   }
   // ... etc
   ```

9. **Validate extractions** - Verify source spans exist in original email text

10. **Emit extraction events** (0-4 events depending on what was found):

**Hard Deadline Event:**
```typescript
{
  event_id: "evt-abc",
  type: "HARD_DEADLINE_OBSERVED",
  watcher_id: "wch-123",
  timestamp: 1703635205000,
  payload: {
    message_id: "<abc@example.com>",
    deadline_utc: 1703721600000, // "by 5pm Friday"
    source_span: "Please complete this by end of day Friday",
    confidence: 0.95
  }
}
```

**Urgency Signal Event:**
```typescript
{
  event_id: "evt-def",
  type: "URGENCY_SIGNAL_OBSERVED",
  watcher_id: "wch-123",
  timestamp: 1703635206000,
  payload: {
    message_id: "<abc@example.com>",
    level: "warning", // ok | warning | critical
    source_span: "This is becoming urgent",
    reason: "Escalation language detected"
  }
}
```

---

### Phase 3: Thread Detection & Lifecycle
**Location:** `backend/src/watcher/thread-detection.ts`

11. **Check thread matching** (3 priority levels):
    - **Priority 1:** Message-ID chain (In-Reply-To, References headers)
    - **Priority 2:** Conversation-Index (Microsoft Outlook threading)
    - **Priority 3:** Subject line + participant overlap

12. **Emit thread event:**

**New Thread Opened:**
```typescript
{
  event_id: "evt-ghi",
  type: "THREAD_OPENED",
  watcher_id: "wch-123",
  timestamp: 1703635207000,
  payload: {
    thread_id: "thr-abc123",
    message_id: "<abc@example.com>",
    subject: "Project deadline update",
    participants: ["sender@example.com", "watcher@vigil.com"],
    reason: "New conversation with actionable signals"
  }
}
```

**Existing Thread Activity:**
```typescript
{
  event_id: "evt-jkl",
  type: "THREAD_ACTIVITY_OBSERVED",
  watcher_id: "wch-123",
  timestamp: 1703635208000,
  payload: {
    thread_id: "thr-abc123",
    message_id: "<reply@example.com>",
    matched_by: "message_id_chain" // or "conversation_index" or "subject_overlap"
  }
}
```

13. **Check for closure:**

**Thread Closed:**
```typescript
{
  event_id: "evt-mno",
  type: "THREAD_CLOSED",
  watcher_id: "wch-123",
  timestamp: 1703635209000,
  payload: {
    thread_id: "thr-abc123",
    message_id: "<final@example.com>",
    closure_reason: "Closure signal detected",
    source_span: "This has been resolved"
  }
}
```

---

### Phase 4: Event Persistence & Cache Invalidation
**Location:** `backend/src/db/event-store.ts` → `backend/src/index.ts`

14. **Append all events atomically** to PostgreSQL:
    ```sql
    INSERT INTO events (event_id, type, watcher_id, timestamp, payload)
    VALUES ($1, $2, $3, $4, $5)
    ```

15. **Invalidate watcher cache** - Force next read to rebuild state

16. **Increment usage counter** for billing:
    ```sql
    UPDATE billing_periods
    SET emails_processed = emails_processed + 1
    WHERE account_id = $1 AND period_start <= NOW() AND period_end > NOW()
    ```

17. **Log completion** with event IDs and types

**Event Store Properties:**
- **Immutable:** Events never modified after insertion
- **Append-only:** New events always appended at the end
- **Ordered:** Events retrieved in chronological order
- **Complete:** All state transitions recorded

---

### Phase 5: State Reconstruction (On-Demand)
**Location:** `backend/src/watcher/runtime.ts`

18. **When UI requests data** (e.g., `GET /api/watchers/:id/threads`):
    - Backend loads ALL events for watcher from DB
    - Replays events in order via reducer pattern
    - Builds thread projections in-memory
    - Returns current snapshot

**Projection Algorithm:**
```typescript
function projectThreads(events: VigilEvent[]): Thread[] {
  const threads = new Map<string, Thread>();
  
  for (const event of events) {
    switch (event.type) {
      case 'THREAD_OPENED':
        threads.set(event.payload.thread_id, {
          thread_id: event.payload.thread_id,
          status: 'open',
          urgency: 'ok',
          first_message_at: event.timestamp,
          last_activity_at: event.timestamp,
          message_count: 1,
          // ...
        });
        break;
      
      case 'THREAD_ACTIVITY_OBSERVED':
        const thread = threads.get(event.payload.thread_id);
        thread.last_activity_at = event.timestamp;
        thread.message_count++;
        break;
      
      case 'HARD_DEADLINE_OBSERVED':
        thread.deadline = event.payload.deadline_utc;
        thread.urgency = calculateUrgency(thread);
        break;
      
      case 'URGENCY_SIGNAL_OBSERVED':
        thread.urgency = event.payload.level;
        break;
      
      case 'THREAD_CLOSED':
        thread.status = 'closed';
        break;
    }
  }
  
  return Array.from(threads.values());
}
```

---

### Phase 6: Real-Time UI Updates
**Location:** `frontend/src/lib/hooks/use-realtime-data.ts` → `frontend/src/app/dashboard/page.tsx`

19. **Frontend polls API** every 5 seconds:
    ```typescript
    const {
      watchers,
      threads,
      isLoading,
      isPolling,
      hasNewData,
      lastUpdated,
    } = useRealtimeData({
      pollInterval: 5000,
      enabled: true,
      pauseWhenHidden: true, // Pause when tab is hidden
    });
    ```

20. **Backend responds** with thread projections:
    ```typescript
    {
      threads: [{
        thread_id: "thr-abc123",
        subject: "Project deadline update",
        status: "open",
        urgency: "warning",
        first_message_at: 1703635200000,
        last_activity_at: 1703721600000,
        message_count: 3,
        deadline: 1703808000000
      }]
    }
    ```

21. **UI automatically updates** when new data detected

---

## Real-Time Update Strategy

### Implementation: Short Polling

**Why Polling?**
- ✅ Simple to implement and debug
- ✅ Works with existing REST API
- ✅ No infrastructure changes needed
- ✅ Reliable across all browsers and networks
- ✅ Easy to pause/resume based on tab visibility

**Polling Behavior:**
- **Interval:** 5 seconds (configurable)
- **Pause when hidden:** Tab visibility API pauses polling when tab is not active
- **Resume on focus:** Immediately fetches fresh data when tab becomes visible
- **Change detection:** Compares JSON snapshots to detect new data
- **Visual indicators:** Shows polling status and new data notifications

**UI States:**
- `isLoading` - Initial data fetch
- `isPolling` - Background update in progress
- `hasNewData` - New data detected since last view
- `error` - Fetch failed (with retry button)
- `lastUpdated` - Timestamp of last successful fetch

---

## Visual Indicators

### Header Status Bar
```
[●] Connected  |  [↻] Updated 3s ago  |  Account  |  Billing  |  Sign out
```

### New Data Notification
```
┌─────────────────────────────────────────┐
│ ● New updates available      [Dismiss]  │
└─────────────────────────────────────────┘
```

### Polling Indicator
```
[●] Updating...  (animated pulse)
```

### Error Banner
```
┌─────────────────────────────────────────┐
│ ⚠ Failed to update data        [Retry]  │
│ Network request failed                   │
└─────────────────────────────────────────┘
```

---

## Event Timeline Example

**Scenario:** User receives urgent project deadline email

```
T+0ms     Email arrives at ingest endpoint
T+50ms    MESSAGE_RECEIVED event emitted
T+100ms   LLM routing identifies deadline + urgency
T+2000ms  HARD_DEADLINE_OBSERVED event emitted (deadline: 2023-12-29 17:00 UTC)
T+2100ms  URGENCY_SIGNAL_OBSERVED event emitted (level: warning)
T+2150ms  Thread matching finds no existing thread
T+2200ms  THREAD_OPENED event emitted (thread_id: thr-abc123)
T+2250ms  All 4 events appended to PostgreSQL
T+2300ms  Cache invalidated for watcher
T+2350ms  HTTP 200 response returned
T+5000ms  Frontend polls GET /watchers/wch-123/threads
T+5100ms  Backend replays 4 events, projects thread state
T+5150ms  Frontend receives updated thread list
T+5200ms  UI shows "New updates available" notification
```

---

## Performance Characteristics

### Backend
- **Event append:** ~10ms (single INSERT transaction)
- **State projection:** ~100ms for 1000 events
- **Cache hit:** ~5ms (in-memory)
- **Full rebuild:** Happens on cache miss or invalidation

### Frontend
- **Poll frequency:** Every 5 seconds
- **Poll cost:** 1 HTTP request per watcher
- **Change detection:** O(n) JSON comparison
- **UI update:** React re-render only when data changes

### Resource Usage
- **Network:** ~1 KB per poll (compressed JSON)
- **Memory:** Minimal (previous snapshot + current)
- **CPU:** Negligible (idle between polls)

---

## Future Enhancements

### Option A: Server-Sent Events (SSE)
```typescript
// Backend
app.get('/api/watchers/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  
  const listener = (event: VigilEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  
  eventEmitter.on('event:appended', listener);
});

// Frontend
const eventSource = new EventSource('/api/watchers/wch-123/stream');
eventSource.onmessage = (event) => {
  const newEvent = JSON.parse(event.data);
  // Update UI immediately
};
```

**Benefits:**
- Real-time updates (no polling delay)
- Lower network overhead
- Browser-native reconnection

**Trade-offs:**
- Requires long-lived connections
- More complex error handling
- Load balancer compatibility

---

### Option B: WebSocket
```typescript
// Backend
io.on('connection', (socket) => {
  socket.on('subscribe:watcher', (watcherId) => {
    socket.join(`watcher:${watcherId}`);
  });
});

eventEmitter.on('event:appended', (event) => {
  io.to(`watcher:${event.watcher_id}`).emit('thread:updated', projection);
});

// Frontend
const socket = io();
socket.emit('subscribe:watcher', 'wch-123');
socket.on('thread:updated', (threads) => {
  setThreads(threads);
});
```

**Benefits:**
- True bidirectional communication
- Push notifications
- Lower latency

**Trade-offs:**
- Requires WebSocket infrastructure
- More complex state management
- Scaling considerations

---

## Configuration

### Environment Variables
```bash
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_POLL_INTERVAL=5000  # Optional: Override poll interval

# Backend
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

### Polling Options
```typescript
// In dashboard component
useRealtimeData({
  pollInterval: 5000,      // Poll every 5 seconds
  enabled: true,           // Enable polling
  pauseWhenHidden: true,   // Pause when tab hidden
});
```

---

## Monitoring & Observability

### Backend Metrics
- Event append latency
- Projection rebuild time
- Cache hit rate
- LLM API latency

### Frontend Metrics
- Poll success rate
- Time to first data
- Data change frequency
- User engagement with updates

### Logs
```typescript
// Backend
logger.info('Events appended', {
  watcher_id: 'wch-123',
  event_types: ['MESSAGE_RECEIVED', 'HARD_DEADLINE_OBSERVED'],
  count: 2,
  latency_ms: 150
});

// Frontend
console.debug('Poll completed', {
  watchers: 3,
  threads: 12,
  changed: true,
  latency_ms: 220
});
```

---

## Testing

### Unit Tests
- Event projection logic
- Thread matching algorithm
- Change detection
- Error recovery

### Integration Tests
- End-to-end email processing
- Multi-event scenarios
- Cache invalidation
- Poll lifecycle

### Manual Testing
1. Send test email to watcher
2. Watch dashboard for real-time update
3. Verify thread appears within 5 seconds
4. Switch tabs, verify polling pauses
5. Return to tab, verify immediate refresh

---

## Summary

The Vigil event lifecycle is now fully implemented with:
- ✅ **Immutable event sourcing** - Complete audit trail
- ✅ **On-demand state projection** - Current view from event history
- ✅ **Real-time polling** - 5-second update cycle
- ✅ **Intelligent pausing** - Resource-efficient when tab hidden
- ✅ **Visual feedback** - Clear indicators for all states
- ✅ **Error recovery** - Graceful degradation with retry

This provides a solid foundation that can be upgraded to WebSocket/SSE in the future without changing the event model or projection logic.
