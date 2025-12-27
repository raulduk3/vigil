/**
 * Notification Worker
 *
 * Implements FR-12: Alert Delivery
 * Implements MR-NotificationWorker-1,2,3
 *
 * Polls for ALERT_QUEUED events and delivers notifications,
 * emitting ALERT_SENT or ALERT_FAILED events.
 */

import { randomUUID } from "crypto";
import type {
    VigilEvent,
    AlertQueuedEvent,
    AlertSentEvent,
    AlertFailedEvent,
    NotificationChannel,
} from "@/events/types";
import { getUnprocessedAlerts, appendEvent } from "@/db/event-store";
import {
    calculateBackoffDelay,
    MAX_RETRIES,
} from "@/worker/notification-worker";
import { getLogger } from "@/logging";

// ============================================================================
// Types
// ============================================================================

export interface NotificationWorkerConfig {
    poll_interval_ms: number;
    max_concurrent_deliveries: number;
    enabled: boolean;
}

export const DEFAULT_WORKER_CONFIG: NotificationWorkerConfig = {
    poll_interval_ms: 5000, // 5 seconds
    max_concurrent_deliveries: 10,
    enabled: true,
};

interface WorkerState {
    running: boolean;
    last_poll_time: number;
    alerts_processed: number;
    alerts_sent: number;
    alerts_failed: number;
    interval_handle: Timer | null;
}

// ============================================================================
// Worker State
// ============================================================================

let state: WorkerState = {
    running: false,
    last_poll_time: 0,
    alerts_processed: 0,
    alerts_sent: 0,
    alerts_failed: 0,
    interval_handle: null,
};

/**
 * Start the notification worker.
 */
export function startNotificationWorker(
    config: Partial<NotificationWorkerConfig> = {}
): void {
    const log = getLogger();
    const fullConfig = { ...DEFAULT_WORKER_CONFIG, ...config };

    if (state.running) {
        log.worker.warn("Notification worker already running");
        return;
    }

    if (!fullConfig.enabled) {
        log.worker.info("Notification worker disabled by configuration");
        return;
    }

    log.worker.info(
        "Notification worker starting",
        {},
        {
            poll_interval_ms: fullConfig.poll_interval_ms,
            max_concurrent_deliveries: fullConfig.max_concurrent_deliveries,
        }
    );

    state.running = true;
    state.interval_handle = setInterval(() => {
        runWorkerCycle(fullConfig).catch((error) => {
            log.worker.error(
                "Notification worker cycle error",
                {},
                {},
                error instanceof Error ? error : new Error(String(error))
            );
        });
    }, fullConfig.poll_interval_ms);

    // Run immediately
    runWorkerCycle(fullConfig).catch((error) => {
        log.worker.error(
            "Notification worker initial cycle error",
            {},
            {},
            error instanceof Error ? error : new Error(String(error))
        );
    });
}

/**
 * Stop the notification worker.
 */
export function stopNotificationWorker(): void {
    const log = getLogger();

    if (!state.running) {
        return;
    }

    log.worker.info(
        "Notification worker stopping",
        {},
        {
            alerts_processed: state.alerts_processed,
            alerts_sent: state.alerts_sent,
            alerts_failed: state.alerts_failed,
        }
    );

    if (state.interval_handle) {
        clearInterval(state.interval_handle);
        state.interval_handle = null;
    }

    state.running = false;
}

/**
 * Get worker health status.
 */
export function getNotificationWorkerHealth(): {
    status: "healthy" | "degraded" | "unhealthy";
    running: boolean;
    last_poll: number;
    alerts_processed: number;
    alerts_sent: number;
    alerts_failed: number;
} {
    const now = Date.now();
    const pollAge = now - state.last_poll_time;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (!state.running) {
        status = "unhealthy";
    } else if (pollAge > 60000) {
        // No poll in 1 minute
        status = "degraded";
    }

    return {
        status,
        running: state.running,
        last_poll: state.last_poll_time,
        alerts_processed: state.alerts_processed,
        alerts_sent: state.alerts_sent,
        alerts_failed: state.alerts_failed,
    };
}

// ============================================================================
// Worker Cycle
// ============================================================================

/**
 * Run a single worker cycle.
 * Polls for unprocessed alerts and delivers them.
 */
async function runWorkerCycle(config: NotificationWorkerConfig): Promise<void> {
    const log = getLogger();
    const now = Date.now();

    try {
        // Get unprocessed alerts
        const alerts = await getUnprocessedAlerts();

        if (alerts.length === 0) {
            state.last_poll_time = now;
            return;
        }

        log.worker.debug(
            "Processing alerts",
            {},
            {
                total_alerts: alerts.length,
                max_concurrent: config.max_concurrent_deliveries,
            }
        );

        // Process alerts up to concurrency limit
        const toProcess = alerts.slice(0, config.max_concurrent_deliveries);

        // Process in parallel
        await Promise.all(
            toProcess.map((alert) => processAlert(alert as AlertQueuedEvent))
        );

        state.last_poll_time = now;

        log.worker.debug(
            "Worker cycle complete",
            {},
            {
                processed: toProcess.length,
                total_processed: state.alerts_processed,
            }
        );
    } catch (error) {
        log.worker.error(
            "Worker cycle failed",
            {},
            {
                cycle_timestamp: now,
            },
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    }
}

/**
 * Process a single alert - deliver to all channels.
 */
async function processAlert(alert: AlertQueuedEvent): Promise<void> {
    state.alerts_processed++;

    const channels = alert.channels || [];

    // Deliver to each channel
    for (const channel of channels) {
        await deliverAlertToChannel(alert, channel);
    }
}

/**
 * Deliver alert to a single channel with retry logic.
 */
async function deliverAlertToChannel(
    alert: AlertQueuedEvent,
    channel: NotificationChannel
): Promise<void> {
    const log = getLogger();
    const ctx = {
        thread_id: alert.thread_id,
    };

    // Format the alert content
    const alertContent = {
        alert_id: alert.alert_id,
        thread_id: alert.thread_id,
        urgency: alert.urgency_state,
        timestamp: alert.timestamp,
    };

    // Attempt delivery with retries
    let lastError: Error | null = null;
    let attempts = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        attempts++;

        try {
            // Mock delivery for now
            const success = await mockDelivery(channel, alertContent);

            if (success) {
                // Emit ALERT_SENT event
                const sentEvent: AlertSentEvent = {
                    event_id: randomUUID(),
                    timestamp: Date.now(),
                    type: "ALERT_SENT",
                    alert_id: alert.alert_id,
                    channel,
                    sent_at: Date.now(),
                };

                await appendEvent(sentEvent as VigilEvent);
                state.alerts_sent++;

                log.delivery.info("Alert sent", ctx, {
                    alert_id: alert.alert_id,
                    channel_type: channel.type,
                    channel_destination: channel.destination,
                    attempts,
                });
                return;
            }
        } catch (error) {
            lastError =
                error instanceof Error ? error : new Error(String(error));
            log.delivery.warn("Delivery attempt failed", ctx, {
                alert_id: alert.alert_id,
                attempt: attempt + 1,
                max_retries: MAX_RETRIES,
                channel_type: channel.type,
                error_message: lastError.message,
            });

            // Wait before retry (exponential backoff)
            if (attempt < MAX_RETRIES) {
                const delay = calculateBackoffDelay(attempt);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted - emit ALERT_FAILED event
    const failedEvent: AlertFailedEvent = {
        event_id: randomUUID(),
        timestamp: Date.now(),
        type: "ALERT_FAILED",
        alert_id: alert.alert_id,
        channel,
        error_message:
            lastError?.message || "Delivery failed after max retries",
        failed_at: Date.now(),
    };

    await appendEvent(failedEvent as VigilEvent);
    state.alerts_failed++;

    log.delivery.error(
        "Alert delivery failed",
        ctx,
        {
            alert_id: alert.alert_id,
            channel_type: channel.type,
            channel_destination: channel.destination,
            total_attempts: attempts,
        },
        lastError || new Error("Delivery failed after max retries")
    );
}

// ============================================================================
// Mock Delivery (Replace with real implementations)
// ============================================================================

/**
 * Mock delivery function - replace with real SMTP/webhook calls.
 */
async function mockDelivery(
    channel: NotificationChannel,
    _content: Record<string, unknown>
): Promise<boolean> {
    const log = getLogger();

    // Simulate network latency
    await sleep(100);

    // Simulate 95% success rate
    if (Math.random() > 0.05) {
        log.delivery.debug(
            "Mock delivery successful",
            {},
            {
                channel_type: channel.type,
                channel_destination: channel.destination,
            }
        );
        return true;
    }

    throw new Error("Mock delivery failure");
}

// TODO: Implement real delivery functions when integrating with SMTP/webhooks
// async function deliverEmail(destination, subject, body) { ... }
// async function deliverWebhook(url, payload) { ... }

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Manual Processing
// ============================================================================

/**
 * Manually process a specific alert.
 * Used for testing or retrying failed alerts.
 */
export async function processAlertById(alertId: string): Promise<void> {
    // Find the alert event
    const alerts = await getUnprocessedAlerts();
    const alert = alerts.find(
        (a) => (a as AlertQueuedEvent).alert_id === alertId
    ) as AlertQueuedEvent | undefined;

    if (!alert) {
        throw new Error(`Alert ${alertId} not found or already processed`);
    }

    await processAlert(alert);
}

/**
 * Get count of unprocessed alerts.
 */
export async function getUnprocessedAlertCount(): Promise<number> {
    const alerts = await getUnprocessedAlerts();
    return alerts.length;
}
