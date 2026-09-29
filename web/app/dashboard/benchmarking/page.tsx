import { getBenchmarks } from "@/lib/benchmarks";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { AiGenerator } from "@/components/ai-generator";

export const dynamic = "force-dynamic";

const idx = (you: number, ind: number) => (ind ? Math.round((you / ind) * 100) : 100);

export default async function BenchmarkingPage() {
  const b = await getBenchmarks();

  const chart = [
    { metric: "Revenue", you: idx(b.shop.revenue, b.industry.revenue) },
    { metric: "Orders", you: idx(b.shop.orders, b.industry.orders) },
    { metric: "Retention", you: idx(b.shop.retention, b.industry.retention) },
  ];

  const cards = [
    {
      label: "Monthly revenue",
      you: `$${b.shop.revenue.toLocaleString()}`,
      ind: `$${Math.round(b.industry.revenue).toLocaleString()}`,
    },
    { label: "Orders / month", you: b.shop.orders, ind: Math.round(b.industry.orders) },
    {
      label: "Retention",
      you: `${Math.round(b.shop.retention * 100)}%`,
      ind: `${Math.round(b.industry.retention * 100)}%`,
    },
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Industry Benchmarking</h1>
          <p className="text-white/60">How your shop compares to other tailor shops.</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            b.live ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {b.live ? `Live · ${b.shopCount} shops` : "Industry sample"}
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/50">{c.label}</p>
            <p className="mt-1 text-xl font-semibold">{c.you}</p>
            <p className="text-xs text-white/40">industry {c.ind}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 p-4">
        <h2 className="mb-4 text-sm text-white/70">You vs industry (index · 100 = average)</h2>
        <BenchmarkChart data={chart} />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Popular services across the industry</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {b.popularServices.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span>{s.name}</span>
              <span className="text-white/40">{s.shops} shops</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">AI interpretation</h2>
        <AiGenerator
          kind="benchmark"
          buttonLabel="Interpret my benchmarks"
          staticFields={{ shopName: b.shop.name, data: { shop: b.shop, industry: b.industry } }}
        />
      </section>
    </div>
  );
}
