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
  session_expiry   INTEGER,
  premium          INTEGER DEFAULT 0       -- 1 = unlimited presentations
);

-- Presentations made per person per day (free users get 3 a day).
-- The Worker also creates this table automatically if it is missing.
CREATE TABLE IF NOT EXISTS usage (
  k     TEXT NOT NULL,                     -- "u:<username>" or "ip:<address>"
  day   TEXT NOT NULL,                     -- YYYY-MM-DD, Nigeria time
  decks INTEGER DEFAULT 0,
  PRIMARY KEY (k, day)
);
