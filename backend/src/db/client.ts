/**
 * PostgreSQL Database Client
 *
 * Provides connection pooling, migrations, and query helpers for the event store.
 * Implements MR-EventStore-1,2,3 with PostgreSQL backend.
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

export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max_connections: number;
    idle_timeout_ms: number;
    connection_timeout_ms: number;
}

export const DEFAULT_CONFIG: DatabaseConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "vigil",
    user: process.env.DB_USER || "vigil",
    password: process.env.DB_PASSWORD || "vigil",
    max_connections: parseInt(process.env.DB_MAX_CONNECTIONS || "20", 10),
    idle_timeout_ms: 30000,
    connection_timeout_ms: 10000,
};

// ============================================================================
// Database Client
// ============================================================================

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        throw new Error(
            "Database not initialized. Call initializeDatabase() first."
        );
    }
    return pool;
}

export async function initializeDatabase(
    config: Partial<DatabaseConfig> = {}
): Promise<void> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    // Validate configuration
    if (!fullConfig.host) {
        throw new Error("Database host is required (DB_HOST)");
    }
    if (!fullConfig.database) {
        throw new Error("Database name is required (DB_NAME)");
    }
    if (!fullConfig.user) {
        throw new Error("Database user is required (DB_USER)");
    }
    if (!fullConfig.password) {
        throw new Error("Database password is required (DB_PASSWORD)");
    }
    if (fullConfig.max_connections < 1 || fullConfig.max_connections > 100) {
        throw new Error("Database max_connections must be between 1 and 100");
    }

    pool = new Pool({
        host: fullConfig.host,
        port: fullConfig.port,
        database: fullConfig.database,
        user: fullConfig.user,
        password: fullConfig.password,
        max: fullConfig.max_connections,
        idleTimeoutMillis: fullConfig.idle_timeout_ms,
        connectionTimeoutMillis: fullConfig.connection_timeout_ms,
    });

    // Test connection
    const client = await pool.connect();
    try {
        await client.query("SELECT 1");
        console.log("[DB] Connected to PostgreSQL");
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
        console.log("[DB] Connection pool closed");
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
        version: 1,
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
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_watcher_timestamp ON events(watcher_id, timestamp);
    `,
    },
    {
        version: 2,
        name: "create_accounts_table",
        sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        account_id UUID PRIMARY KEY,
        owner_email VARCHAR(255) NOT NULL,
        plan VARCHAR(20) NOT NULL DEFAULT 'free',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_owner_email ON accounts(owner_email);
    `,
    },
    {
        version: 3,
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
        version: 4,
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
        version: 5,
        name: "create_watchers_projection_table",
        sql: `
      -- Projection table for fast watcher queries (disposable, rebuilt from events)
      CREATE TABLE IF NOT EXISTS watcher_projections (
        watcher_id UUID PRIMARY KEY,
        account_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        ingest_token VARCHAR(20) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'created',
        policy JSONB NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL,
        created_by UUID NOT NULL,
        deleted_at BIGINT,
        last_event_id UUID,
        last_event_timestamp BIGINT
      );

      CREATE INDEX IF NOT EXISTS idx_watcher_projections_account ON watcher_projections(account_id);
      CREATE INDEX IF NOT EXISTS idx_watcher_projections_ingest_token ON watcher_projections(ingest_token);
      CREATE INDEX IF NOT EXISTS idx_watcher_projections_status ON watcher_projections(status);
    `,
    },
    {
        version: 6,
        name: "create_threads_projection_table",
        sql: `
      -- Projection table for fast thread queries (disposable, rebuilt from events)
      CREATE TABLE IF NOT EXISTS thread_projections (
        thread_id UUID PRIMARY KEY,
        watcher_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        opened_at BIGINT NOT NULL,
        closed_at BIGINT,
        last_activity_at BIGINT NOT NULL,
        original_sender VARCHAR(255),
        normalized_subject VARCHAR(500),
        trigger_type VARCHAR(50),
        message_count INTEGER DEFAULT 0,
        hard_deadline_event_id UUID,
        soft_deadline_event_id UUID,
        last_urgency_state VARCHAR(20) DEFAULT 'ok',
        last_alert_urgency VARCHAR(20)
      );

      CREATE INDEX IF NOT EXISTS idx_thread_projections_watcher ON thread_projections(watcher_id);
      CREATE INDEX IF NOT EXISTS idx_thread_projections_status ON thread_projections(status);
      CREATE INDEX IF NOT EXISTS idx_thread_projections_watcher_status ON thread_projections(watcher_id, status);
    `,
    },
    {
        version: 7,
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
        version: 8,
        name: "add_subscription_columns_to_accounts",
        sql: `
      -- Add Stripe integration columns to accounts table
      ALTER TABLE accounts 
        ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS current_period_start BIGINT,
        ADD COLUMN IF NOT EXISTS current_period_end BIGINT,
        ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer ON accounts(stripe_customer_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_plan ON accounts(plan);
    `,
    },
    {
        version: 9,
        name: "create_account_usage_table",
        sql: `
      -- Usage tracking per billing period (weekly)
      CREATE TABLE IF NOT EXISTS account_usage (
        account_id UUID NOT NULL REFERENCES accounts(account_id),
        period_start BIGINT NOT NULL,
        period_end BIGINT NOT NULL,
        emails_processed INTEGER NOT NULL DEFAULT 0,
        emails_limit INTEGER NOT NULL,
        watchers_count INTEGER NOT NULL DEFAULT 0,
        watchers_limit INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (account_id, period_start)
      );

      CREATE INDEX IF NOT EXISTS idx_account_usage_period ON account_usage(period_start);
      CREATE INDEX IF NOT EXISTS idx_account_usage_account_period ON account_usage(account_id, period_start DESC);
    `,
    },
    {
        version: 10,
        name: "create_stripe_events_table",
        sql: `
      -- Store processed Stripe webhook events for idempotency
      CREATE TABLE IF NOT EXISTS stripe_events (
        event_id VARCHAR(255) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        account_id UUID REFERENCES accounts(account_id),
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        payload JSONB NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_stripe_events_account ON stripe_events(account_id);
    `,
    },
    {
        version: 11,
        name: "create_password_reset_tokens_table",
        sql: `
      -- Password reset tokens for secure password recovery
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_id VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(user_id),
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
    `,
    },
    {
        version: 12,
        name: "create_oauth_account_links_table",
        sql: `
      -- OAuth provider account links for Google/GitHub login
      CREATE TABLE IF NOT EXISTS oauth_account_links (
        link_id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(user_id),
        provider VARCHAR(20) NOT NULL,
        provider_user_id VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        access_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        token_expires_at BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(provider, provider_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_oauth_links_user ON oauth_account_links(user_id);
      CREATE INDEX IF NOT EXISTS idx_oauth_links_provider ON oauth_account_links(provider, provider_user_id);
    `,
    },
    {
        version: 13,
        name: "add_has_usable_password_column",
        sql: `
      -- Track whether user has set a real password (vs random OAuth placeholder)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_usable_password BOOLEAN DEFAULT TRUE;
      
      -- For existing users: if they have OAuth links and were created recently, 
      -- assume they might be OAuth-only. Otherwise assume they have passwords.
      -- This is a best-effort migration - new users will be tracked correctly.
      UPDATE users SET has_usable_password = TRUE WHERE has_usable_password IS NULL;
    `,
    },
];

async function runMigrations(): Promise<void> {
    // Ensure migrations table exists first
    await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

    // Get applied migrations
    const applied = await queryMany<{ version: number }>(
        "SELECT version FROM migrations ORDER BY version"
    );
    const appliedVersions = new Set(applied.map((m) => m.version));

    // Run pending migrations
    for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
            console.log(
                `[DB] Running migration ${migration.version}: ${migration.name}`
            );
            await withTransaction(async (client) => {
                await client.query(migration.sql);
                await client.query(
                    "INSERT INTO migrations (version, name) VALUES ($1, $2)",
                    [migration.version, migration.name]
                );
            });
            console.log(`[DB] Migration ${migration.version} complete`);
        }
    }
}

// ============================================================================
// Health Check
// ============================================================================

export interface DatabaseHealth {
    connected: boolean;
    latency_ms: number;
    pool_total: number;
    pool_idle: number;
    pool_waiting: number;
    error?: string;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
    if (!pool) {
        return {
            connected: false,
            latency_ms: 0,
            pool_total: 0,
            pool_idle: 0,
            pool_waiting: 0,
            error: "Database not initialized",
        };
    }

    const start = Date.now();
    try {
        await pool.query("SELECT 1");
        return {
            connected: true,
            latency_ms: Date.now() - start,
            pool_total: pool.totalCount,
            pool_idle: pool.idleCount,
            pool_waiting: pool.waitingCount,
        };
    } catch (error) {
        return {
            connected: false,
            latency_ms: Date.now() - start,
            pool_total: pool.totalCount,
            pool_idle: pool.idleCount,
            pool_waiting: pool.waitingCount,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
