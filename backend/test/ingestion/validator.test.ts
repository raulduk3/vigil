/**
 * Unit tests for email ingestion validation
 *
 * Tests per SDD requirements:
 * - FR-18: Sender Validation
 * - MR-BackendIngestion-1: Email parsing
 * - MR-BackendIngestion-3: Message deduplication
 */

import { describe, test, expect } from "bun:test";
import {
  validateSender,
  isDuplicateMessage,
  generateMessageId,
  extractThreadingHeaders,
  normalizeSubject,
  validateEmailStructure,
  extractIngestToken,
  type IncomingEmail,
} from "@/ingestion/validator";
import type { WatcherPolicy } from "@/events/types";

// Helper to create test policy
function createPolicy(
  overrides: Partial<WatcherPolicy> = {}
): WatcherPolicy {
  return {
    allowed_senders: [],
    silence_threshold_hours: 72,
    deadline_warning_hours: 24,
    deadline_critical_hours: 2,
    notification_channels: [],
    reporting_cadence: "daily",
    reporting_recipients: [],
    ...overrides,
  };
}

// Helper to create test email
function createEmail(overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    messageId: "msg_123",
    from: "sender@example.com",
    to: "watcher-abc123@ingest.email.vigil.run",
    subject: "Test Subject",
    bodyText: "Test body content",
    receivedAt: Date.now(),
    headers: {},
    ...overrides,
  };
}

describe("validateSender (FR-18: Sender Validation)", () => {
  test("should allow sender when exact match found", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@example.com"],
    });
    const result = validateSender("alice@example.com", policy);
    expect(result.valid).toBe(true);
  });

  test("should allow sender with case-insensitive match", () => {
    const policy = createPolicy({
      allowed_senders: ["Alice@Example.COM"],
    });
    const result = validateSender("alice@example.com", policy);
    expect(result.valid).toBe(true);
  });

  test("should reject sender not in allowlist", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@example.com"],
    });
    const result = validateSender("bob@example.com", policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("bob@example.com");
  });

  test("should allow any sender when allowlist is empty", () => {
    const policy = createPolicy({ allowed_senders: [] });
    const result = validateSender("anyone@anywhere.com", policy);
    expect(result.valid).toBe(true);
  });

  test("should match sender from multiple allowed senders", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@a.com", "bob@b.com", "carol@c.com"],
    });
    const result = validateSender("bob@b.com", policy);
    expect(result.valid).toBe(true);
  });

  test("should reject sender with domain mismatch", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@a.com"],
    });
    const result = validateSender("alice@b.com", policy);
    expect(result.valid).toBe(false);
  });

  test("should reject sender with subdomain mismatch (exact match required)", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@mail.example.com"],
    });
    const result = validateSender("alice@example.com", policy);
    expect(result.valid).toBe(false);
  });

  test("should handle whitespace in sender address", () => {
    const policy = createPolicy({
      allowed_senders: ["alice@example.com"],
    });
    const result = validateSender("  alice@example.com  ", policy);
    expect(result.valid).toBe(true);
  });

  test("should validate 1000 senders against 50-entry allowlist in < 200ms", () => {
    const allowlist = Array.from(
      { length: 50 },
      (_, i) => `user${i}@example.com`
    );
    const policy = createPolicy({ allowed_senders: allowlist });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      validateSender(`user${i % 50}@example.com`, policy);
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(200);
  });
});

describe("isDuplicateMessage (MR-BackendIngestion-3)", () => {
  test("should detect duplicate message ID", () => {
    const existingIds = new Set(["msg_1", "msg_2", "msg_3"]);
    expect(isDuplicateMessage("msg_2", existingIds)).toBe(true);
  });

  test("should not flag new message ID as duplicate", () => {
    const existingIds = new Set(["msg_1", "msg_2", "msg_3"]);
    expect(isDuplicateMessage("msg_4", existingIds)).toBe(false);
  });

  test("should handle empty existing set", () => {
    const existingIds = new Set<string>();
    expect(isDuplicateMessage("msg_1", existingIds)).toBe(false);
  });

  test("should handle case-sensitive message IDs", () => {
    const existingIds = new Set(["MSG_1"]);
    expect(isDuplicateMessage("msg_1", existingIds)).toBe(false);
    expect(isDuplicateMessage("MSG_1", existingIds)).toBe(true);
  });
});

describe("generateMessageId", () => {
  test("should generate deterministic ID for same content", () => {
    const email = createEmail({
      from: "sender@test.com",
      subject: "Test",
      receivedAt: 1000000,
      bodyText: "Hello world",
    });

    const id1 = generateMessageId(email);
    const id2 = generateMessageId(email);

    expect(id1).toBe(id2);
  });

  test("should generate different IDs for different content", () => {
    const email1 = createEmail({ subject: "Subject 1" });
    const email2 = createEmail({ subject: "Subject 2" });

    expect(generateMessageId(email1)).not.toBe(generateMessageId(email2));
  });

  test("should prefix generated IDs with 'gen_'", () => {
    const email = createEmail();
    const id = generateMessageId(email);
    expect(id.startsWith("gen_")).toBe(true);
  });
});

describe("extractThreadingHeaders", () => {
  test("should extract In-Reply-To header", () => {
    const headers = { "In-Reply-To": "<msg123@example.com>" };
    const result = extractThreadingHeaders(headers);
    expect(result.inReplyTo).toBe("<msg123@example.com>");
  });

  test("should extract References header as array", () => {
    const headers = {
      References: "<msg1@example.com> <msg2@example.com> <msg3@example.com>",
    };
    const result = extractThreadingHeaders(headers);
    expect(result.references).toEqual([
      "<msg1@example.com>",
      "<msg2@example.com>",
      "<msg3@example.com>",
    ]);
  });

  test("should extract Conversation-Index header", () => {
    const headers = { "Conversation-Index": "Ac1234567890" };
    const result = extractThreadingHeaders(headers);
    expect(result.conversationIndex).toBe("Ac1234567890");
  });

  test("should extract Thread-Topic header", () => {
    const headers = { "Thread-Topic": "Project Discussion" };
    const result = extractThreadingHeaders(headers);
    expect(result.threadTopic).toBe("Project Discussion");
  });

  test("should handle lowercase header names", () => {
    const headers = {
      "in-reply-to": "<msg@example.com>",
      references: "<ref@example.com>",
    };
    const result = extractThreadingHeaders(headers);
    expect(result.inReplyTo).toBe("<msg@example.com>");
    expect(result.references).toContain("<ref@example.com>");
  });

  test("should return null for missing headers", () => {
    const headers = {};
    const result = extractThreadingHeaders(headers);
    expect(result.inReplyTo).toBeNull();
    expect(result.references).toEqual([]);
    expect(result.conversationIndex).toBeNull();
    expect(result.threadTopic).toBeNull();
  });
});

describe("normalizeSubject (Thread Grouping)", () => {
  test("should remove Re: prefix", () => {
    expect(normalizeSubject("Re: Original Subject")).toBe("original subject");
  });

  test("should remove Fwd: prefix", () => {
    expect(normalizeSubject("Fwd: Forwarded Subject")).toBe("forwarded subject");
  });

  test("should remove multiple prefixes", () => {
    expect(normalizeSubject("Re: Re: Fwd: Subject")).toBe("subject");
  });

  test("should handle case-insensitive prefixes", () => {
    expect(normalizeSubject("RE: Subject")).toBe("subject");
    expect(normalizeSubject("FW: Subject")).toBe("subject");
  });

  test("should remove international reply prefixes", () => {
    expect(normalizeSubject("AW: German Reply")).toBe("german reply");
    expect(normalizeSubject("SV: Swedish Reply")).toBe("swedish reply");
    expect(normalizeSubject("Odp: Polish Reply")).toBe("polish reply");
  });

  test("should remove [tag] prefixes", () => {
    expect(normalizeSubject("[EXTERNAL] Subject")).toBe("subject");
    expect(normalizeSubject("[URGENT] Re: Subject")).toBe("subject");
  });

  test("should trim whitespace", () => {
    expect(normalizeSubject("  Subject  ")).toBe("subject");
  });

  test("should convert to lowercase", () => {
    expect(normalizeSubject("UPPERCASE Subject")).toBe("uppercase subject");
  });
});

describe("validateEmailStructure (MR-BackendIngestion-1)", () => {
  test("should accept valid email", () => {
    const email = createEmail();
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(true);
  });

  test("should reject email without message ID", () => {
    const email = createEmail({ messageId: "" });
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("message ID");
  });

  test("should reject email without sender", () => {
    const email = createEmail({ from: "" });
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("sender");
  });

  test("should reject email without recipient", () => {
    const email = createEmail({ to: "" });
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("recipient");
  });

  test("should reject email with invalid timestamp", () => {
    const email = createEmail({ receivedAt: 0 });
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("timestamp");
  });

  test("should reject email with negative timestamp", () => {
    const email = createEmail({ receivedAt: -1000 });
    const result = validateEmailStructure(email);
    expect(result.valid).toBe(false);
  });
});

describe("extractIngestToken", () => {
  test("should extract token from valid ingestion address", () => {
    const token = extractIngestToken("finance-a7f3k9@ingest.email.vigil.run");
    expect(token).toBe("a7f3k9");
  });

  test("should extract token from address with hyphens in name", () => {
    const token = extractIngestToken("client-billing-x4p9j2@ingest.email.vigil.run");
    expect(token).toBe("x4p9j2");
  });

  test("should handle uppercase in token", () => {
    const token = extractIngestToken("test-ABC123@ingest.email.vigil.run");
    expect(token).toBe("abc123");
  });

  test("should return null for invalid domain", () => {
    const token = extractIngestToken("test-abc123@other.domain.com");
    expect(token).toBeNull();
  });

  test("should return null for address without token", () => {
    const token = extractIngestToken("notokenhere@ingest.email.vigil.run");
    expect(token).toBeNull();
  });

  test("should return null for empty address", () => {
    const token = extractIngestToken("");
    expect(token).toBeNull();
  });
});

describe("Ingestion Performance", () => {
  test("should process email validation in < 1ms", () => {
    const email = createEmail();
    const policy = createPolicy({
      allowed_senders: ["sender@example.com"],
    });

    const start = performance.now();
    validateEmailStructure(email);
    validateSender(email.from, policy);
    normalizeSubject(email.subject);
    extractThreadingHeaders(email.headers);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1);
  });
});
