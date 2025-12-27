/**
 * Input Validation Utilities
 *
 * Provides validation functions for user input across the API.
 * Implements defense-in-depth input sanitization.
 */

// ============================================================================
// UUID Validation
// ============================================================================

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4.
 */
export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Validate UUID and return error message if invalid.
 */
export function validateUUID(value: string, fieldName: string): string | null {
    if (!value || typeof value !== "string") {
        return `${fieldName} is required`;
    }
    if (!isValidUUID(value)) {
        return `${fieldName} must be a valid UUID`;
    }
    return null;
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Domains/IPs that should never be allowed as webhook destinations.
 * Prevents SSRF attacks against internal infrastructure.
 */
const BLOCKED_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254", // AWS metadata
    "metadata.google.internal", // GCP metadata
    "metadata.azure.com", // Azure metadata
]);

const BLOCKED_HOST_PATTERNS = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
    /\.local$/, // .local domains
    /\.internal$/, // .internal domains
];

/**
 * Validate a webhook URL for safety.
 */
export function validateWebhookUrl(url: string): {
    valid: boolean;
    error?: string;
} {
    if (!url || typeof url !== "string") {
        return { valid: false, error: "Webhook URL is required" };
    }

    if (url.length > 2048) {
        return {
            valid: false,
            error: "Webhook URL exceeds maximum length (2048)",
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { valid: false, error: "Invalid URL format" };
    }

    // Must be HTTPS
    if (parsed.protocol !== "https:") {
        return { valid: false, error: "Webhook URL must use HTTPS" };
    }

    // Check blocked hosts
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(hostname)) {
        return { valid: false, error: "This hostname is not allowed" };
    }

    // Check blocked patterns
    for (const pattern of BLOCKED_HOST_PATTERNS) {
        if (pattern.test(hostname)) {
            return {
                valid: false,
                error: "Private/internal hosts are not allowed",
            };
        }
    }

    // No credentials in URL
    if (parsed.username || parsed.password) {
        return { valid: false, error: "URL must not contain credentials" };
    }

    return { valid: true };
}

// ============================================================================
// Email Validation
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email address format.
 */
export function isValidEmail(email: string): boolean {
    if (!email || typeof email !== "string") return false;
    if (email.length > 255) return false;
    return EMAIL_REGEX.test(email);
}

// ============================================================================
// Pagination Validation
// ============================================================================

/**
 * Validate and sanitize pagination parameters.
 */
export function validatePagination(
    limit?: string | number,
    offset?: string | number
): { limit: number; offset: number; error?: string } {
    let parsedLimit = 20; // default
    let parsedOffset = 0; // default

    if (limit !== undefined) {
        parsedLimit = typeof limit === "string" ? parseInt(limit, 10) : limit;
        if (isNaN(parsedLimit) || parsedLimit < 1) {
            return {
                limit: 20,
                offset: 0,
                error: "limit must be a positive integer",
            };
        }
        if (parsedLimit > 100) {
            return { limit: 20, offset: 0, error: "limit cannot exceed 100" };
        }
    }

    if (offset !== undefined) {
        parsedOffset =
            typeof offset === "string" ? parseInt(offset, 10) : offset;
        if (isNaN(parsedOffset) || parsedOffset < 0) {
            return {
                limit: parsedLimit,
                offset: 0,
                error: "offset must be a non-negative integer",
            };
        }
    }

    return { limit: parsedLimit, offset: parsedOffset };
}

// ============================================================================
// Time Format Validation
// ============================================================================

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)Z$/;

/**
 * Validate ISO 8601 time format (HH:MM:SSZ).
 */
export function isValidTimeFormat(time: string): boolean {
    return TIME_REGEX.test(time);
}

// ============================================================================
// Policy Validation
// ============================================================================

const VALID_CHANNEL_TYPES = new Set(["email", "webhook"]);
const VALID_URGENCY_FILTERS = new Set(["all", "warning", "critical"]);
const VALID_REPORTING_CADENCES = new Set(["daily", "weekly", "monthly", "on_demand"]);
const VALID_REPORTING_DAYS = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]);

/**
 * Deep validate a notification channel configuration.
 */
export function validateNotificationChannel(
    channel: unknown,
    index: number
): string[] {
    const errors: string[] = [];
    const prefix = `notification_channels[${index}]`;

    if (!channel || typeof channel !== "object") {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    const ch = channel as Record<string, unknown>;

    // Validate type
    if (!ch.type || typeof ch.type !== "string") {
        errors.push(`${prefix}.type: is required`);
    } else if (!VALID_CHANNEL_TYPES.has(ch.type)) {
        errors.push(`${prefix}.type: must be 'email' or 'webhook'`);
    }

    // Validate destination based on type
    if (!ch.destination || typeof ch.destination !== "string") {
        errors.push(`${prefix}.destination: is required`);
    } else if (ch.type === "email") {
        if (!isValidEmail(ch.destination)) {
            errors.push(`${prefix}.destination: invalid email format`);
        }
    } else if (ch.type === "webhook") {
        const urlValidation = validateWebhookUrl(ch.destination);
        if (!urlValidation.valid) {
            errors.push(`${prefix}.destination: ${urlValidation.error}`);
        }
    }

    // Validate urgency_filter
    if (!ch.urgency_filter || typeof ch.urgency_filter !== "string") {
        errors.push(`${prefix}.urgency_filter: is required`);
    } else if (!VALID_URGENCY_FILTERS.has(ch.urgency_filter)) {
        errors.push(
            `${prefix}.urgency_filter: must be 'all', 'warning', or 'critical'`
        );
    }

    // Validate enabled
    if (typeof ch.enabled !== "boolean") {
        errors.push(`${prefix}.enabled: must be a boolean`);
    }

    return errors;
}

/**
 * Deep validate a watcher policy.
 */
export function validateWatcherPolicy(policy: unknown): string[] {
    const errors: string[] = [];

    if (!policy || typeof policy !== "object") {
        errors.push("policy: must be an object");
        return errors;
    }

    const p = policy as Record<string, unknown>;

    // Validate allowed_senders
    if (p.allowed_senders !== undefined) {
        if (!Array.isArray(p.allowed_senders)) {
            errors.push("allowed_senders: must be an array");
        } else {
            for (let i = 0; i < p.allowed_senders.length; i++) {
                const sender = p.allowed_senders[i];
                if (typeof sender !== "string") {
                    errors.push(`allowed_senders[${i}]: must be a string`);
                } else if (!isValidEmail(sender)) {
                    errors.push(`allowed_senders[${i}]: invalid email format`);
                }
            }
        }
    }

    // Validate timing thresholds
    if (p.silence_threshold_hours !== undefined) {
        const val = p.silence_threshold_hours;
        if (typeof val !== "number" || val < 1 || val > 720) {
            errors.push("silence_threshold_hours: must be between 1 and 720");
        }
    }

    if (p.deadline_warning_hours !== undefined) {
        const val = p.deadline_warning_hours;
        if (typeof val !== "number" || val < 1) {
            errors.push("deadline_warning_hours: must be at least 1");
        }
    }

    if (p.deadline_critical_hours !== undefined) {
        const val = p.deadline_critical_hours;
        if (typeof val !== "number" || val < 1) {
            errors.push("deadline_critical_hours: must be at least 1");
        }
    }

    // Warning hours must be greater than critical hours
    if (
        typeof p.deadline_warning_hours === "number" &&
        typeof p.deadline_critical_hours === "number" &&
        p.deadline_warning_hours <= p.deadline_critical_hours
    ) {
        errors.push(
            "deadline_warning_hours: must be greater than deadline_critical_hours"
        );
    }

    // Validate notification channels
    if (p.notification_channels !== undefined) {
        if (!Array.isArray(p.notification_channels)) {
            errors.push("notification_channels: must be an array");
        } else {
            for (let i = 0; i < p.notification_channels.length; i++) {
                errors.push(
                    ...validateNotificationChannel(
                        p.notification_channels[i],
                        i
                    )
                );
            }
        }
    }

    // Validate reporting cadence
    if (p.reporting_cadence !== undefined) {
        if (
            typeof p.reporting_cadence !== "string" ||
            !VALID_REPORTING_CADENCES.has(p.reporting_cadence)
        ) {
            errors.push(
                "reporting_cadence: must be 'daily', 'weekly', 'monthly', or 'on_demand'"
            );
        }
    }

    // Validate reporting time
    if (p.reporting_time !== undefined) {
        if (
            typeof p.reporting_time !== "string" ||
            !isValidTimeFormat(p.reporting_time)
        ) {
            errors.push(
                "reporting_time: must be in HH:MM:SSZ format (e.g., '09:00:00Z')"
            );
        }
    }

    // Validate reporting day (required for weekly and monthly)
    if (p.reporting_cadence === "weekly") {
        if (
            p.reporting_day === undefined ||
            typeof p.reporting_day !== "string" ||
            !VALID_REPORTING_DAYS.has(p.reporting_day)
        ) {
            errors.push(
                "reporting_day: required for weekly cadence, must be a day name (e.g., 'monday')"
            );
        }
    }

    if (p.reporting_cadence === "monthly") {
        if (
            p.reporting_day === undefined ||
            typeof p.reporting_day !== "number" ||
            p.reporting_day < 1 ||
            p.reporting_day > 31
        ) {
            errors.push(
                "reporting_day: required for monthly cadence, must be a number between 1 and 31"
            );
        }
    }

    // Validate reporting recipients
    if (p.reporting_recipients !== undefined) {
        if (!Array.isArray(p.reporting_recipients)) {
            errors.push("reporting_recipients: must be an array");
        } else {
            for (let i = 0; i < p.reporting_recipients.length; i++) {
                const recipient = p.reporting_recipients[i];
                if (typeof recipient !== "string") {
                    errors.push(`reporting_recipients[${i}]: must be a string`);
                } else if (!isValidEmail(recipient)) {
                    errors.push(
                        `reporting_recipients[${i}]: invalid email format`
                    );
                }
            }
        }
    }

    // Validate feature flags
    if (
        p.enable_soft_deadline_reminders !== undefined &&
        typeof p.enable_soft_deadline_reminders !== "boolean"
    ) {
        errors.push("enable_soft_deadline_reminders: must be a boolean");
    }

    if (
        p.enable_urgency_signal_reminders !== undefined &&
        typeof p.enable_urgency_signal_reminders !== "boolean"
    ) {
        errors.push("enable_urgency_signal_reminders: must be a boolean");
    }

    return errors;
}

// ============================================================================
// Request Body Size Validation
// ============================================================================

/** Maximum request body size in bytes (10MB) */
export const MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Check if a request body exceeds the maximum size.
 */
export function isBodyTooLarge(body: string | null): boolean {
    if (!body) return false;
    return Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE;
}

/**
 * Get body size in bytes.
 */
export function getBodySize(body: string | null): number {
    if (!body) return 0;
    return Buffer.byteLength(body, "utf8");
}
