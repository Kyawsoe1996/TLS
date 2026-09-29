-- TLS — customer engagement: a messages log + seed demo customers on signup.
-- Run AFTER 0001_init.sql. Safe to re-run.

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel     text not null default 'email',
  subject     text,
  body        text,
  status      text not null default 'sent',   -- 'sent' | 'simulated'
  created_at  timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "owner manages messages" on public.messages
  for all using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check  (shop_id in (select id from public.shops where owner_id = auth.uid()));

-- Replace the signup trigger so new shops also get demo customers (some inactive).
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

  insert into public.customers (shop_id, name, email, last_visit) values
    (new_shop_id, 'Aisha Rahman',  'aisha@example.com',  current_date - 12),
    (new_shop_id, 'Omar Farouk',   'omar@example.com',   current_date - 40),
    (new_shop_id, 'Lena Park',     'lena@example.com',   current_date - 115),
    (new_shop_id, 'Daniel Cohen',  'daniel@example.com', current_date - 160),
    (new_shop_id, 'Priya Nair',    'priya@example.com',  current_date - 8),
    (new_shop_id, 'Marco Rossi',   'marco@example.com',  current_date - 210);

  return new;
end;
$$;
