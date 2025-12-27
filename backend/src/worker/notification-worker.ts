/**
 * Notification Delivery Utilities
 *
 * Implements delivery mechanics for FR-12: Alert Delivery
 * Provides channel-specific delivery and formatting functions.
 */

import type { NotificationChannel } from "@/events/types";

// ============================================================================
// Constants
// ============================================================================

export const MAX_RETRIES = 3;
export const BASE_BACKOFF_MS = 1000;

// ============================================================================
// Delivery Functions
// ============================================================================

/**
 * Calculate exponential backoff delay for retries.
 */
export function calculateBackoffDelay(attempt: number): number {
    return BASE_BACKOFF_MS * Math.pow(2, attempt);
}

/**
 * Deliver notification to a specific channel.
 * Returns true on success, false on failure.
 *
 * This is a mock implementation that simulates delivery.
 * In production, this would integrate with actual delivery services.
 */
export async function deliverToChannel(
    channel: NotificationChannel,
    content: {
        subject: string;
        body: string;
        urgency: string;
        metadata?: Record<string, unknown>;
    }
): Promise<{ success: boolean; error?: string }> {
    // Mock implementation - simulates 95% success rate
    const success = Math.random() > 0.05;

    // Simulate network latency
    await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100)
    );

    if (!success) {
        return {
            success: false,
            error: `Simulated delivery failure to ${channel.type}:${channel.destination}`,
        };
    }

    // Log successful delivery (in production, actually send)
    console.log(
        `[MOCK] Delivered ${content.urgency} alert via ${channel.type} to ${channel.destination}`
    );

    return { success: true };
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format alert content for email delivery.
 */
export function formatEmailAlert(alert: {
    thread_id: string;
    urgency_state: string;
    watcher_id: string;
}): { subject: string; body: string } {
    const urgencyLabel = alert.urgency_state.toUpperCase();

    return {
        subject: `[${urgencyLabel}] Vigil Alert - Thread ${alert.thread_id.slice(0, 8)}`,
        body: `
Vigil Alert Notification

Urgency Level: ${urgencyLabel}
Thread ID: ${alert.thread_id}
Watcher ID: ${alert.watcher_id}

This is an automated alert from Vigil monitoring system.

---
Action may be required based on the urgency level.
    `.trim(),
    };
}

/**
 * Format alert content for webhook delivery.
 */
export function formatWebhookPayload(alert: {
    alert_id: string;
    thread_id: string;
    urgency_state: string;
    watcher_id: string;
    reminder_id: string;
}): Record<string, unknown> {
    return {
        event_type: "vigil.alert",
        alert_id: alert.alert_id,
        thread_id: alert.thread_id,
        watcher_id: alert.watcher_id,
        reminder_id: alert.reminder_id,
        urgency: alert.urgency_state,
        timestamp: new Date().toISOString(),
        version: "1.0",
    };
}

/**
 * Format alert content for SMS delivery.
 */
export function formatSmsAlert(alert: {
    thread_id: string;
    urgency_state: string;
}): string {
    return `[Vigil ${alert.urgency_state.toUpperCase()}] Thread ${alert.thread_id.slice(0, 8)} requires attention`;
}
