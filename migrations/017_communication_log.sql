-- Migration 017: Communications & outreach log (ADR-078 / WS-C).
-- Tracks every send (email or print) for payment reminders and thank-you notes.
-- Mirrored in src/lib/sqlite.ts bootstrap (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS communication_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_type  TEXT NOT NULL,                 -- payment_reminder | thank_you | (future)
  channel       TEXT NOT NULL,                 -- email | print
  order_id      INTEGER,                       -- FK orders(id) ON DELETE SET NULL
  customer_id   INTEGER,                       -- FK customers(id) ON DELETE SET NULL
  recipient     TEXT,                          -- email address, or 'print'
  subject       TEXT,
  body_snapshot TEXT,                          -- rendered body at send time (audit)
  status        TEXT NOT NULL DEFAULT 'queued',-- queued | sent | printed | failed
  error         TEXT,
  sent_at       TEXT,                          -- ISO 8601 when sent/printed
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_log_order   ON communication_log(order_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_type    ON communication_log(message_type);
CREATE INDEX IF NOT EXISTS idx_comm_log_created ON communication_log(created_at);
