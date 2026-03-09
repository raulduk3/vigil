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
    return (getDb().prepare(toSqlite(sql)).get(...(params as any[])) as T) ?? null;
}

/** Return all rows */
export function queryMany<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
): T[] {
    return getDb().prepare(toSqlite(sql)).all(...(params as any[])) as T[];
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
