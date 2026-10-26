-- Fabric stock: the cloth a shop keeps on the shelf, in metres, and what each order takes off it.
-- Ids are UUIDs; timestamps are UTC ISO 8601 TEXT. Lengths are REAL metres (one decimal in the app).

CREATE TABLE IF NOT EXISTS fabrics (
  id              TEXT PRIMARY KEY,
  shop_id         TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                      -- "Super 130s navy wool"
  supplier        TEXT,                               -- mill or merchant
  colour          TEXT,
  kind            TEXT NOT NULL DEFAULT 'suiting',    -- suiting | jacketing | trousering | shirting | lining | other
  width_cm        INTEGER,                            -- usual 150 (suiting) or 145 (linen)
  metres_left     REAL NOT NULL DEFAULT 0,
  low_at_metres   REAL NOT NULL DEFAULT 3,            -- "low" badge and Home count when metres_left < this
  cost_per_metre  INTEGER,                            -- THB, optional, for the shop's records
  swatch          TEXT,                               -- hex colour for the swatch square in the app, e.g. "#1E2D4D"
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fabrics_shop ON fabrics(shop_id, metres_left);

-- Every change of a bolt's length: a delivery from the mill (+), a correction after a stock-take (+/-),
-- or an order that reached Cutting (-, with the order id).
CREATE TABLE IF NOT EXISTS fabric_movements (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  fabric_id   TEXT NOT NULL REFERENCES fabrics(id) ON DELETE CASCADE,
  order_id    TEXT,                                   -- plain link; the order may be deleted later
  metres      REAL NOT NULL,                          -- signed
  reason      TEXT NOT NULL,                          -- received | correction | order
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fabric_movements_fabric ON fabric_movements(fabric_id, created_at);

-- An order can be cut from a fabric in stock: the length it needs, and when that length came off the bolt
-- (stamped once, when the status first reaches "cutting").
ALTER TABLE orders ADD COLUMN fabric_id TEXT;
ALTER TABLE orders ADD COLUMN metres_needed REAL;
ALTER TABLE orders ADD COLUMN metres_taken_at TEXT;
