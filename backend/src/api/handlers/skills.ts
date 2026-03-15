/**
 * Skills Handler
 *
 * CRUD for per-watcher skills (pre-built provider integrations).
 */

import type { Context } from "hono";
import { queryMany, queryOne, run } from "../../db/client";
import { encrypt, decrypt } from "../../auth/encryption";
import { SKILL_CATALOG, executeSkill } from "../../skills/registry";
import { logger } from "../../logger";

interface SkillRow {
    id: string;
    watcher_id: string;
    provider: string;
    name: string;
    config_enc: string | null;
    enabled: boolean | number;
    execution_count: number;
    last_executed_at: string | null;
    created_at: string;
}

function formatSkill(row: SkillRow) {
    return {
        id: row.id,
        watcher_id: row.watcher_id,
        provider: row.provider,
        name: row.name,
        enabled: Boolean(row.enabled),
        execution_count: row.execution_count,
        last_executed_at: row.last_executed_at,
        created_at: row.created_at,
        // Never return config_enc or decrypted config to the client
    };
}

async function verifyWatcherOwnership(watcherId: string, accountId: string): Promise<boolean> {
    const watcher = queryOne<{ id: string }>(
        `SELECT id FROM watchers WHERE id = ? AND account_id = ? AND status != 'deleted'`,
        [watcherId, accountId]
    );
    return !!watcher;
}

export const skillHandlers = {
    /** GET /api/skills/catalog — public */
    async catalog(c: Context) {
        return c.json({ catalog: SKILL_CATALOG });
    },

    /** GET /api/watchers/:id/skills */
    async list(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const skills = queryMany<SkillRow>(
            `SELECT * FROM skills WHERE watcher_id = ? ORDER BY created_at ASC`,
            [watcherId]
        );

        return c.json({ skills: skills.map(formatSkill) });
    },

    /** POST /api/watchers/:id/skills */
    async create(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const body = await c.req.json().catch(() => ({}));
        const { provider, name, config } = body;

        if (!provider || !name) {
            return c.json({ error: "provider and name are required" }, 400);
        }

        // Validate provider exists in catalog
        const catalogEntry = SKILL_CATALOG.find(e => e.provider === provider);
        if (!catalogEntry) {
            return c.json({ error: `Unknown provider: ${provider}. Valid providers: ${SKILL_CATALOG.map(e => e.provider).join(", ")}` }, 400);
        }

        // Encrypt config if provided
        let configEnc: string | null = null;
        if (config && Object.keys(config).length > 0) {
            try {
                configEnc = encrypt(JSON.stringify(config));
            } catch (err) {
                logger.error("Failed to encrypt skill config", { watcherId, provider, err });
                return c.json({ error: "Failed to encrypt config" }, 500);
            }
        }

        const id = crypto.randomUUID();
        run(
            `INSERT INTO skills (id, watcher_id, provider, name, config_enc, enabled, execution_count, created_at)
             VALUES (?, ?, ?, ?, ?, TRUE, 0, CURRENT_TIMESTAMP)`,
            [id, watcherId, provider, name.trim(), configEnc]
        );

        const skill = queryOne<SkillRow>(`SELECT * FROM skills WHERE id = ?`, [id]);
        return c.json({ skill: formatSkill(skill!) }, 201);
    },

    /** PUT /api/watchers/:id/skills/:skillId */
    async update(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const skillId = c.req.param("skillId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const skill = queryOne<SkillRow>(
            `SELECT * FROM skills WHERE id = ? AND watcher_id = ?`,
            [skillId, watcherId]
        );
        if (!skill) return c.json({ error: "Skill not found" }, 404);

        const body = await c.req.json().catch(() => ({}));
        const { name, config, enabled } = body;

        const sets: string[] = [];
        const vals: unknown[] = [];

        if (name !== undefined) { sets.push("name = ?"); vals.push(name.trim()); }
        if (enabled !== undefined) { sets.push("enabled = ?"); vals.push(enabled ? 1 : 0); }
        if (config !== undefined) {
            if (config === null || Object.keys(config).length === 0) {
                sets.push("config_enc = ?");
                vals.push(null);
            } else {
                try {
                    sets.push("config_enc = ?");
                    vals.push(encrypt(JSON.stringify(config)));
                } catch (err) {
                    logger.error("Failed to encrypt updated skill config", { skillId, err });
                    return c.json({ error: "Failed to encrypt config" }, 500);
                }
            }
        }

        if (sets.length === 0) return c.json({ error: "Nothing to update" }, 400);

        vals.push(skillId);
        run(`UPDATE skills SET ${sets.join(", ")} WHERE id = ?`, vals);

        const updated = queryOne<SkillRow>(`SELECT * FROM skills WHERE id = ?`, [skillId]);
        return c.json({ skill: formatSkill(updated!) });
    },

    /** DELETE /api/watchers/:id/skills/:skillId */
    async delete_(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const skillId = c.req.param("skillId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const skill = queryOne<{ id: string }>(
            `SELECT id FROM skills WHERE id = ? AND watcher_id = ?`,
            [skillId, watcherId]
        );
        if (!skill) return c.json({ error: "Skill not found" }, 404);

        run(`DELETE FROM skills WHERE id = ?`, [skillId]);
        return c.json({ deleted: true });
    },

    /** POST /api/watchers/:id/skills/:skillId/test */
    async test(c: Context) {
        const user = c.get("user");
        const watcherId = c.req.param("id");
        const skillId = c.req.param("skillId");

        if (!await verifyWatcherOwnership(watcherId, user.account_id)) {
            return c.json({ error: "Watcher not found" }, 404);
        }

        const skill = queryOne<SkillRow>(
            `SELECT * FROM skills WHERE id = ? AND watcher_id = ?`,
            [skillId, watcherId]
        );
        if (!skill) return c.json({ error: "Skill not found" }, 404);

        if (!skill.config_enc) {
            return c.json({ error: "Skill has no config — add credentials before testing" }, 400);
        }

        let config: unknown;
        try {
            config = JSON.parse(decrypt(skill.config_enc));
        } catch (err) {
            logger.error("Failed to decrypt skill config for test", { skillId, err });
            return c.json({ error: "Failed to decrypt config" }, 500);
        }

        // Use catalog test params
        const catalogEntry = SKILL_CATALOG.find(e => e.provider === skill.provider);
        const testParams = catalogEntry?.testParams ?? { message: "Vigil test" };

        try {
            const result = await executeSkill(skill.provider, config, testParams);
            logger.info("Skill test executed", { skillId, provider: skill.provider, ok: result.ok });
            return c.json({ success: result.ok, message: result.message });
        } catch (err) {
            logger.error("Skill test threw", { skillId, err });
            return c.json({ success: false, error: String(err) });
        }
    },
};
