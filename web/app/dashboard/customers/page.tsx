import { getCustomers } from "@/lib/customers";
import { getShop } from "@/lib/shop";
import { addCustomer } from "./actions";
import { ReengageForm } from "@/components/reengage-form";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [{ customers, live }, shop] = await Promise.all([getCustomers(), getShop()]);
  const inactiveCount = customers.filter((c) => c.inactive).length;

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-white/60">
          {customers.length} customers · {inactiveCount} inactive (90+ days)
          {live ? "" : " · sample data"}
        </p>
      </header>

      <form action={addCustomer} className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          placeholder="Name"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-slate-900">
          Add customer
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3">Last visit</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-white/5 align-top">
                <td className="p-3">{c.name}</td>
                <td className="p-3 text-white/70">{c.email ?? "—"}</td>
                <td className="p-3 text-center">
                  {c.daysSince !== null ? `${c.daysSince}d ago` : "—"}
                </td>
                <td className="p-3 text-center">
                  {c.inactive ? (
                    <div className="space-y-1">
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                        Inactive
                      </span>
                      <ReengageForm
                        customer={{ id: c.id, name: c.name, email: c.email }}
                        shopName={shop.name}
                      />
                    </div>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                      Active
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
