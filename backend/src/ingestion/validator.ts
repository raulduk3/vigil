/**
 * Email Ingestion Validator
 *
 * Validates incoming email messages against watcher policies.
 * Per MR-BackendIngestion-1: Sender validation
 * Per MR-BackendIngestion-3: Message deduplication
 * Per FR-18: Sender allowlist validation
 */

import type { WatcherPolicy } from "../events/types";

export type IncomingEmail = {
    readonly messageId: string;
    readonly from: string;
    readonly to: string;
    readonly subject: string;
    readonly bodyText: string;
    readonly receivedAt: number;
    readonly headers: Record<string, string>;
};

export type ValidationResult =
    | { valid: true; reason?: undefined }
    | { valid: false; reason: string };

/**
 * Validate sender against watcher policy allowlist.
 * Per FR-18: Case-insensitive exact match.
 *
 * @param sender - Email address of sender
 * @param policy - Watcher policy with allowed_senders
 * @returns Validation result
 */
export function validateSender(
    sender: string,
    policy: WatcherPolicy
): ValidationResult {
    // Empty allowlist means all senders allowed
    if (policy.allowed_senders.length === 0) {
        return { valid: true };
    }

    const normalizedSender = sender.toLowerCase().trim();
    const allowed = policy.allowed_senders.some(
        (allowedSender) =>
            allowedSender.toLowerCase().trim() === normalizedSender
    );

    if (allowed) {
        return { valid: true };
    }

    return {
        valid: false,
        reason: `Sender ${sender} not in allowlist`,
    };
}

/**
 * Check if message ID already exists (deduplication).
 * Per MR-BackendIngestion-3: Prevent duplicate MESSAGE_RECEIVED events.
 *
 * @param messageId - Message ID to check
 * @param existingMessageIds - Set of existing message IDs
 * @returns true if duplicate
 */
export function isDuplicateMessage(
    messageId: string,
    existingMessageIds: ReadonlySet<string>
): boolean {
    return existingMessageIds.has(messageId);
}

/**
 * Generate deterministic message ID from email content.
 * Used when Message-ID header is missing or invalid.
 *
 * @param email - Incoming email
 * @returns Deterministic message ID based on content hash
 */
export function generateMessageId(email: IncomingEmail): string {
    const content = `${email.from}|${email.subject}|${email.receivedAt}|${email.bodyText.slice(0, 500)}`;
    // Simple hash for deterministic ID generation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `gen_${Math.abs(hash).toString(36)}`;
}

/**
 * Extract email headers relevant for threading.
 *
 * @param headers - Raw email headers
 * @returns Threading-relevant headers
 */
export function extractThreadingHeaders(headers: Record<string, string>): {
    inReplyTo: string | null;
    references: string[];
    conversationIndex: string | null;
    threadTopic: string | null;
} {
    return {
        inReplyTo: headers["In-Reply-To"] || headers["in-reply-to"] || null,
        references: (headers["References"] || headers["references"] || "")
            .split(/\s+/)
            .filter(Boolean),
        conversationIndex:
            headers["Conversation-Index"] ||
            headers["conversation-index"] ||
            null,
        threadTopic: headers["Thread-Topic"] || headers["thread-topic"] || null,
    };
}

/**
 * Normalize email subject for thread grouping.
 * Removes Re:, Fwd:, etc. prefixes.
 *
 * @param subject - Raw subject line
 * @returns Normalized subject
 */
export function normalizeSubject(subject: string): string {
    let result = subject;
    let prevResult = "";

    // Iteratively remove prefixes until no more changes
    while (result !== prevResult) {
        prevResult = result;
        // Remove common reply/forward prefixes (case-insensitive)
        result = result.replace(
            /^(re|fwd|fw|aw|sv|vs|tr|odp|odpověď|antw|rif|r|enc):\s*/i,
            ""
        );
        // Remove [tag] prefixes
        result = result.replace(/^\[.*?\]\s*/, "");
    }

    return result.trim().toLowerCase();
}

/**
 * Validate email structure for required fields.
 *
 * @param email - Incoming email
 * @returns Validation result
 */
export function validateEmailStructure(email: IncomingEmail): ValidationResult {
    if (!email.messageId) {
        return { valid: false, reason: "Missing message ID" };
    }
    if (!email.from) {
        return { valid: false, reason: "Missing sender address" };
    }
    if (!email.to) {
        return { valid: false, reason: "Missing recipient address" };
    }
    if (!email.receivedAt || email.receivedAt <= 0) {
        return { valid: false, reason: "Invalid received timestamp" };
    }
    return { valid: true };
}

/**
 * Extract ingest token from recipient address.
 * Format: <name>-<token>@ingest.email.vigil.run
 *
 * @param recipient - Recipient email address
 * @returns Ingest token or null if invalid format
 */
export function extractIngestToken(recipient: string): string | null {
    const match = recipient.match(/^[^@]+-([a-z0-9]+)@ingest\.email\.vigil\.run$/i);
    return match && match[1] ? match[1].toLowerCase() : null;
}
