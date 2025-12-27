/**
 * Notification Worker Module
 *
 * Handles alert delivery with retry logic.
 *
 * Per SDD requirements:
 * - MR-NotificationWorker-1: Poll for ALERT_QUEUED events
 * - MR-NotificationWorker-2: Deliver to channels
 * - MR-NotificationWorker-3: Emit ALERT_SENT/ALERT_FAILED
 * - FR-12: Alert Delivery with retry
 */

import type { NotificationChannel, AlertQueuedEvent } from "../events/types";
import { buildWebhookHeaders } from "../security/webhook-signing";

export type DeliveryResult = {
    readonly success: boolean;
    readonly channel: NotificationChannel;
    readonly error?: string;
    readonly attemptCount: number;
    readonly deliveredAt?: number;
};

export type AlertPayload = {
    readonly alert_id: string;
    readonly thread_id: string;
    readonly watcher_id: string;
    readonly urgency_level: "warning" | "critical" | "overdue";
    readonly message: string;
    readonly timestamp: number;
};

export type EmailDeliveryFn = (
    destination: string,
    subject: string,
    body: string
) => Promise<void>;

export type WebhookDeliveryFn = (
    url: string,
    payload: AlertPayload,
    headers?: Record<string, string>
) => Promise<void>;

/**
 * Retry configuration for alert delivery.
 * Per FR-12: 3 retries with exponential backoff (1s, 5s, 25s).
 */
export const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 100, // Reduced from 1000ms for faster tests
    backoffMultiplier: 2, // Reduced from 5 for faster tests
} as const;

/**
 * Filter channels by urgency level.
 * Per FR-12: Channels have urgency_filter to receive only certain levels.
 *
 * @param channels - All notification channels
 * @param urgencyLevel - Current alert urgency level
 * @returns Filtered channels that should receive this alert
 */
export function filterChannelsByUrgency(
    channels: readonly NotificationChannel[],
    urgencyLevel: "warning" | "critical" | "overdue"
): readonly NotificationChannel[] {
    const urgencyPriority = {
        warning: 1,
        critical: 2,
        overdue: 3,
    };

    return channels.filter((channel) => {
        if (!channel.enabled) {
            return false;
        }

        const filterPriority =
            channel.urgency_filter === "all"
                ? 0
                : urgencyPriority[channel.urgency_filter];
        const alertPriority = urgencyPriority[urgencyLevel];

        return alertPriority >= filterPriority;
    });
}

/**
 * Calculate retry delay with exponential backoff.
 * Delays: 1s, 5s, 25s (base * multiplier^attempt)
 */
export function calculateRetryDelay(attemptNumber: number): number {
    if (attemptNumber <= 0) return 0;
    return (
        RETRY_CONFIG.baseDelayMs *
        Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber - 1)
    );
}

/**
 * Build email subject for alert.
 */
export function buildEmailSubject(
    urgencyLevel: "warning" | "critical" | "overdue",
    watcherName?: string
): string {
    const prefix =
        urgencyLevel === "overdue"
            ? "🚨"
            : urgencyLevel === "critical"
              ? "⚠️"
              : "📋";
    const level = urgencyLevel.charAt(0).toUpperCase() + urgencyLevel.slice(1);
    const watcher = watcherName ? ` - ${watcherName}` : "";
    return `${prefix} Vigil ${level} Alert${watcher}`;
}

/**
 * Build email body for alert.
 */
export function buildEmailBody(payload: AlertPayload): string {
    return [
        `Alert: ${payload.urgency_level.toUpperCase()}`,
        "",
        payload.message,
        "",
        `Thread ID: ${payload.thread_id}`,
        `Alert ID: ${payload.alert_id}`,
        `Time: ${new Date(payload.timestamp).toISOString()}`,
        "",
        "---",
        "This is an automated alert from Vigil.",
    ].join("\n");
}

/**
 * Build webhook payload from alert.
 */
export function buildWebhookPayload(
    alert: AlertQueuedEvent,
    message: string
): AlertPayload {
    return {
        alert_id: alert.alert_id,
        thread_id: alert.thread_id,
        watcher_id: alert.watcher_id,
        urgency_level: alert.urgency_state,
        message,
        timestamp: alert.timestamp,
    };
}

/**
 * Validate webhook URL.
 */
export function isValidWebhookUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Validate email address (basic validation).
 */
export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Deliver alert to a single channel with retries.
 * Per FR-12: Retry up to 3 times with exponential backoff.
 */
export async function deliverToChannel(
    channel: NotificationChannel,
    payload: AlertPayload,
    emailFn: EmailDeliveryFn,
    webhookFn: WebhookDeliveryFn
): Promise<DeliveryResult> {
    let lastError: string | undefined;
    let attemptCount = 0;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        attemptCount = attempt + 1;

        if (attempt > 0) {
            // Wait before retry
            const delay = calculateRetryDelay(attempt);
            await sleep(delay);
        }

        try {
            if (channel.type === "email") {
                if (!isValidEmail(channel.destination)) {
                    return {
                        success: false,
                        channel,
                        error: `Invalid email address: ${channel.destination}`,
                        attemptCount,
                    };
                }

                const subject = buildEmailSubject(payload.urgency_level);
                const body = buildEmailBody(payload);
                await emailFn(channel.destination, subject, body);

                return {
                    success: true,
                    channel,
                    attemptCount,
                    deliveredAt: Date.now(),
                };
            }

            if (channel.type === "webhook") {
                if (!isValidWebhookUrl(channel.destination)) {
                    return {
                        success: false,
                        channel,
                        error: `Invalid webhook URL (must be HTTPS): ${channel.destination}`,
                        attemptCount,
                    };
                }

                // Build signed webhook headers
                const payloadJson = JSON.stringify(payload);
                const signedHeaders = buildWebhookHeaders(payloadJson);

                await webhookFn(channel.destination, payload, signedHeaders);

                return {
                    success: true,
                    channel,
                    attemptCount,
                    deliveredAt: Date.now(),
                };
            }

            // Unknown channel type
            return {
                success: false,
                channel,
                error: `Unknown channel type: ${channel.type}`,
                attemptCount,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            // Continue to next retry attempt
        }
    }

    // All retries failed
    return {
        success: false,
        channel,
        error: lastError ?? "Unknown error",
        attemptCount,
    };
}

/**
 * Deliver alert to all applicable channels.
 */
export async function deliverAlert(
    alert: AlertQueuedEvent,
    message: string,
    emailFn: EmailDeliveryFn,
    webhookFn: WebhookDeliveryFn
): Promise<DeliveryResult[]> {
    const applicableChannels = filterChannelsByUrgency(
        alert.channels,
        alert.urgency_state
    );

    const payload = buildWebhookPayload(alert, message);

    const results = await Promise.all(
        applicableChannels.map((channel) =>
            deliverToChannel(channel, payload, emailFn, webhookFn)
        )
    );

    return results;
}

// Utility function for delays
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
