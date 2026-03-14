/**
 * API Keys Handler
 *
 * Create/list/revoke developer API keys for programmatic access.
 * Key format: vk_ + 32 random hex chars
 * Only the SHA-256 hash is stored. The full key is returned once on creation.
 */

import type { Context } from "hono";
import { queryMany, queryOne, run } from "../../db/client";

interface ApiKeyRow {
    id: string;
    account_id: string;
    name: string;
    key_hash: string;
    key_prefix: string;
    permissions: string;
    last_used_at: string | null;
    usage_count: number;
    created_at: string;
}

function formatKey(row: ApiKeyRow) {
    return {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        permissions: safeParseJson<string[]>(row.permissions, ["read"]),
        last_used_at: row.last_used_at,
        usage_count: row.usage_count,
        created_at: row.created_at,
    };
}

function safeParseJson<T>(val: string | null | undefined, fallback: T): T {
    if (!val) return fallback;
    try { return JSON.parse(val) as T; } catch { return fallback; }
}

async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function generateRawKey(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `vk_${hex}`;
}

export const apiKeyHandlers = {
    async list(c: Context) {
        const user = c.get("user");

        const keys = queryMany<ApiKeyRow>(
            `SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC`,
            [user.account_id]
        );

        return c.json({ keys: keys.map(formatKey) });
    },

    async create(c: Context) {
        const user = c.get("user");
        const body = await c.req.json().catch(() => ({}));
        const { name, permissions } = body;

        if (!name?.trim()) {
            return c.json({ error: "name is required" }, 400);
        }

        const rawKey = generateRawKey();
        const keyHash = await hashKey(rawKey);
        const keyPrefix = rawKey.slice(0, 10); // "vk_" + 7 chars

        const id = crypto.randomUUID();
        run(
            `INSERT INTO api_keys (id, account_id, name, key_hash, key_prefix, permissions, usage_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
            [
                id,
                user.account_id,
                name.trim(),
                keyHash,
                keyPrefix,
                JSON.stringify(Array.isArray(permissions) ? permissions : ["read"]),
            ]
        );

        const row = queryOne<ApiKeyRow>(`SELECT * FROM api_keys WHERE id = ?`, [id]);
        return c.json({ key: { ...formatKey(row!), full_key: rawKey } }, 201);
    },

    async delete_(c: Context) {
        const user = c.get("user");
        const keyId = c.req.param("id");

        const key = queryOne<{ id: string }>(
            `SELECT id FROM api_keys WHERE id = ? AND account_id = ?`,
            [keyId, user.account_id]
        );
        if (!key) return c.json({ error: "Key not found" }, 404);

        run(`DELETE FROM api_keys WHERE id = ?`, [keyId]);
        return c.json({ deleted: true });
    },
};

/**
 * Look up account_id by raw API key (for middleware use).
 * Updates usage stats on hit.
 */
export async function lookupApiKey(rawKey: string): Promise<{ account_id: string; email: string } | null> {
    const hash = await hashKey(rawKey);

    const row = queryOne<{ id: string; account_id: string; email: string }>(
        `SELECT k.id, k.account_id, a.email
         FROM api_keys k
         JOIN accounts a ON a.id = k.account_id
         WHERE k.key_hash = ?`,
        [hash]
    );

    if (!row) return null;

    // Update usage stats (fire and forget)
    run(
        `UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [row.id]
    );

    return { account_id: row.account_id, email: row.email };
}
