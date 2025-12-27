/**
 * LLM Extraction Service
 *
 * Pure functions for extracting structured facts from email text.
 * These functions define the extraction contract - actual LLM calls
 * are handled by the LLM service infrastructure.
 *
 * Module Requirements:
 * - MR-LLMService-1: Hard deadline extraction
 * - MR-LLMService-2: Closure signal detection
 * - MR-LLMService-3: Source span validation
 * - MR-LLMService-4: Soft deadline signal extraction
 * - MR-LLMService-5: Urgency signal detection
 */

/**
 * Confidence level for extraction results
 */
export type ExtractionConfidence = "high" | "medium" | "low";

/**
 * Closure type detected in email
 */
export type ClosureType = "explicit" | "implicit" | "none";

/**
 * Urgency level for urgency signals
 */
export type UrgencySignalLevel = "high" | "medium" | "low";

/**
 * Hard deadline extraction request (MR-LLMService-1)
 */
export interface HardDeadlineRequest {
    email_text: string;
    reference_timestamp: number;
    reference_timezone: string;
}

/**
 * Hard deadline extraction response (MR-LLMService-1)
 */
export interface HardDeadlineResponse {
    deadline_found: boolean;
    deadline_utc: number | null;
    deadline_text: string;
    source_span: string;
    confidence: ExtractionConfidence;
    is_absolute: boolean;
    binding_language: boolean;
    extractor_version: string;
}

/**
 * Closure detection request (MR-LLMService-2)
 */
export interface ClosureDetectionRequest {
    email_text: string;
}

/**
 * Closure detection response (MR-LLMService-2)
 */
export interface ClosureDetectionResponse {
    closure_found: boolean;
    closure_type: ClosureType;
    source_span: string;
    confidence: ExtractionConfidence;
    extractor_version: string;
}

/**
 * Soft deadline signal request (MR-LLMService-4)
 */
export interface SoftDeadlineRequest {
    email_text: string;
    reference_timestamp: number;
}

/**
 * Soft deadline signal response (MR-LLMService-4)
 */
export interface SoftDeadlineResponse {
    signal_found: boolean;
    signal_text: string;
    source_span: string;
    estimated_horizon_hours: number | null;
    confidence: ExtractionConfidence;
    binding_language: boolean;
    extractor_version: string;
}

/**
 * Urgency signal detection request (MR-LLMService-5)
 */
export interface UrgencySignalRequest {
    email_text: string;
}

/**
 * Urgency signal detection response (MR-LLMService-5)
 */
export interface UrgencySignalResponse {
    urgency_found: boolean;
    urgency_level: UrgencySignalLevel;
    indicators: string[];
    source_span: string;
    extractor_version: string;
}

/**
 * Current extractor version
 */
export const EXTRACTOR_VERSION = "v1.0.0";

/**
 * Validate that source span exists in original email text (MR-LLMService-3).
 * Performs case-insensitive comparison to handle LLM variations.
 */
export function validateSourceSpan(
    emailText: string,
    sourceSpan: string
): boolean {
    if (!sourceSpan || !emailText) {
        return false;
    }

    const normalizedText = emailText.toLowerCase();
    const normalizedSpan = sourceSpan.toLowerCase();

    return normalizedText.includes(normalizedSpan);
}

/**
 * Parse deadline text into UTC timestamp.
 * Handles common deadline phrases relative to reference timestamp.
 */
export function parseDeadlineText(
    deadlineText: string,
    referenceTimestamp: number,
    _referenceTimezone: string
): number | null {
    const text = deadlineText.toLowerCase().trim();

    // Handle explicit weekdays
    const weekdays = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ];

    for (let i = 0; i < weekdays.length; i++) {
        const weekday = weekdays[i];
        if (weekday && text.includes(weekday)) {
            const refDate = new Date(referenceTimestamp);
            const currentDay = refDate.getUTCDay();
            const targetDay = i;
            let daysUntil = targetDay - currentDay;
            if (daysUntil <= 0) daysUntil += 7;

            const targetDate = new Date(referenceTimestamp);
            targetDate.setUTCDate(targetDate.getUTCDate() + daysUntil);

            // Check for time in the text
            const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (timeMatch && timeMatch[1]) {
                let hours = parseInt(timeMatch[1], 10);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                const meridiem = timeMatch[3]?.toLowerCase();

                if (meridiem === "pm" && hours < 12) hours += 12;
                if (meridiem === "am" && hours === 12) hours = 0;

                targetDate.setUTCHours(hours, minutes, 0, 0);
            } else {
                // Default to end of business day (5pm)
                targetDate.setUTCHours(17, 0, 0, 0);
            }

            return targetDate.getTime();
        }
    }

    // Handle "tomorrow"
    if (text.includes("tomorrow")) {
        const targetDate = new Date(referenceTimestamp);
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);

        const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch && timeMatch[1]) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            const meridiem = timeMatch[3]?.toLowerCase();

            if (meridiem === "pm" && hours < 12) hours += 12;
            if (meridiem === "am" && hours === 12) hours = 0;

            targetDate.setUTCHours(hours, minutes, 0, 0);
        } else {
            targetDate.setUTCHours(17, 0, 0, 0);
        }

        return targetDate.getTime();
    }

    // Handle explicit dates like "December 31" or "12/31"
    const monthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];

    for (let i = 0; i < monthNames.length; i++) {
        const monthName = monthNames[i];
        if (!monthName) continue;

        const monthMatch = text.match(
            new RegExp(`${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, "i")
        );
        if (monthMatch && monthMatch[1]) {
            const day = parseInt(monthMatch[1], 10);
            const refDate = new Date(referenceTimestamp);
            const targetDate = new Date(
                Date.UTC(refDate.getUTCFullYear(), i, day, 17, 0, 0, 0)
            );

            // If date is in the past, assume next year
            if (targetDate.getTime() < referenceTimestamp) {
                targetDate.setUTCFullYear(targetDate.getUTCFullYear() + 1);
            }

            return targetDate.getTime();
        }
    }

    // Handle MM/DD format
    const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch && slashMatch[1] && slashMatch[2]) {
        const month = parseInt(slashMatch[1], 10) - 1;
        const day = parseInt(slashMatch[2], 10);
        const refDate = new Date(referenceTimestamp);
        const targetDate = new Date(
            Date.UTC(refDate.getUTCFullYear(), month, day, 17, 0, 0, 0)
        );

        if (targetDate.getTime() < referenceTimestamp) {
            targetDate.setUTCFullYear(targetDate.getUTCFullYear() + 1);
        }

        return targetDate.getTime();
    }

    return null;
}

/**
 * Determine if deadline text indicates binding commitment.
 */
export function hasBindingLanguage(text: string): boolean {
    const bindingPhrases = [
        "due by",
        "deadline",
        "must be",
        "required by",
        "no later than",
        "by end of",
        "expires",
        "final date",
        "last day",
        "cutoff",
        "must submit",
        "mandatory",
    ];

    const lowerText = text.toLowerCase();
    return bindingPhrases.some((phrase) => lowerText.includes(phrase));
}

/**
 * Determine if deadline is absolute (explicit date/time) vs relative.
 */
export function isAbsoluteDeadline(text: string): boolean {
    const absolutePatterns = [
        /\d{1,2}\/\d{1,2}/, // MM/DD
        /\d{1,2}-\d{1,2}/, // MM-DD
        /january|february|march|april|may|june|july|august|september|october|november|december/i,
        /\d{4}/, // Year
    ];

    return absolutePatterns.some((pattern) => pattern.test(text));
}

/**
 * Extract hard deadline from email text (MR-LLMService-1).
 * Returns extraction result with deadline timestamp and metadata.
 */
export function extractHardDeadline(
    request: HardDeadlineRequest
): HardDeadlineResponse {
    const { email_text, reference_timestamp, reference_timezone } = request;

    // Deadline patterns with binding language
    const deadlinePatterns = [
        // "due by Friday 5pm"
        /(?:due\s+(?:by\s+)?|deadline[:\s]+|must\s+(?:be\s+)?(?:submitted?\s+)?(?:by\s+)?|required\s+by\s+|no\s+later\s+than\s+)((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i,
        // "by December 31st"
        /(?:due\s+(?:by\s+)?|deadline[:\s]+|by\s+)((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
        // "by 12/31"
        /(?:due\s+(?:by\s+)?|deadline[:\s]+|by\s+)(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
        // "tomorrow at 5pm"
        /(?:due\s+(?:by\s+)?|deadline[:\s]+|by\s+)(tomorrow(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i,
    ];

    for (const pattern of deadlinePatterns) {
        const match = email_text.match(pattern);
        if (match && match[0] && match[1]) {
            const sourceSpan = match[0];
            const deadlineText = match[1];
            const deadlineUtc = parseDeadlineText(
                deadlineText,
                reference_timestamp,
                reference_timezone
            );

            if (deadlineUtc !== null) {
                return {
                    deadline_found: true,
                    deadline_utc: deadlineUtc,
                    deadline_text: deadlineText,
                    source_span: sourceSpan,
                    confidence: hasBindingLanguage(sourceSpan)
                        ? "high"
                        : "medium",
                    is_absolute: isAbsoluteDeadline(deadlineText),
                    binding_language: hasBindingLanguage(sourceSpan),
                    extractor_version: EXTRACTOR_VERSION,
                };
            }
        }
    }

    return {
        deadline_found: false,
        deadline_utc: null,
        deadline_text: "",
        source_span: "",
        confidence: "low",
        is_absolute: false,
        binding_language: false,
        extractor_version: EXTRACTOR_VERSION,
    };
}

/**
 * Detect closure signals in email text (MR-LLMService-2).
 */
export function detectClosureSignal(
    request: ClosureDetectionRequest
): ClosureDetectionResponse {
    const { email_text } = request;

    // Explicit closure phrases
    const explicitPatterns = [
        /this\s+(?:issue|matter|task|item|request)\s+(?:is\s+)?(?:now\s+)?(?:closed|resolved|completed|done|finished)/i,
        /(?:marking|mark)\s+(?:this\s+)?(?:as\s+)?(?:closed|resolved|completed|done)/i,
        /(?:closing|close)\s+(?:this\s+)?(?:ticket|issue|request|thread)/i,
        /no\s+(?:further\s+)?action\s+(?:is\s+)?(?:needed|required)/i,
        /(?:problem|issue)\s+(?:has\s+been\s+)?(?:resolved|fixed|addressed)/i,
    ];

    for (const pattern of explicitPatterns) {
        const match = email_text.match(pattern);
        if (match) {
            return {
                closure_found: true,
                closure_type: "explicit",
                source_span: match[0],
                confidence: "high",
                extractor_version: EXTRACTOR_VERSION,
            };
        }
    }

    // Implicit closure phrases
    const implicitPatterns = [
        /thank\s+you\s+for\s+(?:your\s+)?(?:help|assistance|resolving|fixing)/i,
        /(?:that|this)\s+(?:works|worked)(?:\s+perfectly)?/i,
        /(?:got\s+it|received|all\s+set)/i,
        /(?:thanks|thank\s+you)[.!]?\s*$/i,
    ];

    for (const pattern of implicitPatterns) {
        const match = email_text.match(pattern);
        if (match) {
            return {
                closure_found: true,
                closure_type: "implicit",
                source_span: match[0],
                confidence: "medium",
                extractor_version: EXTRACTOR_VERSION,
            };
        }
    }

    return {
        closure_found: false,
        closure_type: "none",
        source_span: "",
        confidence: "low",
        extractor_version: EXTRACTOR_VERSION,
    };
}

/**
 * Extract soft deadline signals from email text (MR-LLMService-4).
 * Fuzzy temporal language without explicit dates.
 */
export function extractSoftDeadlineSignal(
    request: SoftDeadlineRequest
): SoftDeadlineResponse {
    const { email_text, reference_timestamp: _reference_timestamp } = request;

    // Soft deadline patterns with estimated horizons
    const softPatterns: Array<{
        pattern: RegExp;
        horizonHours: number;
        signalText: string;
    }> = [
        {
            pattern: /(?:by\s+)?end\s+of\s+(?:this\s+)?week/i,
            horizonHours: 120,
            signalText: "end of week",
        },
        {
            pattern: /(?:by\s+)?end\s+of\s+(?:this\s+)?month/i,
            horizonHours: 720,
            signalText: "end of month",
        },
        { pattern: /next\s+week/i, horizonHours: 168, signalText: "next week" },
        {
            pattern: /(?:within|in)\s+(?:a\s+)?few\s+days/i,
            horizonHours: 72,
            signalText: "few days",
        },
        {
            pattern: /(?:as\s+)?soon\s+(?:as\s+possible|as\s+you\s+can)/i,
            horizonHours: 24,
            signalText: "soon",
        },
        {
            pattern: /(?:when\s+you\s+)?get\s+a\s+chance/i,
            horizonHours: 48,
            signalText: "when you get a chance",
        },
        {
            pattern: /(?:at\s+your\s+)?earliest\s+convenience/i,
            horizonHours: 48,
            signalText: "earliest convenience",
        },
        {
            pattern: /(?:in\s+the\s+)?coming\s+days/i,
            horizonHours: 72,
            signalText: "coming days",
        },
        {
            pattern: /sometime\s+(?:this|next)\s+week/i,
            horizonHours: 168,
            signalText: "sometime this week",
        },
    ];

    for (const { pattern, horizonHours, signalText } of softPatterns) {
        const match = email_text.match(pattern);
        if (match) {
            return {
                signal_found: true,
                signal_text: signalText,
                source_span: match[0],
                estimated_horizon_hours: horizonHours,
                confidence: "medium",
                binding_language: false,
                extractor_version: EXTRACTOR_VERSION,
            };
        }
    }

    return {
        signal_found: false,
        signal_text: "",
        source_span: "",
        estimated_horizon_hours: null,
        confidence: "low",
        binding_language: false,
        extractor_version: EXTRACTOR_VERSION,
    };
}

/**
 * Detect urgency signals in email text (MR-LLMService-5).
 * Priority indicators without temporal constraints.
 */
export function detectUrgencySignal(
    request: UrgencySignalRequest
): UrgencySignalResponse {
    const { email_text } = request;
    const lowerText = email_text.toLowerCase();

    // High urgency indicators
    const highIndicators = [
        "urgent",
        "asap",
        "immediately",
        "critical",
        "emergency",
        "time-sensitive",
        "top priority",
        "highest priority",
    ];

    // Medium urgency indicators
    const mediumIndicators = [
        "important",
        "priority",
        "please respond",
        "need this",
        "waiting on",
        "following up",
        "reminder",
        "pending",
    ];

    // Low urgency indicators
    const lowIndicators = [
        "when you can",
        "no rush",
        "fyi",
        "for your information",
        "just checking",
        "quick question",
    ];

    const foundIndicators: string[] = [];
    let urgencyLevel: UrgencySignalLevel = "low";

    // Check high urgency
    for (const indicator of highIndicators) {
        if (lowerText.includes(indicator)) {
            foundIndicators.push(indicator);
            urgencyLevel = "high";
        }
    }

    // Check medium urgency (only if not already high)
    if (urgencyLevel !== "high") {
        for (const indicator of mediumIndicators) {
            if (lowerText.includes(indicator)) {
                foundIndicators.push(indicator);
                urgencyLevel = "medium";
            }
        }
    }

    // Check low urgency (only if nothing else found)
    if (foundIndicators.length === 0) {
        for (const indicator of lowIndicators) {
            if (lowerText.includes(indicator)) {
                foundIndicators.push(indicator);
                urgencyLevel = "low";
            }
        }
    }

    if (foundIndicators.length > 0) {
        // Find source span for first indicator
        const firstIndicator = foundIndicators[0];
        if (firstIndicator) {
            const index = lowerText.indexOf(firstIndicator);
            const start = Math.max(0, index - 20);
            const end = Math.min(
                email_text.length,
                index + firstIndicator.length + 20
            );
            const sourceSpan = email_text.slice(start, end).trim();

            return {
                urgency_found: true,
                urgency_level: urgencyLevel,
                indicators: foundIndicators,
                source_span: sourceSpan,
                extractor_version: EXTRACTOR_VERSION,
            };
        }
    }

    return {
        urgency_found: false,
        urgency_level: "low",
        indicators: [],
        source_span: "",
        extractor_version: EXTRACTOR_VERSION,
    };
}

/**
 * Run all extractors on email text and return combined results.
 */
export interface ExtractionResult {
    hardDeadline: HardDeadlineResponse;
    closure: ClosureDetectionResponse;
    softDeadline: SoftDeadlineResponse;
    urgencySignal: UrgencySignalResponse;
}

export function runAllExtractors(
    emailText: string,
    referenceTimestamp: number,
    referenceTimezone: string = "UTC"
): ExtractionResult {
    return {
        hardDeadline: extractHardDeadline({
            email_text: emailText,
            reference_timestamp: referenceTimestamp,
            reference_timezone: referenceTimezone,
        }),
        closure: detectClosureSignal({
            email_text: emailText,
        }),
        softDeadline: extractSoftDeadlineSignal({
            email_text: emailText,
            reference_timestamp: referenceTimestamp,
        }),
        urgencySignal: detectUrgencySignal({
            email_text: emailText,
        }),
    };
}
