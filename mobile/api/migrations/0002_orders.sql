-- TLS mobile API - orders (a garment for a client, moving through the workshop)
-- ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fitting_id   TEXT,                           -- optional link to fittings.id
  garment      TEXT NOT NULL,
  fabric       TEXT,
  status       TEXT NOT NULL,                  -- 'measured' | 'cutting' | 'fitting' | 'ready' | 'delivered'
  due_at       TEXT,                           -- ISO, date semantics
  delivered_at TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status_due ON orders(shop_id, status, due_at);
