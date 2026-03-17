/**
 * Assertion: reasonable-memory
 * Guards against memory over-storage (a key failure mode on smaller models).
 *
 * Rules:
 *   1. Max 3 memories per email
 *   2. No 5-importance memories unless email_type is action_request, deadline, or security_alert
 *   3. No memories for spam, newsletter, account_setup, confirmation, or shipping emails
 *   4. If 2+ memories, median must be <= 4 (prevents bulk inflation)
 */
module.exports = (output, context) => {
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch {
        return { pass: false, score: 0, reason: "Not valid JSON" };
    }

    const memories = parsed.memory_append;
    const emailType = (context?.vars?.email_type ?? "").toLowerCase();

    const noMemoryTypes = ["spam", "newsletter", "account_setup", "confirmation", "shipping"];
    const highImportanceAllowed = ["action_request", "deadline", "security_alert", "financial", "meeting_request", "question"];

    if (!memories || (Array.isArray(memories) && memories.length === 0)) {
        return { pass: true, score: 1, reason: "No memories stored" };
    }

    const memArray = Array.isArray(memories) ? memories : [memories];

    if (noMemoryTypes.includes(emailType) && memArray.length > 0) {
        return {
            pass: false,
            score: 0,
            reason: `Should not store memories for '${emailType}' emails. Stored ${memArray.length} memory(ies): ${memArray.map(m => `"${String(m.content ?? "").slice(0, 60)}"`).join(", ")}`,
        };
    }

    if (memArray.length > 3) {
        return {
            pass: false,
            score: 0.3,
            reason: `Too many memories: ${memArray.length} (max 3 per email).`,
        };
    }

    const importances = memArray.map(m => {
        const imp = Number(m.importance);
        return isNaN(imp) ? 3 : Math.max(1, Math.min(5, imp));
    }).sort((a, b) => a - b);

    // Importance 5 is only valid for high-stakes email types
    const has5 = importances.some(i => i === 5);
    if (has5 && !highImportanceAllowed.includes(emailType)) {
        return {
            pass: false,
            score: 0.5,
            reason: `Memory importance 5 is too high for '${emailType}' emails. Importances: [${importances.join(", ")}]`,
        };
    }

    // If multiple memories, guard against bulk inflation
    if (memArray.length >= 2) {
        const mid = Math.floor(importances.length / 2);
        const median = importances.length % 2 === 0
            ? ((importances[mid - 1] ?? 3) + (importances[mid] ?? 3)) / 2
            : (importances[mid] ?? 3);

        if (median > 4) {
            return {
                pass: false,
                score: 0.5,
                reason: `Memory importance median too high: ${median} (should be ≤ 4 when storing multiple). Importances: [${importances.join(", ")}].`,
            };
        }
    }

    return { pass: true, score: 1, reason: "Memory check passed" };
};
