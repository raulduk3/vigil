/**
 * Assertion: reasonable-memory
 * Guards against memory over-storage (a key failure mode on smaller models).
 *
 * Rules:
 *   1. Max 3 memories per email
 *   2. Importance median must be <= 3 (not everything is urgent)
 *   3. No memories for spam, newsletter, account_setup, or confirmation emails
 *   4. No memory with importance < 3 should exist (1-2 should basically never appear)
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

    // Types that should never produce memories
    const noMemoryTypes = ["spam", "newsletter", "account_setup", "confirmation", "shipping"];

    if (!memories || (Array.isArray(memories) && memories.length === 0)) {
        // No memory is always valid
        return { pass: true, score: 1, reason: "No memories stored" };
    }

    const memArray = Array.isArray(memories) ? memories : [memories];

    // Rule: no memories for noise email types
    if (noMemoryTypes.includes(emailType) && memArray.length > 0) {
        return {
            pass: false,
            score: 0,
            reason: `Should not store memories for '${emailType}' emails. Stored ${memArray.length} memory(ies): ${memArray.map(m => `"${String(m.content ?? "").slice(0, 60)}"`).join(", ")}`,
        };
    }

    // Rule: max 3 memories per email
    if (memArray.length > 3) {
        return {
            pass: false,
            score: 0.3,
            reason: `Too many memories: ${memArray.length} (max 3 per email). Contents: ${memArray.map(m => `"${String(m.content ?? "").slice(0, 40)}"`).join(", ")}`,
        };
    }

    // Rule: importance median <= 3
    const importances = memArray.map(m => {
        const imp = Number(m.importance);
        return isNaN(imp) ? 3 : Math.max(1, Math.min(5, imp));
    }).sort((a, b) => a - b);

    const mid = Math.floor(importances.length / 2);
    const median = importances.length % 2 === 0
        ? ((importances[mid - 1] ?? 3) + (importances[mid] ?? 3)) / 2
        : (importances[mid] ?? 3);

    if (median > 3) {
        return {
            pass: false,
            score: 0.5,
            reason: `Memory importance median too high: ${median} (should be ≤ 3). Importances: [${importances.join(", ")}]. The system prompt says: "If most of your memories are 4 or 5, recalibrate."`,
        };
    }

    // Rule: importance 1 memories should be rare (warn but don't fail)
    const veryLowImportance = importances.filter(i => i <= 1);
    if (veryLowImportance.length > 0) {
        return {
            pass: true,
            score: 0.8,
            reason: `Warning: ${veryLowImportance.length} memory(ies) with importance 1. These are almost never worth storing.`,
        };
    }

    return { pass: true, score: 1 };
};
