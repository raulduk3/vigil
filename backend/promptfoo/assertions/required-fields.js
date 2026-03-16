/**
 * Assertion: required-fields
 * Verifies the agent response has all required top-level fields:
 *   actions (array), email_analysis (object or null), thread_updates (array or null)
 *
 * For scheduled_tick triggers, email_analysis may be null — that's acceptable.
 */
module.exports = (output, context) => {
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch {
        return { pass: false, score: 0, reason: "Not valid JSON — cannot check required fields" };
    }

    const errors = [];

    // actions must always be present and be an array
    if (!("actions" in parsed)) {
        errors.push("missing field: actions");
    } else if (!Array.isArray(parsed.actions)) {
        errors.push(`actions must be an array, got ${typeof parsed.actions}`);
    }

    // thread_updates must be present (can be null or array)
    if (!("thread_updates" in parsed)) {
        errors.push("missing field: thread_updates");
    } else if (parsed.thread_updates !== null && !Array.isArray(parsed.thread_updates)) {
        errors.push(`thread_updates must be an array or null, got ${typeof parsed.thread_updates}`);
    }

    // email_analysis must be present for email_received trigger
    const triggerType = context?.vars?.trigger_type ?? "email_received";
    if (triggerType === "email_received") {
        if (!("email_analysis" in parsed)) {
            errors.push("missing field: email_analysis (required for email_received trigger)");
        } else if (parsed.email_analysis !== null && typeof parsed.email_analysis !== "object") {
            errors.push(`email_analysis must be an object or null, got ${typeof parsed.email_analysis}`);
        }

        // Validate email_analysis fields when present
        if (parsed.email_analysis && typeof parsed.email_analysis === "object") {
            const analysis = parsed.email_analysis;
            const requiredAnalysisFields = ["summary", "intent", "urgency", "entities"];
            const missingAnalysis = requiredAnalysisFields.filter(f => !(f in analysis));
            if (missingAnalysis.length > 0) {
                errors.push(`email_analysis missing fields: ${missingAnalysis.join(", ")}`);
            }

            const validUrgencies = ["low", "normal", "high"];
            if (analysis.urgency && !validUrgencies.includes(analysis.urgency)) {
                errors.push(`email_analysis.urgency must be low|normal|high, got "${analysis.urgency}"`);
            }

            if ("entities" in analysis && !Array.isArray(analysis.entities)) {
                errors.push(`email_analysis.entities must be an array, got ${typeof analysis.entities}`);
            }
        }
    }

    // Validate actions shape if present
    if (Array.isArray(parsed.actions)) {
        for (let i = 0; i < parsed.actions.length; i++) {
            const action = parsed.actions[i];
            if (!action.tool) errors.push(`actions[${i}] missing tool`);
            if (!action.params || typeof action.params !== "object") {
                errors.push(`actions[${i}] missing or invalid params`);
            }
        }
    }

    if (errors.length > 0) {
        return { pass: false, score: 0, reason: errors.join("; ") };
    }

    return { pass: true, score: 1 };
};
