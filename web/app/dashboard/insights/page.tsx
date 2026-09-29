import { AiGenerator } from "@/components/ai-generator";
import { getShopData } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { name, monthlyMetrics, campaignPerformance } = await getShopData();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI Business Insights</h1>
        <p className="text-white/60">
          Recommendations generated from your shop&apos;s own numbers.
        </p>
      </header>

      <AiGenerator
        kind="insights"
        buttonLabel="Generate insights"
        staticFields={{
          shopName: name,
          data: { monthlyMetrics, campaignPerformance },
        }}
      />
    </div>
  );
}
