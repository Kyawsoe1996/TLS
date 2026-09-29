import { createClient } from "@/lib/supabase/server";
import { getShopData } from "@/lib/shop";

export type Benchmark = {
  shop: { name: string; revenue: number; orders: number; retention: number };
  industry: { revenue: number; orders: number; retention: number };
  popularServices: { name: string; shops: number }[];
  shopCount: number;
  live: boolean;
};

// Synthetic "industry sample" — used until there are >= 3 real shops to aggregate.
const SYNTHETIC = {
  industry: { revenue: 11800, orders: 59, retention: 0.55 },
  popularServices: [
    { name: "Trouser alteration", shops: 38 },
    { name: "Bespoke 2-piece suit", shops: 31 },
    { name: "Wedding sherwani", shops: 22 },
    { name: "Shirt — made to measure", shops: 19 },
    { name: "Dress hemming", shops: 17 },
  ],
};

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function shopLatest(data: Awaited<ReturnType<typeof getShopData>>) {
  const m = data.monthlyMetrics;
  const last = m[m.length - 1];
  const denom = last ? last.newCustomers + last.returningCustomers : 0;
  return {
    name: data.name,
    revenue: last?.revenue ?? 0,
    orders: last?.orders ?? 0,
    retention: denom ? last!.returningCustomers / denom : 0,
  };
}

function synthetic(shop: Benchmark["shop"], shopCount: number): Benchmark {
  return {
    shop,
    industry: SYNTHETIC.industry,
    popularServices: SYNTHETIC.popularServices,
    shopCount,
    live: false,
  };
}

export async function getBenchmarks(): Promise<Benchmark> {
  const shop = shopLatest(await getShopData());
  if (!configured()) return synthetic(shop, 1);

  try {
    const supabase = await createClient();
    const { data: bench } = await supabase.rpc("get_industry_benchmarks").single();
    const benchRow = bench as
      | { shop_count: number; avg_revenue: number; avg_orders: number; avg_retention: number }
      | null;
    const shopCount = benchRow?.shop_count ?? 0;

    if (!benchRow || shopCount < 3) return synthetic(shop, shopCount);

    const { data: services } = await supabase.rpc("get_popular_services");
    return {
      shop,
      industry: {
        revenue: Number(benchRow.avg_revenue),
        orders: Number(benchRow.avg_orders),
        retention: Number(benchRow.avg_retention),
      },
      popularServices: ((services as { name: string; shops: number }[]) ?? []).map((s) => ({
        name: s.name,
        shops: s.shops,
      })),
      shopCount,
      live: true,
    };
  } catch {
    return synthetic(shop, 1);
  }
}
