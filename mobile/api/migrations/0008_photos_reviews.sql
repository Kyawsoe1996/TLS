-- TLS mobile API - order progress photos, the shop's Google review link and review-request emails.
-- ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.
-- SQLite / libSQL only allows one column per ALTER TABLE, so each column is its own statement.

-- Shops: the Google "write a review" link (Google Business Profile -> Get more reviews). NULL hides the review card.
ALTER TABLE shops ADD COLUMN google_review_url TEXT;

-- Orders: when a review_request email was sent for the order (NULL until then; the app offers it once per order).
ALTER TABLE orders ADD COLUMN review_requested_at TEXT;

-- Progress photos on an order. The file itself lives in the S3 bucket under media_key
-- (<shop_id>/orders/<order_id>/<uuid>.<ext>, see media.ts); only its metadata is stored here.
CREATE TABLE IF NOT EXISTS order_photos (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  media_key    TEXT NOT NULL,                  -- S3 object key (without S3_PREFIX)
  stage        TEXT NOT NULL,                  -- the order's status when the photo was taken (OrderStatus)
  content_type TEXT NOT NULL,                  -- image/jpeg | image/png | image/webp
  width        INTEGER,                        -- pixels, when the app sent them
  height       INTEGER,
  size         INTEGER NOT NULL,               -- bytes
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_photos_order_created ON order_photos(order_id, created_at);
