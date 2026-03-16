/**
 * Billing Notifications — Trial expiry, payment reminders
 *
 * Sends email notifications when accounts hit trial limits or need billing attention.
 */

import { queryOne, run } from "../db/client";
import { FREE_TRIAL_EMAILS } from "./types";
import { logger } from "../logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://vigil.run";

interface AccountInfo {
    id: string;
    email: string;
    trial_emails_used: number;
    has_payment_method: number;
    trial_notified_at: string | null;
}

/**
 * Check if a trial warning or expiry notification should be sent.
 * Call after incrementing trial usage.
 */
export async function checkTrialNotifications(accountId: string): Promise<void> {
    const account = queryOne<AccountInfo>(
        `SELECT id, email, trial_emails_used, has_payment_method, trial_notified_at
         FROM accounts WHERE id = ?`,
        [accountId]
    );

    if (!account || account.has_payment_method) return;

    const used = account.trial_emails_used;
    const threshold80 = Math.floor(FREE_TRIAL_EMAILS * 0.8); // 40 of 50

    // Send warning at 80% usage
    if (used === threshold80 && !account.trial_notified_at) {
        await sendTrialWarning(account.email, used, FREE_TRIAL_EMAILS);
        run(`UPDATE accounts SET trial_notified_at = CURRENT_TIMESTAMP WHERE id = ?`, [accountId]);
        return;
    }

    // Send expiry notice when trial is exhausted
    if (used >= FREE_TRIAL_EMAILS) {
        await sendTrialExpired(account.email, FREE_TRIAL_EMAILS);
        run(`UPDATE accounts SET trial_notified_at = CURRENT_TIMESTAMP WHERE id = ?`, [accountId]);
    }
}

/**
 * Send when account is rejected (trial exhausted, no payment method).
 * Debounced: only sends once per 24 hours per account.
 */
export async function sendTrialBlockedNotice(accountId: string): Promise<void> {
    const account = queryOne<AccountInfo>(
        `SELECT id, email, trial_emails_used, has_payment_method, trial_notified_at
         FROM accounts WHERE id = ?`,
        [accountId]
    );

    if (!account || account.has_payment_method) return;

    // Debounce: don't spam. Only send once per 24h.
    if (account.trial_notified_at) {
        const lastNotified = new Date(account.trial_notified_at).getTime();
        const hoursSince = (Date.now() - lastNotified) / (1000 * 60 * 60);
        if (hoursSince < 24) return;
    }

    await sendTrialExpired(account.email, FREE_TRIAL_EMAILS);
    run(`UPDATE accounts SET trial_notified_at = CURRENT_TIMESTAMP WHERE id = ?`, [accountId]);
}

// ============================================================================
// Email templates
// ============================================================================

async function sendTrialWarning(to: string, used: number, total: number): Promise<void> {
    const remaining = total - used;
    const html = buildEmail(
        "Your free trial is almost up",
        `<p style="font-size:15px;color:#111827;line-height:1.6;">
            You've used <strong>${used} of ${total}</strong> free emails on Vigil. 
            You have <strong>${remaining} emails remaining</strong> before your watchers pause.
        </p>
        <p style="font-size:15px;color:#111827;line-height:1.6;">
            Add a payment method to keep your watchers running. It takes 30 seconds and 
            billing is pure usage-based: <strong>~0.25¢ per email</strong> on the default model (actual AI cost + 5%). No subscriptions. No tiers.
        </p>
        <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/account/billing" 
               style="display:inline-block;padding:12px 32px;background:#0f766e;color:white;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
                Add Payment Method
            </a>
        </div>
        <p style="font-size:13px;color:#6b7280;line-height:1.5;">
            A typical month runs $0.40–$5 depending on email volume. Or bring your own API key 
            and pay nothing. You can manage billing anytime from your dashboard.
        </p>`
    );

    await sendViaResend(to, "Your Vigil free trial is almost up", html);
    logger.info("Sent trial warning email", { to, used, total });
}

async function sendTrialExpired(to: string, total: number): Promise<void> {
    const html = buildEmail(
        "Your free trial has ended",
        `<p style="font-size:15px;color:#111827;line-height:1.6;">
            You've used all <strong>${total} free emails</strong> on Vigil. 
            Your watchers are now <strong>paused</strong> and incoming emails are not being processed.
        </p>
        <p style="font-size:15px;color:#111827;line-height:1.6;">
            Add a payment method to resume. Billing is usage-based: <strong>~0.25¢ per email</strong> on the default model 
            (actual AI cost + 5%). No minimums, no commitments. Cancel anytime.
        </p>
        <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/account/billing" 
               style="display:inline-block;padding:12px 32px;background:#0f766e;color:white;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
                Add Payment Method →
            </a>
        </div>
        <p style="font-size:13px;color:#6b7280;line-height:1.5;">
            Once billing is active, your watchers will resume automatically on the next incoming email. 
            No data is lost — your threads, memories, and agent history are preserved.
        </p>`
    );

    await sendViaResend(to, "Your Vigil watchers are paused — add billing to resume", html);
    logger.info("Sent trial expired email", { to, total });
}

// ============================================================================
// Shared
// ============================================================================

function buildEmail(heading: string, body: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f9fafb;">
    <div style="background:white;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:20px 24px;color:white;">
            <h1 style="margin:0;font-size:18px;font-weight:700;">${heading}</h1>
        </div>
        <div style="padding:24px;">
            ${body}
        </div>
        <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
            Vigil · <a href="${APP_URL}" style="color:#9ca3af;">vigil.run</a>
        </div>
    </div>
</body>
</html>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn("RESEND_API_KEY not set, cannot send billing notification");
        return false;
    }

    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "alerts@vigil.run";
    const from = rawFrom.includes("<") ? rawFrom : `Vigil <${rawFrom}>`;

    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ from, to: [to], subject, html }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            logger.error("Billing notification send failed", { status: resp.status, err });
            return false;
        }
        return true;
    } catch (err) {
        logger.error("Billing notification error", { err });
        return false;
    }
}
