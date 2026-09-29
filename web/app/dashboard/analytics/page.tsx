import { AnalyticsCharts } from "@/components/analytics-charts";
import { getShopData } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { monthlyMetrics, campaignPerformance } = await getShopData();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-white/60">Your shop&apos;s performance at a glance.</p>
      </header>

      <AnalyticsCharts monthly={monthlyMetrics} campaigns={campaignPerformance} />
    </div>
  );
}
