/**
 * Assertion: no-hallucinated-quotes
 * Every meaningful phrase in a source_quote must appear in the email body.
 * Uses 5-word sliding windows — catches fabrication while allowing models to
 * combine or reorder sentences from the same email.
 * Importance >= 4 requires a source_quote.
 */
module.exports = (output, context) => {
    let parsed;
    try { parsed = JSON.parse(output); }
    catch { return { pass: false, score: 0, reason: "Not valid JSON" }; }

    const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const emailBody = norm(context?.vars?.email_body ?? "");
    const memories = parsed.memory_append;

    if (!memories || (Array.isArray(memories) && memories.length === 0))
        return { pass: true, score: 1, reason: "No memories to validate" };

    const memArray = Array.isArray(memories) ? memories : [memories];
    const errors = [];

    const isGrounded = (quote, body) => {
        const words = norm(quote).split(" ").filter(w => w.length > 1);
        if (words.length <= 5) return body.includes(norm(quote));
        const W = 5;
        let hits = 0, total = 0;
        for (let i = 0; i <= words.length - W; i++) {
            const ngram = words.slice(i, i + W).join(" ");
            if (body.includes(ngram)) hits++;
            total++;
        }
        return total === 0 || (hits / total) >= 0.5;
    };

    for (const mem of memArray) {
        if (!mem || typeof mem !== "object") continue;
        const importance = mem.importance ?? 3;
        const quote = mem.source_quote;

        if (importance >= 4 && !quote) {
            errors.push(`importance=${importance} memory missing source_quote: "${String(mem.content ?? "").slice(0, 80)}"`);
            continue;
        }

        if (quote && typeof quote === "string" && emailBody) {
            if (!isGrounded(quote, emailBody))
                errors.push(`Hallucinated quote not grounded in email: "${quote.slice(0, 100)}"`);
        }
    }

    if (errors.length > 0)
        return { pass: false, score: 0, reason: errors.join("; ") };

    return { pass: true, score: 1, reason: "All quotes verified" };
};
