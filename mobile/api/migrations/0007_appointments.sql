-- TLS mobile API - appointments (a dated visit by a client: fitting, collection or consultation)
-- plus the reminder link on messages. ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.

CREATE TABLE IF NOT EXISTS appointments (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id        TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id         TEXT,                        -- optional link to orders.id (e.g. the garment being collected)
  kind             TEXT NOT NULL,               -- 'fitting' | 'collection' | 'consultation'
  starts_at        TEXT NOT NULL,               -- ISO instant (UTC); shown in the shop's local time by the app
  notes            TEXT,
  status           TEXT NOT NULL,               -- 'scheduled' | 'done' | 'cancelled'
  reminder_sent_at TEXT,                        -- when an appointment_reminder email was last sent for it
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_status_starts ON appointments(shop_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client_starts ON appointments(client_id, starts_at);

-- Messages: which appointment a reminder was for (NULL for every other kind).
ALTER TABLE messages ADD COLUMN appointment_id TEXT;
