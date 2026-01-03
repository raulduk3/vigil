/**
 * PostgreSQL Database Client
 *
 * Connection pooling and query helpers.
 */

import {
    Pool,
    type PoolClient,
    type QueryResult,
    type QueryResultRow,
} from "pg";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

let pool: Pool | null = null;

// ============================================================================
// Connection Management
// ============================================================================

export function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL environment variable required");
        }
        pool = new Pool({
            connectionString,
            ...DEFAULT_CONFIG,
        });
    }
    return pool;
}

export async function initializeDatabase(): Promise<void> {
    const p = getPool();
    // Test connection
    const client = await p.connect();
    try {
        await client.query("SELECT 1");
    } finally {
        client.release();
    }
    // Run migrations
    await runMigrations();
}

export async function closeDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

// ============================================================================
// Query Helpers
// ============================================================================

export async function query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
): Promise<QueryResult<T>> {
    const p = getPool();
    return p.query<T>(sql, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
): Promise<T | null> {
    const result = await query<T>(sql, params);
    return result.rows[0] || null;
}

export async function queryMany<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
): Promise<T[]> {
    const result = await query<T>(sql, params);
    return result.rows;
}

export async function withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const p = getPool();
    const client = await p.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// Migrations
// ============================================================================

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
    {
        version: 0,
        name: "create_migrations_table",
        sql: `
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `,
    },
    {
        version: 2,
        name: "create_events_table",
        sql: `
            CREATE TABLE IF NOT EXISTS events (
                id BIGSERIAL PRIMARY KEY,
                event_id UUID NOT NULL UNIQUE,
                watcher_id UUID NOT NULL,
                timestamp BIGINT NOT NULL,
                type VARCHAR(100) NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_events_watcher_id ON events(watcher_id);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_watcher_timestamp ON events(watcher_id, timestamp);
        `,
    },
    {
        version: 3,
        name: "create_accounts_table",
        sql: `
            CREATE TABLE IF NOT EXISTS accounts (
                account_id UUID PRIMARY KEY,
                owner_email VARCHAR(255) NOT NULL,
                plan VARCHAR(20) NOT NULL DEFAULT 'free',
                stripe_customer_id VARCHAR(255),
                stripe_subscription_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_accounts_owner_email ON accounts(owner_email);
            CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer ON accounts(stripe_customer_id);
        `,
    },
    {
        version: 4,
        name: "create_users_table",
        sql: `
            CREATE TABLE IF NOT EXISTS users (
                user_id UUID PRIMARY KEY,
                account_id UUID NOT NULL REFERENCES accounts(account_id),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'member',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
        `,
    },
    {
        version: 5,
        name: "create_refresh_tokens_table",
        sql: `
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                token_id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(user_id),
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                revoked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
        `,
    },
    {
        version: 6,
        name: "create_watcher_projections_table",
        sql: `
            CREATE TABLE IF NOT EXISTS watcher_projections (
                watcher_id UUID PRIMARY KEY,
                account_id UUID NOT NULL,
                name VARCHAR(255) NOT NULL,
                ingest_token VARCHAR(20) NOT NULL UNIQUE,
                status VARCHAR(20) NOT NULL DEFAULT 'created',
                policy JSONB NOT NULL DEFAULT '{}',
                created_at BIGINT NOT NULL,
                created_by UUID NOT NULL,
                deleted_at BIGINT
            );
            CREATE INDEX IF NOT EXISTS idx_watcher_projections_account ON watcher_projections(account_id);
            CREATE INDEX IF NOT EXISTS idx_watcher_projections_ingest_token ON watcher_projections(ingest_token);
        `,
    },
    {
        version: 7,
        name: "create_thread_projections_table",
        sql: `
            CREATE TABLE IF NOT EXISTS thread_projections (
                thread_id UUID PRIMARY KEY,
                watcher_id UUID NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                opened_at BIGINT NOT NULL,
                closed_at BIGINT,
                last_activity_at BIGINT NOT NULL,
                last_action_request_event_id UUID,
                normalized_subject VARCHAR(500),
                original_sender VARCHAR(255),
                message_count INTEGER DEFAULT 0,
                silence_alerted BOOLEAN DEFAULT FALSE
            );
            CREATE INDEX IF NOT EXISTS idx_thread_projections_watcher ON thread_projections(watcher_id);
            CREATE INDEX IF NOT EXISTS idx_thread_projections_status ON thread_projections(status);
        `,
    },
    {
        version: 8,
        name: "create_account_usage_table",
        sql: `
            CREATE TABLE IF NOT EXISTS account_usage (
                account_id UUID NOT NULL REFERENCES accounts(account_id),
                period_start BIGINT NOT NULL,
                period_end BIGINT NOT NULL,
                emails_processed INTEGER NOT NULL DEFAULT 0,
                emails_limit INTEGER NOT NULL,
                watchers_count INTEGER NOT NULL DEFAULT 0,
                watchers_limit INTEGER NOT NULL,
                PRIMARY KEY (account_id, period_start)
            );
            CREATE INDEX IF NOT EXISTS idx_account_usage_period ON account_usage(period_start);
        `,
    },
];

async function runMigrations(): Promise<void> {
    const p = getPool();

    // Ensure migrations table exists (version 0)
    const migrationTableMigration = MIGRATIONS.find((m) => m.version === 0);
    if (migrationTableMigration) {
        await p.query(migrationTableMigration.sql);
    }

    // Get applied migrations
    const applied = await queryMany<{ version: number }>(
        "SELECT version FROM migrations ORDER BY version"
    );
    const appliedVersions = new Set(applied.map((r) => r.version));

    // Run pending migrations
    for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
            console.log(
                `Running migration ${migration.version}: ${migration.name}`
            );
            await withTransaction(async (client) => {
                await client.query(migration.sql);
                await client.query(
                    "INSERT INTO migrations (version, name) VALUES ($1, $2)",
                    [migration.version, migration.name]
                );
            });
        }
    }
}
