-- Payments: one row per amount received (or corrected) against an order, so the monthly report can say
-- how much money came in during a month. Written by the API whenever an order's deposit changes;
-- orders.deposit stays the running total the app already shows.
-- Ids are UUIDs; timestamps are UTC ISO 8601 TEXT; amounts are whole baht (negative = a correction down).

CREATE TABLE IF NOT EXISTS order_payments (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  paid_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_payments_shop_paid ON order_payments(shop_id, paid_at);
