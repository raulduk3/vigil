/**
 * Unit tests for PII and Secret Sanitization
 *
 * Tests detection and redaction of:
 * - PII: SSN, credit cards, phone numbers, addresses, etc.
 * - Secrets: API keys, tokens, passwords, private keys, etc.
 */

import { describe, test, expect } from "bun:test";
import {
    sanitizeText,
    sanitizeBodyExcerpt,
    likelyContainsSensitiveData,
    safeForLogging,
} from "@/security/pii-sanitizer";

// ============================================================================
// PII Detection Tests
// ============================================================================

describe("PII Sanitization: Social Security Numbers", () => {
    test("should redact SSN with dashes", () => {
        const input = "My SSN is 123-45-6789 please process";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "My SSN is [SSN_REDACTED] please process"
        );
        expect(result.was_sanitized).toBe(true);
        expect(result.pii_types_found).toContain("ssn");
    });

    test("should redact SSN with spaces", () => {
        const input = "SSN: 123 45 6789";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("SSN: [SSN_REDACTED]");
        expect(result.pii_types_found).toContain("ssn");
    });

    test("should NOT redact 9-digit numbers without separators to avoid false positives", () => {
        // This prevents false positives with routing numbers, etc.
        const input = "Order 123456789 on file";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Order 123456789 on file");
        expect(result.pii_types_found).not.toContain("ssn");
    });

    test("should redact multiple SSNs", () => {
        const input = "Primary: 111-22-3333, Secondary: 444-55-6666";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "Primary: [SSN_REDACTED], Secondary: [SSN_REDACTED]"
        );
        expect(result.redaction_count).toBe(2);
    });
});

describe("PII Sanitization: Credit Card Numbers", () => {
    test("should redact Visa card number", () => {
        const input = "Card: 4111111111111111";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Card: [CARD_REDACTED]");
        expect(result.pii_types_found).toContain("credit_card");
    });

    test("should redact card with dashes", () => {
        const input = "Payment card 4111-1111-1111-1111 on file";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "Payment card [CARD_REDACTED] on file"
        );
    });

    test("should redact card with spaces", () => {
        const input = "Card number: 4111 1111 1111 1111";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Card number: [CARD_REDACTED]");
    });

    test("should redact MasterCard", () => {
        const input = "MasterCard 5500000000000004";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("MasterCard [CARD_REDACTED]");
    });

    test("should redact Amex (15 digits)", () => {
        const input = "Amex: 340000000000009";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Amex: [CARD_REDACTED]");
    });
});

describe("PII Sanitization: Phone Numbers", () => {
    test("should redact US phone with parentheses", () => {
        const input = "Call me at (555) 123-4567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Call me at [PHONE_REDACTED]");
        expect(result.pii_types_found).toContain("phone_number");
    });

    test("should redact phone with dashes", () => {
        const input = "Phone: 555-123-4567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Phone: [PHONE_REDACTED]");
    });

    test("should redact phone with dots", () => {
        const input = "Contact: 555.123.4567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Contact: [PHONE_REDACTED]");
    });

    test("should redact phone with country code", () => {
        const input = "International: +1-555-123-4567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("International: [PHONE_REDACTED]");
    });

    test("should redact E.164 format", () => {
        const input = "Mobile: +14155551234";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Mobile: [PHONE_REDACTED]");
    });
});

describe("PII Sanitization: Email Addresses", () => {
    test("should redact email local part but keep domain", () => {
        const input = "Contact john.doe@example.com for details";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "Contact [EMAIL]@example.com for details"
        );
        expect(result.pii_types_found).toContain("email_address");
    });

    test("should handle multiple emails", () => {
        const input = "From: alice@corp.com To: bob@corp.com";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "From: [EMAIL]@corp.com To: [EMAIL]@corp.com"
        );
        expect(result.redaction_count).toBe(2);
    });
});

describe("PII Sanitization: IP Addresses", () => {
    test("should redact IPv4 address", () => {
        const input = "Server IP: 192.168.1.100";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Server IP: [IP_REDACTED]");
        expect(result.pii_types_found).toContain("ip_address");
    });

    test("should redact multiple IPs", () => {
        const input = "From 10.0.0.1 to 10.0.0.255";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "From [IP_REDACTED] to [IP_REDACTED]"
        );
    });
});

describe("PII Sanitization: Street Addresses", () => {
    test("should redact street address", () => {
        const input = "Ship to 123 Main Street, New York";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[ADDRESS_REDACTED]");
        expect(result.pii_types_found).toContain("street_address");
    });

    test("should redact address with apartment", () => {
        const input = "Located at 456 Oak Ave Apt 7B";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[ADDRESS_REDACTED]");
    });

    test("should redact state and ZIP", () => {
        const input = "Located in NY 10001";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Located in [LOCATION_REDACTED]");
    });
});

describe("PII Sanitization: Date of Birth", () => {
    test("should redact labeled DOB", () => {
        const input = "DOB: 01/15/1990";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[DOB_REDACTED]");
        expect(result.pii_types_found).toContain("date_of_birth");
    });

    test("should redact date of birth spelled out", () => {
        const input = "Date of Birth: 12-25-1985";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[DOB_REDACTED]");
    });
});

describe("PII Sanitization: Government IDs", () => {
    test("should redact passport number", () => {
        const input = "Passport: AB1234567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[PASSPORT_REDACTED]");
        expect(result.pii_types_found).toContain("passport");
    });

    test("should redact driver's license", () => {
        const input = "Driver's License: D12345678";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[DL_REDACTED]");
        expect(result.pii_types_found).toContain("drivers_license");
    });
});

describe("PII Sanitization: Bank Account Info", () => {
    test("should redact labeled account number", () => {
        const input = "Account: 123456789012";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[ACCOUNT_REDACTED]");
        expect(result.pii_types_found).toContain("bank_account");
    });

    test("should redact IBAN", () => {
        const input = "IBAN: DE89370400440532013000";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[ACCOUNT_REDACTED]");
    });

    test("should redact routing number", () => {
        const input = "Routing: 021000021";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[ROUTING_REDACTED]");
        expect(result.pii_types_found).toContain("routing_number");
    });
});

// ============================================================================
// Secret Detection Tests
// ============================================================================

describe("Secret Sanitization: AWS Keys", () => {
    test("should redact AWS Access Key ID", () => {
        const input = "Key: AKIAIOSFODNN7EXAMPLE";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Key: [AWS_KEY_REDACTED]");
        expect(result.secret_types_found).toContain("aws_key");
    });

    test("should redact AWS Secret Access Key", () => {
        const input =
            "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[AWS_SECRET_REDACTED]");
    });
});

describe("Secret Sanitization: GitHub Tokens", () => {
    test("should redact GitHub PAT", () => {
        const input =
            "Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Token: [GITHUB_TOKEN_REDACTED]");
        expect(result.secret_types_found).toContain("github_token");
    });

    test("should redact GitHub OAuth token", () => {
        const input =
            "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[GITHUB_TOKEN_REDACTED]");
    });
});

describe("Secret Sanitization: Stripe Keys", () => {
    test("should redact Stripe secret key", () => {
        const input = "Key: sk_test_4eC39HqLyjWDarjtT1zdp7dc";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Key: [STRIPE_KEY_REDACTED]");
        expect(result.secret_types_found).toContain("stripe_key");
    });

    test("should redact Stripe publishable key", () => {
        const input = "pk_live_xxxxxxxxxxxxxxxxxxxxxxxx";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[STRIPE_KEY_REDACTED]");
    });
});

describe("Secret Sanitization: API Keys", () => {
    test("should redact generic API key", () => {
        const input = "api_key: abcdefghijklmnopqrstuvwxyz";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[API_KEY_REDACTED]");
        expect(result.secret_types_found).toContain("api_key");
    });

    test("should redact API secret", () => {
        const input = "api-secret=my_super_secret_key_12345";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[API_KEY_REDACTED]");
    });
});

describe("Secret Sanitization: Tokens", () => {
    test("should redact Bearer token", () => {
        const input =
            "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(
            "Authorization: [BEARER_TOKEN_REDACTED]"
        );
        expect(result.secret_types_found).toContain("bearer_token");
    });

    test("should redact JWT token", () => {
        const input =
            "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiam9obiJ9.abc123";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("Token: [JWT_REDACTED]");
        expect(result.secret_types_found).toContain("jwt_token");
    });
});

describe("Secret Sanitization: Private Keys", () => {
    test("should redact RSA private key", () => {
        const input = `Here is the key:
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyf8Kl4
-----END RSA PRIVATE KEY-----
Please keep safe.`;
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[PRIVATE_KEY_REDACTED]");
        expect(result.secret_types_found).toContain("private_key");
    });

    test("should redact generic private key", () => {
        const input = `-----BEGIN PRIVATE KEY-----
abcdef123456
-----END PRIVATE KEY-----`;
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[PRIVATE_KEY_REDACTED]");
    });
});

describe("Secret Sanitization: Passwords", () => {
    test("should redact labeled password", () => {
        const input = "password: mysupersecretpassword123";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[PASSWORD_REDACTED]");
        expect(result.secret_types_found).toContain("password");
    });

    test("should redact password with equals sign", () => {
        const input = "pwd=verysecurepassword";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[PASSWORD_REDACTED]");
    });
});

describe("Secret Sanitization: Connection Strings", () => {
    test("should redact MongoDB connection string", () => {
        const input = "mongodb://user:password123@localhost:27017/db";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[CONNECTION_STRING_REDACTED]");
        expect(result.secret_types_found).toContain("generic_secret");
    });

    test("should redact PostgreSQL connection string", () => {
        const input = "postgresql://admin:secret@db.example.com:5432/mydb";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe("[CONNECTION_STRING_REDACTED]");
    });
});

// ============================================================================
// Integration and Edge Case Tests
// ============================================================================

describe("sanitizeBodyExcerpt", () => {
    test("should truncate and sanitize long text", () => {
        const longText = "A".repeat(1000) + " SSN: 123-45-6789";
        const result = sanitizeBodyExcerpt(longText, 100);
        expect(result.sanitized_text.length).toBeLessThanOrEqual(104); // 100 + "..."
        expect(result.sanitized_text.endsWith("...")).toBe(true);
    });

    test("should add ellipsis for truncated text", () => {
        const input = "Short text but longer than limit";
        const result = sanitizeBodyExcerpt(input, 10);
        expect(result.sanitized_text).toBe("Short text...");
    });

    test("should not add ellipsis for short text", () => {
        const input = "Short";
        const result = sanitizeBodyExcerpt(input, 100);
        expect(result.sanitized_text).toBe("Short");
        expect(result.sanitized_text.endsWith("...")).toBe(false);
    });

    test("should handle default max length", () => {
        const input = "Some text with SSN 123-45-6789";
        const result = sanitizeBodyExcerpt(input);
        expect(result.sanitized_text).toBe(
            "Some text with SSN [SSN_REDACTED]"
        );
    });
});

describe("likelyContainsSensitiveData", () => {
    test("should detect SSN-like patterns", () => {
        expect(likelyContainsSensitiveData("SSN 123-45-6789")).toBe(true);
    });

    test("should detect card-like patterns", () => {
        expect(
            likelyContainsSensitiveData("Card 1234-5678-9012-3456")
        ).toBe(true);
    });

    test("should detect secret keywords", () => {
        expect(likelyContainsSensitiveData("api_key=xxx")).toBe(true);
        expect(likelyContainsSensitiveData("password:")).toBe(true);
        expect(likelyContainsSensitiveData("secret token")).toBe(true);
    });

    test("should detect key markers", () => {
        expect(
            likelyContainsSensitiveData("-----BEGIN PRIVATE KEY-----")
        ).toBe(true);
    });

    test("should detect Stripe keys", () => {
        expect(likelyContainsSensitiveData("sk_test_xxx")).toBe(true);
    });

    test("should detect GitHub tokens", () => {
        expect(likelyContainsSensitiveData("ghp_xxx")).toBe(true);
    });

    test("should return false for safe text", () => {
        expect(
            likelyContainsSensitiveData("Hello, please review the report")
        ).toBe(false);
    });

    test("should return false for empty/null", () => {
        expect(likelyContainsSensitiveData("")).toBe(false);
    });
});

describe("safeForLogging", () => {
    test("should sanitize and truncate for logging", () => {
        const input = "Password is secretpassword123 and SSN is 123-45-6789";
        const result = safeForLogging(input, 100);
        expect(result).not.toContain("123-45-6789");
        expect(result).toContain("[SSN_REDACTED]");
    });

    test("should handle safe text", () => {
        const input = "Just a normal message";
        const result = safeForLogging(input, 100);
        expect(result).toBe("Just a normal message");
    });
});

describe("Mixed sensitive data", () => {
    test("should handle email with multiple sensitive items", () => {
        const input = `Hi,

Please process payment:
Card: 4111-1111-1111-1111
SSN: 123-45-6789
Call me at 555-123-4567

API Key: sk_test_abcdefghijklmnopqrstuv

Thanks,
John`;
        const result = sanitizeText(input);

        expect(result.sanitized_text).not.toContain("4111");
        expect(result.sanitized_text).not.toContain("123-45-6789");
        expect(result.sanitized_text).not.toContain("sk_test");

        expect(result.pii_types_found).toContain("credit_card");
        expect(result.pii_types_found).toContain("ssn");
        expect(result.pii_types_found).toContain("phone_number");
        expect(result.secret_types_found).toContain("stripe_key");

        expect(result.redaction_count).toBeGreaterThanOrEqual(4);
    });

    test("should preserve non-sensitive content", () => {
        const input =
            "Meeting scheduled for Friday at 3pm to discuss Q4 budget";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toBe(input);
        expect(result.was_sanitized).toBe(false);
        expect(result.pii_types_found).toEqual([]);
        expect(result.secret_types_found).toEqual([]);
    });
});

describe("Edge cases", () => {
    test("should handle empty string", () => {
        const result = sanitizeText("");
        expect(result.sanitized_text).toBe("");
        expect(result.was_sanitized).toBe(false);
    });

    test("should handle whitespace only", () => {
        const result = sanitizeText("   \n\t  ");
        expect(result.was_sanitized).toBe(false);
    });

    test("should handle unicode content", () => {
        const input = "联系方式: 555-123-4567";
        const result = sanitizeText(input);
        expect(result.sanitized_text).toContain("[PHONE_REDACTED]");
        expect(result.sanitized_text).toContain("联系方式");
    });

    test("should not false-positive on short numbers", () => {
        const input = "Order #12345 was shipped";
        const result = sanitizeText(input);
        // Should not redact short order numbers
        expect(result.sanitized_text).toBe("Order #12345 was shipped");
    });
});
