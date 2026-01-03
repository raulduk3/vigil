/**
 * Vigil Email Ingestion Cloudflare Worker
 *
 * Receives emails from Cloudflare Email Routing and forwards them
 * to the Vigil backend for processing.
 *
 * Email address format: {ingest_token}@vigil.run
 *
 * Setup:
 * 1. Deploy this worker: wrangler deploy
 * 2. In Cloudflare Dashboard → Email → Email Routing
 * 3. Create catch-all rule: *@vigil.run → Send to Worker → vigil-email-ingest
 * 4. Set VIGIL_API_URL environment variable to your backend URL
 *
 * @see backend/src/api/handlers/ingestion.ts for backend implementation
 */

export interface Env {
    VIGIL_API_URL: string;
}

interface EmailMessage {
    readonly from: string;
    readonly to: string;
    readonly headers: Headers;
    readonly raw: ReadableStream<Uint8Array>;
    readonly rawSize: number;

    setReject(reason: string): void;
    forward(rcptTo: string, headers?: Headers): Promise<void>;
}

export default {
    /**
     * Handle incoming email from Cloudflare Email Routing
     */
    async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
        const startTime = Date.now();

        try {
            // Extract token from recipient address
            // Format: {token}@vigil.run or {name}-{token}@vigil.run
            const toAddress = message.to.toLowerCase();
            const localPart = toAddress.split("@")[0];

            if (!localPart) {
                console.error("Invalid recipient address: missing local part");
                message.setReject("Invalid recipient address");
                return;
            }

            // The local part IS the ingest token (may include optional name prefix)
            const token = localPart;

            // Read raw email content
            const rawEmailBuffer = await streamToArrayBuffer(message.raw);
            const rawEmail = new TextDecoder().decode(rawEmailBuffer);

            // Log incoming email (without sensitive content)
            console.log(
                JSON.stringify({
                    event: "email_received",
                    from: message.from,
                    to: message.to,
                    token: token.substring(0, 8) + "...",
                    size: message.rawSize,
                    timestamp: new Date().toISOString(),
                })
            );

            // Validate API URL
            const apiUrl = env.VIGIL_API_URL;
            if (!apiUrl) {
                console.error(
                    JSON.stringify({
                        event: "configuration_error",
                        error: "VIGIL_API_URL environment variable not set",
                    })
                );
                // Accept email silently to avoid bounces
                return;
            }

            // Forward to Vigil backend
            // Backend supports both /ingest/:token and /api/ingest/:token
            const ingestUrl = `${apiUrl}/ingest/${token}`;
            
            const response = await fetch(ingestUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Cloudflare-Email-From": message.from,
                    "X-Cloudflare-Email-To": message.to,
                    "X-Cloudflare-Email-Size": message.rawSize.toString(),
                    "User-Agent": "Vigil-Cloudflare-Worker/1.0",
                },
                body: rawEmail,
            });

            const duration = Date.now() - startTime;

            if (!response.ok) {
                const errorBody = await response.text();
                let errorMessage: string;
                let errorCode: string | undefined;

                try {
                    const errorJson = JSON.parse(errorBody);
                    errorCode = errorJson.error_code || errorJson.code;
                    errorMessage = errorJson.error || errorJson.message || errorBody;
                } catch {
                    errorMessage = errorBody;
                }

                console.error(
                    JSON.stringify({
                        event: "ingestion_failed",
                        token: token.substring(0, 8) + "...",
                        status: response.status,
                        error_code: errorCode,
                        error: errorMessage.substring(0, 500),
                        duration_ms: duration,
                    })
                );

                // Don't reject the email - it would bounce back to sender
                // Just log the error and accept the email silently
                // Backend handles rate limiting, validation, and proper error responses
                return;
            }

            // Parse success response
            let result: Record<string, unknown> = {};
            try {
                const responseText = await response.text();
                if (responseText) {
                    result = JSON.parse(responseText);
                }
            } catch (parseError) {
                console.warn(
                    JSON.stringify({
                        event: "response_parse_warning",
                        token: token.substring(0, 8) + "...",
                        error: parseError instanceof Error ? parseError.message : String(parseError),
                    })
                );
            }

            console.log(
                JSON.stringify({
                    event: "ingestion_success",
                    token: token.substring(0, 8) + "...",
                    watcher_id: result.watcher_id,
                    events_generated: result.events_generated,
                    duration_ms: duration,
                })
            );
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(
                JSON.stringify({
                    event: "worker_error",
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    duration_ms: duration,
                })
            );

            // Don't reject - accept email silently to avoid bounces
            // Emails accepted here are logged and can be investigated
        }
    },

    /**
     * Handle HTTP requests (for health checks and testing)
     */
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Health check endpoint
        if (url.pathname === "/health") {
            return new Response(
                JSON.stringify({
                    status: "healthy",
                    service: "vigil-email-ingest",
                    version: "1.0.0",
                    timestamp: new Date().toISOString(),
                    api_url: env.VIGIL_API_URL || "(not configured)",
                }),
                {
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Test endpoint - simulate email ingestion
        if (url.pathname === "/test" && request.method === "POST") {
            const body = await request.text();
            const token = url.searchParams.get("token");

            if (!token) {
                return new Response(
                    JSON.stringify({ error: "Missing token parameter" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }

            const apiUrl = env.VIGIL_API_URL;
            if (!apiUrl) {
                return new Response(
                    JSON.stringify({ 
                        error: "VIGIL_API_URL not configured",
                        message: "Set VIGIL_API_URL environment variable in wrangler.toml"
                    }),
                    { status: 500, headers: { "Content-Type": "application/json" } }
                );
            }

            const response = await fetch(`${apiUrl}/ingest/${token}`, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain",
                    "X-Cloudflare-Email-From": "test@example.com",
                    "X-Cloudflare-Email-To": `${token}@test.vigil.run`,
                    "User-Agent": "Vigil-Cloudflare-Worker/1.0-test",
                },
                body: body,
            });

            const result = await response.text();
            return new Response(result, {
                status: response.status,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Root endpoint
        return new Response(
            JSON.stringify({
                service: "Vigil Email Ingestion Worker",
                version: "1.0.0",
                endpoints: {
                    health: "/health",
                    test: "/test?token={ingest_token} (POST)",
                },
            }),
            {
                headers: { "Content-Type": "application/json" },
            }
        );
    },
};

/**
 * Convert ReadableStream to ArrayBuffer
 */
async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result.buffer;
}
