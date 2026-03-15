/**
 * Twilio Skill Provider — sends an SMS via Twilio.
 */

export interface TwilioConfig {
    account_sid: string;
    auth_token: string;
    from_number: string;
    to_number: string;
}

export interface TwilioParams {
    body: string;
}

export const configSchema = {
    fields: [
        { name: "account_sid", label: "Account SID", type: "text", required: true, placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
        { name: "auth_token", label: "Auth Token", type: "password", required: true, placeholder: "Your Twilio auth token" },
        { name: "from_number", label: "From Number", type: "text", required: true, placeholder: "+15005550006" },
        { name: "to_number", label: "To Number", type: "text", required: true, placeholder: "+15005550006" },
    ],
};

export async function execute(config: TwilioConfig, params: TwilioParams): Promise<{ ok: boolean; message: string }> {
    if (!config.account_sid || !config.auth_token || !config.from_number || !config.to_number) {
        return { ok: false, message: "account_sid, auth_token, from_number, and to_number are required" };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
    const credentials = btoa(`${config.account_sid}:${config.auth_token}`);

    const formData = new URLSearchParams({
        From: config.from_number,
        To: config.to_number,
        Body: params.body,
    });

    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credentials}`,
            "content-type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json().catch(() => ({})) as any;
    if (!resp.ok) {
        return { ok: false, message: `Twilio returned ${resp.status}: ${data?.message ?? "unknown error"}` };
    }

    return { ok: true, message: `SMS sent, SID: ${data.sid}` };
}
