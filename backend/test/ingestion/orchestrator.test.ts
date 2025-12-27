/**
 * Unit tests for Backend Ingestion Orchestrator
 * 
 * Tests for Module Requirements:
 * - MR-BackendIngestion-1: Email parsing
 * - MR-BackendIngestion-2: Sender validation  
 * - MR-BackendIngestion-3: Email deduplication
 * - MR-BackendIngestion-4: LLM orchestration
 */

import { describe, test, expect } from "bun:test";
import {
  parseRawEmail,
  validateSenderAllowed,
  shouldRunExtraction,
  generateVigilMessageId,
  orchestrateLLMExtraction,
  createExtractionEvents,
  orchestrateIngestion,
  type IngestionContext,
} from "@/ingestion/orchestrator";

// ============================================================================
// MR-BackendIngestion-1: Email Parsing Tests
// ============================================================================

describe("MR-BackendIngestion-1: parseRawEmail", () => {
  test("should parse simple email with all headers", () => {
    const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Date: Wed, 25 Dec 2025 10:00:00 GMT
Message-ID: <abc123@example.com>

This is the email body.`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.sender).toBe("sender@example.com");
    expect(parsed.recipients).toEqual(["recipient@example.com"]);
    expect(parsed.subject).toBe("Test Email");
    expect(parsed.body_text).toBe("This is the email body.");
    expect(parsed.message_id).toBe("<abc123@example.com>");
  });

  test("should extract email from 'Name <email>' format", () => {
    const rawEmail = `From: John Doe <john@example.com>
To: Jane Smith <jane@example.com>
Subject: Test

Body text`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.sender).toBe("john@example.com");
    expect(parsed.recipients).toEqual(["jane@example.com"]);
  });

  test("should handle multiple recipients", () => {
    const rawEmail = `From: sender@example.com
To: alice@example.com, bob@example.com
CC: carol@example.com, dave@example.com
Subject: Group email

Body`;

    const parsed = parseRawEmail(rawEmail);

    // Recipients now combines To and CC (excluding Vigil addresses)
    expect(parsed.recipients).toHaveLength(4);
    expect(parsed.recipients).toContain("alice@example.com");
    expect(parsed.recipients).toContain("bob@example.com");
    expect(parsed.recipients).toContain("carol@example.com");
    expect(parsed.recipients).toContain("dave@example.com");
  });

  test("should parse multiline body", () => {
    const rawEmail = `From: sender@example.com
Subject: Multiline

Line 1
Line 2
Line 3`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.body_text).toContain("Line 1");
    expect(parsed.body_text).toContain("Line 2");
    expect(parsed.body_text).toContain("Line 3");
  });

  test("should handle missing optional headers", () => {
    const rawEmail = `From: sender@example.com
Subject: Minimal

Body`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.sender).toBe("sender@example.com");
    expect(parsed.recipients).toEqual([]);
    expect(parsed.message_id).toBeNull();
  });

  test("should preserve threading headers", () => {
    const rawEmail = `From: sender@example.com
Subject: Re: Original
In-Reply-To: <original@example.com>
References: <original@example.com> <reply1@example.com>
Conversation-Index: ABC123

Reply body`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.headers["in-reply-to"]).toBe("<original@example.com>");
    expect(parsed.headers["references"]).toContain("<original@example.com>");
    expect(parsed.headers["conversation-index"]).toBe("ABC123");
  });

  test("should parse date header into timestamp", () => {
    const rawEmail = `From: sender@example.com
Date: Wed, 25 Dec 2025 15:30:00 GMT
Subject: Dated email

Body`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.sent_at).toBeGreaterThan(0);
    const date = new Date(parsed.sent_at);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(11); // December
    expect(date.getUTCDate()).toBe(25);
  });

  test("should use current time for missing date", () => {
    const before = Date.now();
    const rawEmail = `From: sender@example.com
Subject: No date

Body`;

    const parsed = parseRawEmail(rawEmail);
    const after = Date.now();

    expect(parsed.sent_at).toBeGreaterThanOrEqual(before);
    expect(parsed.sent_at).toBeLessThanOrEqual(after);
  });

  test("should normalize email addresses to lowercase", () => {
    const rawEmail = `From: SENDER@EXAMPLE.COM
To: Recipient@Example.Com
Subject: Mixed case

Body`;

    const parsed = parseRawEmail(rawEmail);

    expect(parsed.sender).toBe("sender@example.com");
    expect(parsed.recipients[0]).toBe("recipient@example.com");
  });
});

// ============================================================================
// MR-BackendIngestion-2: Sender Validation Tests
// ============================================================================

describe("MR-BackendIngestion-2: validateSenderAllowed", () => {
  test("should allow all senders when allowlist is empty", () => {
    expect(validateSenderAllowed("anyone@anywhere.com", [])).toBe(true);
  });

  test("should allow sender in exact match list", () => {
    const allowlist = ["allowed@example.com", "another@example.com"];
    
    expect(validateSenderAllowed("allowed@example.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("another@example.com", allowlist)).toBe(true);
  });

  test("should reject sender not in list", () => {
    const allowlist = ["allowed@example.com"];
    
    expect(validateSenderAllowed("blocked@example.com", allowlist)).toBe(false);
  });

  test("should perform case-insensitive matching", () => {
    const allowlist = ["Allowed@Example.COM"];
    
    expect(validateSenderAllowed("allowed@example.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("ALLOWED@EXAMPLE.COM", allowlist)).toBe(true);
  });

  test("should support domain wildcard matching", () => {
    const allowlist = ["*@trusted.com"];
    
    expect(validateSenderAllowed("anyone@trusted.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("user@trusted.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("user@untrusted.com", allowlist)).toBe(false);
  });

  test("should handle mixed exact and wildcard entries", () => {
    const allowlist = ["specific@example.com", "*@trusted.com"];
    
    expect(validateSenderAllowed("specific@example.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("anyone@trusted.com", allowlist)).toBe(true);
    expect(validateSenderAllowed("other@example.com", allowlist)).toBe(false);
  });

  test("should return false for null/empty sender", () => {
    const allowlist = ["allowed@example.com"];
    
    expect(validateSenderAllowed("", allowlist)).toBe(false);
  });

  test("should trim whitespace from sender and allowlist", () => {
    const allowlist = ["  allowed@example.com  "];
    
    expect(validateSenderAllowed("  allowed@example.com  ", allowlist)).toBe(true);
  });
});

// ============================================================================
// MR-BackendIngestion-3: Deduplication Tests
// ============================================================================

describe("MR-BackendIngestion-3: generateVigilMessageId", () => {
  test("should use email Message-ID when present", () => {
    const id = generateVigilMessageId(
      "<abc123@example.com>",
      "sender@example.com",
      "Subject",
      Date.now()
    );

    expect(id.startsWith("msgid-")).toBe(true);
    expect(id.length).toBeGreaterThan(6);
  });

  test("should generate hash-based ID when no Message-ID", () => {
    const id = generateVigilMessageId(
      null,
      "sender@example.com",
      "Subject",
      Date.now()
    );

    expect(id.startsWith("hash-")).toBe(true);
  });

  test("should generate consistent IDs for same Message-ID", () => {
    const id1 = generateVigilMessageId(
      "<abc123@example.com>",
      "sender@example.com",
      "Subject",
      Date.now()
    );

    const id2 = generateVigilMessageId(
      "<abc123@example.com>",
      "different@example.com",
      "Different Subject",
      Date.now() + 1000
    );

    // Same Message-ID should produce same vigil ID
    expect(id1).toBe(id2);
  });

  test("should generate consistent hash for same content", () => {
    const timestamp = Date.now();
    
    const id1 = generateVigilMessageId(
      null,
      "sender@example.com",
      "Subject",
      timestamp
    );

    const id2 = generateVigilMessageId(
      null,
      "sender@example.com",
      "Subject",
      timestamp
    );

    expect(id1).toBe(id2);
  });

  test("should generate different hash for different content", () => {
    const timestamp = Date.now();

    const id1 = generateVigilMessageId(
      null,
      "sender1@example.com",
      "Subject",
      timestamp
    );

    const id2 = generateVigilMessageId(
      null,
      "sender2@example.com",
      "Subject",
      timestamp
    );

    expect(id1).not.toBe(id2);
  });

  test("should strip angle brackets from Message-ID", () => {
    const id1 = generateVigilMessageId(
      "<abc123@example.com>",
      "sender@example.com",
      "Subject",
      Date.now()
    );

    const id2 = generateVigilMessageId(
      "abc123@example.com",
      "sender@example.com",
      "Subject",
      Date.now()
    );

    expect(id1).toBe(id2);
  });
});

// ============================================================================
// MR-BackendIngestion-4: LLM Orchestration Tests
// ============================================================================

describe("MR-BackendIngestion-4: shouldRunExtraction", () => {
  test("should run extraction for allowed sender and active watcher", () => {
    expect(shouldRunExtraction(true, "active")).toBe(true);
  });

  test("should NOT run extraction for disallowed sender", () => {
    expect(shouldRunExtraction(false, "active")).toBe(false);
  });

  test("should NOT run extraction for paused watcher", () => {
    expect(shouldRunExtraction(true, "paused")).toBe(false);
  });

  test("should NOT run extraction for created (not activated) watcher", () => {
    expect(shouldRunExtraction(true, "created")).toBe(false);
  });

  test("should NOT run extraction for deleted watcher", () => {
    expect(shouldRunExtraction(true, "deleted")).toBe(false);
  });
});

describe("MR-BackendIngestion-4: orchestrateLLMExtraction", () => {
  const referenceTimestamp = new Date("2025-12-25T10:00:00Z").getTime();
  const referenceTimezone = "UTC";

  test("should extract hard deadline from email", () => {
    const result = orchestrateLLMExtraction(
      "Please submit the report due by Friday 5pm.",
      referenceTimestamp,
      referenceTimezone
    );

    expect(result.hardDeadline).not.toBeNull();
    expect(result.hardDeadline?.deadline_found).toBe(true);
  });

  test("should extract closure signal from email", () => {
    const result = orchestrateLLMExtraction(
      "Thanks! This issue is now closed.",
      referenceTimestamp,
      referenceTimezone
    );

    expect(result.closure).not.toBeNull();
    expect(result.closure?.closure_found).toBe(true);
  });

  test("should extract soft deadline signal from email", () => {
    const result = orchestrateLLMExtraction(
      "Please complete this by end of week.",
      referenceTimestamp,
      referenceTimezone
    );

    expect(result.softDeadline).not.toBeNull();
    expect(result.softDeadline?.signal_found).toBe(true);
  });

  test("should extract urgency signal from email", () => {
    const result = orchestrateLLMExtraction(
      "URGENT: Need this reviewed immediately.",
      referenceTimestamp,
      referenceTimezone
    );

    expect(result.urgencySignal).not.toBeNull();
    expect(result.urgencySignal?.urgency_found).toBe(true);
  });

  test("should return nulls for empty email", () => {
    const result = orchestrateLLMExtraction("", referenceTimestamp, referenceTimezone);

    expect(result.hardDeadline).toBeNull();
    expect(result.closure).toBeNull();
    expect(result.softDeadline).toBeNull();
    expect(result.urgencySignal).toBeNull();
  });

  test("should extract multiple signals from complex email", () => {
    const result = orchestrateLLMExtraction(
      "URGENT: The proposal is due by Friday 5pm. This is critical.",
      referenceTimestamp,
      referenceTimezone
    );

    expect(result.hardDeadline).not.toBeNull();
    expect(result.urgencySignal).not.toBeNull();
  });
});

describe("MR-BackendIngestion-4: createExtractionEvents", () => {
  const watcherId = "watcher-123";
  const messageId = "msg-456";
  const timestamp = Date.now();

  test("should create HARD_DEADLINE_OBSERVED event", () => {
    const extraction = {
      hardDeadline: {
        deadline_found: true,
        deadline_utc: Date.now() + 86400000,
        deadline_text: "Friday 5pm",
        source_span: "due by Friday 5pm",
        confidence: "high" as const,
        is_absolute: false,
        binding_language: true,
        extractor_version: "v1.0.0",
      },
      closure: null,
      softDeadline: null,
      urgencySignal: null,
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + HARD_DEADLINE_OBSERVED + EXTRACTION_COMPLETE = 3 events
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events[1].type).toBe("HARD_DEADLINE_OBSERVED");
    expect(result.events[2].type).toBe("EXTRACTION_COMPLETE");
    expect((result.events[1] as any).message_id).toBe(messageId);
    expect(result.hardDeadlineEventId).toBeTruthy();
  });

  test("should create CLOSURE_SIGNAL_OBSERVED event", () => {
    const extraction = {
      hardDeadline: null,
      closure: {
        closure_found: true,
        closure_type: "explicit" as const,
        source_span: "issue is closed",
        confidence: "high" as const,
        extractor_version: "v1.0.0",
      },
      softDeadline: null,
      urgencySignal: null,
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + CLOSURE_SIGNAL_OBSERVED + EXTRACTION_COMPLETE = 3 events
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events[1].type).toBe("CLOSURE_SIGNAL_OBSERVED");
    expect(result.events[2].type).toBe("EXTRACTION_COMPLETE");
    expect(result.closureSignalEventId).toBeTruthy();
  });

  test("should create SOFT_DEADLINE_SIGNAL_OBSERVED event", () => {
    const extraction = {
      hardDeadline: null,
      closure: null,
      softDeadline: {
        signal_found: true,
        signal_text: "end of week",
        source_span: "by end of week",
        estimated_horizon_hours: 120,
        confidence: "medium" as const,
        binding_language: false,
        extractor_version: "v1.0.0",
      },
      urgencySignal: null,
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + SOFT_DEADLINE_SIGNAL_OBSERVED + EXTRACTION_COMPLETE = 3 events
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events[1].type).toBe("SOFT_DEADLINE_SIGNAL_OBSERVED");
    expect(result.events[2].type).toBe("EXTRACTION_COMPLETE");
    expect(result.softDeadlineEventId).toBeTruthy();
  });

  test("should create URGENCY_SIGNAL_OBSERVED event", () => {
    const extraction = {
      hardDeadline: null,
      closure: null,
      softDeadline: null,
      urgencySignal: {
        urgency_found: true,
        urgency_level: "high" as const,
        indicators: ["urgent"],
        source_span: "URGENT:",
        extractor_version: "v1.0.0",
      },
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + URGENCY_SIGNAL_OBSERVED + EXTRACTION_COMPLETE = 3 events
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events[1].type).toBe("URGENCY_SIGNAL_OBSERVED");
    expect(result.events[2].type).toBe("EXTRACTION_COMPLETE");
    expect(result.urgencySignalEventId).toBeTruthy();
  });

  test("should create multiple events for multiple extractions", () => {
    const extraction = {
      hardDeadline: {
        deadline_found: true,
        deadline_utc: Date.now() + 86400000,
        deadline_text: "Friday 5pm",
        source_span: "due by Friday 5pm",
        confidence: "high" as const,
        is_absolute: false,
        binding_language: true,
        extractor_version: "v1.0.0",
      },
      closure: null,
      softDeadline: null,
      urgencySignal: {
        urgency_found: true,
        urgency_level: "high" as const,
        indicators: ["urgent"],
        source_span: "URGENT:",
        extractor_version: "v1.0.0",
      },
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + HARD_DEADLINE + URGENCY + EXTRACTION_COMPLETE = 4 events
    expect(result.events).toHaveLength(4);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events.map((e) => e.type)).toContain("HARD_DEADLINE_OBSERVED");
    expect(result.events.map((e) => e.type)).toContain("URGENCY_SIGNAL_OBSERVED");
    expect(result.events[result.events.length - 1].type).toBe("EXTRACTION_COMPLETE");
    expect(result.hardDeadlineEventId).toBeTruthy();
    expect(result.urgencySignalEventId).toBeTruthy();
  });

  test("should create only ROUTE_EXTRACTION_COMPLETE and EXTRACTION_COMPLETE for no extractions", () => {
    const extraction = {
      hardDeadline: null,
      closure: null,
      softDeadline: null,
      urgencySignal: null,
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + EXTRACTION_COMPLETE = 2 events (always)
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe("ROUTE_EXTRACTION_COMPLETE");
    expect(result.events[1].type).toBe("EXTRACTION_COMPLETE");
    expect(result.hardDeadlineEventId).toBeNull();
    expect(result.softDeadlineEventId).toBeNull();
    expect(result.urgencySignalEventId).toBeNull();
    expect(result.closureSignalEventId).toBeNull();
  });

  test("should set unique event_id for each event", () => {
    const extraction = {
      hardDeadline: {
        deadline_found: true,
        deadline_utc: Date.now() + 86400000,
        deadline_text: "Friday",
        source_span: "by Friday",
        confidence: "high" as const,
        is_absolute: false,
        binding_language: true,
        extractor_version: "v1.0.0",
      },
      closure: {
        closure_found: true,
        closure_type: "explicit" as const,
        source_span: "closed",
        confidence: "high" as const,
        extractor_version: "v1.0.0",
      },
      softDeadline: null,
      urgencySignal: null,
    };

    const result = createExtractionEvents(watcherId, messageId, extraction, timestamp);

    // ROUTE_EXTRACTION_COMPLETE + HARD_DEADLINE + CLOSURE + EXTRACTION_COMPLETE = 4 events
    expect(result.events).toHaveLength(4);
    const eventIds = result.events.map(e => e.event_id);
    const uniqueIds = new Set(eventIds);
    expect(uniqueIds.size).toBe(eventIds.length);
  });
});

// ============================================================================
// Full Orchestration Integration Tests
// ============================================================================

describe("orchestrateIngestion", () => {
  const context: IngestionContext = {
    watcher_id: "watcher-123",
    watcher_status: "active",
    policy: {
      allowed_senders: [],
      silence_threshold_hours: 72,
      deadline_warning_hours: 24,
      deadline_critical_hours: 2,
      notification_channels: [],
      reporting_cadence: "daily",
      reporting_recipients: [],
    },
    reference_timestamp: Date.now(),
    reference_timezone: "UTC",
  };

  const noDuplicate = async () => false;
  const isDuplicate = async () => true;

  test("should successfully ingest valid email", async () => {
    const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Date: Wed, 25 Dec 2025 10:00:00 GMT

This is a test email body.`;

    const result = await orchestrateIngestion(rawEmail, context, noDuplicate);

    expect(result.success).toBe(true);
    expect(result.message_received_event).not.toBeNull();
    expect(result.message_received_event?.type).toBe("MESSAGE_RECEIVED");
  });

  test("should reject duplicate messages", async () => {
    const rawEmail = `From: sender@example.com
Subject: Test

Body`;

    const result = await orchestrateIngestion(rawEmail, context, isDuplicate);

    expect(result.success).toBe(false);
    expect(result.skipped_reason).toBe("DUPLICATE_MESSAGE");
    expect(result.message_received_event).toBeNull();
  });

  test("should extract deadline from email body", async () => {
    const rawEmail = `From: sender@example.com
Subject: Deadline Request

Please submit the report due by Friday 5pm.`;

    const result = await orchestrateIngestion(rawEmail, context, noDuplicate);

    expect(result.success).toBe(true);
    expect(result.extraction_events.length).toBeGreaterThan(0);
    expect(result.extraction_events.some((e) => e.type === "HARD_DEADLINE_OBSERVED")).toBe(true);
  });

  test("should NOT extract when watcher is paused", async () => {
    const pausedContext: IngestionContext = {
      ...context,
      watcher_status: "paused",
    };

    const rawEmail = `From: sender@example.com
Subject: Urgent Request

URGENT: Due by Friday 5pm.`;

    const result = await orchestrateIngestion(rawEmail, pausedContext, noDuplicate);

    expect(result.success).toBe(true);
    expect(result.message_received_event).not.toBeNull();
    expect(result.extraction_events).toHaveLength(0);
  });

  test("should NOT extract when sender not allowed", async () => {
    const restrictedContext: IngestionContext = {
      ...context,
      policy: {
        ...context.policy,
        allowed_senders: ["allowed@example.com"],
      },
    };

    const rawEmail = `From: blocked@example.com
Subject: Request

Due by Friday 5pm.`;

    const result = await orchestrateIngestion(rawEmail, restrictedContext, noDuplicate);

    expect(result.success).toBe(true);
    expect(result.message_received_event).not.toBeNull();
    expect(result.extraction_events).toHaveLength(0);
  });

  test("should only run extraction for allowed senders", async () => {
    const restrictedContext: IngestionContext = {
      ...context,
      policy: {
        ...context.policy,
        allowed_senders: ["allowed@example.com"],
      },
    };

    const allowedEmail = `From: allowed@example.com
Subject: Deadline by Friday

Due by Friday`;

    const blockedEmail = `From: blocked@example.com
Subject: Deadline by Friday

Due by Friday`;

    const allowedResult = await orchestrateIngestion(allowedEmail, restrictedContext, noDuplicate);
    const blockedResult = await orchestrateIngestion(blockedEmail, restrictedContext, noDuplicate);

    // Both emails are received (MESSAGE_RECEIVED created)
    expect(allowedResult.success).toBe(true);
    expect(blockedResult.success).toBe(true);
    
    // But extraction only runs for allowed senders
    expect(allowedResult.extraction_events?.length).toBeGreaterThan(0);
    expect(blockedResult.extraction_events?.length).toBe(0);
  });

  test("should preserve threading headers in event", async () => {
    const rawEmail = `From: sender@example.com
Subject: Re: Original Thread
In-Reply-To: <original@example.com>
References: <original@example.com>

Reply body`;

    const result = await orchestrateIngestion(rawEmail, context, noDuplicate);

    expect(result.success).toBe(true);
    const headers = (result.message_received_event as any).headers;
    expect(headers["in-reply-to"]).toBe("<original@example.com>");
    expect(headers["references"]).toContain("<original@example.com>");
  });

  test("should track body_text_extract without storing full body", async () => {
    const rawEmail = `From: sender@example.com
Subject: Long Email

${"This is a long email body. ".repeat(100)}`;

    const result = await orchestrateIngestion(rawEmail, context, noDuplicate);

    expect(result.success).toBe(true);
    // Body text extract should be truncated (500 chars + "..." = max 503)
    expect((result.message_received_event as any).body_text_extract.length).toBeLessThanOrEqual(503);
    // Raw body is not stored per design
    expect((result.message_received_event as any).raw_body_stored).toBe(false);
    // PII tracking fields should be present
    expect((result.message_received_event as any).pii_detected).toBeDefined();
    expect((result.message_received_event as any).pii_types_redacted).toBeDefined();
    expect((result.message_received_event as any).secrets_redacted).toBeDefined();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  const context: IngestionContext = {
    watcher_id: "watcher-123",
    watcher_status: "active",
    policy: {
      allowed_senders: [],
      silence_threshold_hours: 72,
      deadline_warning_hours: 24,
      deadline_critical_hours: 2,
      notification_channels: [],
      reporting_cadence: "daily",
      reporting_recipients: [],
    },
    reference_timestamp: Date.now(),
    reference_timezone: "UTC",
  };

  test("should handle email without From header", async () => {
    const rawEmail = `To: recipient@example.com
Subject: No From

Body`;

    const result = await orchestrateIngestion(rawEmail, context, async () => false);

    expect(result.success).toBe(false);
    expect(result.error).toBe("MISSING_REQUIRED_HEADER");
  });

  test("should handle completely empty email", async () => {
    const result = await orchestrateIngestion("", context, async () => false);

    expect(result.success).toBe(false);
  });

  test("should handle email with only headers", async () => {
    const rawEmail = `From: sender@example.com
Subject: Headers Only`;

    const result = await orchestrateIngestion(rawEmail, context, async () => false);

    // Should succeed - body is optional
    expect(result.success).toBe(true);
    expect(result.message_received_event).not.toBeNull();
  });
});
