/**
 * HTTP Skill Provider — generic HTTP POST (or any method) to a URL.
 * Replaces / extends the old custom-tools webhook functionality.
 */

export interface HttpConfig {
    url: string;
    headers?: Record<string, string>;
    method?: string;
}

export interface HttpParams {
    body: unknown;
}

export const configSchema = {
    fields: [
        { name: "url", label: "URL", type: "url", required: true, placeholder: "https://your-endpoint.example.com/webhook" },
        { name: "method", label: "Method (optional)", type: "text", required: false, placeholder: "POST" },
        { name: "headers", label: "Headers JSON (optional)", type: "textarea", required: false, placeholder: '{"Authorization": "Bearer token"}' },
    ],
};

export async function execute(config: HttpConfig, params: HttpParams): Promise<{ ok: boolean; message: string }> {
    if (!config.url) {
        return { ok: false, message: "url is required" };
    }

    const method = (config.method ?? "POST").toUpperCase();
    const headers: Record<string, string> = {
        "content-type": "application/json",
        ...((config.headers as Record<string, string>) ?? {}),
    };

    const resp = await fetch(config.url, {
        method,
        headers,
        body: method !== "GET" && method !== "HEAD" ? JSON.stringify(params.body) : undefined,
        signal: AbortSignal.timeout(10000),
    });

    const responseBody = await resp.text().catch(() => "");
    if (!resp.ok) {
        return { ok: false, message: `HTTP ${resp.status}: ${responseBody.slice(0, 200)}` };
    }

    return { ok: true, message: `HTTP ${resp.status}: ${responseBody.slice(0, 200)}` };
}
