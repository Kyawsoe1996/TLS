-- Portfolio website: the free website grows from one page into five (Home, Work, a page per piece, Services, About),
-- with a look the owner picks, the work they choose to show, services with "from" prices and pasted reviews.
-- Ids are UUIDs; timestamps are UTC ISO 8601 TEXT.
-- SQLite / libSQL only allows one column per ALTER TABLE, so each column is its own statement.

-- The page's look and the owner's own words.
ALTER TABLE shops ADD COLUMN website_theme TEXT NOT NULL DEFAULT 'atelier'; -- atelier | ivory | noir
ALTER TABLE shops ADD COLUMN website_headline TEXT;                         -- Home's big line; NULL = "Made to measure in <district>"
ALTER TABLE shops ADD COLUMN website_about_heading TEXT;                    -- About's heading; NULL = "About <shop>"
ALTER TABLE shops ADD COLUMN website_includes TEXT;                         -- JSON array of strings ("Every garment includes"); NULL = defaults
ALTER TABLE shops ADD COLUMN website_rating REAL;                           -- e.g. 4.9, shown as "4.9 on Google"; NULL hides it
ALTER TABLE shops ADD COLUMN website_cover_piece_id TEXT;                   -- the portfolio piece whose first photo is the cover
ALTER TABLE shops ADD COLUMN website_tailor_photo_key TEXT;                 -- uploaded photo on the About page (media key)
ALTER TABLE shops ADD COLUMN website_sections TEXT;                         -- JSON {fabrics, process, booking} booleans; NULL = all on

-- A piece of work shown on the website. Never carries a client name: the title and line are the owner's words.
CREATE TABLE IF NOT EXISTS website_pieces (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other',   -- suits | jackets | trousers | shirts | wedding | other
  cloth       TEXT,
  style       TEXT,
  line        TEXT,                            -- "A line about it"
  made_at     TEXT,                            -- month it was made (ISO date)
  order_id    TEXT,                            -- plain link to the order it came from; NULL after the order is deleted
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_pieces_shop ON website_pieces(shop_id, sort);

-- A piece's photos. Order and post photos are referenced by their media key (the file is shared, not copied), so a
-- file is only deleted once nothing points at it any more; uploads (source = upload) belong to the piece alone.
CREATE TABLE IF NOT EXISTS website_piece_photos (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  piece_id    TEXT NOT NULL REFERENCES website_pieces(id) ON DELETE CASCADE,
  media_key   TEXT NOT NULL,
  source      TEXT NOT NULL,                   -- order | post | upload
  source_id   TEXT,                            -- order_photos.id or posts.id
  width       INTEGER,
  height      INTEGER,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_piece_photos_piece ON website_piece_photos(piece_id, sort);
CREATE INDEX IF NOT EXISTS idx_website_piece_photos_key ON website_piece_photos(shop_id, media_key);

-- "What we make": a service with an optional "from" price in baht.
CREATE TABLE IF NOT EXISTS website_services (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  from_price  INTEGER,
  line        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_website_services_shop ON website_services(shop_id, sort);

-- Reviews the owner pastes in (from Google or elsewhere), shown as quote cards.
CREATE TABLE IF NOT EXISTS website_reviews (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  quote       TEXT NOT NULL,
  author      TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'Google',
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_website_reviews_shop ON website_reviews(shop_id, sort);
