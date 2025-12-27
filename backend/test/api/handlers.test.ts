/**
 * Unit tests for API HTTP Handlers
 * 
 * Tests for:
 * - Health check endpoints (IR-24)
 * - Email ingestion endpoint (FR-5)
 * - Watcher CRUD operations
 * - Thread list endpoint (MR-Frontend-1)
 * - Event log endpoint (FR-14)
 * - Per-watcher logs (IR-22)
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  handleHealthCheck,
  handleSystemHealth,
  handleEmailIngestion,
  handleListWatchers,
  handleGetWatcher,
  handleCreateWatcher,
  handleUpdateWatcher,
  handleUpdatePolicy,
  handleDeleteWatcher,
  handleListThreads,
  handleGetEvents,
  handleGetLogs,
  routeRequest,
  type HttpRequest,
  type HandlerContext,
  type ComponentHealth,
} from "@/api/handlers";
import { InMemoryEventStore } from "@/events/event-store";
import type { VigilEvent, WatcherPolicy } from "@/events/types";
import type { WatcherState, ThreadState } from "@/watcher/runtime";

// Mock getEffectivePlan to avoid database dependency in tests
mock.module("@/billing", () => {
  const original = require("@/billing");
  return {
    ...original,
    getEffectivePlan: async () => "free" as const,
  };
});

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  const eventStore = new InMemoryEventStore();
  const mockAuthResult = {
    success: true,
    user: {
      user_id: "user-123",
      account_id: "account-123",
      email: "user@example.com",
      role: "owner",
    },
    tokens: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
    },
  } as const;

  return {
    eventStore,
    getWatcherByToken: async () => null,
    getWatcherById: async () => null,
    validateAuth: async (auth) =>
      auth
        ? {
            user_id: "user-123",
            account_id: "account-123",
            email: "user@example.com",
            role: "owner",
          }
        : null,
    registerUser: async () => mockAuthResult,
    loginUser: async () => mockAuthResult,
    refreshTokens: async () => mockAuthResult,
    ...overrides,
  };
}

function createRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    path: "/",
    params: {},
    query: {},
    headers: {},
    body: null,
    ...overrides,
  };
}

function createMockWatcher(overrides: Partial<WatcherState> = {}): WatcherState {
  return {
    watcher_id: "watcher-123",
    account_id: "account-123",
    status: "active",
    threads: new Map(),
    policy: null,
    extraction_events: new Map(),
    reminders: new Map(),
    message_associations: new Map(),
    ...overrides,
  };
}

function createMockThread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    thread_id: "thread-456",
    watcher_id: "watcher-123",
    trigger_type: "hard_deadline",
    opened_at: Date.now() - 86400000,
    last_activity_at: Date.now() - 3600000,
    status: "open",
    closed_at: null,
    message_ids: ["msg-1"],
    participants: ["sender@example.com"],
    normalized_subject: "test subject",
    original_sender: "sender@example.com",
    original_sent_at: Date.now() - 86400000,
    hard_deadline_event_id: null,
    soft_deadline_event_id: null,
    last_urgency_state: "ok",
    last_alert_urgency: null,
    ...overrides,
  };
}

// ============================================================================
// Health Check Tests (IR-24)
// ============================================================================

describe("IR-24: Health Check Endpoints", () => {
  describe("handleHealthCheck", () => {
    test("should return healthy status", async () => {
      const response = await handleHealthCheck();

      expect(response.status).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe("healthy");
      expect(body.timestamp).toBeDefined();
    });

    test("should return JSON content type", async () => {
      const response = await handleHealthCheck();

      expect(response.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("handleSystemHealth", () => {
    test("should aggregate component health statuses", async () => {
      const providers = new Map<string, () => Promise<ComponentHealth>>([
        [
          "event_store",
          async () => ({
            status: "healthy",
            last_heartbeat: new Date().toISOString(),
            metrics: { connections: 5 },
          }),
        ],
        [
          "llm_service",
          async () => ({
            status: "healthy",
            last_heartbeat: new Date().toISOString(),
            metrics: { latency_ms: 150 },
          }),
        ],
      ]);

      const response = await handleSystemHealth(providers);
      const body = JSON.parse(response.body);

      expect(body.status).toBe("healthy");
      expect(body.components.event_store.status).toBe("healthy");
      expect(body.components.llm_service.status).toBe("healthy");
    });

    test("should return degraded when any component is degraded", async () => {
      const providers = new Map<string, () => Promise<ComponentHealth>>([
        [
          "event_store",
          async () => ({
            status: "healthy",
            last_heartbeat: new Date().toISOString(),
            metrics: {},
          }),
        ],
        [
          "llm_service",
          async () => ({
            status: "degraded",
            last_heartbeat: new Date().toISOString(),
            metrics: {},
          }),
        ],
      ]);

      const response = await handleSystemHealth(providers);
      const body = JSON.parse(response.body);

      expect(body.status).toBe("degraded");
    });

    test("should return unhealthy when any component is unhealthy", async () => {
      const providers = new Map<string, () => Promise<ComponentHealth>>([
        [
          "event_store",
          async () => ({
            status: "unhealthy",
            last_heartbeat: new Date().toISOString(),
            metrics: {},
          }),
        ],
      ]);

      const response = await handleSystemHealth(providers);
      const body = JSON.parse(response.body);

      expect(body.status).toBe("unhealthy");
    });

    test("should handle provider errors gracefully", async () => {
      const providers = new Map<string, () => Promise<ComponentHealth>>([
        [
          "failing_component",
          async () => {
            throw new Error("Connection failed");
          },
        ],
      ]);

      const response = await handleSystemHealth(providers);
      const body = JSON.parse(response.body);

      expect(body.status).toBe("unhealthy");
      expect(body.components.failing_component.status).toBe("unhealthy");
    });
  });
});

// ============================================================================
// Email Ingestion Tests (FR-5)
// ============================================================================

describe("FR-5: Email Ingestion", () => {
  describe("handleEmailIngestion", () => {
    test("should accept valid email for active watcher", async () => {
      const watcher = createMockWatcher({ status: "active" });
      const context = createMockContext({
        getWatcherByToken: async () => watcher,
      });

      const request = createRequest({
        method: "POST",
        params: { token: "abc123" },
        body: "From: sender@example.com\nSubject: Test\n\nBody",
      });

      const response = await handleEmailIngestion(request, context);

      expect(response.status).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.accepted).toBe(true);
      expect(body.watcher_id).toBe("watcher-123");
    });

    test("should reject request without token", async () => {
      const context = createMockContext();
      const request = createRequest({
        method: "POST",
        params: {},
        body: "email content",
      });

      const response = await handleEmailIngestion(request, context);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("MISSING_TOKEN");
    });

    test("should reject invalid token", async () => {
      const context = createMockContext({
        getWatcherByToken: async () => null,
      });

      const request = createRequest({
        method: "POST",
        params: { token: "invalid" },
        body: "email content",
      });

      const response = await handleEmailIngestion(request, context);

      expect(response.status).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("INVALID_TOKEN");
    });

    test("should reject email for deleted watcher", async () => {
      const watcher = createMockWatcher({ status: "deleted" });
      const context = createMockContext({
        getWatcherByToken: async () => watcher,
      });

      const request = createRequest({
        method: "POST",
        params: { token: "abc123" },
        body: "email content",
      });

      const response = await handleEmailIngestion(request, context);

      expect(response.status).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("WATCHER_DELETED");
    });

    test("should reject request without body", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherByToken: async () => watcher,
      });

      const request = createRequest({
        method: "POST",
        params: { token: "abc123" },
        body: null,
      });

      const response = await handleEmailIngestion(request, context);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("MISSING_BODY");
    });
  });
});

// ============================================================================
// Watcher CRUD Tests
// ============================================================================

describe("Watcher Management", () => {
  describe("handleCreateWatcher", () => {
    test("should create watcher with valid name", async () => {
      const context = createMockContext();

      const request = createRequest({
        method: "POST",
        body: JSON.stringify({ name: "Finance Watcher" }),
      });

      const response = await handleCreateWatcher(
        request,
        context,
        "account-123",
        "user-123"
      );

      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.watcher.name).toBe("Finance Watcher");
      expect(body.watcher.watcher_id).toBeDefined();
      expect(body.watcher.ingest_email).toContain("@ingest.email.vigil.run");
    });

    test("should reject missing name", async () => {
      const context = createMockContext();

      const request = createRequest({
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await handleCreateWatcher(
        request,
        context,
        "account-123",
        "user-123"
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("MISSING_NAME");
    });

    test("should reject name over 100 characters", async () => {
      const context = createMockContext();

      const request = createRequest({
        method: "POST",
        body: JSON.stringify({ name: "a".repeat(101) }),
      });

      const response = await handleCreateWatcher(
        request,
        context,
        "account-123",
        "user-123"
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("NAME_TOO_LONG");
    });

    test("should reject invalid JSON", async () => {
      const context = createMockContext();

      const request = createRequest({
        method: "POST",
        body: "not json",
      });

      const response = await handleCreateWatcher(
        request,
        context,
        "account-123",
        "user-123"
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("INVALID_JSON");
    });

    test("should append WATCHER_CREATED and POLICY_UPDATED events to store", async () => {
      const context = createMockContext();

      const request = createRequest({
        method: "POST",
        body: JSON.stringify({ name: "Test Watcher" }),
      });

      await handleCreateWatcher(request, context, "account-123", "user-123");

      const events = await context.eventStore.getAllEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("WATCHER_CREATED");
      expect(events[1].type).toBe("POLICY_UPDATED");
    });
  });

  describe("handleGetWatcher", () => {
    test("should return watcher details", async () => {
      const eventStore = new InMemoryEventStore();
      await eventStore.append({
        event_id: "evt-create",
        timestamp: Date.now() - 1000,
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test Watcher",
        ingest_token: "tok123",
        created_by: "user-123",
        created_at: Date.now() - 1000,
      });

      const threads = new Map([
        ["t1", createMockThread({ thread_id: "t1", status: "open" })],
        ["t2", createMockThread({ thread_id: "t2", status: "closed" })],
      ]);
      const watcher = createMockWatcher({ threads });
      const context = createMockContext({
        eventStore,
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleGetWatcher(
        request,
        context,
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.watcher.watcher_id).toBe("watcher-123");
      expect(body.watcher.thread_count).toBe(2);
      expect(body.watcher.open_threads).toBe(1);
    });

    test("should return 404 for unknown watcher", async () => {
      const context = createMockContext();

      const request = createRequest({
        params: { id: "unknown" },
      });

      const response = await handleGetWatcher(
        request,
        context,
        "account-123"
      );

      expect(response.status).toBe(404);
    });
  });

  describe("handleDeleteWatcher", () => {
    test("should delete existing watcher", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleDeleteWatcher(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.deleted).toBe(true);

      const events = await context.eventStore.getAllEvents();
      expect(events[0].type).toBe("WATCHER_DELETED");
    });

    test("should reject deleting already deleted watcher", async () => {
      const watcher = createMockWatcher({ status: "deleted" });
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleDeleteWatcher(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("ALREADY_DELETED");
    });
  });

  describe("handleUpdatePolicy", () => {
    test("should update policy with valid data", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const policy: WatcherPolicy = {
        allowed_senders: ["test@example.com"],
        silence_threshold_hours: 48,
        deadline_warning_hours: 24,
        deadline_critical_hours: 2,
        notification_channels: [],
        reporting_cadence: "daily",
        reporting_recipients: [],
      };

      const request = createRequest({
        params: { id: "watcher-123" },
        body: JSON.stringify(policy),
      });

      const response = await handleUpdatePolicy(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.updated).toBe(true);
    });

    test("should reject invalid silence_threshold_hours", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const policy = {
        allowed_senders: [],
        silence_threshold_hours: 0, // Invalid
        deadline_warning_hours: 24,
        deadline_critical_hours: 2,
        notification_channels: [],
        reporting_cadence: "daily",
        reporting_recipients: [],
      };

      const request = createRequest({
        params: { id: "watcher-123" },
        body: JSON.stringify(policy),
      });

      const response = await handleUpdatePolicy(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("INVALID_POLICY");
    });

    test("should reject critical >= warning hours", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const policy = {
        allowed_senders: [],
        silence_threshold_hours: 72,
        deadline_warning_hours: 24,
        deadline_critical_hours: 24, // Same as warning
        notification_channels: [],
        reporting_cadence: "daily",
        reporting_recipients: [],
      };

      const request = createRequest({
        params: { id: "watcher-123" },
        body: JSON.stringify(policy),
      });

      const response = await handleUpdatePolicy(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(400);
    });

    test("should reject policy with more notification channels than plan allows", async () => {
      const watcher = createMockWatcher();
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      // Free plan allows max 2 notification channels
      // Create policy with 3 channels (exceeds free plan limit)
      const policy = {
        allowed_senders: [],
        silence_threshold_hours: 72,
        deadline_warning_hours: 24,
        deadline_critical_hours: 2,
        notification_channels: [
          { type: "email" as const, destination: "user1@example.com", urgency_filter: "all" as const, enabled: true },
          { type: "email" as const, destination: "user2@example.com", urgency_filter: "all" as const, enabled: true },
          { type: "email" as const, destination: "user3@example.com", urgency_filter: "all" as const, enabled: true },
        ],
        reporting_cadence: "daily" as const,
        reporting_recipients: [],
      };

      const request = createRequest({
        params: { id: "watcher-123" },
        body: JSON.stringify(policy),
      });

      const response = await handleUpdatePolicy(
        request,
        context,
        "user-123",
        "account-123"
      );

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("CHANNEL_LIMIT_EXCEEDED");
      expect(body.details).toContain("2 notification channels");
    });
  });

  describe("handleUpdateWatcher", () => {
    test("should update watcher name and reflect it in GET watcher", async () => {
      const now = Date.now();
      const eventStore = new InMemoryEventStore();
      await eventStore.append({
        event_id: "evt-create",
        timestamp: now - 1000,
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Old Name",
        ingest_token: "tok123",
        created_by: "user-123",
        created_at: now - 1000,
      });

      const watcher = createMockWatcher({ watcher_id: "watcher-123" });
      const context = createMockContext({
        eventStore,
        getWatcherById: async () => watcher,
      });

      const updateRequest = createRequest({
        method: "PATCH",
        params: { id: "watcher-123" },
        body: JSON.stringify({ name: "New Watcher Name" }),
      });

      const updateResponse = await handleUpdateWatcher(
        updateRequest,
        context,
        "user-123",
        "account-123"
      );
      expect(updateResponse.status).toBe(200);

      const getRequest = createRequest({
        method: "GET",
        params: { id: "watcher-123" },
      });
      const getResponse = await handleGetWatcher(getRequest, context, "account-123");
      expect(getResponse.status).toBe(200);

      const body = JSON.parse(getResponse.body);
      expect(body.watcher.name).toBe("New Watcher Name");
      // Name changes should update displayed ingest_email, but keep token stable
      expect(body.watcher.ingest_email).toContain("tok123@ingest.email.vigil.run");
    });
  });
});

// ============================================================================
// Thread List Tests (MR-Frontend-1)
// ============================================================================

describe("MR-Frontend-1: Thread List", () => {
  describe("handleListThreads", () => {
    test("should return all threads for watcher", async () => {
      const threads = new Map([
        ["t1", createMockThread({ thread_id: "t1", status: "open" })],
        ["t2", createMockThread({ thread_id: "t2", status: "closed" })],
      ]);
      const watcher = createMockWatcher({ threads });
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: {},
      });

      const response = await handleListThreads(
        request,
        context,
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.threads).toHaveLength(2);
    });

    test("should filter threads by status=open", async () => {
      const threads = new Map([
        ["t1", createMockThread({ thread_id: "t1", status: "open" })],
        ["t2", createMockThread({ thread_id: "t2", status: "closed" })],
      ]);
      const watcher = createMockWatcher({ threads });
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { status: "open" },
      });

      const response = await handleListThreads(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].status).toBe("open");
    });

    test("should filter threads by status=closed", async () => {
      const threads = new Map([
        ["t1", createMockThread({ thread_id: "t1", status: "open" })],
        ["t2", createMockThread({ thread_id: "t2", status: "closed" })],
      ]);
      const watcher = createMockWatcher({ threads });
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { status: "closed" },
      });

      const response = await handleListThreads(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].status).toBe("closed");
    });

    test("should include thread metadata in response", async () => {
      const thread = createMockThread({
        thread_id: "t1",
        message_ids: ["m1", "m2", "m3"],
        original_sender: "sender@example.com",
        normalized_subject: "test thread",
        last_urgency_state: "warning",
      });
      const threads = new Map([["t1", thread]]);
      const watcher = createMockWatcher({ threads });
      const context = createMockContext({
        getWatcherById: async () => watcher,
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleListThreads(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      const responseThread = body.threads[0];
      expect(responseThread.message_count).toBe(3);
      expect(responseThread.subject).toBe("test thread");
      expect(responseThread.urgency).toBe("warning");
    });
  });
});

// ============================================================================
// Event Log Tests (FR-14)
// ============================================================================

describe("FR-14: Event Log Inspection", () => {
  describe("handleGetEvents", () => {
    test("should return events for watcher", async () => {
      const eventStore = new InMemoryEventStore();
      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test",
        ingest_token: "abc",
        created_by: "u1",
        created_at: Date.now(),
      });

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleGetEvents(
        request,
        context,
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });

    test("should filter events by type", async () => {
      const eventStore = new InMemoryEventStore();
      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test",
        ingest_token: "abc",
        created_by: "u1",
        created_at: Date.now(),
      });
      await eventStore.append({
        event_id: "e2",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "WATCHER_ACTIVATED",
      });

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { type: "WATCHER_ACTIVATED" },
      });

      const response = await handleGetEvents(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].type).toBe("WATCHER_ACTIVATED");
    });

    test("should filter events by since timestamp", async () => {
      const eventStore = new InMemoryEventStore();
      const now = Date.now();

      await eventStore.append({
        event_id: "e1",
        timestamp: now - 10000, // Old
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test",
        ingest_token: "abc",
        created_by: "u1",
        created_at: now - 10000,
      });
      await eventStore.append({
        event_id: "e2",
        timestamp: now, // New
        watcher_id: "watcher-123",
        type: "WATCHER_ACTIVATED",
      });

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { since: String(now - 5000) },
      });

      const response = await handleGetEvents(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].type).toBe("WATCHER_ACTIVATED");
    });

    test("should paginate events", async () => {
      const eventStore = new InMemoryEventStore();

      for (let i = 0; i < 5; i++) {
        await eventStore.append({
          event_id: `e${i}`,
          timestamp: Date.now() + i,
          watcher_id: "watcher-123",
          type: "WATCHER_ACTIVATED",
        });
      }

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { limit: "2", offset: "1" },
      });

      const response = await handleGetEvents(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(2);
      expect(body.pagination.total).toBe(5);
      expect(body.pagination.has_more).toBe(true);
    });
  });
});

// ============================================================================
// Per-Watcher Logs Tests (IR-22)
// ============================================================================

describe("IR-22: Per-Watcher Logs", () => {
  describe("handleGetLogs", () => {
    test("should return human-readable logs", async () => {
      const eventStore = new InMemoryEventStore();
      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "MESSAGE_RECEIVED",
        message_id: "m1",
        from: "sender@example.com",
        to: ["recipient@example.com"],
        cc: [],
        subject: "Test",
        received_at: Date.now(),
        headers: {},
        body_length: 100,
        sender_allowed: true,
      } as VigilEvent);

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleGetLogs(
        request,
        context,
        "account-123"
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toContain("Message received from");
      expect(body.logs[0].level).toBe("INFO");
    });

    test("should translate event types to plain English", async () => {
      const eventStore = new InMemoryEventStore();

      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "HARD_DEADLINE_OBSERVED",
        message_id: "m1",
        deadline_utc: Date.now() + 86400000,
        deadline_text: "Friday 5pm",
        source_span: "due by Friday 5pm",
        confidence: "high",
        binding: true,
        extractor_version: "v1.0.0",
      } as VigilEvent);

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleGetLogs(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.logs[0].message).toContain("Deadline found");
    });

    test("should filter logs by level", async () => {
      const eventStore = new InMemoryEventStore();

      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test",
        ingest_token: "abc",
        created_by: "u1",
        created_at: Date.now(),
      });

      await eventStore.append({
        event_id: "e2",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "ALERT_QUEUED",
        alert_id: "a1",
        reminder_id: "r1",
        thread_id: "t1",
        urgency_state: "warning",
        channels: [],
      } as VigilEvent);

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
        query: { level: "WARN" },
      });

      const response = await handleGetLogs(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].level).toBe("WARN");
    });

    test("should attribute actions correctly", async () => {
      const eventStore = new InMemoryEventStore();

      await eventStore.append({
        event_id: "e1",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "WATCHER_CREATED",
        account_id: "account-123",
        name: "Test",
        ingest_token: "abc",
        created_by: "u1",
        created_at: Date.now(),
      });

      await eventStore.append({
        event_id: "e2",
        timestamp: Date.now(),
        watcher_id: "watcher-123",
        type: "THREAD_OPENED",
        thread_id: "t1",
        message_id: "m1",
        opened_at: Date.now(),
      } as VigilEvent);

      const context = createMockContext({
        eventStore,
        getWatcherById: async () => createMockWatcher(),
      });

      const request = createRequest({
        params: { id: "watcher-123" },
      });

      const response = await handleGetLogs(
        request,
        context,
        "account-123"
      );

      const body = JSON.parse(response.body);
      
      // User action
      const createdLog = body.logs.find((l: any) =>
        l.message.includes("Watcher created")
      );
      expect(createdLog.action_by).toBe("by you");

      // Automatic action
      const threadLog = body.logs.find((l: any) =>
        l.message.includes("Thread created")
      );
      expect(threadLog.action_by).toBe("automatically");
    });
  });
});

// ============================================================================
// Router Tests
// ============================================================================

describe("routeRequest", () => {
  test("should route GET /health without auth", async () => {
    const context = createMockContext();

    const request = createRequest({
      method: "GET",
      path: "/health",
    });

    const response = await routeRequest(request, context);

    expect(response.status).toBe(200);
  });

  test("should route POST /ingest/:token without user auth", async () => {
    const watcher = createMockWatcher();
    const context = createMockContext({
      getWatcherByToken: async () => watcher,
    });

    const request = createRequest({
      method: "POST",
      path: "/ingest/abc123",
      body: "email content",
    });

    const response = await routeRequest(request, context);

    expect(response.status).toBe(202);
  });

  test("should require auth for API routes", async () => {
    const context = createMockContext();

    const request = createRequest({
      method: "GET",
      path: "/api/watchers",
      headers: {}, // No auth
    });

    const response = await routeRequest(request, context);

    expect(response.status).toBe(401);
  });

  test("should accept auth for API routes", async () => {
    const context = createMockContext();

    const request = createRequest({
      method: "GET",
      path: "/api/watchers",
      headers: { authorization: "Bearer token" },
    });

    const response = await routeRequest(request, context);

    // 200 with empty watchers (not 401)
    expect(response.status).toBe(200);
  });

  test("should return 404 for unknown routes", async () => {
    const context = createMockContext();

    const request = createRequest({
      method: "GET",
      path: "/unknown/route",
      headers: { authorization: "Bearer token" },
    });

    const response = await routeRequest(request, context);

    expect(response.status).toBe(404);
  });
});

// ============================================================================
// Authorization Tests
// ============================================================================

describe("Authorization", () => {
  test("should enforce watcher ownership", async () => {
    // This would require account-level isolation checks
    // In a real implementation, getWatcherById would verify ownership
  });

  test("should prevent cross-account access", async () => {
    // User B should not access User A's watcher
    // This would be enforced at the context level
  });
});
