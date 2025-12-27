/**
 * Email Templates
 *
 * HTML and plain text email templates for all system emails.
 * Templates use simple string interpolation for variables.
 */

// ============================================================================
// Types
// ============================================================================

export interface EmailTemplate {
    subject: string;
    html: string;
    text: string;
}

export interface AlertTemplateData {
    urgencyLevel: "warning" | "critical" | "overdue";
    watcherName: string;
    threadSubject: string;
    threadSender: string;
    deadline?: string;
    hoursUntilDeadline?: number;
    hoursSinceActivity?: number;
    alertId: string;
    threadId: string;
    dashboardUrl: string;
}

export interface ReportTemplateData {
    reportType: "daily" | "weekly";
    watcherName: string;
    periodStart: string;
    periodEnd: string;
    threadsOpened: number;
    threadsClosed: number;
    threadsActive: number;
    alertsSent: number;
    messagesReceived: number;
    dashboardUrl: string;
}

export interface WelcomeTemplateData {
    userName: string;
    email: string;
    dashboardUrl: string;
    docsUrl: string;
}

export interface PasswordResetTemplateData {
    resetUrl: string;
    expiresIn: string;
    email: string;
}

export interface UsageLimitTemplateData {
    planName: string;
    currentUsage: number;
    limit: number;
    periodEnd: string;
    upgradeUrl: string;
}

export interface SubscriptionConfirmTemplateData {
    planName: string;
    price: string;
    billingPeriod: string;
    dashboardUrl: string;
}

// ============================================================================
// Common Styles
// ============================================================================

const BRAND_COLOR = "#4F46E5"; // Indigo
const BRAND_COLOR_DARK = "#3730A3";
const WARNING_COLOR = "#F59E0B";
const CRITICAL_COLOR = "#EF4444";
const OVERDUE_COLOR = "#DC2626";
const SUCCESS_COLOR = "#10B981";

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #F3F4F6; }
  .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; }
  .header { background: ${BRAND_COLOR}; color: white; padding: 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
  .content { padding: 32px 24px; }
  .footer { background: #F9FAFB; padding: 24px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB; }
  .button { display: inline-block; background: ${BRAND_COLOR}; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin: 16px 0; }
  .button:hover { background: ${BRAND_COLOR_DARK}; }
  .info-box { background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .label { font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { font-size: 16px; color: #111827; font-weight: 500; }
  hr { border: none; border-top: 1px solid #E5E7EB; margin: 24px 0; }
`;

// ============================================================================
// Alert Email Templates
// ============================================================================

function getUrgencyStyles(level: "warning" | "critical" | "overdue"): {
    color: string;
    emoji: string;
    label: string;
} {
    switch (level) {
        case "warning":
            return { color: WARNING_COLOR, emoji: "📋", label: "Warning" };
        case "critical":
            return { color: CRITICAL_COLOR, emoji: "⚠️", label: "Critical" };
        case "overdue":
            return { color: OVERDUE_COLOR, emoji: "🚨", label: "Overdue" };
    }
}

export function buildAlertEmail(data: AlertTemplateData): EmailTemplate {
    const urgency = getUrgencyStyles(data.urgencyLevel);

    const timeInfo =
        data.hoursUntilDeadline !== undefined
            ? data.hoursUntilDeadline < 0
                ? `${Math.abs(data.hoursUntilDeadline)} hours overdue`
                : `${data.hoursUntilDeadline} hours until deadline`
            : data.hoursSinceActivity !== undefined
              ? `${data.hoursSinceActivity} hours since last activity`
              : "";

    const subject = `${urgency.emoji} Vigil ${urgency.label} Alert - ${data.watcherName}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${urgency.color};">
      <h1>${urgency.emoji} ${urgency.label} Alert</h1>
    </div>
    <div class="content">
      <p>A thread in <strong>${escapeHtml(data.watcherName)}</strong> requires your attention.</p>
      
      <div class="info-box">
        <div style="margin-bottom: 12px;">
          <span class="label">Subject</span><br>
          <span class="value">${escapeHtml(data.threadSubject)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <span class="label">From</span><br>
          <span class="value">${escapeHtml(data.threadSender)}</span>
        </div>
        ${
            data.deadline
                ? `
        <div style="margin-bottom: 12px;">
          <span class="label">Deadline</span><br>
          <span class="value">${escapeHtml(data.deadline)}</span>
        </div>
        `
                : ""
        }
        <div>
          <span class="label">Status</span><br>
          <span class="value" style="color: ${urgency.color};">${timeInfo}</span>
        </div>
      </div>

      <p style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}/threads/${data.threadId}" class="button">
          View Thread
        </a>
      </p>
      
      <hr>
      
      <p style="font-size: 12px; color: #6B7280;">
        Alert ID: ${data.alertId}<br>
        Thread ID: ${data.threadId}
      </p>
    </div>
    <div class="footer">
      <p>This is an automated alert from Vigil.</p>
      <p>You can manage your notification preferences in your <a href="${escapeHtml(data.dashboardUrl)}/settings">settings</a>.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
${urgency.emoji} VIGIL ${urgency.label.toUpperCase()} ALERT

Watcher: ${data.watcherName}

A thread requires your attention.

Subject: ${data.threadSubject}
From: ${data.threadSender}
${data.deadline ? `Deadline: ${data.deadline}` : ""}
Status: ${timeInfo}

View Thread: ${data.dashboardUrl}/threads/${data.threadId}

---
Alert ID: ${data.alertId}
Thread ID: ${data.threadId}

This is an automated alert from Vigil.
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Report Email Templates
// ============================================================================

export function buildReportEmail(data: ReportTemplateData): EmailTemplate {
    const periodLabel = data.reportType === "daily" ? "Daily" : "Weekly";
    const subject = `📊 Vigil ${periodLabel} Report - ${data.watcherName}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 ${periodLabel} Report</h1>
    </div>
    <div class="content">
      <p><strong>${escapeHtml(data.watcherName)}</strong></p>
      <p style="color: #6B7280; font-size: 14px;">
        ${escapeHtml(data.periodStart)} - ${escapeHtml(data.periodEnd)}
      </p>
      
      <div class="info-box">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;">
              <span class="label">Messages Received</span><br>
              <span class="value">${data.messagesReceived}</span>
            </td>
            <td style="padding: 8px 0;">
              <span class="label">Alerts Sent</span><br>
              <span class="value">${data.alertsSent}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <span class="label">Threads Opened</span><br>
              <span class="value">${data.threadsOpened}</span>
            </td>
            <td style="padding: 8px 0;">
              <span class="label">Threads Closed</span><br>
              <span class="value">${data.threadsClosed}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 8px 0;">
              <span class="label">Currently Active Threads</span><br>
              <span class="value" style="font-size: 24px; color: ${BRAND_COLOR};">${data.threadsActive}</span>
            </td>
          </tr>
        </table>
      </div>

      <p style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}/watchers" class="button">
          View Dashboard
        </a>
      </p>
    </div>
    <div class="footer">
      <p>This is an automated report from Vigil.</p>
      <p>You can manage your reporting preferences in your <a href="${escapeHtml(data.dashboardUrl)}/settings">settings</a>.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
📊 VIGIL ${periodLabel.toUpperCase()} REPORT

Watcher: ${data.watcherName}
Period: ${data.periodStart} - ${data.periodEnd}

SUMMARY
-------
Messages Received: ${data.messagesReceived}
Alerts Sent: ${data.alertsSent}
Threads Opened: ${data.threadsOpened}
Threads Closed: ${data.threadsClosed}
Currently Active: ${data.threadsActive}

View Dashboard: ${data.dashboardUrl}/watchers

---
This is an automated report from Vigil.
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Welcome Email Templates
// ============================================================================

export function buildWelcomeEmail(data: WelcomeTemplateData): EmailTemplate {
    const subject = "🎉 Welcome to Vigil!";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Vigil!</h1>
    </div>
    <div class="content">
      <p>Hi${data.userName ? ` ${escapeHtml(data.userName)}` : ""},</p>
      
      <p>Thank you for signing up for Vigil! We're excited to help you stay on top of your email obligations.</p>
      
      <h3>Getting Started</h3>
      
      <ol style="color: #4B5563; line-height: 1.8;">
        <li><strong>Create a Watcher</strong> - Set up your first watcher to monitor a specific area of responsibility.</li>
        <li><strong>Forward Emails</strong> - Forward important emails to your watcher's unique address.</li>
        <li><strong>Get Alerts</strong> - Receive notifications when deadlines approach or conversations go silent.</li>
      </ol>

      <p style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}" class="button">
          Go to Dashboard
        </a>
      </p>

      <hr>

      <p style="font-size: 14px; color: #6B7280;">
        Need help? Check out our <a href="${escapeHtml(data.docsUrl)}">documentation</a> or reply to this email.
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this because you signed up for Vigil with ${escapeHtml(data.email)}.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
🎉 WELCOME TO VIGIL!

Hi${data.userName ? ` ${data.userName}` : ""},

Thank you for signing up for Vigil! We're excited to help you stay on top of your email obligations.

GETTING STARTED
---------------
1. Create a Watcher - Set up your first watcher to monitor a specific area of responsibility.
2. Forward Emails - Forward important emails to your watcher's unique address.
3. Get Alerts - Receive notifications when deadlines approach or conversations go silent.

Go to Dashboard: ${data.dashboardUrl}

Need help? Check out our documentation at ${data.docsUrl}

---
You're receiving this because you signed up for Vigil with ${data.email}.
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Password Reset Email Templates
// ============================================================================

export function buildPasswordResetEmail(
    data: PasswordResetTemplateData
): EmailTemplate {
    const subject = "🔐 Reset your Vigil password";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Password Reset</h1>
    </div>
    <div class="content">
      <p>We received a request to reset the password for your Vigil account.</p>
      
      <p style="text-align: center;">
        <a href="${escapeHtml(data.resetUrl)}" class="button">
          Reset Password
        </a>
      </p>

      <div class="info-box" style="background: #FEF3C7; border: 1px solid #F59E0B;">
        <p style="margin: 0; color: #92400E;">
          ⚠️ This link expires in ${escapeHtml(data.expiresIn)}. If you didn't request this reset, you can safely ignore this email.
        </p>
      </div>

      <hr>

      <p style="font-size: 12px; color: #6B7280;">
        If the button doesn't work, copy and paste this URL into your browser:<br>
        <code style="word-break: break-all;">${escapeHtml(data.resetUrl)}</code>
      </p>
    </div>
    <div class="footer">
      <p>This email was sent to ${escapeHtml(data.email)} because a password reset was requested.</p>
      <p>If you didn't request this, please ignore this email or contact support if you're concerned.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
🔐 PASSWORD RESET

We received a request to reset the password for your Vigil account.

Reset your password: ${data.resetUrl}

⚠️ This link expires in ${data.expiresIn}. If you didn't request this reset, you can safely ignore this email.

---
This email was sent to ${data.email} because a password reset was requested.
If you didn't request this, please ignore this email or contact support if you're concerned.
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Usage Limit Warning Email Templates
// ============================================================================

export function buildUsageLimitEmail(
    data: UsageLimitTemplateData
): EmailTemplate {
    const percentUsed = Math.round((data.currentUsage / data.limit) * 100);
    const isNearLimit = percentUsed >= 90;

    const subject = isNearLimit
        ? `⚠️ Vigil: You've used ${percentUsed}% of your email limit`
        : `📊 Vigil: Usage update - ${percentUsed}% of limit used`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${isNearLimit ? WARNING_COLOR : BRAND_COLOR};">
      <h1>${isNearLimit ? "⚠️" : "📊"} Usage Update</h1>
    </div>
    <div class="content">
      <p>Here's your current usage for the <strong>${escapeHtml(data.planName)}</strong> plan:</p>
      
      <div class="info-box">
        <div style="margin-bottom: 16px;">
          <span class="label">Emails Processed</span><br>
          <span class="value" style="font-size: 24px;">${data.currentUsage} / ${data.limit}</span>
        </div>
        <div style="background: #E5E7EB; border-radius: 4px; height: 8px; overflow: hidden;">
          <div style="background: ${isNearLimit ? WARNING_COLOR : SUCCESS_COLOR}; height: 100%; width: ${Math.min(percentUsed, 100)}%;"></div>
        </div>
        <p style="margin: 8px 0 0; font-size: 12px; color: #6B7280;">
          ${percentUsed}% used • Resets on ${escapeHtml(data.periodEnd)}
        </p>
      </div>

      ${
          isNearLimit
              ? `
      <div class="info-box" style="background: #FEF3C7; border: 1px solid #F59E0B;">
        <p style="margin: 0; color: #92400E;">
          ⚠️ You're approaching your weekly limit. Consider upgrading to continue processing emails without interruption.
        </p>
      </div>
      `
              : ""
      }

      <p style="text-align: center;">
        <a href="${escapeHtml(data.upgradeUrl)}" class="button">
          ${isNearLimit ? "Upgrade Plan" : "View Plans"}
        </a>
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this because you're on the ${escapeHtml(data.planName)} plan.</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
${isNearLimit ? "⚠️" : "📊"} VIGIL USAGE UPDATE

Plan: ${data.planName}

Emails Processed: ${data.currentUsage} / ${data.limit} (${percentUsed}%)
Resets on: ${data.periodEnd}

${isNearLimit ? "⚠️ You're approaching your weekly limit. Consider upgrading to continue processing emails without interruption.\n\n" : ""}View Plans: ${data.upgradeUrl}

---
You're receiving this because you're on the ${data.planName} plan.
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Subscription Confirmation Email Templates
// ============================================================================

export function buildSubscriptionConfirmEmail(
    data: SubscriptionConfirmTemplateData
): EmailTemplate {
    const subject = "✅ Vigil subscription confirmed!";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${SUCCESS_COLOR};">
      <h1>✅ Subscription Confirmed!</h1>
    </div>
    <div class="content">
      <p>Thank you for subscribing to Vigil! Your subscription is now active.</p>
      
      <div class="info-box">
        <div style="margin-bottom: 12px;">
          <span class="label">Plan</span><br>
          <span class="value">${escapeHtml(data.planName)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <span class="label">Price</span><br>
          <span class="value">${escapeHtml(data.price)}</span>
        </div>
        <div>
          <span class="label">Billing Period</span><br>
          <span class="value">${escapeHtml(data.billingPeriod)}</span>
        </div>
      </div>

      <p style="text-align: center;">
        <a href="${escapeHtml(data.dashboardUrl)}" class="button">
          Go to Dashboard
        </a>
      </p>

      <hr>

      <p style="font-size: 14px; color: #6B7280;">
        You can manage your subscription anytime from your account settings.
      </p>
    </div>
    <div class="footer">
      <p>Thank you for choosing Vigil!</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
✅ SUBSCRIPTION CONFIRMED!

Thank you for subscribing to Vigil! Your subscription is now active.

Plan: ${data.planName}
Price: ${data.price}
Billing Period: ${data.billingPeriod}

Go to Dashboard: ${data.dashboardUrl}

You can manage your subscription anytime from your account settings.

---
Thank you for choosing Vigil!
`.trim();

    return { subject, html, text };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
    };
    return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
}
