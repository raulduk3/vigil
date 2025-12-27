/**
 * PII and Secret Sanitization
 *
 * Detects and redacts Personally Identifiable Information (PII) and secrets
 * from email body excerpts before storage. Vigil never stores raw email bodies,
 * but this module ensures that even the short excerpt stored for context
 * has sensitive data removed.
 *
 * Categories of sensitive data:
 * - PII: SSN, credit cards, phone numbers, addresses, etc.
 * - Secrets: API keys, tokens, passwords, private keys, etc.
 *
 * Design principles:
 * - Conservative matching: Prefer false positives over missed PII
 * - Preserve readability: Use descriptive redaction placeholders
 * - Audit trail: Track what types of data were redacted
 */

/**
 * Types of PII that can be detected and redacted
 */
export type PIIType =
    | "ssn"
    | "credit_card"
    | "phone_number"
    | "email_address"
    | "ip_address"
    | "street_address"
    | "date_of_birth"
    | "passport"
    | "drivers_license"
    | "bank_account"
    | "routing_number";

/**
 * Types of secrets that can be detected and redacted
 */
export type SecretType =
    | "api_key"
    | "jwt_token"
    | "bearer_token"
    | "private_key"
    | "password"
    | "aws_key"
    | "github_token"
    | "stripe_key"
    | "generic_secret";

/**
 * Result of sanitization operation
 */
export interface SanitizationResult {
    /** Sanitized text with PII/secrets redacted */
    sanitized_text: string;
    /** Whether any redactions were made */
    was_sanitized: boolean;
    /** Types of PII found and redacted */
    pii_types_found: PIIType[];
    /** Types of secrets found and redacted */
    secret_types_found: SecretType[];
    /** Total count of redactions made */
    redaction_count: number;
}

/**
 * Pattern definition for detection
 */
interface DetectionPattern {
    type: PIIType | SecretType;
    pattern: RegExp;
    placeholder: string;
}

// ============================================================================
// PII Detection Patterns
// Note: Order matters! More specific labeled patterns should come BEFORE
// general patterns like phone numbers to prevent false matches.
// ============================================================================

const PII_PATTERNS: DetectionPattern[] = [
    // ---- LABELED PATTERNS (must come first to prevent phone regex matching) ----

    // Bank Account Numbers (when labeled) - MUST come before phone pattern
    {
        type: "bank_account",
        pattern:
            /(?:Account|Acct|A\/C)[\s#:]*\d{8,17}/gi,
        placeholder: "[ACCOUNT_REDACTED]",
    },

    // IBAN (when labeled) - MUST come before phone pattern
    {
        type: "bank_account",
        pattern:
            /IBAN[\s:]*[A-Z]{2}\d{2}[A-Z0-9]{4,30}/gi,
        placeholder: "[ACCOUNT_REDACTED]",
    },

    // Routing Numbers (US - 9 digits, when labeled) - MUST come before phone pattern
    {
        type: "routing_number",
        pattern: /(?:Routing|ABA|RTN)[\s#:]*\d{9}/gi,
        placeholder: "[ROUTING_REDACTED]",
    },

    // Date of Birth patterns (when labeled)
    {
        type: "date_of_birth",
        pattern:
            /(?:DOB|Date\s+of\s+Birth|Birthday|Born)[\s:]+\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/gi,
        placeholder: "[DOB_REDACTED]",
    },

    // Passport Numbers (when labeled)
    {
        type: "passport",
        pattern: /(?:Passport|Passport\s*#?)[\s:]*[A-Z0-9]{6,9}/gi,
        placeholder: "[PASSPORT_REDACTED]",
    },

    // Driver's License (when labeled)
    {
        type: "drivers_license",
        pattern:
            /(?:DL|Driver'?s?\s*License|License\s*#?)[\s:]*[A-Z0-9]{5,15}/gi,
        placeholder: "[DL_REDACTED]",
    },

    // ---- GENERAL PATTERNS ----

    // Social Security Number (US)
    // Matches: 123-45-6789, 123 45 6789 (with separators only to reduce false positives)
    {
        type: "ssn",
        pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
        placeholder: "[SSN_REDACTED]",
    },

    // Credit Card Numbers
    // Matches major card formats: Visa, MasterCard, Amex, Discover
    {
        type: "credit_card",
        pattern:
            /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
        placeholder: "[CARD_REDACTED]",
    },
    // Card numbers with spaces or dashes
    {
        type: "credit_card",
        pattern:
            /\b(?:\d{4}[-\s]){3}\d{4}\b|\b(?:\d{4}[-\s]){2}\d{6}[-\s]\d{5}\b/g,
        placeholder: "[CARD_REDACTED]",
    },

    // Phone Numbers (various formats)
    // Matches: +1-555-555-5555, (555) 555-5555, 555.555.5555, 555-555-5555
    // Note: Requires separators to avoid matching account numbers
    {
        type: "phone_number",
        pattern:
            /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g,
        placeholder: "[PHONE_REDACTED]",
    },
    // International format with + prefix
    {
        type: "phone_number",
        pattern: /\+[1-9]\d{6,14}/g,
        placeholder: "[PHONE_REDACTED]",
    },

    // Email Addresses (but keep domain for context)
    // Note: We replace just the local part, keeping domain visible
    {
        type: "email_address",
        pattern: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
        placeholder: "[EMAIL]@$1",
    },

    // IP Addresses
    {
        type: "ip_address",
        pattern:
            /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        placeholder: "[IP_REDACTED]",
    },

    // Street Addresses (US format - conservative match)
    {
        type: "street_address",
        pattern:
            /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\.?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+|Unit\s*\d+)?\b/gi,
        placeholder: "[ADDRESS_REDACTED]",
    },

    // ZIP Codes (when appearing with address context)
    {
        type: "street_address",
        pattern: /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,
        placeholder: "[LOCATION_REDACTED]",
    },
];

// ============================================================================
// Secret Detection Patterns
// ============================================================================

const SECRET_PATTERNS: DetectionPattern[] = [
    // AWS Access Key ID
    {
        type: "aws_key",
        pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
        placeholder: "[AWS_KEY_REDACTED]",
    },

    // AWS Secret Access Key (40 char base64)
    {
        type: "aws_key",
        pattern:
            /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)[\s:="']*[A-Za-z0-9/+=]{40}\b/gi,
        placeholder: "[AWS_SECRET_REDACTED]",
    },

    // GitHub Personal Access Token
    {
        type: "github_token",
        pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
        placeholder: "[GITHUB_TOKEN_REDACTED]",
    },

    // Stripe API Keys
    {
        type: "stripe_key",
        pattern: /(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{20,}/g,
        placeholder: "[STRIPE_KEY_REDACTED]",
    },

    // Generic API Keys (common patterns)
    {
        type: "api_key",
        pattern:
            /\b(?:api[_-]?key|apikey|api[_-]?secret)[\s:="']*[A-Za-z0-9_\-]{20,}\b/gi,
        placeholder: "[API_KEY_REDACTED]",
    },

    // Bearer Tokens
    {
        type: "bearer_token",
        pattern: /\bBearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
        placeholder: "[BEARER_TOKEN_REDACTED]",
    },

    // JWT Tokens (three base64 segments)
    {
        type: "jwt_token",
        pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
        placeholder: "[JWT_REDACTED]",
    },

    // Private Keys (PEM format markers)
    {
        type: "private_key",
        pattern:
            /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
        placeholder: "[PRIVATE_KEY_REDACTED]",
    },

    // SSH Private Keys
    {
        type: "private_key",
        pattern:
            /-----BEGIN\s+(?:OPENSSH|EC|DSA)\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:OPENSSH|EC|DSA)\s+PRIVATE\s+KEY-----/g,
        placeholder: "[SSH_KEY_REDACTED]",
    },

    // Password patterns (when labeled)
    {
        type: "password",
        pattern:
            /\b(?:password|passwd|pwd|pass)[\s:="']+[^\s"']{8,}\b/gi,
        placeholder: "[PASSWORD_REDACTED]",
    },

    // Generic secrets (when labeled)
    {
        type: "generic_secret",
        pattern:
            /\b(?:secret|token|credential|auth)[\s:="']+[A-Za-z0-9_\-]{16,}\b/gi,
        placeholder: "[SECRET_REDACTED]",
    },

    // Connection strings
    {
        type: "generic_secret",
        pattern:
            /\b(?:mongodb|postgresql|mysql|redis|amqp):\/\/[^\s"']+:[^\s"']+@[^\s"']+\b/gi,
        placeholder: "[CONNECTION_STRING_REDACTED]",
    },
];

/**
 * Sanitize text by removing PII and secrets.
 *
 * @param text - The text to sanitize
 * @returns SanitizationResult with sanitized text and metadata
 */
export function sanitizeText(text: string): SanitizationResult {
    if (!text || text.trim().length === 0) {
        return {
            sanitized_text: text,
            was_sanitized: false,
            pii_types_found: [],
            secret_types_found: [],
            redaction_count: 0,
        };
    }

    let sanitized = text;
    const piiTypesFound = new Set<PIIType>();
    const secretTypesFound = new Set<SecretType>();
    let redactionCount = 0;

    // Apply PII patterns
    for (const { type, pattern, placeholder } of PII_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = sanitized.match(pattern);
        if (matches) {
            redactionCount += matches.length;
            piiTypesFound.add(type as PIIType);
            sanitized = sanitized.replace(pattern, placeholder);
        }
    }

    // Apply secret patterns
    for (const { type, pattern, placeholder } of SECRET_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = sanitized.match(pattern);
        if (matches) {
            redactionCount += matches.length;
            secretTypesFound.add(type as SecretType);
            sanitized = sanitized.replace(pattern, placeholder);
        }
    }

    return {
        sanitized_text: sanitized,
        was_sanitized: redactionCount > 0,
        pii_types_found: Array.from(piiTypesFound),
        secret_types_found: Array.from(secretTypesFound),
        redaction_count: redactionCount,
    };
}

/**
 * Sanitize email body excerpt for storage.
 * This is the main entry point for the ingestion pipeline.
 *
 * @param bodyText - Full email body text
 * @param maxLength - Maximum length of excerpt to store (default 500)
 * @returns Sanitized excerpt ready for storage
 */
export function sanitizeBodyExcerpt(
    bodyText: string,
    maxLength: number = 500
): SanitizationResult {
    // First truncate to limit exposure
    const truncated = bodyText.substring(0, maxLength);

    // Then sanitize the truncated text
    const result = sanitizeText(truncated);

    // Add truncation indicator if needed
    if (bodyText.length > maxLength) {
        result.sanitized_text = result.sanitized_text + "...";
    }

    return result;
}

/**
 * Quick check if text likely contains PII or secrets.
 * Useful for logging decisions without full sanitization.
 *
 * @param text - Text to check
 * @returns true if likely contains sensitive data
 */
export function likelyContainsSensitiveData(text: string): boolean {
    if (!text) return false;

    // Quick patterns for likely sensitive data
    const quickPatterns = [
        /\d{3}[-\s]?\d{2}[-\s]?\d{4}/, // SSN-like
        /\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}/, // Card-like
        /\b(?:password|secret|token|api[_-]?key)\b/i, // Keywords
        /-----BEGIN.*KEY-----/, // Key markers
        /\b(?:sk|pk)_(?:test|live)_/, // Stripe keys
        /\bghp_[A-Za-z0-9]/, // GitHub tokens
    ];

    return quickPatterns.some((pattern) => pattern.test(text));
}

/**
 * Get a safe logging representation of text.
 * Returns first N chars with sensitive data replaced by asterisks.
 *
 * @param text - Text to make safe for logging
 * @param maxLength - Maximum chars to include
 * @returns Safe string for logging
 */
export function safeForLogging(text: string, maxLength: number = 100): string {
    const result = sanitizeText(text.substring(0, maxLength));
    return result.sanitized_text;
}
