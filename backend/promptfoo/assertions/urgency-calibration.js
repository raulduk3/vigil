/**
 * Assertion: urgency-calibration
 * Validates urgency alignment with email type.
 *
 * Hard rules:
 *   - receipt, confirmation, newsletter, shipping, spam, account_setup → NEVER high
 *   - security_alert → NEVER low
 *   - action_request, deadline → NEVER low
 *
 * Soft rules (uses expected_urgency var if set):
 *   - If expected_urgency is provided, the agent must match it exactly
 */
module.exports = (output, context) => {
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch {
        return { pass: false, score: 0, reason: "Not valid JSON" };
    }

    const analysis = parsed.email_analysis;
    if (!analysis) {
        // email_analysis absent is fine for tick triggers
        const triggerType = context?.vars?.trigger_type ?? "email_received";
        if (triggerType !== "email_received") return { pass: true, score: 1, reason: "Not an email trigger" };
        return { pass: false, score: 0, reason: "email_analysis missing on email_received trigger" };
    }

    const urgency = analysis.urgency;
    const emailType = (context?.vars?.email_type ?? "").toLowerCase();
    const expectedUrgency = context?.vars?.expected_urgency;

    const validUrgencies = ["low", "normal", "high"];
    if (!validUrgencies.includes(urgency)) {
        return { pass: false, score: 0, reason: `Invalid urgency value: "${urgency}". Must be low|normal|high` };
    }

    // Hard rule: noise types should never be high urgency
    const neverHighTypes = ["receipt", "confirmation", "newsletter", "shipping", "spam", "account_setup"];
    if (neverHighTypes.includes(emailType) && urgency === "high") {
        return {
            pass: false,
            score: 0,
            reason: `${emailType} emails must not be high urgency (got: high). The system prompt says confirmations and receipts are expected events.`,
        };
    }

    // Hard rule: security alerts must not be low urgency
    if (emailType === "security_alert" && urgency === "low") {
        return {
            pass: false,
            score: 0,
            reason: `security_alert must not be low urgency. Security events should be normal or high.`,
        };
    }

    // Hard rule: explicit action requests with deadlines should not be low urgency
    if (emailType === "action_request" && urgency === "low") {
        return {
            pass: false,
            score: 0,
            reason: `action_request emails must not be low urgency. Someone is waiting for a response.`,
        };
    }

    if (emailType === "deadline" && urgency === "low") {
        return {
            pass: false,
            score: 0,
            reason: `deadline emails must not be low urgency. Deadlines within 48 hours require attention.`,
        };
    }

    // Soft rule: exact expected_urgency match (from test var)
    if (expectedUrgency && urgency !== expectedUrgency) {
        return {
            pass: false,
            score: 0.5,
            reason: `Expected urgency "${expectedUrgency}" but got "${urgency}" for ${emailType} email`,
        };
    }

    return { pass: true, score: 1, reason: "Urgency check passed" };
};
