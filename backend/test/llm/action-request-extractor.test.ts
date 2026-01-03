/**
 * Action Request Extractor Unit Tests
 *
 * Tests for bounded LLM extraction and fallback extraction.
 * Commercial model: ONE question - "Does this contain an actionable request?"
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
    extractActionRequest,
    getExtractorVersion,
    type ExtractionInput,
    type ExtractionResult,
} from "../../src/llm/action-request-extractor";

// Note: These tests focus on the fallback extraction logic since we don't want
// to call the actual OpenAI API in unit tests. Integration tests with mocked
// API responses would cover the full LLM path.

// Store original API key to restore after tests
const originalApiKey = process.env.OPENAI_API_KEY;

// ============================================================================
// Fallback Extraction Tests (No OPENAI_API_KEY)
// ============================================================================

describe("Fallback Extraction", () => {
    // Ensure no API key for these tests - delete before each test
    beforeEach(() => {
        delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
        // Restore original if it existed
        if (originalApiKey) {
            process.env.OPENAI_API_KEY = originalApiKey;
        }
    });

    describe("Question pattern detection", () => {
        it("detects 'can you' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "Can you review this document and send your feedback?",
                from: "alice@example.com",
                subject: "Document Review",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
            expect(result.confidence).toBe("low"); // Fallback always low confidence
        });

        it("detects 'could you' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "Could you please confirm the meeting time?",
                from: "alice@example.com",
                subject: "Meeting Confirmation",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'would you' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "Would you be able to approve this expense report?",
                from: "alice@example.com",
                subject: "Expense Report",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'please' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "Please review the attached proposal at your earliest convenience.",
                from: "alice@example.com",
                subject: "Proposal Review",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'let me know' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "I've prepared the report. Let me know if you need any changes.",
                from: "alice@example.com",
                subject: "Report Ready",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'waiting for your' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "The project is on hold. We are waiting for your approval to proceed.",
                from: "alice@example.com",
                subject: "Project Status",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'need your' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "I need your signature on the contract before we can proceed.",
                from: "alice@example.com",
                subject: "Contract",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects 'require your' pattern", async () => {
            const input: ExtractionInput = {
                email_text: "This matter will require your immediate attention.",
                from: "alice@example.com",
                subject: "Urgent Matter",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });

        it("detects question marks", async () => {
            const input: ExtractionInput = {
                email_text: "Are you available for a call tomorrow afternoon?",
                from: "alice@example.com",
                subject: "Quick Call",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(true);
        });
    });

    describe("No action request detection", () => {
        it("returns false for informational email", async () => {
            const input: ExtractionInput = {
                email_text: "Just wanted to share that the project was completed successfully. The client was very happy with the results.",
                from: "alice@example.com",
                subject: "Project Update",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(false);
        });

        it("returns false for simple acknowledgment", async () => {
            const input: ExtractionInput = {
                email_text: "Thanks for the update. Looks good!",
                from: "alice@example.com",
                subject: "Re: Report",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(false);
        });

        it("returns false for empty email body", async () => {
            const input: ExtractionInput = {
                email_text: "",
                from: "alice@example.com",
                subject: "No Content",
            };

            const result = await extractActionRequest(input);

            expect(result.contains_action_request).toBe(false);
        });
    });

    describe("Result structure", () => {
        it("returns correct structure for detected request", async () => {
            const input: ExtractionInput = {
                email_text: "Can you review this?",
                from: "alice@example.com",
                subject: "Review Request",
            };

            const result = await extractActionRequest(input);

            expect(result).toHaveProperty("contains_action_request");
            expect(result).toHaveProperty("action_summary");
            expect(result).toHaveProperty("request_type");
            expect(result).toHaveProperty("source_span");
            expect(result).toHaveProperty("confidence");
        });

        it("returns 'unknown' request_type in fallback mode", async () => {
            const input: ExtractionInput = {
                email_text: "Can you review this proposal?",
                from: "alice@example.com",
                subject: "Proposal",
            };

            const result = await extractActionRequest(input);

            expect(result.request_type).toBe("unknown");
        });

        it("returns 'low' confidence in fallback mode", async () => {
            const input: ExtractionInput = {
                email_text: "Please approve this request.",
                from: "alice@example.com",
                subject: "Approval",
            };

            const result = await extractActionRequest(input);

            expect(result.confidence).toBe("low");
        });

        it("includes source_span with matched pattern", async () => {
            const input: ExtractionInput = {
                email_text: "Hello, can you review this document by Friday?",
                from: "alice@example.com",
                subject: "Document Review",
            };

            const result = await extractActionRequest(input);

            expect(result.source_span).toBeTruthy();
            expect(input.email_text.toLowerCase()).toContain(result.source_span.toLowerCase());
        });
    });
});

// ============================================================================
// Extractor Version Tests
// ============================================================================

describe("getExtractorVersion", () => {
    it("returns version string", () => {
        const version = getExtractorVersion();

        expect(typeof version).toBe("string");
        expect(version.length).toBeGreaterThan(0);
    });

    it("includes 'commercial' in version name", () => {
        const version = getExtractorVersion();

        expect(version).toContain("commercial");
    });
});

// ============================================================================
// Commercial Model Constraints Tests
// ============================================================================

describe("Commercial Model Constraints", () => {
    it("does NOT extract deadlines", async () => {
        const input: ExtractionInput = {
            email_text: "Please review this by January 15th, 2024. This is due next Friday.",
            from: "alice@example.com",
            subject: "Deadline Request",
        };

        const result = await extractActionRequest(input) as any;

        // Result should not contain deadline fields
        expect(result.deadline_utc).toBeUndefined();
        expect(result.hard_deadline).toBeUndefined();
        expect(result.soft_deadline).toBeUndefined();
        expect(result.due_date).toBeUndefined();
    });

    it("does NOT infer urgency levels", async () => {
        const input: ExtractionInput = {
            email_text: "URGENT: Please respond immediately! This is critical!",
            from: "alice@example.com",
            subject: "URGENT",
        };

        const result = await extractActionRequest(input) as any;

        // Result should not contain urgency fields
        expect(result.urgency_level).toBeUndefined();
        expect(result.urgency).toBeUndefined();
        expect(result.priority).toBeUndefined();
    });

    it("returns single extraction result (not array)", async () => {
        const input: ExtractionInput = {
            email_text: "Can you review this? Also, please approve the budget. And confirm the meeting time.",
            from: "alice@example.com",
            subject: "Multiple Requests",
        };

        const result = await extractActionRequest(input);

        // Should be a single result, not an array
        expect(Array.isArray(result)).toBe(false);
        expect(result.contains_action_request).toBe(true);
    });

    it("request_type is bounded to valid values", async () => {
        const input: ExtractionInput = {
            email_text: "Please review this proposal.",
            from: "alice@example.com",
            subject: "Proposal",
        };

        const result = await extractActionRequest(input);

        const validTypes = ["confirmation", "approval", "response", "review", "unknown"];
        expect(validTypes).toContain(result.request_type);
    });

    it("confidence is bounded to valid values", async () => {
        const input: ExtractionInput = {
            email_text: "Can you help with this?",
            from: "alice@example.com",
            subject: "Help",
        };

        const result = await extractActionRequest(input);

        const validConfidence = ["high", "medium", "low"];
        expect(validConfidence).toContain(result.confidence);
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
    it("handles very long email text", async () => {
        const longText = "This is a test. ".repeat(1000) + "Can you review this?";
        const input: ExtractionInput = {
            email_text: longText,
            from: "alice@example.com",
            subject: "Long Email",
        };

        const result = await extractActionRequest(input);

        expect(result.contains_action_request).toBe(true);
    });

    it("handles special characters in email text", async () => {
        const input: ExtractionInput = {
            email_text: "Can you review this? 日本語テスト émojis 🎉 <script>alert('xss')</script>",
            from: "alice@example.com",
            subject: "Special Characters",
        };

        const result = await extractActionRequest(input);

        expect(result.contains_action_request).toBe(true);
    });

    it("handles multiline email text", async () => {
        const input: ExtractionInput = {
            email_text: `Hi Team,

I hope this email finds you well.

Can you please review the attached document?

Best regards,
Alice`,
            from: "alice@example.com",
            subject: "Document Review",
        };

        const result = await extractActionRequest(input);

        expect(result.contains_action_request).toBe(true);
    });

    it("handles email with only subject-based context", async () => {
        // Clear API key to ensure fallback mode
        delete process.env.OPENAI_API_KEY;
        
        const input: ExtractionInput = {
            email_text: "See attached.",
            from: "alice@example.com",
            subject: "Can you review?",
        };

        // Fallback only looks at email_text, not subject
        const result = await extractActionRequest(input);

        // "See attached" doesn't match patterns in fallback mode
        // Note: With real LLM, subject might be considered
        expect(result.contains_action_request).toBe(false);
    });
});

// ============================================================================
// Pattern Priority Tests
// ============================================================================

describe("Pattern Priority", () => {
    it("matches first applicable pattern", async () => {
        const input: ExtractionInput = {
            email_text: "Can you please let me know if you require any changes?",
            from: "alice@example.com",
            subject: "Review",
        };

        const result = await extractActionRequest(input);

        expect(result.contains_action_request).toBe(true);
        // Should match "can you" first
        expect(result.source_span.toLowerCase()).toContain("can you");
    });
});
