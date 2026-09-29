import { createClient } from "@/lib/supabase/server";

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  lastVisit: string | null;
  daysSince: number | null;
  inactive: boolean;
};

const INACTIVE_DAYS = 90;

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function toCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  last_visit: string | null;
}): Customer {
  const d = daysSince(row.last_visit);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    lastVisit: row.last_visit,
    daysSince: d,
    inactive: d !== null && d > INACTIVE_DAYS,
  };
}

// Demo fallback with dates relative to today, so "inactive" stays meaningful.
function demoCustomers(): Customer[] {
  const iso = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return [
    { id: "demo-1", name: "Aisha Rahman", email: "aisha@example.com", last_visit: iso(12) },
    { id: "demo-2", name: "Omar Farouk", email: "omar@example.com", last_visit: iso(40) },
    { id: "demo-3", name: "Lena Park", email: "lena@example.com", last_visit: iso(115) },
    { id: "demo-4", name: "Daniel Cohen", email: "daniel@example.com", last_visit: iso(160) },
    { id: "demo-5", name: "Priya Nair", email: "priya@example.com", last_visit: iso(8) },
    { id: "demo-6", name: "Marco Rossi", email: "marco@example.com", last_visit: iso(210) },
  ].map(toCustomer);
}

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function getCustomers(): Promise<{ customers: Customer[]; live: boolean }> {
  if (!configured()) return { customers: demoCustomers(), live: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { customers: demoCustomers(), live: false };

    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .single();
    if (!shop) return { customers: demoCustomers(), live: false };

    const { data } = await supabase
      .from("customers")
      .select("id, name, email, last_visit")
      .eq("shop_id", shop.id)
      .order("last_visit", { ascending: true });

    return { customers: (data ?? []).map(toCustomer), live: true };
  } catch {
    return { customers: demoCustomers(), live: false };
  }
}
