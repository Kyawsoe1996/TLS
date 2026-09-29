import { getMonthlyReport } from "@/lib/report";
import { AiGenerator } from "@/components/ai-generator";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const r = await getMonthlyReport();

  const kpis = [
    {
      label: "Revenue",
      value: `$${r.revenue.toLocaleString()}`,
      sub:
        r.revenueChangePct !== null
          ? `${r.revenueChangePct >= 0 ? "+" : ""}${r.revenueChangePct}% vs prev month`
          : "",
    },
    { label: "Orders", value: r.orders, sub: "" },
    { label: "New customers", value: r.newCustomers, sub: "" },
    { label: "Returning", value: r.returningCustomers, sub: "" },
    { label: "Total customers", value: r.totalCustomers, sub: "" },
    { label: "Inactive (90d+)", value: r.inactiveCustomers, sub: "" },
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monthly Report</h1>
          <p className="text-white/60">
            {r.shopName} · {r.month}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/report/export"
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-slate-900"
          >
            Download CSV
          </a>
          <PrintButton />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/50">{k.label}</p>
            <p className="mt-1 text-xl font-semibold">{k.value}</p>
            {k.sub && <p className="text-xs text-white/40">{k.sub}</p>}
          </div>
        ))}
      </div>

      {r.topCampaign && (
        <p className="text-sm text-white/70">
          Top campaign: <strong>{r.topCampaign.campaign}</strong> — {r.topCampaign.conversions}{" "}
          conversions
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">AI summary</h2>
        <AiGenerator
          kind="report"
          buttonLabel="Generate report summary"
          staticFields={{ shopName: r.shopName, data: r }}
        />
      </section>
    </div>
  );
}
