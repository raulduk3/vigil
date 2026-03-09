/**
 * Notification Delivery
 *
 * Email (Resend) and webhook delivery for alerts.
 * Uses templates from ./templates.ts for email formatting.
 */

import { logger } from "../logger";
import type { NotificationChannel } from "../agent/schema";
import {
    silenceAlertTemplate,
    silenceAlertSubject,
    weeklyReportTemplate,
    weeklyReportSubject,
    type SilenceAlertData,
    type WeeklyReportData,
} from "./templates";

// ============================================================================
// Types
// ============================================================================

export interface AlertContent {
    watcherName: string;
    threadId: string;
    threadSubject?: string;
    originalSender?: string;
    hoursSilent: number;
    thresholdHours: number;
    lastActivityAt: number;
    dashboardUrl: string;
}

// ============================================================================
// Email Delivery (Resend)
// ============================================================================

async function sendViaResend(
    destination: string,
    subject: string,
    html: string
): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.error("RESEND_API_KEY not configured");
        return false;
    }

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
        logger.debug("Email sent", { emailId: result.id, destination });
        return true;
    } catch (error) {
        logger.error("Failed to send email", { error, destination });
        return false;
    }
}

export async function sendAlertEmail(
    destination: string,
    content: AlertContent
): Promise<boolean> {
    const data: SilenceAlertData = {
        watcherName: content.watcherName,
        threadId: content.threadId,
        threadSubject: content.threadSubject,
        originalSender: content.originalSender,
        hoursSilent: content.hoursSilent,
        thresholdHours: content.thresholdHours,
        lastActivityAt: content.lastActivityAt,
        dashboardUrl: content.dashboardUrl,
    };

    const subject = silenceAlertSubject(data);
    const html = silenceAlertTemplate(data);

    return sendViaResend(destination, subject, html);
}

export async function sendWeeklyReportEmail(
    destination: string,
    data: WeeklyReportData
): Promise<boolean> {
    const subject = weeklyReportSubject(data);
    const html = weeklyReportTemplate(data);

    return sendViaResend(destination, subject, html);
}

// ============================================================================
// Webhook Delivery
// ============================================================================

export async function sendAlertWebhook(
    destination: string,
    content: AlertContent
): Promise<boolean> {
    const payload = {
        event: "silence_threshold_exceeded",
        watcher_name: content.watcherName,
        thread_id: content.threadId,
        thread_subject: content.threadSubject,
        original_sender: content.originalSender,
        hours_silent: content.hoursSilent,
        threshold_hours: content.thresholdHours,
        last_activity_at: content.lastActivityAt,
        dashboard_url: content.dashboardUrl,
        timestamp: Date.now(),
    };

    const signature = await signWebhook(JSON.stringify(payload));

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

async function signWebhook(payload: string): Promise<string> {
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
// Unified Delivery
// ============================================================================

export async function deliverAlert(
    channel: NotificationChannel,
    content: AlertContent
): Promise<boolean> {
    if (!channel.enabled) {
        return false;
    }

    switch (channel.type) {
        case "email":
            return sendAlertEmail(channel.destination, content);
        case "webhook":
            return sendAlertWebhook(channel.destination, content);
        default:
            logger.warn("Unknown channel type", { type: channel.type });
            return false;
    }
}
