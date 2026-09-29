-- seed/seed.sql
-- Seeded demo data for the Analytics tab. Paste into the Lovable Cloud / Supabase SQL
-- editor, or hand it to Lovable as the reference when you ask it to seed the database.
-- All data is FICTIONAL — safe for a public, free-tier demo (no real customer info).

-- Monthly performance (drives the revenue line chart + new/returning customer chart)
create table if not exists monthly_metrics (
  id                  bigint generated always as identity primary key,
  month               text    not null,   -- 'YYYY-MM'
  revenue             numeric not null,
  orders              int     not null,
  new_customers       int     not null,
  returning_customers int     not null
);

insert into monthly_metrics (month, revenue, orders, new_customers, returning_customers) values
  ('2025-09',  8200, 41, 22, 19),
  ('2025-10',  9100, 47, 25, 22),
  ('2025-11', 12400, 63, 34, 29),
  ('2025-12', 15800, 79, 41, 38),
  ('2026-01',  7600, 38, 15, 23),
  ('2026-02',  9900, 50, 21, 29),
  ('2026-03', 11200, 57, 26, 31),
  ('2026-04', 13600, 68, 30, 38),
  ('2026-05', 14800, 74, 33, 41),
  ('2026-06', 16500, 82, 37, 45);

-- Campaign performance (drives the campaign ROI bar chart + the AI Insights input)
create table if not exists campaign_performance (
  id          bigint generated always as identity primary key,
  campaign    text    not null,
  channel     text    not null,
  spend       numeric not null,
  reach       int     not null,
  clicks      int     not null,
  conversions int     not null
);

insert into campaign_performance (campaign, channel, spend, reach, clicks, conversions) values
  ('Eid Bespoke Suits',    'Instagram', 120, 18400, 920, 41),
  ('Winter Wedding Wear',  'Facebook',   90, 12100, 540, 28),
  ('Back-to-Office Fits',  'Instagram',  75,  9800, 410, 19),
  ('Ramadan Kaftan Drop',  'WhatsApp',   40,  3200, 380, 33),
  ('Graduation Tailoring', 'Google',    110, 14500, 600, 24);

-- Optional: a tiny services/portfolio table for the shop profile screen
create table if not exists services (
  id    bigint generated always as identity primary key,
  name  text    not null,
  price numeric not null,
  unit  text    not null default 'per item'
);

insert into services (name, price, unit) values
  ('Bespoke 2-piece suit', 480, 'per suit'),
  ('Wedding sherwani',     650, 'per outfit'),
  ('Trouser alteration',    25, 'per item'),
  ('Shirt — made to measure', 95, 'per shirt'),
  ('Dress hemming',         18, 'per item');
