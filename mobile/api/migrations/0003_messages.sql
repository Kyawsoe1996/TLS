-- TLS mobile API - messages (emails sent to a client from the app)
-- ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id    TEXT,                            -- optional link to orders.id (order_ready)
  kind        TEXT NOT NULL,                   -- 'winback' | 'order_ready' | 'followup'
  channel     TEXT NOT NULL,                   -- 'email'
  to_address  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,                   -- plain text
  status      TEXT NOT NULL,                   -- 'sent' | 'simulated' | 'failed'
  error       TEXT,                            -- provider message when status is 'failed'
  provider_id TEXT,                            -- Resend email id when status is 'sent'
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_client_id_created ON messages(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_shop_id ON messages(shop_id);
