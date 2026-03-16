/**
 * SQLite Database Client (bun:sqlite)
 *
 * Replaces the Postgres client. Uses bun's built-in SQLite bindings.
 * Schema is created from schema.sql on initializeDatabase().
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "../logger";

// ============================================================================
// Connection
// ============================================================================

let db: Database | null = null;

function getDb(): Database {
    if (!db) {
        const dbPath = process.env.DB_PATH ?? "./vigil.db";
        db = new Database(dbPath, { create: true });
        db.exec("PRAGMA journal_mode = WAL");
        db.exec("PRAGMA foreign_keys = ON");
    }
    return db;
}

// Convert Postgres-style $1, $2 params to SQLite ?
function toSqlite(sql: string): string {
    return sql.replace(/\$\d+/g, "?");
}

// ============================================================================
// Lifecycle
// ============================================================================

export async function initializeDatabase(): Promise<void> {
    const database = getDb();
    const schemaPath = join(import.meta.dir, "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    database.exec(schema);

    // Migrate: add billing columns to accounts table if not present (existing DBs)
    const billingMigrations = [
        `ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT`,
        `ALTER TABLE accounts ADD COLUMN stripe_subscription_id TEXT`,
        `ALTER TABLE accounts ADD COLUMN has_payment_method BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE accounts ADD COLUMN trial_emails_used INTEGER DEFAULT 0`,
        `ALTER TABLE accounts ADD COLUMN trial_notified_at TIMESTAMP`,
    ];
    for (const sql of billingMigrations) {
        try { database.exec(sql); } catch { /* column already exists */ }
    }

    // Migrate: add BYOK encrypted API key columns to accounts table
    const byokMigrations = [
        `ALTER TABLE accounts ADD COLUMN openai_api_key_enc TEXT`,
        `ALTER TABLE accounts ADD COLUMN anthropic_api_key_enc TEXT`,
        `ALTER TABLE accounts ADD COLUMN google_api_key_enc TEXT`,
    ];
    // Migrate: add digest_frequency to watchers    try { database.exec(`ALTER TABLE watchers ADD COLUMN digest_frequency TEXT DEFAULT 'weekly'`); } catch {}
    for (const sql of byokMigrations) {
        try { database.exec(sql); } catch { /* column already exists */ }
    }

    // Migrate: add skills table
    const skillsMigrations = [
        `CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          watcher_id TEXT NOT NULL REFERENCES watchers(id),
          provider TEXT NOT NULL,
          name TEXT NOT NULL,
          config_enc TEXT,
          enabled BOOLEAN DEFAULT TRUE,
          execution_count INTEGER DEFAULT 0,
          last_executed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_skills_watcher ON skills(watcher_id)`,
    ];
    for (const sql of skillsMigrations) {
        try { database.exec(sql); } catch { /* already exists */ }
    }

    // Migrate: add account-level usage tracking (survives watcher deletion/flush)
    const usageMigrations = [
        `ALTER TABLE accounts ADD COLUMN usage_month TEXT`,       // e.g. "2026-03"
        `ALTER TABLE accounts ADD COLUMN usage_month_cost REAL DEFAULT 0`, // cumulative cost for usage_month
    ];
    for (const sql of usageMigrations) {
        try { database.exec(sql); } catch { /* column already exists */ }
    }

    // Migrate: add input_tokens and output_tokens to actions table
    const tokenMigrations = [
        `ALTER TABLE actions ADD COLUMN input_tokens INTEGER`,
        `ALTER TABLE actions ADD COLUMN output_tokens INTEGER`,
    ];
    for (const sql of tokenMigrations) {
        try { database.exec(sql); } catch { /* column already exists */ }
    }

    // Rebuild FTS5 index to keep it in sync (handles schema changes, manual data wipes)
    try {
        database.exec(`INSERT INTO memories_fts(memories_fts) VALUES('rebuild')`);
    } catch {
        // FTS5 table may not exist yet on first run
    }

    logger.info("SQLite database initialized");
}

export async function closeDatabase(): Promise<void> {
    if (db) {
        db.close();
        db = null;
    }
}

// ============================================================================
// Query Helpers
// ============================================================================

/** Execute a query, return nothing (INSERT/UPDATE/DELETE) */
export function run(sql: string, params: unknown[] = []): void {
    getDb().prepare(toSqlite(sql)).run(...(params as any[]));
}

/** Return one row or null */
export function queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
): T | null {
    const row = getDb().prepare(toSqlite(sql)).get(...(params as any[])) as T | null;
    return row ? normalizeTimestamps(row) : null;
}

/** Return all rows */
export function queryMany<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
): T[] {
    const rows = getDb().prepare(toSqlite(sql)).all(...(params as any[])) as T[];
    return rows.map(normalizeTimestamps);
}

/**
 * Normalize bare SQLite timestamps to ISO 8601 UTC.
 * "2026-03-10 00:33:29" → "2026-03-10T00:33:29Z"
 * Already-ISO strings (with T and Z) are left alone.
 */
const BARE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function normalizeTimestamps<T>(row: T): T {
    if (!row || typeof row !== "object") return row;
    const out = { ...row } as Record<string, unknown>;
    for (const key of Object.keys(out)) {
        const val = out[key];
        if (typeof val === "string" && BARE_TIMESTAMP_RE.test(val)) {
            out[key] = val.replace(" ", "T") + "Z";
        }
    }
    return out as T;
}

/** Legacy compat: wraps queryMany in { rows } */
export function query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
): { rows: T[]; rowCount?: number } {
    const rows = queryMany<T>(sql, params);
    return { rows, rowCount: rows.length };
}

/** Synchronous transaction wrapper */
export function withTransaction<T>(fn: () => T): T {
    return getDb().transaction(fn)();
}
