/**
 * Unit tests for LLM extraction service
 * 
 * Tests for Module Requirements:
 * - MR-LLMService-1: Hard deadline extraction
 * - MR-LLMService-2: Closure signal detection
 * - MR-LLMService-3: Source span validation
 * - MR-LLMService-4: Soft deadline signal extraction
 * - MR-LLMService-5: Urgency signal detection
 */

import { describe, test, expect } from "bun:test";
import {
  validateSourceSpan,
  parseDeadlineText,
  hasBindingLanguage,
  isAbsoluteDeadline,
  extractHardDeadline,
  detectClosureSignal,
  extractSoftDeadlineSignal,
  detectUrgencySignal,
  runAllExtractors,
  EXTRACTOR_VERSION,
} from "@/llm/extractor";

// ============================================================================
// MR-LLMService-3: Source Span Validation Tests
// ============================================================================

describe("MR-LLMService-3: validateSourceSpan", () => {
  test("should return true when source span exists in email text", () => {
    const emailText = "Please submit the report by Friday 5pm.";
    const sourceSpan = "by Friday 5pm";
    
    expect(validateSourceSpan(emailText, sourceSpan)).toBe(true);
  });

  test("should perform case-insensitive matching", () => {
    const emailText = "The DEADLINE is December 31st.";
    const sourceSpan = "deadline is december 31st";
    
    expect(validateSourceSpan(emailText, sourceSpan)).toBe(true);
  });

  test("should return false when source span not found", () => {
    const emailText = "Please submit the report.";
    const sourceSpan = "Friday deadline";
    
    expect(validateSourceSpan(emailText, sourceSpan)).toBe(false);
  });

  test("should return false for empty source span", () => {
    const emailText = "Some email text";
    
    expect(validateSourceSpan(emailText, "")).toBe(false);
  });

  test("should return false for empty email text", () => {
    const sourceSpan = "some span";
    
    expect(validateSourceSpan("", sourceSpan)).toBe(false);
  });

  test("should handle partial matches correctly", () => {
    const emailText = "Due by end of business Friday";
    const sourceSpan = "end of business Friday";
    
    expect(validateSourceSpan(emailText, sourceSpan)).toBe(true);
  });
});

// ============================================================================
// MR-LLMService-1: Hard Deadline Extraction Tests
// ============================================================================

describe("MR-LLMService-1: extractHardDeadline", () => {
  // Reference: Monday, December 25, 2025 at 10:00 AM UTC
  const referenceTimestamp = new Date("2025-12-25T10:00:00Z").getTime();
  const referenceTimezone = "UTC";

  describe("weekday deadline patterns", () => {
    test("should extract 'due by Friday 5pm'", () => {
      const result = extractHardDeadline({
        email_text: "Please submit the report due by Friday 5pm.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.deadline_text).toContain("Friday");
      expect(result.confidence).toBe("high");
      expect(result.binding_language).toBe(true);
      expect(result.extractor_version).toBe(EXTRACTOR_VERSION);
    });

    test("should extract 'deadline: Monday'", () => {
      const result = extractHardDeadline({
        email_text: "Deadline: Monday at noon for the submission.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.deadline_text.toLowerCase()).toContain("monday");
      expect(result.binding_language).toBe(true);
    });

    test("should extract 'must be submitted by Wednesday'", () => {
      const result = extractHardDeadline({
        email_text: "The proposal must be submitted by Wednesday at 3pm.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.binding_language).toBe(true);
    });
  });

  describe("month/date deadline patterns", () => {
    test("should extract 'by December 31st'", () => {
      const result = extractHardDeadline({
        email_text: "All reports are due by December 31st.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.is_absolute).toBe(true);
      expect(result.deadline_utc).not.toBeNull();
    });

    test("should extract 'deadline January 15'", () => {
      const result = extractHardDeadline({
        email_text: "The deadline January 15 is firm.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.is_absolute).toBe(true);
    });

    test("should extract MM/DD format", () => {
      const result = extractHardDeadline({
        email_text: "Submit by 12/31 for year-end processing.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.is_absolute).toBe(true);
    });
  });

  describe("tomorrow deadline patterns", () => {
    test("should extract 'due by tomorrow'", () => {
      const result = extractHardDeadline({
        email_text: "This is due by tomorrow at 9am.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      expect(result.deadline_text.toLowerCase()).toContain("tomorrow");
    });

    test("should calculate correct timestamp for tomorrow", () => {
      const result = extractHardDeadline({
        email_text: "Due by tomorrow at 5pm",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(true);
      // Should be Dec 26, 2025 at 5pm
      const deadlineDate = new Date(result.deadline_utc!);
      expect(deadlineDate.getUTCDate()).toBe(26);
      expect(deadlineDate.getUTCHours()).toBe(17);
    });
  });

  describe("no deadline scenarios", () => {
    test("should return false when no deadline found", () => {
      const result = extractHardDeadline({
        email_text: "Just following up on our conversation.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(false);
      expect(result.deadline_utc).toBeNull();
      expect(result.confidence).toBe("low");
    });

    test("should not extract soft deadline phrases as hard deadlines", () => {
      const result = extractHardDeadline({
        email_text: "Please get this done sometime next week.",
        reference_timestamp: referenceTimestamp,
        reference_timezone: referenceTimezone,
      });

      expect(result.deadline_found).toBe(false);
    });
  });

  describe("binding language detection", () => {
    test("should identify binding language in 'deadline:'", () => {
      expect(hasBindingLanguage("deadline: Friday 5pm")).toBe(true);
    });

    test("should identify binding language in 'due by'", () => {
      expect(hasBindingLanguage("Due by end of month")).toBe(true);
    });

    test("should identify binding language in 'must be submitted by'", () => {
      expect(hasBindingLanguage("Must be submitted by Monday")).toBe(true);
    });

    test("should identify binding language in 'no later than'", () => {
      expect(hasBindingLanguage("Arrive no later than 9am")).toBe(true);
    });

    test("should return false for non-binding language", () => {
      expect(hasBindingLanguage("Maybe next week")).toBe(false);
    });
  });

  describe("absolute vs relative deadline detection", () => {
    test("should identify absolute deadline with explicit date", () => {
      expect(isAbsoluteDeadline("December 31, 2025")).toBe(true);
    });

    test("should identify absolute deadline with MM/DD", () => {
      expect(isAbsoluteDeadline("12/31")).toBe(true);
    });

    test("should identify relative deadline", () => {
      expect(isAbsoluteDeadline("tomorrow at 5pm")).toBe(false);
    });

    test("should identify relative weekday deadline", () => {
      expect(isAbsoluteDeadline("Friday at noon")).toBe(false);
    });
  });
});

// ============================================================================
// MR-LLMService-2: Closure Signal Detection Tests
// ============================================================================

describe("MR-LLMService-2: detectClosureSignal", () => {
  describe("explicit closure detection", () => {
    test("should detect 'this issue is closed'", () => {
      const result = detectClosureSignal({
        email_text: "Thanks for the update. This issue is closed.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("explicit");
      expect(result.confidence).toBe("high");
    });

    test("should detect 'marking as resolved'", () => {
      const result = detectClosureSignal({
        email_text: "Great work! Marking this as resolved now.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("explicit");
    });

    test("should detect 'closing this ticket'", () => {
      const result = detectClosureSignal({
        email_text: "Closing this ticket as the fix has been deployed.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("explicit");
    });

    test("should detect 'no further action needed'", () => {
      const result = detectClosureSignal({
        email_text: "Everything looks good. No further action needed.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("explicit");
    });

    test("should detect 'problem has been resolved'", () => {
      const result = detectClosureSignal({
        email_text: "The problem has been resolved by the IT team.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("explicit");
    });
  });

  describe("implicit closure detection", () => {
    test("should detect 'thank you for resolving'", () => {
      const result = detectClosureSignal({
        email_text: "Thank you for resolving this so quickly!",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("implicit");
      expect(result.confidence).toBe("medium");
    });

    test("should detect 'that works'", () => {
      const result = detectClosureSignal({
        email_text: "Perfect, that works for me. Thanks!",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("implicit");
    });

    test("should detect 'got it'", () => {
      const result = detectClosureSignal({
        email_text: "Got it, I'll proceed with these changes.",
      });

      expect(result.closure_found).toBe(true);
      expect(result.closure_type).toBe("implicit");
    });
  });

  describe("no closure scenarios", () => {
    test("should return false when no closure signal found", () => {
      const result = detectClosureSignal({
        email_text: "Can you please review the attached document?",
      });

      expect(result.closure_found).toBe(false);
      expect(result.closure_type).toBe("none");
    });

    test("should return false for ongoing conversation", () => {
      const result = detectClosureSignal({
        email_text: "I still have some questions about the proposal.",
      });

      expect(result.closure_found).toBe(false);
    });
  });

  describe("source span extraction", () => {
    test("should include closure phrase in source span", () => {
      const result = detectClosureSignal({
        email_text: "Thanks for the help. This matter is now closed.",
      });

      expect(result.source_span.toLowerCase()).toContain("closed");
    });
  });
});

// ============================================================================
// MR-LLMService-4: Soft Deadline Signal Extraction Tests
// ============================================================================

describe("MR-LLMService-4: extractSoftDeadlineSignal", () => {
  const referenceTimestamp = new Date("2025-12-25T10:00:00Z").getTime();

  describe("week-based signals", () => {
    test("should extract 'end of week'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Please have this ready by end of week.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("end of week");
      expect(result.estimated_horizon_hours).toBe(120); // ~5 days
      expect(result.binding_language).toBe(false);
    });

    test("should extract 'next week'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Let's aim for next week on the deliverables.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("next week");
      expect(result.estimated_horizon_hours).toBe(168); // 7 days
    });

    test("should extract 'sometime this week'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "I'll get you the files sometime this week.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
    });
  });

  describe("month-based signals", () => {
    test("should extract 'end of month'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "We need to finalize by end of month.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("end of month");
      expect(result.estimated_horizon_hours).toBe(720); // ~30 days
    });
  });

  describe("day-based signals", () => {
    test("should extract 'within a few days'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "I'll have an update within a few days.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("few days");
      expect(result.estimated_horizon_hours).toBe(72); // 3 days
    });

    test("should extract 'coming days'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Expect a response in the coming days.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
    });
  });

  describe("urgency-style soft signals", () => {
    test("should extract 'as soon as possible'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Please respond as soon as possible.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("soon");
      expect(result.estimated_horizon_hours).toBe(24);
    });

    test("should extract 'when you get a chance'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Let me know when you get a chance.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.estimated_horizon_hours).toBe(48);
    });

    test("should extract 'at your earliest convenience'", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Please review at your earliest convenience.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(true);
      expect(result.signal_text).toBe("earliest convenience");
    });
  });

  describe("no soft deadline scenarios", () => {
    test("should return false when no signal found", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Here is the information you requested.",
        reference_timestamp: referenceTimestamp,
      });

      expect(result.signal_found).toBe(false);
      expect(result.estimated_horizon_hours).toBeNull();
    });

    test("should not match hard deadline as soft signal", () => {
      const result = extractSoftDeadlineSignal({
        email_text: "Due by Friday 5pm - firm deadline.",
        reference_timestamp: referenceTimestamp,
      });

      // Hard deadlines should not trigger soft deadline extraction
      expect(result.signal_found).toBe(false);
    });
  });
});

// ============================================================================
// MR-LLMService-5: Urgency Signal Detection Tests
// ============================================================================

describe("MR-LLMService-5: detectUrgencySignal", () => {
  describe("high urgency detection", () => {
    test("should detect 'urgent' as high urgency", () => {
      const result = detectUrgencySignal({
        email_text: "URGENT: Please review immediately.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
      expect(result.indicators).toContain("urgent");
    });

    test("should detect 'ASAP' as high urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Need this done ASAP.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
      expect(result.indicators).toContain("asap");
    });

    test("should detect 'immediately' as high urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Please respond immediately.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
    });

    test("should detect 'critical' as high urgency", () => {
      const result = detectUrgencySignal({
        email_text: "This is a critical issue that needs attention.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
    });

    test("should detect 'emergency' as high urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Emergency: System is down.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
    });
  });

  describe("medium urgency detection", () => {
    test("should detect 'important' as medium urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Important: Please review the attached document.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("medium");
      expect(result.indicators).toContain("important");
    });

    test("should detect 'please respond' as medium urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Please respond to confirm receipt.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("medium");
    });

    test("should detect 'following up' as medium urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Just following up on my previous email.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("medium");
    });

    test("should detect 'waiting on' as medium urgency", () => {
      const result = detectUrgencySignal({
        email_text: "We are waiting on your approval.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("medium");
    });

    test("should detect 'reminder' as medium urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Reminder: Meeting tomorrow at 10am.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("medium");
    });
  });

  describe("low urgency detection", () => {
    test("should detect 'when you can' as low urgency", () => {
      const result = detectUrgencySignal({
        email_text: "Let me know when you can.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("low");
    });

    test("should detect 'no rush' as low urgency", () => {
      const result = detectUrgencySignal({
        email_text: "No rush on this, but please review eventually.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("low");
    });

    test("should detect 'FYI' as low urgency", () => {
      const result = detectUrgencySignal({
        email_text: "FYI: New policy update attached.",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("low");
    });
  });

  describe("no urgency scenarios", () => {
    test("should return false when no urgency signal found", () => {
      const result = detectUrgencySignal({
        email_text: "Here is the report you requested.",
      });

      expect(result.urgency_found).toBe(false);
      expect(result.indicators).toHaveLength(0);
    });
  });

  describe("multiple indicators", () => {
    test("should collect multiple high urgency indicators", () => {
      const result = detectUrgencySignal({
        email_text: "URGENT and CRITICAL: This needs immediate attention!",
      });

      expect(result.urgency_found).toBe(true);
      expect(result.urgency_level).toBe("high");
      expect(result.indicators.length).toBeGreaterThan(1);
    });
  });

  describe("source span extraction", () => {
    test("should include context around indicator in source span", () => {
      const result = detectUrgencySignal({
        email_text: "This is an urgent request for budget approval.",
      });

      expect(result.source_span.length).toBeGreaterThan(0);
      expect(result.source_span.toLowerCase()).toContain("urgent");
    });
  });
});

// ============================================================================
// Combined Extraction Tests
// ============================================================================

describe("runAllExtractors", () => {
  const referenceTimestamp = new Date("2025-12-25T10:00:00Z").getTime();

  test("should extract hard deadline and urgency from combined email", () => {
    const result = runAllExtractors(
      "URGENT: The report is due by Friday 5pm. Please prioritize.",
      referenceTimestamp
    );

    expect(result.hardDeadline.deadline_found).toBe(true);
    expect(result.urgencySignal.urgency_found).toBe(true);
    expect(result.urgencySignal.urgency_level).toBe("high");
  });

  test("should extract soft deadline when no hard deadline present", () => {
    const result = runAllExtractors(
      "Please get this done by end of week. No hard deadline.",
      referenceTimestamp
    );

    expect(result.hardDeadline.deadline_found).toBe(false);
    expect(result.softDeadline.signal_found).toBe(true);
  });

  test("should detect closure in reply email", () => {
    const result = runAllExtractors(
      "Thanks! That works perfectly. Marking this as resolved.",
      referenceTimestamp
    );

    expect(result.closure.closure_found).toBe(true);
    expect(result.closure.closure_type).toBe("explicit");
  });

  test("should handle email with no extractable content", () => {
    const result = runAllExtractors(
      "Here is the information you requested.",
      referenceTimestamp
    );

    expect(result.hardDeadline.deadline_found).toBe(false);
    expect(result.softDeadline.signal_found).toBe(false);
    expect(result.closure.closure_found).toBe(false);
    expect(result.urgencySignal.urgency_found).toBe(false);
  });

  test("should extract from complex multi-signal email", () => {
    const result = runAllExtractors(
      `Hi Team,

This is urgent - we need to finalize the proposal by December 31st.
The client is waiting on our response and this is a top priority.

Please respond as soon as possible.

Thanks`,
      referenceTimestamp
    );

    expect(result.hardDeadline.deadline_found).toBe(true);
    expect(result.urgencySignal.urgency_found).toBe(true);
    expect(result.urgencySignal.urgency_level).toBe("high");
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases", () => {
  test("should handle empty email text gracefully", () => {
    const result = runAllExtractors("", Date.now());

    expect(result.hardDeadline.deadline_found).toBe(false);
    expect(result.softDeadline.signal_found).toBe(false);
    expect(result.closure.closure_found).toBe(false);
    expect(result.urgencySignal.urgency_found).toBe(false);
  });

  test("should handle very long email text", () => {
    const longText = "This is important. ".repeat(1000) + "Due by Friday 5pm.";
    const result = runAllExtractors(longText, Date.now());

    expect(result.hardDeadline.deadline_found).toBe(true);
    expect(result.urgencySignal.urgency_found).toBe(true);
  });

  test("should handle special characters in email", () => {
    const result = runAllExtractors(
      "Due by Friday 5pm! <urgent> @team #deadline",
      Date.now()
    );

    expect(result.hardDeadline.deadline_found).toBe(true);
  });

  test("should handle unicode characters", () => {
    const result = runAllExtractors(
      "🚨 URGENT: Deadline: tomorrow at 5pm! ⏰",
      Date.now()
    );

    expect(result.urgencySignal.urgency_found).toBe(true);
    expect(result.hardDeadline.deadline_found).toBe(true);
  });
});

// ============================================================================
// parseDeadlineText Tests
// ============================================================================

describe("parseDeadlineText", () => {
  // Wednesday, December 25, 2025 at 10:00 AM UTC
  const referenceTimestamp = new Date("2025-12-25T10:00:00Z").getTime();

  test("should parse weekday with time", () => {
    const result = parseDeadlineText("Friday 5pm", referenceTimestamp, "UTC");
    
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getUTCDay()).toBe(5); // Friday
    expect(date.getUTCHours()).toBe(17);
  });

  test("should parse tomorrow", () => {
    const result = parseDeadlineText("tomorrow at 9am", referenceTimestamp, "UTC");
    
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getUTCDate()).toBe(26);
    expect(date.getUTCHours()).toBe(9);
  });

  test("should parse month and day", () => {
    const result = parseDeadlineText("January 15", referenceTimestamp, "UTC");
    
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getUTCMonth()).toBe(0); // January
    expect(date.getUTCDate()).toBe(15);
  });

  test("should parse MM/DD format", () => {
    const result = parseDeadlineText("1/15", referenceTimestamp, "UTC");
    
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(15);
  });

  test("should return null for unparseable text", () => {
    const result = parseDeadlineText("sometime soon", referenceTimestamp, "UTC");
    
    expect(result).toBeNull();
  });
});
