import { createClient } from "@/lib/supabase/server";
import {
  monthlyMetrics as demoMetrics,
  campaignPerformance as demoCampaigns,
} from "@/lib/demo-data";

export type ShopData = {
  name: string;
  monthlyMetrics: typeof demoMetrics;
  campaignPerformance: { campaign: string; conversions: number }[];
};

const FALLBACK: ShopData = {
  name: "Demo Tailor Co.",
  monthlyMetrics: demoMetrics,
  campaignPerformance: demoCampaigns.map((c) => ({
    campaign: c.campaign,
    conversions: c.conversions,
  })),
};

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Just the shop name (for headers / sign-out bar). Falls back to demo when
// Supabase isn't configured yet or there's no signed-in user.
export async function getShop(): Promise<{ name: string }> {
  if (!configured()) return { name: FALLBACK.name };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { name: FALLBACK.name };

    const { data } = await supabase
      .from("shops")
      .select("name")
      .eq("owner_id", user.id)
      .single();
    return { name: data?.name ?? FALLBACK.name };
  } catch {
    return { name: FALLBACK.name };
  }
}

// Shop name + analytics data. RLS already scopes rows to the user; the
// owner filter is belt-and-suspenders. Falls back to demo data on any miss.
export async function getShopData(): Promise<ShopData> {
  if (!configured()) return FALLBACK;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return FALLBACK;

    const { data: shop } = await supabase
      .from("shops")
      .select("id, name")
      .eq("owner_id", user.id)
      .single();
    if (!shop) return FALLBACK;

    const { data: metrics } = await supabase
      .from("monthly_metrics")
      .select("month, revenue, orders, new_customers, returning_customers")
      .eq("shop_id", shop.id)
      .order("month");

    const { data: campaigns } = await supabase
      .from("campaign_performance")
      .select("campaign, conversions")
      .eq("shop_id", shop.id);

    if (!metrics?.length) return { ...FALLBACK, name: shop.name };

    return {
      name: shop.name,
      monthlyMetrics: metrics.map((m) => ({
        month: m.month,
        revenue: Number(m.revenue),
        orders: m.orders ?? 0,
        newCustomers: m.new_customers,
        returningCustomers: m.returning_customers,
      })),
      campaignPerformance: (campaigns ?? []).map((c) => ({
        campaign: c.campaign,
        conversions: c.conversions,
      })),
    };
  } catch {
    return FALLBACK;
  }
}
