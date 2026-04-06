-- Vigil V2 Schema (SQLite)
-- Replaces Postgres event store with simple relational model

CREATE TABLE IF NOT EXISTS accounts (
  id                      TEXT PRIMARY KEY,
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT,
  password_hash           TEXT,
  oauth_provider          TEXT,
  oauth_id                TEXT,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS watchers (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  name            TEXT NOT NULL,
  ingest_token    TEXT UNIQUE NOT NULL,
  system_prompt   TEXT NOT NULL,
  tools           TEXT NOT NULL DEFAULT '["send_alert"]',
  silence_hours   INTEGER DEFAULT 48,
  tick_interval   INTEGER DEFAULT 60,
  model           TEXT DEFAULT 'gpt-4.1',
  status          TEXT DEFAULT 'active',
  template_id     TEXT,
  last_tick_at    TIMESTAMP,
  reactivity      INTEGER DEFAULT 3,
  memory_sensitivity INTEGER DEFAULT 3,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  subject         TEXT,
  participants    TEXT,
  status          TEXT DEFAULT 'active',
  first_seen      TIMESTAMP,
  last_activity   TIMESTAMP,
  email_count     INTEGER DEFAULT 0,
  summary         TEXT,
  flags           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emails (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  thread_id       TEXT REFERENCES threads(id),
  message_id      TEXT,
  from_addr       TEXT,
  to_addr         TEXT,
  subject         TEXT,
  received_at     TIMESTAMP,
  original_date   TIMESTAMP,
  recipient_received_at TEXT,
  body_hash       TEXT,
  analysis        TEXT,
  processed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  thread_id       TEXT,
  trigger_type    TEXT NOT NULL,
  email_id        TEXT,
  decision        TEXT,
  tool            TEXT,
  tool_params     TEXT,
  result          TEXT,
  error           TEXT,
  reasoning       TEXT,
  model           TEXT,
  memory_delta    TEXT,
  context_tokens  INTEGER,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd        REAL,
  duration_ms     INTEGER,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channels (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  type            TEXT NOT NULL,
  destination     TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_threads_watcher ON threads(watcher_id, status);
CREATE INDEX IF NOT EXISTS idx_emails_watcher ON emails(watcher_id, received_at);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_actions_watcher ON actions(watcher_id, created_at);
CREATE INDEX IF NOT EXISTS idx_watchers_account ON watchers(account_id);
CREATE INDEX IF NOT EXISTS idx_watchers_token ON watchers(ingest_token);

-- Semantic memory store (per watcher)
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  content         TEXT NOT NULL,
  embedding       BLOB,
  importance      INTEGER DEFAULT 3,
  confidence      INTEGER DEFAULT 5,
  source_quote    TEXT,
  access_count    INTEGER DEFAULT 0,
  thread_id       TEXT REFERENCES threads(id),
  last_accessed   TIMESTAMP,
  obsolete        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memories_watcher ON memories(watcher_id, obsolete);
CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(watcher_id, last_accessed);

-- FTS5 virtual table for memory search (content table backed by memories)
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    content=memories,
    content_rowid=rowid
);

-- Keep FTS5 in sync with memories table
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Refresh tokens for JWT auth
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  revoked     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account ON refresh_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Custom tools (per watcher, for agent use)
CREATE TABLE IF NOT EXISTS custom_tools (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL REFERENCES watchers(id),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  webhook_url     TEXT NOT NULL,
  headers         TEXT DEFAULT '{}',
  parameter_schema TEXT DEFAULT '{}',
  enabled         BOOLEAN DEFAULT TRUE,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_custom_tools_watcher ON custom_tools(watcher_id);

-- API keys (per account, for developer API access)
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  permissions     TEXT DEFAULT '["read"]',
  last_used_at    TIMESTAMP,
  usage_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_keys_account ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Skills (pre-built integrations that watchers can use as tools)
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  watcher_id TEXT NOT NULL REFERENCES watchers(id),
  provider TEXT NOT NULL, -- 'slack', 'discord', 'notion', 'linear', 'pagerduty', 'twilio', 'email_forward', 'http'
  name TEXT NOT NULL,
  config_enc TEXT, -- AES-256-GCM encrypted JSON blob (API keys, webhook URLs, etc)
  enabled BOOLEAN DEFAULT TRUE,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_skills_watcher ON skills(watcher_id);

-- Gmail forwarding confirmation codes (Chrome extension support)
CREATE TABLE IF NOT EXISTS confirm_codes (
  id              TEXT PRIMARY KEY,
  watcher_id      TEXT NOT NULL,
  code            TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_confirm_codes_watcher ON confirm_codes(watcher_id);
