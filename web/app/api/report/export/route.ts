import { getShopData } from "@/lib/shop";

export const runtime = "nodejs";

// GET /api/report/export → a CSV download of the shop's metrics + campaigns.
export async function GET() {
  const data = await getShopData();

  const lines: string[] = [];
  lines.push(`Shop,${data.name}`);
  lines.push("");
  lines.push("month,revenue,new_customers,returning_customers");
  for (const m of data.monthlyMetrics) {
    lines.push(`${m.month},${m.revenue},${m.newCustomers},${m.returningCustomers}`);
  }
  lines.push("");
  lines.push("campaign,conversions");
  for (const c of data.campaignPerformance) {
    lines.push(`"${c.campaign}",${c.conversions}`);
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tls-monthly-report.csv"',
    },
  });
}
