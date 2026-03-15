/**
 * PagerDuty Skill Provider — triggers an incident via Events API v2.
 */

export interface PagerDutyConfig {
    routing_key: string;
}

export interface PagerDutyParams {
    summary: string;
    severity: "critical" | "error" | "warning" | "info";
}

export const configSchema = {
    fields: [
        { name: "routing_key", label: "Integration / Routing Key", type: "password", required: true, placeholder: "Your PagerDuty Events API v2 routing key" },
    ],
};

export async function execute(config: PagerDutyConfig, params: PagerDutyParams): Promise<{ ok: boolean; message: string }> {
    if (!config.routing_key) {
        return { ok: false, message: "routing_key is required" };
    }

    const payload = {
        routing_key: config.routing_key,
        event_action: "trigger",
        payload: {
            summary: params.summary,
            severity: params.severity ?? "error",
            source: "vigil",
            timestamp: new Date().toISOString(),
        },
    };

    const resp = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json().catch(() => ({})) as any;
    if (!resp.ok) {
        return { ok: false, message: `PagerDuty returned ${resp.status}: ${data?.message ?? "unknown error"}` };
    }

    return { ok: true, message: `PagerDuty incident triggered, dedup key: ${data.dedup_key}` };
}
