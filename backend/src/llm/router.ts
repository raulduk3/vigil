/**
 * Email Router - Classification before Extraction
 *
 * Determines which extraction types should be applied to an email.
 * Uses LLM service with regex fallback for classification.
 *
 * Flow:
 * 1. Every inbound email goes through routing
 * 2. Router classifies what signals MIGHT be present
 * 3. Only relevant extractors are run based on routing result
 *
 * This saves compute by not running all extractors on every email.
 */

import type { RoutingRequest, RoutingResponse } from "./client";

/**
 * Regex patterns for detecting potential signal presence.
 * These are intentionally broader than extraction patterns -
 * we want to flag emails that MIGHT contain signals, not extract them.
 */

// Deadline indicators - broader than extraction patterns
const DEADLINE_INDICATORS = [
    // Explicit deadline language
    /\b(?:deadline|due|submit|deliver|complete|finish)\b/i,
    // Time references
    /\b(?:by|before|until|no later than)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /\b(?:by|before|until)\s+(?:tomorrow|today|tonight)/i,
    /\b(?:by|before|until)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)/i,
    /\b(?:by|before|until)\s+(?:end of|eod|cob|close of business)/i,
    // Date patterns
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
    // Numbered dates
    /\b(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i,
];

// Soft deadline indicators - fuzzy temporal language
const SOFT_DEADLINE_INDICATORS = [
    /\b(?:end of|by end of)\s+(?:week|month|quarter|year)/i,
    /\b(?:soon|shortly|in a bit|when you can|get a chance)/i,
    /\b(?:next|coming|this)\s+(?:week|month|few days)/i,
    /\b(?:earliest convenience|as soon as|whenever possible)/i,
    /\b(?:sometime|around|approximately|roughly)\b/i,
    /\b(?:hoping|would like|prefer)\s+(?:by|to have)/i,
];

// Urgency indicators
const URGENCY_INDICATORS = [
    /\b(?:urgent|asap|immediately|critical|emergency)/i,
    /\b(?:time.?sensitive|high priority|top priority|highest priority)/i,
    /\b(?:important|priority|escalat)/i,
    /\b(?:need(?:ed)?\s+(?:this\s+)?(?:now|today|urgently|immediately))/i,
    /\b(?:please respond|waiting on|following up|reminder)/i,
    /!{2,}/, // Multiple exclamation marks
    /\bASAP\b/, // All caps ASAP
    /\bURGENT\b/, // All caps URGENT
];

// Closure indicators
const CLOSURE_INDICATORS = [
    /\b(?:resolved|completed|done|finished|closed|fixed)/i,
    /\b(?:no\s+(?:further\s+)?action\s+(?:needed|required))/i,
    /\b(?:marking|mark)\s+(?:as\s+)?(?:closed|resolved|done)/i,
    /\b(?:this\s+)?(?:issue|matter|ticket|request)\s+(?:is\s+)?(?:now\s+)?(?:closed|resolved)/i,
    /\b(?:thank you|thanks)\s+(?:for\s+)?(?:your\s+)?(?:help|resolving|fixing)/i,
    /\b(?:that|this)\s+(?:works|worked|did the trick)/i,
    /\b(?:all set|got it|received|confirmed)/i,
];

// Patterns that suggest NO action needed (informational only)
const INFORMATIONAL_INDICATORS = [
    /\b(?:fyi|for your information|just letting you know)/i,
    /\b(?:no action|no response|no reply)\s+(?:needed|required|necessary)/i,
    /\b(?:just wanted to|thought you|keeping you)\s+(?:share|inform|update|loop)/i,
    /\b(?:newsletter|announcement|update|bulletin)/i,
];

/**
 * Router version for tracking
 */
export const ROUTER_VERSION = "v1.0.0";

/**
 * Route an email to determine which extractions should be performed.
 * Uses regex patterns to classify email content.
 *
 * @param request - Email content and metadata
 * @returns Routing decision with extraction flags
 */
export function routeEmail(request: RoutingRequest): RoutingResponse {
    const { email_text, subject } = request;
    const combinedText = `${subject}\n${email_text}`;

    // Check for informational-only patterns first
    const isInformational = INFORMATIONAL_INDICATORS.some((pattern) =>
        pattern.test(combinedText)
    );

    // Check for each signal type
    const hasDeadlineIndicators = DEADLINE_INDICATORS.some((pattern) =>
        pattern.test(combinedText)
    );

    const hasSoftDeadlineIndicators = SOFT_DEADLINE_INDICATORS.some((pattern) =>
        pattern.test(combinedText)
    );

    const hasUrgencyIndicators = URGENCY_INDICATORS.some((pattern) =>
        pattern.test(combinedText)
    );

    const hasClosureIndicators = CLOSURE_INDICATORS.some((pattern) =>
        pattern.test(combinedText)
    );

    // Build reasoning string
    const signals: string[] = [];
    if (hasDeadlineIndicators) signals.push("deadline");
    if (hasSoftDeadlineIndicators) signals.push("soft_deadline");
    if (hasUrgencyIndicators) signals.push("urgency");
    if (hasClosureIndicators) signals.push("closure");

    let reasoning: string;
    if (signals.length === 0) {
        reasoning = isInformational
            ? "Informational email, no actionable signals detected"
            : "No signal indicators detected";
    } else {
        reasoning = `Detected potential signals: ${signals.join(", ")}`;
    }

    // If informational and no strong signals, skip extraction
    if (isInformational && !hasUrgencyIndicators && !hasDeadlineIndicators) {
        return {
            extract_deadline: false,
            extract_soft_deadline: false,
            extract_urgency: false,
            extract_closure: hasClosureIndicators, // Still check for closure
            reasoning: `${reasoning}. Skipping most extractions for informational email.`,
        };
    }

    return {
        extract_deadline: hasDeadlineIndicators,
        extract_soft_deadline: hasSoftDeadlineIndicators,
        extract_urgency: hasUrgencyIndicators,
        extract_closure: hasClosureIndicators,
        reasoning,
    };
}

/**
 * Quick check if email likely contains ANY actionable content.
 * Used for fast-path filtering before full routing.
 */
export function hasAnySignalIndicators(
    emailText: string,
    subject: string
): boolean {
    const combinedText = `${subject}\n${emailText}`;

    return (
        DEADLINE_INDICATORS.some((p) => p.test(combinedText)) ||
        SOFT_DEADLINE_INDICATORS.some((p) => p.test(combinedText)) ||
        URGENCY_INDICATORS.some((p) => p.test(combinedText)) ||
        CLOSURE_INDICATORS.some((p) => p.test(combinedText))
    );
}

/**
 * Detailed signal detection result for debugging/logging
 */
export interface SignalDetectionDetails {
    deadline: { detected: boolean; matches: string[] };
    softDeadline: { detected: boolean; matches: string[] };
    urgency: { detected: boolean; matches: string[] };
    closure: { detected: boolean; matches: string[] };
    informational: { detected: boolean; matches: string[] };
}

/**
 * Get detailed signal detection information for debugging.
 */
export function getSignalDetails(
    emailText: string,
    subject: string
): SignalDetectionDetails {
    const combinedText = `${subject}\n${emailText}`;

    const findMatches = (patterns: RegExp[]): string[] => {
        const matches: string[] = [];
        for (const pattern of patterns) {
            const match = combinedText.match(pattern);
            if (match) {
                matches.push(match[0]);
            }
        }
        return matches;
    };

    return {
        deadline: {
            detected: DEADLINE_INDICATORS.some((p) => p.test(combinedText)),
            matches: findMatches(DEADLINE_INDICATORS),
        },
        softDeadline: {
            detected: SOFT_DEADLINE_INDICATORS.some((p) =>
                p.test(combinedText)
            ),
            matches: findMatches(SOFT_DEADLINE_INDICATORS),
        },
        urgency: {
            detected: URGENCY_INDICATORS.some((p) => p.test(combinedText)),
            matches: findMatches(URGENCY_INDICATORS),
        },
        closure: {
            detected: CLOSURE_INDICATORS.some((p) => p.test(combinedText)),
            matches: findMatches(CLOSURE_INDICATORS),
        },
        informational: {
            detected: INFORMATIONAL_INDICATORS.some((p) =>
                p.test(combinedText)
            ),
            matches: findMatches(INFORMATIONAL_INDICATORS),
        },
    };
}
