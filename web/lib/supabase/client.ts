import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (for use inside "use client" components).
// Used in the next phase for auth + reading the user's own shop data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
