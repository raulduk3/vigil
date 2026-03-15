/**
 * Slack Skill Provider — sends a message to a Slack webhook URL.
 */

export interface SlackConfig {
    webhook_url: string;
    channel?: string;
}

export interface SlackParams {
    text: string;
}

export const configSchema = {
    fields: [
        { name: "webhook_url", label: "Webhook URL", type: "url", required: true, placeholder: "https://hooks.slack.com/services/..." },
        { name: "channel", label: "Channel (optional)", type: "text", required: false, placeholder: "#alerts" },
    ],
};

export async function execute(config: SlackConfig, params: SlackParams): Promise<{ ok: boolean; message: string }> {
    if (!config.webhook_url) {
        return { ok: false, message: "webhook_url is required" };
    }

    const payload: Record<string, unknown> = { text: params.text };
    if (config.channel) payload.channel = config.channel;

    const resp = await fetch(config.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    });

    const body = await resp.text().catch(() => "");
    if (!resp.ok) {
        return { ok: false, message: `Slack returned ${resp.status}: ${body}` };
    }

    return { ok: true, message: "Message sent to Slack" };
}
