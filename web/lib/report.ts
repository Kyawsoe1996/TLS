import { getShopData } from "@/lib/shop";
import { getCustomers } from "@/lib/customers";

export type MonthlyReport = {
  shopName: string;
  month: string;
  revenue: number;
  orders: number;
  newCustomers: number;
  returningCustomers: number;
  revenueChangePct: number | null;
  topCampaign: { campaign: string; conversions: number } | null;
  totalCustomers: number;
  inactiveCustomers: number;
};

export async function getMonthlyReport(): Promise<MonthlyReport> {
  const data = await getShopData();
  const { customers } = await getCustomers();

  const m = data.monthlyMetrics;
  const last = m[m.length - 1];
  const prev = m[m.length - 2];
  const revenueChangePct =
    last && prev && prev.revenue
      ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100)
      : null;

  const topCampaign =
    [...data.campaignPerformance].sort((a, b) => b.conversions - a.conversions)[0] ?? null;

  return {
    shopName: data.name,
    month: last?.month ?? "—",
    revenue: last?.revenue ?? 0,
    orders: last?.orders ?? 0,
    newCustomers: last?.newCustomers ?? 0,
    returningCustomers: last?.returningCustomers ?? 0,
    revenueChangePct,
    topCampaign,
    totalCustomers: customers.length,
    inactiveCustomers: customers.filter((c) => c.inactive).length,
  };
}
