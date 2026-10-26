-- Smart Referral: each client gets a personal link; a friend who opens it can ask for a fitting (a lead);
-- when the friend's first order is delivered, the client who sent them earns the shop's reward.
-- Ids are UUIDs; timestamps are UTC ISO 8601 TEXT.

-- The shop's offer, shown on the friend's page and in the share message. Null = not set up yet.
ALTER TABLE shops ADD COLUMN referral_friend_offer TEXT;   -- "A complimentary shirt with your first suit"
ALTER TABLE shops ADD COLUMN referral_client_offer TEXT;   -- "A free monogram on your next order"

-- Per client: the code in their link (made once, on first use), how often they tapped Share, and who sent them.
ALTER TABLE clients ADD COLUMN referral_code TEXT;
ALTER TABLE clients ADD COLUMN referral_shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN referred_by_client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);

-- A friend who filled in the public page (GET/POST /r/:code). Becomes a client when the shop taps "Add as client".
CREATE TABLE IF NOT EXISTS referral_leads (
  id                  TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  referrer_client_id  TEXT NOT NULL,                  -- the ambassador whose link was used
  name                TEXT NOT NULL,
  contact             TEXT NOT NULL,                  -- phone or LINE id, as typed
  preferred           TEXT,                           -- this_week | next_week | any
  status              TEXT NOT NULL DEFAULT 'new',    -- new | added | dismissed
  client_id           TEXT,                           -- the client row made from this lead
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_leads_shop ON referral_leads(shop_id, status, created_at);

-- A reward owed to an ambassador for one friend. pending until the friend's first order is delivered,
-- then ready; given once the shop hands it over.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id                    TEXT PRIMARY KEY,
  shop_id               TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  ambassador_client_id  TEXT NOT NULL,
  friend_client_id      TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | ready | given
  ready_at              TEXT,
  given_at              TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_shop ON referral_rewards(shop_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_pair ON referral_rewards(ambassador_client_id, friend_client_id);
