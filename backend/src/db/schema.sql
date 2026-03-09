-- Vigil V2 Schema (SQLite)
-- Replaces Postgres event store with simple relational model

CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  password_hash   TEXT,
  oauth_provider  TEXT,
  oauth_id        TEXT,
  plan            TEXT DEFAULT 'free',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  status          TEXT DEFAULT 'active',
  template_id     TEXT,
  last_tick_at    TIMESTAMP,
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
  memory_delta    TEXT,
  context_tokens  INTEGER,
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
  last_accessed   TIMESTAMP,
  obsolete        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memories_watcher ON memories(watcher_id, obsolete);
CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(watcher_id, last_accessed);
