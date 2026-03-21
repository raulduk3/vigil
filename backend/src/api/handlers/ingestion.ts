/**
 * Email Ingestion Handlers — V2
 *
 * Cloudflare worker sends raw MIME email here via POST /api/ingest/:token
 * Also accepts JSON for direct API calls and testing.
 */

import type { Context } from "hono";
import PostalMime from "postal-mime";
import { queryOne, run } from "../../db/client";
import { ingestEmail } from "../../ingestion/orchestrator";
import { logger } from "../../logger";
// ============================================================================
// Forwarding Confirmation Detection
// ============================================================================

/**
 * Known forwarding confirmation senders/patterns.
 * When a user sets up email forwarding (Gmail, Outlook, Yahoo, etc.),
 * the provider sends a confirmation email to the forwarding address.
 * We detect these and relay them to the account owner so they can
 * complete the verification.
 */
const CONFIRMATION_PATTERNS = [
    // Gmail
    { from: /forwarding-noreply@google\.com/i, subject: /forwarding confirmation/i },
    { from: /noreply@google\.com/i, subject: /gmail forwarding/i },
    // Outlook / Microsoft
    { from: /no-reply@microsoft\.com/i, subject: /verify.*forwarding/i },
    { from: /postmaster@outlook\.com/i, subject: /forwarding/i },
    // Yahoo
    { from: /no-reply@yahoo\.com/i, subject: /forwarding/i },
    // iCloud
    { from: /noreply@apple\.com/i, subject: /forwarding/i },
    // Fastmail
    { from: /system@fastmail\.com/i, subject: /forwarding/i },
    // ProtonMail
    { from: /noreply@proton\.me/i, subject: /forwarding/i },
    // Generic catch: any email with "forwarding" + "confirm" in subject
    { from: /.*/i, subject: /confirm.*forwarding|forwarding.*confirm|verify.*forwarding|forwarding.*verif/i },
];

// Rate limit map: token → last relay timestamp
const confirmationRelayTimes = new Map<string, number>();


/**
 * Extract confirmation code from a forwarding confirmation email body.
 * Gmail: "Confirmation code: 123456789"
 * Outlook: typically a link, not a code
 */
function extractConfirmationCode(body: string, _from: string): { code: string; provider: string } | null {
    // Gmail confirmation code
    const gmailMatch = body.match(/[Cc]onfirmation\s+[Cc]ode[:\s]+([0-9]{6,12})/);
    if (gmailMatch) return { code: gmailMatch[1]!, provider: "gmail" };

    // Generic numeric code pattern (6-12 digits on their own line or after "code")
    const genericMatch = body.match(/(?:code|verify|confirm)[^0-9]*([0-9]{6,12})/i);
    if (genericMatch) return { code: genericMatch[1]!, provider: "unknown" };

    return null;
}

function isForwardingConfirmation(from: string, subject: string): boolean {
    return CONFIRMATION_PATTERNS.some(
        (p) => p.from.test(from) && p.subject.test(subject)
    );
}

/**
 * Relay a forwarding confirmation email to the watcher's account owner.
 * Returns true if relayed successfully.
 */
async function relayConfirmationEmail(
    accountEmail: string,
    originalFrom: string,
    _subject: string,
    body: string,
    watcherName: string
): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;

    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "alerts@vigil.run";
    const from = rawFrom.includes("<") ? rawFrom : `Vigil <${rawFrom}>`;

    // Preserve original body content (may contain confirmation links/codes)
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;background:#f1f5f9;">
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="height:4px;background:#0d9488;"></div>
    <div style="padding:20px 24px 12px;">
      <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#0d9488;background:#f0fdfa;padding:3px 8px;border-radius:4px;">Forwarding Setup</span>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px;">${escapeHtml(watcherName)}</span>
    </div>
    <div style="padding:4px 24px 16px;">
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Your email provider sent a forwarding confirmation to your Vigil watcher address. Complete the verification below to activate forwarding.</p>
    </div>
    <div style="margin:0 24px 20px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Original message from ${escapeHtml(originalFrom)}</p>
      <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#1e293b;">${body}</div>
    </div>
    <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
      <span style="font-size:11px;color:#94a3b8;">Vigil · Forwarding verification relay</span>
    </div>
  </div>
</body>
</html>`;

    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ from, to: [accountEmail], subject: `Vigil · Confirm email forwarding to ${watcherName}`, html }),
        });
        if (!resp.ok) {
            logger.error("Confirmation relay failed", { status: resp.status });
            return false;
        }
        logger.info("Forwarding confirmation relayed", { to: accountEmail, originalFrom });
        return true;
    } catch (err) {
        logger.error("Confirmation relay error", { err });
        return false;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the ingest token from a route param that may be a full local part.
 * e.g. "ricky-personal-watch-9uw05nk7" → "9uw05nk7"
 * or just "9uw05nk7" → "9uw05nk7"
 */
function extractToken(param: string): string {
    const parts = param.split("-");
    return parts[parts.length - 1] ?? param;
}

/**
 * Parse a raw MIME email string into structured fields.
 */
async function parseRawEmail(raw: string) {
    const parser = new PostalMime();
    const parsed = await parser.parse(raw);

    const headers: Record<string, string> = {};
    const receivedHeaders: string[] = [];
    for (const h of parsed.headers ?? []) {
        headers[h.key.toLowerCase()] = h.value;
        if (h.key.toLowerCase() === "received") {
            receivedHeaders.push(h.value);
        }
    }

    // Extract the time the original recipient's mail server received the email.
    // In Gmail auto-forwarding, the earliest "Received" header with a parseable
    // date is typically when Gmail first accepted delivery.
    let recipientReceivedAt: string | undefined;
    for (const rh of receivedHeaders.reverse()) {
        const dateMatch = rh.match(/;\s*(.+)$/);
        if (dateMatch?.[1]) {
            const d = new Date(dateMatch[1].trim());
            if (!isNaN(d.getTime())) {
                recipientReceivedAt = d.toISOString();
                break;
            }
        }
    }

    return {
        messageId: headers["message-id"] ?? crypto.randomUUID(),
        from: parsed.from?.address ?? parsed.from?.name ?? "unknown",
        to: parsed.to?.[0]?.address ?? "",
        subject: parsed.subject ?? "(no subject)",
        body: parsed.text ?? parsed.html ?? "",
        inReplyTo: headers["in-reply-to"] ?? undefined,
        headers,
        recipientReceivedAt,
    };
}

// ============================================================================
// Handlers
// ============================================================================

export const ingestionHandlers = {
    // POST /api/ingest/:token — called by Cloudflare worker (raw MIME) or API (JSON)
    async ingestByToken(c: Context) {
        try {
            const rawToken = c.req.param("token") ?? "";
            const token = extractToken(rawToken);

            // Determine if raw MIME or JSON based on content type
            const contentType = c.req.header("content-type") ?? "";
            let messageId: string, from: string, to: string, subject: string, emailBody: string, headers: Record<string, string>, inReplyTo: string | undefined, originalFrom: string | undefined, recipientReceivedAt: string | undefined;

            if (contentType.includes("text/plain") || contentType.includes("message/rfc822")) {
                // Raw MIME from Cloudflare Worker
                const rawEmail = await c.req.text();
                const parsed = await parseRawEmail(rawEmail);
                messageId = parsed.messageId;
                from = parsed.from;
                to = parsed.to;
                subject = parsed.subject.replace(/^(fwd|fw):\s*/gi, '').trim();
                emailBody = parsed.body;
                headers = parsed.headers;
                inReplyTo = parsed.inReplyTo;
                recipientReceivedAt = parsed.recipientReceivedAt;

                // Fallback: use Cloudflare headers if MIME parsing missed them
                if (from === "unknown") from = c.req.header("x-cloudflare-email-from") ?? "unknown";
                if (!to) to = c.req.header("x-cloudflare-email-to") ?? "";

                // Extract original sender for forwarded emails:
                // 1. X-Forwarded-For header — but only if it's a single clean email address
                //    (Gmail auto-forward puts multiple addresses space-separated, which is not useful)
                const xForwardedFor = headers["x-forwarded-for"];
                if (xForwardedFor) {
                    const cleaned = xForwardedFor.trim();
                    // Only use if it's a single email address (no spaces)
                    if (!cleaned.includes(" ") && cleaned.includes("@") && cleaned !== from) {
                        originalFrom = cleaned;
                    }
                }
                // 2. Parse 'From:' line from manual forward body marker
                if (!originalFrom && emailBody.includes("---------- Forwarded message")) {
                    const fwdFromMatch = emailBody.match(/From:\s*(.+?)(?:\r?\n|$)/m);
                    if (fwdFromMatch?.[1]?.trim()) {
                        originalFrom = fwdFromMatch[1].trim();
                    }
                }

                logger.info("Parsed raw MIME email", { from, originalFrom, subject, to: to.substring(0, 30) });
            } else {
                // JSON from direct API calls / tests
                const body = await c.req.json();
                messageId = body.headers?.["message-id"] ?? body.messageId ?? body.message_id ?? crypto.randomUUID();
                from = body.from ?? body.envelope?.from ?? "unknown";
                to = body.to ?? body.envelope?.to?.[0] ?? "";
                subject = body.subject ?? "(no subject)";
                emailBody = body.text ?? body.html ?? body.body ?? "";
                headers = body.headers ?? {};
                inReplyTo = body.in_reply_to ?? body.inReplyTo ?? headers["in-reply-to"];
            }

            // Check for forwarding confirmation emails BEFORE watcher lookup.
            // These need to be relayed to the account owner so they can complete
            // the email provider's verification flow.
            // Skip emails FROM Vigil itself (prevents relay loops when forwarding is active)
            if (from.includes("vigil.run") || from.includes("notifications@vigil")) {
                logger.debug("Skipping email from Vigil itself", { from, subject });
                return c.json({ success: true, agent_invoked: false, message: "Skipped own email" });
            }

            if (isForwardingConfirmation(from, subject)) {
                // Rate limit: only relay one confirmation per token per hour
                const now = Date.now();
                const lastRelay = confirmationRelayTimes.get(token) ?? 0;
                if (now - lastRelay < 3600000) {
                    logger.debug("Forwarding confirmation suppressed (rate limited)", { token });
                    return c.json({ success: true, confirmation_relayed: false, message: "Already relayed recently" });
                }
                confirmationRelayTimes.set(token, now);
                logger.info("Forwarding confirmation detected", { from, subject, token });

                // Look up watcher just for account email
                const watcherForRelay = queryOne<{ id: string; account_id: string; name: string }>(
                    `SELECT w.id, w.account_id, w.name FROM watchers w WHERE w.ingest_token = ?`,
                    [token]
                );

                if (watcherForRelay) {
                    const account = queryOne<{ email: string }>(
                        `SELECT email FROM accounts WHERE id = ?`,
                        [watcherForRelay.account_id]
                    );

                    if (account) {
                        // Extract and store confirmation code for Chrome extension retrieval
                        const codeInfo = extractConfirmationCode(emailBody, from);
                        if (codeInfo) {
                            run(
                                `INSERT OR REPLACE INTO confirmation_codes (id, watcher_id, provider, code) VALUES (?, ?, ?, ?)`,
                                [crypto.randomUUID(), watcherForRelay.id, codeInfo.provider, codeInfo.code]
                            );
                            logger.info("Stored confirmation code for extension", { watcherId: watcherForRelay.id, provider: codeInfo.provider });
                        }

                        const relayed = await relayConfirmationEmail(
                            account.email, from, subject, emailBody, watcherForRelay.name
                        );
                        return c.json({
                            success: true,
                            confirmation_relayed: relayed,
                            confirmation_code: codeInfo?.code ?? null,
                            message: relayed
                                ? "Forwarding confirmation relayed to account owner"
                                : "Confirmation detected but relay failed",
                        });
                    }
                }

                // Couldn't find account — still accept to avoid bounce
                return c.json({
                    success: true,
                    confirmation_relayed: false,
                    message: "Forwarding confirmation detected but no account found for relay",
                });
            }

            const watcher = queryOne<{ id: string; account_id: string; status: string }>(
                `SELECT id, account_id, status FROM watchers
                 WHERE ingest_token = ? AND status = 'active'`,
                [token]
            );

            if (!watcher) {
                logger.warn("Unknown watcher token", { rawToken, extractedToken: token });
                return c.json({ error: "Unknown or inactive watcher" }, 404);
            }

            const result = await ingestEmail({
                watcherId: watcher.id,
                messageId,
                from,
                to,
                subject,
                body: emailBody,
                headers,
                inReplyTo,
                receivedAt: Date.now(),
                originalFrom,
                originalDate: headers["date"] ? new Date(headers["date"]).getTime() || undefined : undefined,
                recipientReceivedAt: recipientReceivedAt,
            });

            return c.json({
                success: result.success,
                agent_invoked: result.agentInvoked,
            });
        } catch (err) {
            logger.error("Email ingestion failed", { err: String(err), stack: err instanceof Error ? err.stack : undefined });
            return c.json({ error: "Ingestion failed" }, 500);
        }
    },

    // Legacy: POST /api/ingestion/cloudflare-email (old Cloudflare format)
    async cloudflareEmail(c: Context) {
        try {
            const body = await c.req.json();

            // Extract ingest token from recipient address (name-TOKEN@vigil.run)
            const to = body.to ?? body.envelope?.to?.[0];
            if (!to) return c.json({ error: "Missing recipient" }, 400);

            const match = to.match(/-([a-z0-9]{6,8})@vigil\.run$/i);
            if (!match) {
                logger.warn("Invalid ingestion address format", { to });
                return c.json({ error: "Invalid ingestion address" }, 400);
            }

            const ingestToken = match[1].toLowerCase();
            const watcher = queryOne<{ id: string; account_id: string; status: string }>(
                `SELECT id, account_id, status FROM watchers
                 WHERE ingest_token = ? AND status = 'active'`,
                [ingestToken]
            );

            if (!watcher) {
                return c.json({ error: "Unknown watcher" }, 404);
            }

            const messageId =
                body.headers?.["message-id"] ?? crypto.randomUUID();
            const from = body.from ?? body.envelope?.from ?? "unknown";
            const subject = body.subject ?? "(no subject)";
            const emailBody = body.text ?? body.html ?? "";
            const headers = body.headers ?? {};

            const result = await ingestEmail({
                watcherId: watcher.id,
                messageId,
                from,
                to,
                subject,
                body: emailBody,
                headers,
                receivedAt: Date.now(),
            });

            return c.json({
                success: result.success,
                agent_invoked: result.agentInvoked,
            });
        } catch (err) {
            logger.error("Email ingestion failed", { err });
            return c.json({ error: "Ingestion failed" }, 500);
        }
    },
};
