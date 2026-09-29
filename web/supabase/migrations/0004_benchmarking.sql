-- TLS — anonymized cross-shop benchmarks.
-- SECURITY DEFINER lets these functions read across all shops (bypassing RLS), but they
-- return ONLY aggregates — never shop ids or individual rows — so no shop's data leaks.
-- The app additionally hides results until there are >= 3 shops (see lib/benchmarks.ts).

create or replace function public.get_industry_benchmarks()
returns table (shop_count int, avg_revenue numeric, avg_orders numeric, avg_retention numeric)
language sql
security definer
set search_path = public
stable
as $$
  with latest as (
    select distinct on (shop_id)
      shop_id, revenue, orders, new_customers, returning_customers
    from monthly_metrics
    order by shop_id, month desc
  )
  select
    count(*)::int,
    round(avg(revenue), 0),
    round(avg(orders), 1),
    round(avg(returning_customers::numeric / nullif(new_customers + returning_customers, 0)), 3)
  from latest;
$$;

grant execute on function public.get_industry_benchmarks() to authenticated;

create or replace function public.get_popular_services()
returns table (name text, shops int)
language sql
security definer
set search_path = public
stable
as $$
  select name, count(distinct shop_id)::int as shops
  from services
  group by name
  order by shops desc, name
  limit 5;
$$;

grant execute on function public.get_popular_services() to authenticated;
