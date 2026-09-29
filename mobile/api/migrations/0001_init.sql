-- TLS mobile API - initial schema (Turso / libSQL)
-- ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.

CREATE TABLE IF NOT EXISTS shops (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,          -- Clerk user id
  name          TEXT NOT NULL,
  district      TEXT NOT NULL,
  city          TEXT NOT NULL,
  tone          TEXT NOT NULL DEFAULT 'Sophisticated',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  shop_id       TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  line_id       TEXT,
  notes         TEXT,
  last_order_at TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_shop_id ON clients(shop_id);
CREATE INDEX IF NOT EXISTS idx_clients_shop_id_name ON clients(shop_id, name);

CREATE TABLE IF NOT EXISTS fittings (
  id            TEXT PRIMARY KEY,
  shop_id       TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  style         TEXT NOT NULL,
  fabric        TEXT NOT NULL,
  chest         REAL,
  waist         REAL,
  over_arm      REAL,
  shoulder      REAL,
  sleeve        REAL,
  jacket_length REAL,
  posture_note  TEXT,
  ai_json       TEXT,                          -- FitAnalysis JSON after POST /ai/fit
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fittings_client_id ON fittings(client_id);
CREATE INDEX IF NOT EXISTS idx_fittings_shop_id_created_at ON fittings(shop_id, created_at);

CREATE TABLE IF NOT EXISTS generations (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                   -- 'seo' | 'post' | 'winback'
  input_json  TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generations_shop_id_created_at ON generations(shop_id, created_at);
