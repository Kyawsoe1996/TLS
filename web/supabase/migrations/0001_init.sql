-- TLS — initial multi-tenant schema with Row-Level Security.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Model: one shop per authenticated user. Every table is scoped to the owner via RLS.

-- ─────────────────────────── Tables ───────────────────────────
create table if not exists public.shops (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'My Tailor Shop',
  city       text,
  created_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.services (
  id      uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name    text not null,
  price   numeric not null default 0,
  unit    text not null default 'per item'
);

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  last_visit date,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_metrics (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references public.shops(id) on delete cascade,
  month               text not null,
  revenue             numeric not null default 0,
  orders              int not null default 0,
  new_customers       int not null default 0,
  returning_customers int not null default 0
);

create table if not exists public.campaign_performance (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  campaign    text not null,
  channel     text not null,
  spend       numeric not null default 0,
  reach       int not null default 0,
  clicks      int not null default 0,
  conversions int not null default 0
);

-- ─────────────────────── Row-Level Security ───────────────────────
alter table public.shops                enable row level security;
alter table public.services             enable row level security;
alter table public.customers            enable row level security;
alter table public.monthly_metrics      enable row level security;
alter table public.campaign_performance enable row level security;

-- A user fully manages their own shop row.
create policy "owner manages shop" on public.shops
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables: accessible only if the row's shop belongs to the current user.
create policy "owner manages services" on public.services
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));

create policy "owner manages customers" on public.customers
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));

create policy "owner manages monthly_metrics" on public.monthly_metrics
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));

create policy "owner manages campaign_performance" on public.campaign_performance
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));

-- ──────────── Seed a populated demo shop on every new signup ────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_shop_id uuid;
begin
  insert into public.shops (owner_id, name, city)
  values (new.id, 'My Tailor Shop', 'Dubai')
  returning id into new_shop_id;

  insert into public.services (shop_id, name, price, unit) values
    (new_shop_id, 'Bespoke 2-piece suit', 480, 'per suit'),
    (new_shop_id, 'Wedding sherwani', 650, 'per outfit'),
    (new_shop_id, 'Trouser alteration', 25, 'per item'),
    (new_shop_id, 'Shirt — made to measure', 95, 'per shirt'),
    (new_shop_id, 'Dress hemming', 18, 'per item');

  insert into public.monthly_metrics (shop_id, month, revenue, orders, new_customers, returning_customers) values
    (new_shop_id, '2025-09',  8200, 41, 22, 19),
    (new_shop_id, '2025-10',  9100, 47, 25, 22),
    (new_shop_id, '2025-11', 12400, 63, 34, 29),
    (new_shop_id, '2025-12', 15800, 79, 41, 38),
    (new_shop_id, '2026-01',  7600, 38, 15, 23),
    (new_shop_id, '2026-02',  9900, 50, 21, 29),
    (new_shop_id, '2026-03', 11200, 57, 26, 31),
    (new_shop_id, '2026-04', 13600, 68, 30, 38),
    (new_shop_id, '2026-05', 14800, 74, 33, 41),
    (new_shop_id, '2026-06', 16500, 82, 37, 45);

  insert into public.campaign_performance (shop_id, campaign, channel, spend, reach, clicks, conversions) values
    (new_shop_id, 'Eid Bespoke Suits',    'Instagram', 120, 18400, 920, 41),
    (new_shop_id, 'Winter Wedding Wear',  'Facebook',   90, 12100, 540, 28),
    (new_shop_id, 'Back-to-Office Fits',  'Instagram',  75,  9800, 410, 19),
    (new_shop_id, 'Ramadan Kaftan Drop',  'WhatsApp',   40,  3200, 380, 33),
    (new_shop_id, 'Graduation Tailoring', 'Google',    110, 14500, 600, 24);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
