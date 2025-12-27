/**
 * Webhook Security
 *
 * Implements HMAC signing for outbound webhooks.
 * Follows industry standards (similar to Stripe, GitHub webhooks).
 */

import { createHmac } from "crypto";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get webhook signing secret from environment.
 * This should be a unique, random secret per installation.
 */
export function getWebhookSecret(): string {
    const secret = process.env.WEBHOOK_SIGNING_SECRET;
    if (!secret) {
        console.warn(
            "[SECURITY] WEBHOOK_SIGNING_SECRET not set. Using default for development."
        );
        return "vigil-webhook-development-secret";
    }
    return secret;
}

// ============================================================================
// HMAC Signing
// ============================================================================

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * @param payload - The JSON string payload
 * @param secret - The webhook signing secret
 * @param timestamp - Unix timestamp for replay protection
 * @returns The signature string
 */
export function signWebhookPayload(
    payload: string,
    secret: string,
    timestamp: number
): string {
    // Include timestamp in signed message for replay protection
    const signedMessage = `${timestamp}.${payload}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(signedMessage);
    return hmac.digest("hex");
}

/**
 * Verify a webhook signature.
 *
 * @param payload - The JSON string payload
 * @param signature - The received signature
 * @param timestamp - The received timestamp
 * @param secret - The webhook signing secret
 * @returns Whether the signature is valid
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: number,
    secret: string
): boolean {
    const expectedSignature = signWebhookPayload(payload, secret, timestamp);

    // Use timing-safe comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
        return false;
    }

    // Simple constant-time comparison
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
        result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
}

/**
 * Check if a webhook timestamp is within acceptable window.
 * Prevents replay attacks by rejecting old webhooks.
 *
 * @param timestamp - The webhook timestamp
 * @param toleranceSeconds - Maximum age in seconds (default: 300 = 5 minutes)
 * @returns Whether the timestamp is valid
 */
export function isTimestampValid(
    timestamp: number,
    toleranceSeconds: number = 300
): boolean {
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;

    // Reject if too old
    if (age > toleranceSeconds) {
        return false;
    }

    // Reject if in the future (clock skew tolerance: 60 seconds)
    if (age < -60) {
        return false;
    }

    return true;
}

// ============================================================================
// Header Helpers
// ============================================================================

/**
 * Header name for webhook signature.
 */
export const WEBHOOK_SIGNATURE_HEADER = "X-Vigil-Signature";

/**
 * Header name for webhook timestamp.
 */
export const WEBHOOK_TIMESTAMP_HEADER = "X-Vigil-Timestamp";

/**
 * Build webhook security headers.
 */
export function buildWebhookHeaders(
    payload: string,
    secret?: string
): Record<string, string> {
    const signingSecret = secret || getWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(payload, signingSecret, timestamp);

    return {
        [WEBHOOK_SIGNATURE_HEADER]: `sha256=${signature}`,
        [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
        "Content-Type": "application/json",
    };
}

/**
 * Parse signature header value.
 * Format: "sha256=<hex_signature>"
 */
export function parseSignatureHeader(header: string): {
    algorithm: string;
    signature: string;
} | null {
    const match = header.match(/^(\w+)=([a-f0-9]+)$/i);
    if (!match || !match[1] || !match[2]) {
        return null;
    }
    return {
        algorithm: match[1].toLowerCase(),
        signature: match[2],
    };
}
