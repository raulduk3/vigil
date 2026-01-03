/**
 * Email Templates
 *
 * HTML email templates for Vigil notifications.
 * All templates use inline styles for maximum email client compatibility.
 */

// ============================================================================
// Shared Styles
// ============================================================================

const COLORS = {
    primary: "#2563eb",
    danger: "#dc2626",
    warning: "#f59e0b",
    success: "#10b981",
    gray: {
        50: "#f9fafb",
        100: "#f3f4f6",
        200: "#e5e7eb",
        400: "#9ca3af",
        500: "#6b7280",
        600: "#4b5563",
        700: "#374151",
        900: "#111827",
    },
};

const baseStyles = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: ${COLORS.gray[900]};
        margin: 0;
        padding: 0;
        background-color: ${COLORS.gray[100]};
    }
    .wrapper {
        max-width: 600px;
        margin: 0 auto;
        padding: 40px 20px;
    }
    .container {
        background: white;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }
    .header {
        padding: 24px 32px;
        border-bottom: 1px solid ${COLORS.gray[200]};
    }
    .header-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
    }
    .content {
        padding: 32px;
    }
    .footer {
        padding: 24px 32px;
        background: ${COLORS.gray[50]};
        border-top: 1px solid ${COLORS.gray[200]};
        font-size: 12px;
        color: ${COLORS.gray[500]};
    }
    .button {
        display: inline-block;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 500;
        font-size: 14px;
    }
    .button-primary {
        background: ${COLORS.primary};
        color: white;
    }
    .detail-card {
        background: ${COLORS.gray[50]};
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
    }
    .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid ${COLORS.gray[200]};
    }
    .detail-row:last-child {
        border-bottom: none;
    }
    .detail-label {
        color: ${COLORS.gray[500]};
        font-size: 14px;
    }
    .detail-value {
        font-weight: 500;
        font-size: 14px;
    }
    .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 500;
    }
    .badge-danger {
        background: #fef2f2;
        color: ${COLORS.danger};
    }
    .badge-warning {
        background: #fffbeb;
        color: ${COLORS.warning};
    }
    .badge-success {
        background: #ecfdf5;
        color: ${COLORS.success};
    }
    .thread-card {
        border: 1px solid ${COLORS.gray[200]};
        border-radius: 8px;
        padding: 16px;
        margin: 12px 0;
    }
    .thread-subject {
        font-weight: 500;
        margin-bottom: 8px;
    }
    .thread-meta {
        font-size: 13px;
        color: ${COLORS.gray[500]};
    }
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin: 20px 0;
    }
    .stat-box {
        text-align: center;
        padding: 16px;
        background: ${COLORS.gray[50]};
        border-radius: 8px;
    }
    .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: ${COLORS.gray[900]};
    }
    .stat-label {
        font-size: 12px;
        color: ${COLORS.gray[500]};
        margin-top: 4px;
    }
`;

function wrapTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>${baseStyles}</style>
</head>
<body>
    <div class="wrapper">
        ${content}
    </div>
</body>
</html>
    `.trim();
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    });
}

function formatDuration(hours: number): string {
    if (hours < 24) {
        return `${hours.toFixed(1)} hours`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours < 1) {
        return `${days} day${days > 1 ? "s" : ""}`;
    }
    return `${days}d ${remainingHours.toFixed(0)}h`;
}

// ============================================================================
// Silence Alert Email
// ============================================================================

export interface SilenceAlertData {
    watcherName: string;
    threadId: string;
    threadSubject?: string;
    originalSender?: string;
    hoursSilent: number;
    thresholdHours: number;
    lastActivityAt: number;
    dashboardUrl: string;
}

export function silenceAlertTemplate(data: SilenceAlertData): string {
    const content = `
        <div class="container">
            <div class="header" style="background: #fef2f2; border-bottom-color: #fecaca;">
                <p class="header-title" style="color: ${COLORS.danger};">
                    Silence Threshold Exceeded
                </p>
            </div>

            <div class="content">
                <p style="margin-top: 0;">
                    A thread in <strong>${escapeHtml(data.watcherName)}</strong> has been silent for
                    <strong>${formatDuration(data.hoursSilent)}</strong>, exceeding your configured
                    threshold of ${data.thresholdHours} hours.
                </p>

                <div class="detail-card">
                    ${
                        data.threadSubject
                            ? `
                    <div class="detail-row">
                        <span class="detail-label">Subject</span>
                        <span class="detail-value">${escapeHtml(data.threadSubject)}</span>
                    </div>
                    `
                            : ""
                    }
                    ${
                        data.originalSender
                            ? `
                    <div class="detail-row">
                        <span class="detail-label">From</span>
                        <span class="detail-value">${escapeHtml(data.originalSender)}</span>
                    </div>
                    `
                            : ""
                    }
                    <div class="detail-row">
                        <span class="detail-label">Silent for</span>
                        <span class="detail-value" style="color: ${COLORS.danger};">${formatDuration(data.hoursSilent)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last activity</span>
                        <span class="detail-value">${formatDate(data.lastActivityAt)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Thread ID</span>
                        <span class="detail-value" style="font-family: monospace; font-size: 12px;">${data.threadId.slice(0, 8)}...</span>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 24px;">
                    <a href="${data.dashboardUrl}" class="button button-primary">View Thread</a>
                </div>
            </div>

            <div class="footer">
                <p style="margin: 0;">
                    This alert was sent because a thread exceeded your silence threshold.
                    You can adjust your notification settings in the Vigil dashboard.
                </p>
            </div>
        </div>
    `;

    return wrapTemplate(content);
}

export function silenceAlertSubject(data: SilenceAlertData): string {
    const duration = formatDuration(data.hoursSilent);
    return `[Vigil] ${data.watcherName}: Thread silent for ${duration}`;
}

// ============================================================================
// Weekly Report Email
// ============================================================================

export interface ThreadSummary {
    threadId: string;
    subject: string;
    originalSender: string;
    status: "open" | "closed";
    hoursSilent: number;
    messageCount: number;
    openedAt: number;
    closedAt?: number;
}

export interface WeeklyReportData {
    watcherName: string;
    watcherId: string;
    periodStart: number;
    periodEnd: number;
    stats: {
        totalThreads: number;
        openThreads: number;
        closedThreads: number;
        silenceAlertsTriggered: number;
        emailsProcessed: number;
    };
    openThreads: ThreadSummary[];
    recentlyClosed: ThreadSummary[];
    dashboardUrl: string;
}

export function weeklyReportTemplate(data: WeeklyReportData): string {
    const periodStr = `${formatDate(data.periodStart).split(",")[0]} - ${formatDate(data.periodEnd).split(",")[0]}`;

    const openThreadsHtml =
        data.openThreads.length > 0
            ? data.openThreads
                  .map(
                      (thread) => `
            <div class="thread-card">
                <div class="thread-subject">${escapeHtml(thread.subject)}</div>
                <div class="thread-meta">
                    From: ${escapeHtml(thread.originalSender)} &bull;
                    ${thread.messageCount} message${thread.messageCount > 1 ? "s" : ""} &bull;
                    <span style="color: ${thread.hoursSilent > 72 ? COLORS.danger : thread.hoursSilent > 24 ? COLORS.warning : COLORS.success};">
                        Silent ${formatDuration(thread.hoursSilent)}
                    </span>
                </div>
            </div>
        `
                  )
                  .join("")
            : `<p style="color: ${COLORS.gray[500]}; text-align: center; padding: 20px;">No open threads</p>`;

    const closedThreadsHtml =
        data.recentlyClosed.length > 0
            ? data.recentlyClosed
                  .slice(0, 5)
                  .map(
                      (thread) => `
            <div class="thread-card" style="opacity: 0.7;">
                <div class="thread-subject">
                    <span class="badge badge-success">Closed</span>
                    ${escapeHtml(thread.subject)}
                </div>
                <div class="thread-meta">
                    From: ${escapeHtml(thread.originalSender)} &bull;
                    Closed ${formatDate(thread.closedAt!)}
                </div>
            </div>
        `
                  )
                  .join("")
            : `<p style="color: ${COLORS.gray[500]}; text-align: center; padding: 20px;">No threads closed this week</p>`;

    const content = `
        <div class="container">
            <div class="header">
                <p class="header-title">Weekly Thread Report</p>
                <p style="margin: 4px 0 0; color: ${COLORS.gray[500]}; font-size: 14px;">
                    ${escapeHtml(data.watcherName)} &bull; ${periodStr}
                </p>
            </div>

            <div class="content">
                <!-- Stats Grid -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                    <tr>
                        <td width="33%" style="text-align: center; padding: 16px; background: ${COLORS.gray[50]}; border-radius: 8px 0 0 8px;">
                            <div style="font-size: 28px; font-weight: 700; color: ${data.stats.openThreads > 0 ? COLORS.warning : COLORS.success};">
                                ${data.stats.openThreads}
                            </div>
                            <div style="font-size: 12px; color: ${COLORS.gray[500]}; margin-top: 4px;">Open Threads</div>
                        </td>
                        <td width="33%" style="text-align: center; padding: 16px; background: ${COLORS.gray[50]};">
                            <div style="font-size: 28px; font-weight: 700; color: ${COLORS.gray[900]};">
                                ${data.stats.closedThreads}
                            </div>
                            <div style="font-size: 12px; color: ${COLORS.gray[500]}; margin-top: 4px;">Closed This Week</div>
                        </td>
                        <td width="33%" style="text-align: center; padding: 16px; background: ${COLORS.gray[50]}; border-radius: 0 8px 8px 0;">
                            <div style="font-size: 28px; font-weight: 700; color: ${data.stats.silenceAlertsTriggered > 0 ? COLORS.danger : COLORS.gray[900]};">
                                ${data.stats.silenceAlertsTriggered}
                            </div>
                            <div style="font-size: 12px; color: ${COLORS.gray[500]}; margin-top: 4px;">Silence Alerts</div>
                        </td>
                    </tr>
                </table>

                <!-- Open Threads -->
                <h3 style="font-size: 16px; font-weight: 600; margin: 24px 0 12px; color: ${COLORS.gray[700]};">
                    Open Threads Requiring Attention
                </h3>
                ${openThreadsHtml}

                <!-- Recently Closed -->
                <h3 style="font-size: 16px; font-weight: 600; margin: 24px 0 12px; color: ${COLORS.gray[700]};">
                    Recently Closed
                </h3>
                ${closedThreadsHtml}

                <div style="text-align: center; margin-top: 32px;">
                    <a href="${data.dashboardUrl}" class="button button-primary">View Full Dashboard</a>
                </div>
            </div>

            <div class="footer">
                <p style="margin: 0;">
                    This weekly report is sent every Monday at 9:00 AM.
                    Manage your notification preferences in the dashboard.
                </p>
            </div>
        </div>
    `;

    return wrapTemplate(content);
}

export function weeklyReportSubject(data: WeeklyReportData): string {
    const openCount = data.stats.openThreads;
    if (openCount === 0) {
        return `[Vigil] ${data.watcherName}: All clear - Weekly Report`;
    }
    return `[Vigil] ${data.watcherName}: ${openCount} open thread${openCount > 1 ? "s" : ""} - Weekly Report`;
}

// ============================================================================
// Thread Digest Email (Multiple alerts batched)
// ============================================================================

export interface ThreadDigestData {
    watcherName: string;
    threads: Array<{
        threadId: string;
        subject: string;
        originalSender: string;
        hoursSilent: number;
        lastActivityAt: number;
    }>;
    dashboardUrl: string;
}

export function threadDigestTemplate(data: ThreadDigestData): string {
    const threadsHtml = data.threads
        .map(
            (thread) => `
        <div class="thread-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div class="thread-subject">${escapeHtml(thread.subject)}</div>
                    <div class="thread-meta">From: ${escapeHtml(thread.originalSender)}</div>
                </div>
                <span class="badge badge-danger">${formatDuration(thread.hoursSilent)}</span>
            </div>
            <div class="thread-meta" style="margin-top: 8px;">
                Last activity: ${formatDate(thread.lastActivityAt)}
            </div>
        </div>
    `
        )
        .join("");

    const content = `
        <div class="container">
            <div class="header" style="background: #fffbeb; border-bottom-color: #fde68a;">
                <p class="header-title" style="color: ${COLORS.warning};">
                    ${data.threads.length} Thread${data.threads.length > 1 ? "s" : ""} Need${data.threads.length === 1 ? "s" : ""} Attention
                </p>
            </div>

            <div class="content">
                <p style="margin-top: 0;">
                    The following threads in <strong>${escapeHtml(data.watcherName)}</strong> have exceeded
                    their silence thresholds:
                </p>

                ${threadsHtml}

                <div style="text-align: center; margin-top: 24px;">
                    <a href="${data.dashboardUrl}" class="button button-primary">View All Threads</a>
                </div>
            </div>

            <div class="footer">
                <p style="margin: 0;">
                    You received this digest because multiple threads exceeded their silence thresholds.
                </p>
            </div>
        </div>
    `;

    return wrapTemplate(content);
}

export function threadDigestSubject(data: ThreadDigestData): string {
    return `[Vigil] ${data.watcherName}: ${data.threads.length} thread${data.threads.length > 1 ? "s" : ""} need attention`;
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
