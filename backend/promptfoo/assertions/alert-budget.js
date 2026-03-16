/**
 * Assertion: alert-budget
 * Guards against over-alerting — the most disruptive agent failure mode.
 *
 * Rules:
 *   1. receipt, newsletter, spam, shipping, confirmation, account_setup → no send_alert
 *   2. If should_alert=false in test vars → no send_alert
 *   3. If should_alert=true in test vars → send_alert is expected (soft warning if missing)
 *   4. For tick triggers: only alert on overdue active threads (no blanket alerting)
 */
module.exports = (output, context) => {
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch {
        return { pass: false, score: 0, reason: "Not valid JSON" };
    }

    const actions = parsed.actions ?? [];
    const alertActions = actions.filter(a => a.tool === "send_alert");
    const hasAlert = alertActions.length > 0;

    const emailType = (context?.vars?.email_type ?? "").toLowerCase();
    const shouldAlert = context?.vars?.should_alert;

    // Types that must never generate an alert
    const noAlertTypes = ["receipt", "newsletter", "spam", "shipping", "confirmation", "account_setup"];

    if (noAlertTypes.includes(emailType) && hasAlert) {
        const alertMessages = alertActions.map(a =>
            `tool=${a.tool} message="${String(a.params?.message ?? "").slice(0, 80)}"`
        ).join("; ");
        return {
            pass: false,
            score: 0,
            reason: `${emailType} emails must not trigger send_alert. Got: [${alertMessages}]`,
        };
    }

    // Explicit should_alert=false → hard fail if alert fired
    if (shouldAlert === false && hasAlert) {
        const alertMessages = alertActions.map(a =>
            `"${String(a.params?.message ?? "").slice(0, 80)}"`
        ).join("; ");
        return {
            pass: false,
            score: 0,
            reason: `Test expects no alert, but send_alert was triggered: ${alertMessages}`,
        };
    }

    // Explicit should_alert=true → soft warn if no alert (partial score — model may be
    // conservative, which isn't necessarily wrong)
    if (shouldAlert === true && !hasAlert) {
        return {
            pass: false,
            score: 0.4,
            reason: `Test expects an alert (should_alert=true) but no send_alert action was found. Other actions: ${JSON.stringify(actions.map(a => a.tool))}`,
        };
    }

    // Tick-specific: check for over-alerting on non-overdue threads
    if (emailType === "tick" && hasAlert) {
        const shouldAlertOnTick = context?.vars?.should_alert;
        if (shouldAlertOnTick === false) {
            return {
                pass: false,
                score: 0,
                reason: `Tick test expects no alert but send_alert was fired. Only overdue active threads should trigger silence alerts.`,
            };
        }
    }

    return { pass: true, score: 1 };
};
