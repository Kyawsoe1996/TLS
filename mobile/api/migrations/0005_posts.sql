-- TLS mobile API - posts (the content library behind Content Studio) + their attached photo / video.
-- ids are UUIDs (crypto.randomUUID()); timestamps are UTC ISO 8601 TEXT.
-- The media file itself lives in the R2 bucket (binding MEDIA) under media_key; only its metadata is stored here.

CREATE TABLE IF NOT EXISTS posts (
  id                 TEXT PRIMARY KEY,
  shop_id            TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,              -- blog title
  body               TEXT NOT NULL,              -- blog post
  caption            TEXT NOT NULL,              -- social caption with hashtags
  call_to_action     TEXT NOT NULL,
  topic              TEXT NOT NULL,              -- the brief it was generated from
  tone               TEXT NOT NULL,              -- BrandTone
  audience           TEXT NOT NULL,              -- Audience
  status             TEXT NOT NULL,              -- 'draft' | 'shared'
  shared_at          TEXT,                       -- last time "Share" was completed
  media_key          TEXT,                       -- R2 object key: <shop_id>/<post_id>/<uuid>.<ext>; NULL = no media
  media_kind         TEXT,                       -- 'image' | 'video'
  media_content_type TEXT,                       -- e.g. image/jpeg, video/mp4
  media_width        REAL,
  media_height       REAL,
  media_duration     REAL,                       -- seconds, videos only
  media_size         INTEGER,                    -- bytes
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_shop_created ON posts(shop_id, created_at);
