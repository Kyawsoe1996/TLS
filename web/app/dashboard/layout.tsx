import Link from "next/link";
import { logout } from "@/app/login/actions";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard/marketing", label: "AI Marketing" },
  { href: "/dashboard/seo", label: "SEO" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/benchmarking", label: "Benchmarking" },
  { href: "/dashboard/insights", label: "AI Insights" },
  { href: "/dashboard/reports", label: "Reports" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shop = await getShop();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 p-5">
        <div className="mb-8">
          <p className="text-lg font-semibold">TLS</p>
          <p className="text-xs text-white/50">{shop.name}</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <form action={logout}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/50 hover:bg-white/5">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
