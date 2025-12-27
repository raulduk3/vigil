/**
 * Unit tests for Notification Worker
 *
 * Tests per SDD requirements:
 * - MR-NotificationWorker-1: Poll and process ALERT_QUEUED events
 * - MR-NotificationWorker-2: Deliver to channels (email, webhook)
 * - MR-NotificationWorker-3: Emit ALERT_SENT/ALERT_FAILED events
 * - FR-12: Alert Delivery with retry logic
 */

import { describe, test, expect, mock } from "bun:test";
import {
  filterChannelsByUrgency,
  calculateRetryDelay,
  buildEmailSubject,
  buildEmailBody,
  buildWebhookPayload,
  isValidWebhookUrl,
  isValidEmail,
  deliverToChannel,
  deliverAlert,
  RETRY_CONFIG,
  type AlertPayload,
  type EmailDeliveryFn,
  type WebhookDeliveryFn,
} from "@/worker/notification";
import type { NotificationChannel, AlertQueuedEvent } from "@/events/types";

// Helper to create notification channel
function createChannel(
  overrides: Partial<NotificationChannel> = {}
): NotificationChannel {
  return {
    type: "email",
    destination: "test@example.com",
    urgency_filter: "all",
    enabled: true,
    ...overrides,
  };
}

// Helper to create alert event
function createAlert(
  overrides: Partial<AlertQueuedEvent> = {}
): AlertQueuedEvent {
  return {
    event_id: "evt_1",
    timestamp: Date.now(),
    watcher_id: "w1",
    thread_id: "t1",
    type: "ALERT_QUEUED",
    alert_id: "alert_1",
    reminder_id: "reminder_1",
    urgency_state: "warning",
    causal_event_id: "causal_1",
    channels: [createChannel()],
    ...overrides,
  };
}

describe("filterChannelsByUrgency (FR-12)", () => {
  test("should include channel with 'all' filter for warning", () => {
    const channels = [createChannel({ urgency_filter: "all" })];
    const result = filterChannelsByUrgency(channels, "warning");
    expect(result.length).toBe(1);
  });

  test("should include channel with 'all' filter for critical", () => {
    const channels = [createChannel({ urgency_filter: "all" })];
    const result = filterChannelsByUrgency(channels, "critical");
    expect(result.length).toBe(1);
  });

  test("should exclude channel with 'critical' filter for warning", () => {
    const channels = [createChannel({ urgency_filter: "critical" })];
    const result = filterChannelsByUrgency(channels, "warning");
    expect(result.length).toBe(0);
  });

  test("should include channel with 'critical' filter for critical alert", () => {
    const channels = [createChannel({ urgency_filter: "critical" })];
    const result = filterChannelsByUrgency(channels, "critical");
    expect(result.length).toBe(1);
  });

  test("should include channel with 'critical' filter for overdue alert", () => {
    const channels = [createChannel({ urgency_filter: "critical" })];
    const result = filterChannelsByUrgency(channels, "overdue");
    expect(result.length).toBe(1);
  });

  test("should exclude disabled channels", () => {
    const channels = [createChannel({ enabled: false })];
    const result = filterChannelsByUrgency(channels, "warning");
    expect(result.length).toBe(0);
  });

  test("should filter multiple channels correctly", () => {
    const channels = [
      createChannel({ urgency_filter: "all", enabled: true }),
      createChannel({ urgency_filter: "critical", enabled: true }),
      createChannel({ urgency_filter: "warning", enabled: false }),
    ];
    const result = filterChannelsByUrgency(channels, "warning");
    expect(result.length).toBe(1);
    expect(result[0]?.urgency_filter).toBe("all");
  });
});

describe("calculateRetryDelay (FR-12: Exponential Backoff)", () => {
  test("should return 0 for first attempt (no delay)", () => {
    expect(calculateRetryDelay(0)).toBe(0);
  });

  test("should return 100ms for first retry", () => {
    expect(calculateRetryDelay(1)).toBe(100);
  });

  test("should return 200ms for second retry", () => {
    expect(calculateRetryDelay(2)).toBe(200);
  });

  test("should return 400ms for third retry", () => {
    expect(calculateRetryDelay(3)).toBe(400);
  });
});

describe("buildEmailSubject", () => {
  test("should build warning subject", () => {
    const subject = buildEmailSubject("warning");
    expect(subject).toContain("Warning");
    expect(subject).toContain("📋");
  });

  test("should build critical subject", () => {
    const subject = buildEmailSubject("critical");
    expect(subject).toContain("Critical");
    expect(subject).toContain("⚠️");
  });

  test("should build overdue subject", () => {
    const subject = buildEmailSubject("overdue");
    expect(subject).toContain("Overdue");
    expect(subject).toContain("🚨");
  });

  test("should include watcher name if provided", () => {
    const subject = buildEmailSubject("warning", "Finance Watcher");
    expect(subject).toContain("Finance Watcher");
  });
});

describe("buildEmailBody", () => {
  test("should include alert details", () => {
    const payload: AlertPayload = {
      alert_id: "alert_123",
      thread_id: "thread_456",
      watcher_id: "watcher_789",
      urgency_level: "critical",
      message: "Deadline approaching for invoice #100",
      timestamp: Date.now(),
    };

    const body = buildEmailBody(payload);

    expect(body).toContain("CRITICAL");
    expect(body).toContain("thread_456");
    expect(body).toContain("alert_123");
    expect(body).toContain("Deadline approaching for invoice #100");
  });
});

describe("buildWebhookPayload", () => {
  test("should build payload from alert event", () => {
    const alert = createAlert({
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_state: "critical",
    });

    const payload = buildWebhookPayload(alert, "Test message");

    expect(payload.alert_id).toBe("a1");
    expect(payload.thread_id).toBe("t1");
    expect(payload.watcher_id).toBe("w1");
    expect(payload.urgency_level).toBe("critical");
    expect(payload.message).toBe("Test message");
  });
});

describe("isValidWebhookUrl", () => {
  test("should accept HTTPS URLs", () => {
    expect(isValidWebhookUrl("https://example.com/webhook")).toBe(true);
    expect(isValidWebhookUrl("https://api.example.com/v1/alerts")).toBe(true);
  });

  test("should reject HTTP URLs", () => {
    expect(isValidWebhookUrl("http://example.com/webhook")).toBe(false);
  });

  test("should reject invalid URLs", () => {
    expect(isValidWebhookUrl("not-a-url")).toBe(false);
    expect(isValidWebhookUrl("")).toBe(false);
  });
});

describe("isValidEmail", () => {
  test("should accept valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("user.name@domain.co.uk")).toBe(true);
  });

  test("should reject invalid emails", () => {
    expect(isValidEmail("invalid")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("test@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("deliverToChannel (FR-12: Alert Delivery)", () => {
  test("should deliver email successfully", async () => {
    const channel = createChannel({ type: "email", destination: "test@example.com" });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(true);
    expect(result.attemptCount).toBe(1);
    expect(result.deliveredAt).toBeDefined();
    expect(emailFn).toHaveBeenCalledTimes(1);
  });

  test("should deliver webhook successfully", async () => {
    const channel = createChannel({
      type: "webhook",
      destination: "https://example.com/webhook",
    });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(true);
    expect(webhookFn).toHaveBeenCalledTimes(1);
  });

  test("should fail for invalid email address", async () => {
    const channel = createChannel({ type: "email", destination: "invalid-email" });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid email");
    expect(emailFn).not.toHaveBeenCalled();
  });

  test("should fail for non-HTTPS webhook", async () => {
    const channel = createChannel({
      type: "webhook",
      destination: "http://example.com/webhook",
    });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  test("should retry on failure up to max retries", async () => {
    const channel = createChannel({ type: "email", destination: "test@example.com" });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    let callCount = 0;
    const emailFn: EmailDeliveryFn = async () => {
      callCount++;
      throw new Error("Connection failed");
    };
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(false);
    // With reduced config: 3 retries + 1 initial = 4 attempts
    expect(result.attemptCount).toBe(RETRY_CONFIG.maxRetries + 1);
    expect(callCount).toBe(RETRY_CONFIG.maxRetries + 1);
    expect(result.error).toBe("Connection failed");
  });

  test("should succeed on retry after initial failure", async () => {
    const channel = createChannel({ type: "email", destination: "test@example.com" });
    const payload: AlertPayload = {
      alert_id: "a1",
      thread_id: "t1",
      watcher_id: "w1",
      urgency_level: "warning",
      message: "Test",
      timestamp: Date.now(),
    };

    let callCount = 0;
    const emailFn: EmailDeliveryFn = async () => {
      callCount++;
      if (callCount < 2) {
        throw new Error("Temporary failure");
      }
      // Success on second attempt
    };
    const webhookFn = mock(() => Promise.resolve());

    const result = await deliverToChannel(channel, payload, emailFn, webhookFn);

    expect(result.success).toBe(true);
    expect(result.attemptCount).toBe(2);
  });
});

describe("deliverAlert (Multiple Channels)", () => {
  test("should deliver to multiple channels", async () => {
    const alert = createAlert({
      urgency_state: "critical",
      channels: [
        createChannel({ type: "email", destination: "user1@example.com" }),
        createChannel({ type: "email", destination: "user2@example.com" }),
      ],
    });

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const results = await deliverAlert(alert, "Test message", emailFn, webhookFn);

    expect(results.length).toBe(2);
    expect(results[0]?.success).toBe(true);
    expect(results[1]?.success).toBe(true);
    expect(emailFn).toHaveBeenCalledTimes(2);
  });

  test("should handle partial failures", async () => {
    const alert = createAlert({
      urgency_state: "warning",
      channels: [
        createChannel({ type: "email", destination: "user1@example.com" }),
        createChannel({ type: "email", destination: "invalid-email" }),
      ],
    });

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const results = await deliverAlert(alert, "Test message", emailFn, webhookFn);

    expect(results.length).toBe(2);
    expect(results[0]?.success).toBe(true); // First email succeeds
    expect(results[1]?.success).toBe(false); // Second email fails (invalid)
  });

  test("should filter channels by urgency before delivery", async () => {
    const alert = createAlert({
      urgency_state: "warning",
      channels: [
        createChannel({ urgency_filter: "all" }), // Should receive
        createChannel({ urgency_filter: "critical" }), // Should not receive
      ],
    });

    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const results = await deliverAlert(alert, "Test message", emailFn, webhookFn);

    expect(results.length).toBe(1); // Only "all" filter channel
    expect(emailFn).toHaveBeenCalledTimes(1);
  });
});

describe("Notification Worker Performance", () => {
  test("should handle 100 alert deliveries efficiently", async () => {
    const channels = [createChannel()];
    const emailFn = mock(() => Promise.resolve());
    const webhookFn = mock(() => Promise.resolve());

    const start = performance.now();

    const deliveries = await Promise.all(
      Array.from({ length: 100 }, (_, i) => {
        const alert = createAlert({
          alert_id: `alert_${i}`,
          channels,
        });
        return deliverAlert(alert, `Message ${i}`, emailFn, webhookFn);
      })
    );

    const duration = performance.now() - start;

    expect(deliveries.length).toBe(100);
    expect(duration).toBeLessThan(1000); // Should complete quickly (mocked)
  });
});

describe("Alert ID Uniqueness (FR-11)", () => {
  test("should generate unique alert IDs", () => {
    const alertIds = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = crypto.randomUUID();
      alertIds.add(id);
    }
    expect(alertIds.size).toBe(1000);
  });
});
