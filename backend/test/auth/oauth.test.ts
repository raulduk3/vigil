import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { closeDatabase, initializeDatabase, queryOne, run } from "../../src/db/client";
import { exchangeCodeForTokens } from "../../src/auth/oauth";

describe("exchangeCodeForTokens", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(async () => {
        process.env.DB_PATH = ":memory:";
        process.env.JWT_SECRET = "test-jwt-secret";
        process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
        process.env.GOOGLE_CLIENT_ID = "google-client-id";
        process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

        await initializeDatabase();
    });

    afterEach(async () => {
        globalThis.fetch = originalFetch;
        await closeDatabase();
    });

    it("marks an existing account as connected to the OAuth provider", async () => {
        run(
            `INSERT INTO accounts (id, email, plan, created_at)
             VALUES (?, ?, 'free', CURRENT_TIMESTAMP)`,
            ["acct-existing", "owner@example.com"]
        );

        globalThis.fetch = mock(async (input: string | URL | Request) => {
            const url = typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

            if (url === "https://oauth2.googleapis.com/token") {
                return new Response(JSON.stringify({ access_token: "google-access-token" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
                return new Response(
                    JSON.stringify({
                        email: "owner@example.com",
                        name: "Owner",
                        picture: "https://example.com/avatar.png",
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        }) as typeof globalThis.fetch;

        const tokens = await exchangeCodeForTokens(
            "google",
            "oauth-code",
            "http://localhost:3000/auth/callback",
            "pkce-verifier"
        );

        expect(tokens).not.toBeNull();

        const account = queryOne<{ oauth_provider: string | null }>(
            `SELECT oauth_provider FROM accounts WHERE id = ?`,
            ["acct-existing"]
        );

        expect(account?.oauth_provider).toBe("google");

        const accountCount = queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM accounts WHERE email = ?`,
            ["owner@example.com"]
        );

        expect(accountCount?.count).toBe(1);
    });
});