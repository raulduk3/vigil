/**
 * Alert Delivery Worker
 *
 * Processes ALERT_QUEUED events and delivers notifications.
 * Emits ALERT_SENT or ALERT_FAILED events.
 */

import { getEventStore } from "../events/store";
import { queryMany, queryOne } from "../db/client";
import { logger } from "../logger";
import type {
    AlertSentEvent,
    AlertFailedEvent,
    VigilEvent,
    NotificationChannel,
} from "../events/types";
import {
    silenceAlertTemplate,
    silenceAlertSubject,
    type SilenceAlertData,
} from "./templates";

// ============================================================================
// Configuration
// ============================================================================

const WORKER_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_RETRIES = 3;

let workerInterval: Timer | null = null;

// ============================================================================
// Worker Lifecycle
// ============================================================================

export function startAlertWorker(): void {
    if (workerInterval) {
        logger.warn("Alert worker already running");
        return;
    }

    logger.info("Starting alert delivery worker", {
        intervalMs: WORKER_INTERVAL_MS,
    });

    // Run immediately
    processQueuedAlerts().catch((err) =>
        logger.error("Alert processing failed", { error: err })
    );

    // Then run on interval
    workerInterval = setInterval(() => {
        processQueuedAlerts().catch((err) =>
            logger.error("Alert processing failed", { error: err })
        );
    }, WORKER_INTERVAL_MS);
}

export function stopAlertWorker(): void {
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
        logger.info("Alert worker stopped");
    }
}

// ============================================================================
// Alert Processing
// ============================================================================

interface QueuedAlert {
    event_id: string;
    watcher_id: string;
    timestamp: number;
    alert_id: string;
    thread_id: string;
    channels: readonly NotificationChannel[];
}

async function processQueuedAlerts(): Promise<void> {
    // Find unprocessed ALERT_QUEUED events
    const queuedAlerts = await findUnprocessedAlerts();

    if (queuedAlerts.length === 0) {
        return;
    }

    logger.debug("Processing queued alerts", { count: queuedAlerts.length });

    for (const alert of queuedAlerts) {
        try {
            await processAlert(alert);
        } catch (error) {
            logger.error("Failed to process alert", {
                alertId: alert.alert_id,
                error,
            });
        }
    }
}

async function findUnprocessedAlerts(): Promise<QueuedAlert[]> {
    // Query for ALERT_QUEUED events that don't have corresponding ALERT_SENT/ALERT_FAILED
    const result = await queryMany<{
        event_id: string;
        watcher_id: string;
        timestamp: string;
        payload: {
            alert_id: string;
            thread_id: string;
            channels: NotificationChannel[];
        };
    }>(
        `
        SELECT e.event_id, e.watcher_id, e.timestamp, e.payload
        FROM events e
        WHERE e.type = 'ALERT_QUEUED'
        AND NOT EXISTS (
            SELECT 1 FROM events e2
            WHERE e2.type IN ('ALERT_SENT', 'ALERT_FAILED')
            AND e2.payload->>'alert_id' = e.payload->>'alert_id'
            AND (
                e2.type = 'ALERT_SENT'
                OR (e2.type = 'ALERT_FAILED' AND (e2.payload->>'attempt')::int >= $1)
            )
        )
        ORDER BY e.timestamp ASC
        LIMIT 100
    `,
        [MAX_RETRIES]
    );

    return result.map((row) => ({
        event_id: row.event_id,
        watcher_id: row.watcher_id,
        timestamp: parseInt(row.timestamp, 10),
        alert_id: row.payload.alert_id,
        thread_id: row.payload.thread_id,
        channels: row.payload.channels,
    }));
}

async function processAlert(alert: QueuedAlert): Promise<void> {
    const eventStore = getEventStore();
    const eventsToEmit: VigilEvent[] = [];

    // Get watcher and thread info for email content
    const watcherInfo = await queryOne<{
        name: string;
        account_id: string;
    }>(
        "SELECT name, account_id FROM watcher_projections WHERE watcher_id = $1",
        [alert.watcher_id]
    );

    const threadInfo = await queryOne<{
        normalized_subject: string;
        original_sender: string;
        last_activity_at: string;
    }>(
        "SELECT normalized_subject, original_sender, last_activity_at FROM thread_projections WHERE thread_id = $1",
        [alert.thread_id]
    );

    // Get silence info from the original event
    const silenceEvent = await queryOne<{
        payload: {
            hours_silent: number;
            threshold_hours: number;
            last_activity_at: number;
        };
    }>(
        `SELECT payload FROM events
         WHERE type = 'SILENCE_THRESHOLD_EXCEEDED'
         AND payload->>'thread_id' = $1
         ORDER BY timestamp DESC LIMIT 1`,
        [alert.thread_id]
    );

    // Get current retry count
    const failedAttempts = await queryOne<{ attempt_count: string }>(
        `SELECT COUNT(*) as attempt_count FROM events
         WHERE type = 'ALERT_FAILED'
         AND payload->>'alert_id' = $1`,
        [alert.alert_id]
    );
    const currentAttempt =
        parseInt(failedAttempts?.attempt_count ?? "0", 10) + 1;

    const dashboardUrl = `${process.env.FRONTEND_URL ?? "https://app.vigil.run"}/watchers/${alert.watcher_id}/threads/${alert.thread_id}`;

    const alertData: SilenceAlertData = {
        watcherName: watcherInfo?.name ?? "Unknown Watcher",
        threadId: alert.thread_id,
        threadSubject: threadInfo?.normalized_subject,
        originalSender: threadInfo?.original_sender,
        hoursSilent: silenceEvent?.payload.hours_silent ?? 0,
        thresholdHours: silenceEvent?.payload.threshold_hours ?? 72,
        lastActivityAt: silenceEvent?.payload.last_activity_at ?? Date.now(),
        dashboardUrl,
    };

    // Process each enabled channel
    for (const channel of alert.channels) {
        if (!channel.enabled) continue;

        const success = await deliverToChannel(channel, alertData);
        const now = Date.now();

        if (success) {
            const sentEvent: AlertSentEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: alert.watcher_id,
                type: "ALERT_SENT",
                alert_id: alert.alert_id,
                channel_type: channel.type,
                destination: channel.destination,
                sent_at: now,
            };
            eventsToEmit.push(sentEvent);

            logger.info("Alert delivered", {
                alertId: alert.alert_id,
                channel: channel.type,
                destination: channel.destination,
            });
        } else {
            const failedEvent: AlertFailedEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: alert.watcher_id,
                type: "ALERT_FAILED",
                alert_id: alert.alert_id,
                channel_type: channel.type,
                destination: channel.destination,
                error: "Delivery failed",
                attempt: currentAttempt,
            };
            eventsToEmit.push(failedEvent);

            logger.warn("Alert delivery failed", {
                alertId: alert.alert_id,
                channel: channel.type,
                destination: channel.destination,
                attempt: currentAttempt,
                maxRetries: MAX_RETRIES,
            });
        }
    }

    // Persist events
    if (eventsToEmit.length > 0) {
        await eventStore.appendBatch(eventsToEmit);
    }
}

// ============================================================================
// Channel Delivery
// ============================================================================

async function deliverToChannel(
    channel: NotificationChannel,
    data: SilenceAlertData
): Promise<boolean> {
    switch (channel.type) {
        case "email":
            return sendEmail(channel.destination, data);
        case "webhook":
            return sendWebhook(channel.destination, data);
        default:
            logger.warn("Unknown channel type", { type: channel.type });
            return false;
    }
}

async function sendEmail(
    destination: string,
    data: SilenceAlertData
): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.error("RESEND_API_KEY not configured");
        return false;
    }

    const subject = silenceAlertSubject(data);
    const html = silenceAlertTemplate(data);

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                from:
                    process.env.RESEND_FROM_EMAIL ?? "Vigil <alerts@vigil.run>",
                to: [destination],
                subject,
                html,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            logger.error("Resend API error", {
                status: response.status,
                error,
            });
            return false;
        }

        const result = (await response.json()) as { id?: string };
        logger.debug("Email sent via Resend", {
            emailId: result.id,
            destination,
        });
        return true;
    } catch (error) {
        logger.error("Failed to send email", { error, destination });
        return false;
    }
}

async function sendWebhook(
    destination: string,
    data: SilenceAlertData
): Promise<boolean> {
    const payload = {
        event: "silence_threshold_exceeded",
        watcher_name: data.watcherName,
        thread_id: data.threadId,
        thread_subject: data.threadSubject,
        original_sender: data.originalSender,
        hours_silent: data.hoursSilent,
        threshold_hours: data.thresholdHours,
        last_activity_at: data.lastActivityAt,
        dashboard_url: data.dashboardUrl,
        timestamp: Date.now(),
    };

    const signature = await signPayload(JSON.stringify(payload));

    try {
        const response = await fetch(destination, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Vigil-Signature": signature,
                "X-Vigil-Event": "silence_threshold_exceeded",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            logger.error("Webhook delivery failed", {
                status: response.status,
                destination,
            });
            return false;
        }

        return true;
    } catch (error) {
        logger.error("Failed to send webhook", { error, destination });
        return false;
    }
}

async function signPayload(payload: string): Promise<string> {
    const secret = process.env.WEBHOOK_SIGNING_SECRET ?? "vigil-webhook-secret";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload)
    );
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// ============================================================================
// Manual Trigger (for testing)
// ============================================================================

export async function triggerAlertProcessing(): Promise<void> {
    await processQueuedAlerts();
}
