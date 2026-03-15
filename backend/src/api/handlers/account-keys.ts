/**
 * Account BYOK (Bring Your Own Key) Handlers
 *
 * GET  /api/account/keys  — Returns boolean flags for which providers have keys set.
 * PUT  /api/account/keys  — Stores/removes encrypted API keys for the account.
 */

import type { Context } from "hono";
import { queryOne, run } from "../../db/client";
import { encrypt } from "../../auth/encryption";
import { logger } from "../../logger";

// ============================================================================
// GET /api/account/keys
// ============================================================================

async function getAccountKeys(c: Context): Promise<Response> {
    const user = c.get("user");
    const account_id = user.account_id;

    const row = queryOne<{
        openai_api_key_enc: string | null;
        anthropic_api_key_enc: string | null;
        google_api_key_enc: string | null;
    }>(
        `SELECT openai_api_key_enc, anthropic_api_key_enc, google_api_key_enc FROM accounts WHERE id = ?`,
        [account_id]
    );

    return c.json({
        openai: !!row?.openai_api_key_enc,
        anthropic: !!row?.anthropic_api_key_enc,
        google: !!row?.google_api_key_enc,
    });
}

// ============================================================================
// PUT /api/account/keys
// ============================================================================

async function putAccountKeys(c: Context): Promise<Response> {
    const user = c.get("user");
    const account_id = user.account_id;

    let body: { openai_key?: string; anthropic_key?: string; google_key?: string };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sets: string[] = [];
    const vals: unknown[] = [];

    const processKey = (fieldName: string, value: string | undefined) => {
        if (value === undefined) return; // not provided — leave unchanged
        if (value === "") {
            // Empty string means remove the key
            sets.push(`${fieldName} = NULL`);
        } else {
            sets.push(`${fieldName} = ?`);
            vals.push(encrypt(value));
        }
    };

    processKey("openai_api_key_enc", body.openai_key);
    processKey("anthropic_api_key_enc", body.anthropic_key);
    processKey("google_api_key_enc", body.google_key);

    if (sets.length === 0) {
        return c.json({ error: "No keys provided" }, 400);
    }

    vals.push(account_id);
    run(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`, vals);

    logger.info("BYOK keys updated", {
        account_id,
        updated: [
            body.openai_key !== undefined ? "openai" : null,
            body.anthropic_key !== undefined ? "anthropic" : null,
            body.google_key !== undefined ? "google" : null,
        ].filter(Boolean),
    });

    return c.json({ success: true });
}

// ============================================================================

export const accountKeyHandlers = {
    get: getAccountKeys,
    put: putAccountKeys,
};
