-- Adelani AI users table (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS users (
  username         TEXT PRIMARY KEY,
  id               TEXT NOT NULL,
  email            TEXT DEFAULT '',
  password         TEXT NOT NULL,          -- pbkdf2$iters$salt$hash
  role             TEXT DEFAULT 'user',
  activated        INTEGER DEFAULT 0,
  banned           INTEGER DEFAULT 0,
  activation_token TEXT,
  created_at       TEXT NOT NULL,
  msg_count        INTEGER DEFAULT 0,
  session_token    TEXT,
  session_expiry   INTEGER
);
