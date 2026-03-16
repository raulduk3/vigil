/**
 * Assertion: no-hallucinated-quotes
 * Every source_quote in memory_append must appear verbatim in the email body.
 * Importance >= 4 requires a source_quote per the system prompt rules.
 *
 * Fails if:
 *   - A source_quote value does not exist verbatim in the email body
 *   - A memory with importance >= 4 is missing a source_quote entirely
 */
module.exports = (output, context) => {
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch {
        return { pass: false, score: 0, reason: "Not valid JSON" };
    }

    const emailBody = (context?.vars?.email_body ?? "").trim();
    const memories = parsed.memory_append;

    // No memories — nothing to check
    if (!memories || (Array.isArray(memories) && memories.length === 0)) {
        return { pass: true, score: 1, reason: "No memories to validate" };
    }

    const memArray = Array.isArray(memories) ? memories : [memories];
    const hallucinated = [];
    const missingRequired = [];

    for (const mem of memArray) {
        if (!mem || typeof mem !== "object") continue;

        const importance = mem.importance ?? 3;
        const quote = mem.source_quote;

        // source_quote required for importance >= 4
        if (importance >= 4 && !quote) {
            missingRequired.push(`importance=${importance} memory missing source_quote: "${String(mem.content ?? "").slice(0, 80)}"`);
            continue;
        }

        // If a quote is provided, it must exist verbatim in the email body
        if (quote && typeof quote === "string" && emailBody) {
            if (!emailBody.includes(quote)) {
                hallucinated.push(`"${quote.slice(0, 100)}"`);
            }
        }
    }

    const errors = [...hallucinated.map(q => `Hallucinated quote not in email: ${q}`), ...missingRequired];

    if (errors.length > 0) {
        return {
            pass: false,
            score: 0,
            reason: errors.join("; "),
        };
    }

    return { pass: true, score: 1 };
};
