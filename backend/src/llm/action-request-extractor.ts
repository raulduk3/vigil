/**
 * Bounded Action Request Extractor
 *
 * LLM answers ONE question: "Does this contain an actionable request?"
 *
 * Commercial Model Constraints:
 * - No deadline extraction
 * - No urgency inference
 * - Single extraction per email
 * - Never invoked during replay
 */

import { logger } from "../logger";

// ============================================================================
// Types
// ============================================================================

export interface ExtractionInput {
    email_text: string;
    from: string;
    subject: string;
}

export interface ExtractionResult {
    contains_action_request: boolean;
    action_summary: string | null;
    request_type:
        | "confirmation"
        | "approval"
        | "response"
        | "review"
        | "unknown";
    source_span: string;
    confidence: "high" | "medium" | "low";
}

// ============================================================================
// Extractor
// ============================================================================

const EXTRACTOR_VERSION = "1.0.0-commercial";

const SYSTEM_PROMPT = `You are analyzing an email to determine if it contains an actionable request.

An actionable request is something that expects the recipient to:
- Confirm something
- Approve something
- Respond to a question
- Review a document or decision

You must respond with a JSON object with these fields:
- contains_action_request: boolean
- action_summary: string or null (brief summary if action found)
- request_type: "confirmation" | "approval" | "response" | "review" | "unknown"
- source_span: exact quote from email that indicates the request (empty string if none)
- confidence: "high" | "medium" | "low"

Rules:
1. Only identify clear, explicit requests
2. Do not infer urgency or importance
3. Do not extract deadlines or due dates
4. The source_span MUST be a verbatim quote from the email
5. If no clear action request, set contains_action_request to false

Respond with ONLY the JSON object, no explanation.`;

export async function extractActionRequest(
    input: ExtractionInput
): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        logger.warn("OPENAI_API_KEY not set, using fallback extraction");
        return fallbackExtraction(input);
    }

    try {
        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        {
                            role: "user",
                            content: `From: ${input.from}\nSubject: ${input.subject}\n\n${input.email_text}`,
                        },
                    ],
                    temperature: 0,
                    max_tokens: 500,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error("Empty response from OpenAI");
        }

        const result = JSON.parse(content) as ExtractionResult;

        // Validate source_span exists in original email
        if (
            result.source_span &&
            !input.email_text.includes(result.source_span)
        ) {
            logger.warn("LLM hallucinated source_span, discarding", {
                source_span: result.source_span,
            });
            result.source_span = "";
            result.confidence = "low";
        }

        return result;
    } catch (error) {
        logger.error("LLM extraction failed", { error });
        return fallbackExtraction(input);
    }
}

/**
 * Fallback extraction using simple heuristics.
 * Used when LLM is unavailable.
 */
function fallbackExtraction(input: ExtractionInput): ExtractionResult {
    const questionPatterns = [
        /can you\s+\w+/i,
        /could you\s+\w+/i,
        /would you\s+\w+/i,
        /please\s+\w+/i,
        /let me know/i,
        /waiting for your/i,
        /need your\s+\w+/i,
        /require your\s+\w+/i,
        /\?$/m,
    ];

    for (const pattern of questionPatterns) {
        const match = input.email_text.match(pattern);
        if (match) {
            return {
                contains_action_request: true,
                action_summary: "Potential request detected (fallback)",
                request_type: "unknown",
                source_span: match[0],
                confidence: "low",
            };
        }
    }

    return {
        contains_action_request: false,
        action_summary: null,
        request_type: "unknown",
        source_span: "",
        confidence: "low",
    };
}

export function getExtractorVersion(): string {
    return EXTRACTOR_VERSION;
}
