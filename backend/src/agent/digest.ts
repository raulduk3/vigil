/**
 * Weekly Digest — Structured Data Report
 *
 * Builds a digest email from real DB data. Uses LLM only for a short
 * "focus" paragraph. Everything else is deterministic.
 */

import { queryMany, queryOne } from "../db/client";
// Memory functions available if needed for future enrichment
import { logger } from "../logger";
import type { ThreadRow, WatcherRow } from "./schema";

// ============================================================================
// Types
// ============================================================================

interface DigestData {
    watcher: WatcherRow;
    period: { start: string; end: string; days: number };
    stats: {
        emailsProcessed: number;
        alertsSent: number;
        threadsCreated: number;
        threadsIgnored: number;
        threadsResolved: number;
        totalCost: number;
    };
    activeThreads: Array<{ subject: string; status: string; emailCount: number; summary: string | null; lastActivity: string }>;
    upcomingDeadlines: string[];
    topMemories: Array<{ content: string; importance: number }>;
}

// ============================================================================
// Data Collection
// ============================================================================

export function collectDigestData(watcherId: string, periodDays: number = 7): DigestData {
    const watcher = queryOne<WatcherRow>(`SELECT * FROM watchers WHERE id = ?`, [watcherId]);
    if (!watcher) throw new Error(`Watcher ${watcherId} not found`);

    const now = Date.now();
    const cutoff = new Date(now - periodDays * 86400000).toISOString();
    const endDate = new Date(now).toISOString();

    // Action stats for the period
    const stats = queryOne<{
        emails: number;
        alerts: number;
        ignored: number;
        cost: number;
    }>(
        `SELECT
            COUNT(*) as emails,
            SUM(CASE WHEN tool = 'send_alert' THEN 1 ELSE 0 END) as alerts,
            SUM(CASE WHEN tool = 'ignore_thread' OR tool = 'watching_thread' OR tool = 'watch_thread' THEN 1 ELSE 0 END) as ignored,
            COALESCE(SUM(cost_usd), 0) as cost
         FROM actions WHERE watcher_id = ? AND created_at >= ?`,
        [watcherId, cutoff]
    ) ?? { emails: 0, alerts: 0, ignored: 0, cost: 0 };

    // Thread stats for the period
    const threadsCreated = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM threads WHERE watcher_id = ? AND created_at >= ?`,
        [watcherId, cutoff]
    )?.count ?? 0;

    const threadsResolved = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM threads WHERE watcher_id = ? AND status = 'resolved' AND last_activity >= ?`,
        [watcherId, cutoff]
    )?.count ?? 0;

    // Active threads (for "needs attention" section)
    const activeThreads = queryMany<ThreadRow>(
        `SELECT * FROM threads WHERE watcher_id = ? AND status IN ('active', 'watching') ORDER BY last_activity DESC LIMIT 10`,
        [watcherId]
    ).map((t) => ({
        subject: t.subject ?? "(no subject)",
        status: t.status,
        emailCount: t.email_count,
        summary: t.summary,
        lastActivity: t.last_activity ?? "",
    }));

    // Memories — look for date patterns that suggest upcoming deadlines
    const allMemories = queryMany<{ content: string; importance: number }>(
        `SELECT content, importance FROM memories WHERE watcher_id = ? AND obsolete = FALSE ORDER BY importance DESC`,
        [watcherId]
    );

    // Simple deadline extraction: look for memories mentioning dates
    const datePatterns = [
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/gi,
        /\d{4}-\d{2}-\d{2}/g,
        /\b(tomorrow|next week|this week|end of day|eod|by friday|by monday|due|deadline)\b/gi,
    ];

    const upcomingDeadlines = allMemories
        .filter((m) => m.importance >= 4 && datePatterns.some((p) => p.test(m.content)))
        .map((m) => m.content);

    // Reset regex lastIndex
    datePatterns.forEach((p) => (p.lastIndex = 0));

    const topMemories = allMemories.slice(0, 5);

    return {
        watcher,
        period: { start: cutoff, end: endDate, days: periodDays },
        stats: {
            emailsProcessed: stats.emails,
            alertsSent: stats.alerts,
            threadsCreated,
            threadsIgnored: stats.ignored,
            threadsResolved,
            totalCost: stats.cost,
        },
        activeThreads,
        upcomingDeadlines,
        topMemories,
    };
}

// ============================================================================
// HTML Builder
// ============================================================================

export function buildDigestHtml(data: DigestData, focusParagraph: string): string {
    const { watcher, period, stats, activeThreads, upcomingDeadlines, topMemories } = data;
    const periodLabel = `${new Date(period.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(period.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const activeRows = activeThreads.map((t) => {
        const statusColor = t.status === "active" ? "#059669" : "#d97706";
        const age = t.lastActivity ? formatAge(t.lastActivity) : "—";
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">${esc(t.subject)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
                <span style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${t.status}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;color:#6b7280;">${t.emailCount}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${age}</td>
        </tr>`;
    }).join("");

    const deadlineItems = upcomingDeadlines.length > 0
        ? upcomingDeadlines.map((d) => `<li style="margin:4px 0;font-size:14px;color:#111827;">${esc(d)}</li>`).join("")
        : `<li style="margin:4px 0;font-size:14px;color:#9ca3af;">No upcoming deadlines detected.</li>`;

    const memoryItems = topMemories.map((m) => {
        const impColor = m.importance >= 4 ? "#dc2626" : m.importance === 3 ? "#d97706" : "#6b7280";
        return `<li style="margin:6px 0;font-size:13px;color:#374151;">
            <span style="color:${impColor};font-weight:600;">[${m.importance}]</span> ${esc(m.content)}
        </li>`;
    }).join("");

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#f9fafb;color:#111827;">
    <div style="background:white;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:24px 28px;color:white;">
            <h1 style="margin:0;font-size:20px;font-weight:700;">Weekly Digest</h1>
            <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">${esc(watcher.name)} · ${periodLabel}</p>
        </div>

        <!-- Focus paragraph (LLM-generated) -->
        ${focusParagraph ? `<div style="padding:20px 28px;background:#f0fdfa;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#134e4a;">${esc(focusParagraph)}</p>
        </div>` : ""}

        <!-- Stats grid -->
        <div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;">
            <h2 style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">This Week</h2>
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="padding:8px 0;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#111827;">${stats.emailsProcessed}</div>
                        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Emails</div>
                    </td>
                    <td style="padding:8px 0;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#dc2626;">${stats.alertsSent}</div>
                        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Alerts</div>
                    </td>
                    <td style="padding:8px 0;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#059669;">${stats.threadsResolved}</div>
                        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Resolved</div>
                    </td>
                    <td style="padding:8px 0;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#6b7280;">${stats.threadsIgnored}</div>
                        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Ignored</div>
                    </td>
                    <td style="padding:8px 0;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#111827;">$${stats.totalCost.toFixed(3)}</div>
                        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">AI Cost</div>
                    </td>
                </tr>
            </table>
        </div>

        <!-- Active threads -->
        ${activeThreads.length > 0 ? `<div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;">
            <h2 style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Active Threads (${activeThreads.length})</h2>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:2px solid #e5e7eb;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Subject</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;">Status</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;">Emails</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Last</th>
                    </tr>
                </thead>
                <tbody>${activeRows}</tbody>
            </table>
        </div>` : ""}

        <!-- Upcoming deadlines -->
        <div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;">
            <h2 style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Upcoming Deadlines</h2>
            <ul style="margin:0;padding-left:20px;">${deadlineItems}</ul>
        </div>

        <!-- Agent memory -->
        ${topMemories.length > 0 ? `<div style="padding:20px 28px;border-bottom:1px solid #e5e7eb;">
            <h2 style="margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Agent Memory (Top ${topMemories.length})</h2>
            <ul style="margin:0;padding-left:20px;list-style:none;">${memoryItems}</ul>
        </div>` : ""}

        <!-- Footer -->
        <div style="padding:16px 28px;background:#f9fafb;font-size:11px;color:#9ca3af;text-align:center;">
            Vigil Weekly Digest · ${esc(watcher.name)} · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>
    </div>
</body>
</html>`;
}

// ============================================================================
// Send Digest
// ============================================================================

export async function sendDigest(watcherId: string): Promise<boolean> {
    const data = collectDigestData(watcherId);

    // Get a short LLM "focus" paragraph
    let focusParagraph = "";
    try {
        focusParagraph = await generateFocusParagraph(data);
    } catch (err) {
        logger.warn("Failed to generate focus paragraph, sending digest without it", { err });
    }

    const html = buildDigestHtml(data, focusParagraph);

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn("RESEND_API_KEY not set, cannot send digest");
        return false;
    }

    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "alerts@vigil.run";
    const from = rawFrom.includes("<") ? rawFrom : `Vigil <${rawFrom}>`;

    // Get account email
    const account = queryOne<{ email: string }>(
        `SELECT email FROM accounts WHERE id = ?`,
        [data.watcher.account_id]
    );
    if (!account) {
        logger.warn("Account not found for digest", { accountId: data.watcher.account_id });
        return false;
    }

    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                from,
                to: [account.email],
                subject: `[Vigil] Weekly Digest — ${data.watcher.name}`,
                html,
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            logger.error("Digest send failed", { status: resp.status, err });
            return false;
        }

        logger.info("Weekly digest sent", { watcherId, to: account.email });
        return true;
    } catch (err) {
        logger.error("Digest send error", { err });
        return false;
    }
}

// ============================================================================
// LLM Focus Paragraph
// ============================================================================

async function generateFocusParagraph(data: DigestData): Promise<string> {
    const activeList = data.activeThreads
        .map((t) => `- "${t.subject}" (${t.status}, ${t.emailCount} emails): ${t.summary ?? "no summary"}`)
        .join("\n");

    const deadlineList = data.upcomingDeadlines.length > 0
        ? data.upcomingDeadlines.map((d) => `- ${d}`).join("\n")
        : "None";

    const prompt = `You are an email monitoring agent writing a 2-3 sentence focus paragraph for a weekly digest email.

Stats: ${data.stats.emailsProcessed} emails processed, ${data.stats.alertsSent} alerts sent, ${data.stats.threadsResolved} resolved, ${data.stats.threadsIgnored} ignored.

Active threads:
${activeList || "None"}

Upcoming deadlines:
${deadlineList}

Write 2-3 sentences about what the user should focus on this week. Be specific and actionable. If there are urgent deadlines, lead with those. If everything is calm, say so. Do not use bullet points or headers. Plain paragraph only. No greeting or sign-off.`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.7,
        }),
    });

    if (!resp.ok) return "";
    const result = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
    return result.choices?.[0]?.message?.content?.trim() ?? "";
}

// ============================================================================
// Helpers
// ============================================================================

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatAge(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}
