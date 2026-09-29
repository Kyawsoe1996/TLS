-- TLS — Google Search Console connection storage (one per shop).
-- Run AFTER 0001_init.sql in the Supabase SQL editor.
-- Note: refresh_token is a secret. For production, encrypt it at rest (e.g. pgsodium /
-- Vault) or store it in a service-role-only schema. RLS here scopes it to the owner.

create table if not exists public.seo_connections (
  shop_id       uuid primary key references public.shops(id) on delete cascade,
  site_url      text not null,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.seo_connections enable row level security;

create policy "owner manages seo_connections" on public.seo_connections
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));
