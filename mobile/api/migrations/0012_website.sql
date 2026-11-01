-- Free shop website: one switch in Settings gives the shop a public page at /s/<slug>, built from its details,
-- delivered garments, order photos and shared posts. A visitor can ask for a fitting there (an enquiry), which the
-- shop can turn into a client. Ids are UUIDs; timestamps are UTC ISO 8601 TEXT.
-- SQLite / libSQL only allows one column per ALTER TABLE, so each column is its own statement.

-- The page's address part (made from the shop name on first use), whether it is live, and two page-only details.
ALTER TABLE shops ADD COLUMN website_slug TEXT;                              -- "kssoe" -> /s/kssoe
ALTER TABLE shops ADD COLUMN website_enabled INTEGER NOT NULL DEFAULT 0;     -- 0 = the page answers 404
ALTER TABLE shops ADD COLUMN website_about TEXT;                             -- "About the shop" paragraph
ALTER TABLE shops ADD COLUMN website_line_id TEXT;                           -- LINE button: line.me/ti/p/~<id>
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_website_slug ON shops(website_slug);

-- A visitor who filled in the booking form (POST /s/:slug). Becomes a client when the shop taps "Add as client".
CREATE TABLE IF NOT EXISTS website_enquiries (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  contact     TEXT NOT NULL,                  -- phone or LINE id, as typed
  garment     TEXT,                           -- what they'd like made, from the form's list
  preferred   TEXT,                           -- this_week | next_week | any
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'new',    -- new | contacted | added | dismissed
  client_id   TEXT,                           -- the client row made from this enquiry
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_enquiries_shop ON website_enquiries(shop_id, status, created_at);
