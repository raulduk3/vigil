/**
 * Discord Skill Provider — sends a message to a Discord webhook.
 */

export interface DiscordConfig {
    webhook_url: string;
}

export interface DiscordParams {
    content: string;
}

export const configSchema = {
    fields: [
        { name: "webhook_url", label: "Webhook URL", type: "url", required: true, placeholder: "https://discord.com/api/webhooks/..." },
    ],
};

export async function execute(config: DiscordConfig, params: DiscordParams): Promise<{ ok: boolean; message: string }> {
    if (!config.webhook_url) {
        return { ok: false, message: "webhook_url is required" };
    }

    const resp = await fetch(config.webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: params.content }),
        signal: AbortSignal.timeout(10000),
    });

    const body = await resp.text().catch(() => "");
    if (!resp.ok) {
        return { ok: false, message: `Discord returned ${resp.status}: ${body}` };
    }

    return { ok: true, message: "Message sent to Discord" };
}
