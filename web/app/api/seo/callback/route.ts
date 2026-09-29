import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, listSites } from "@/lib/seo/gsc";

export const runtime = "nodejs";

// Google redirects here with ?code & ?state. We verify state, exchange the code,
// pick the first verified property, and store the refresh token for this shop.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("seo_oauth_state")?.value;

  const back = new URL("/dashboard/seo", url.origin);

  if (!code || !state || state !== savedState) {
    back.searchParams.set("seo_error", "oauth_state");
    return NextResponse.redirect(back);
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode(code);
    if (!refreshToken) {
      // No refresh token usually means the user previously granted access.
      back.searchParams.set("seo_error", "no_refresh_token");
      return NextResponse.redirect(back);
    }

    const sites = await listSites(accessToken);
    const siteUrl = sites[0];
    if (!siteUrl) {
      back.searchParams.set("seo_error", "no_sites");
      return NextResponse.redirect(back);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      back.searchParams.set("seo_error", "not_signed_in");
      return NextResponse.redirect(back);
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .single();
    if (!shop) {
      back.searchParams.set("seo_error", "no_shop");
      return NextResponse.redirect(back);
    }

    await supabase
      .from("seo_connections")
      .upsert(
        { shop_id: shop.id, site_url: siteUrl, refresh_token: refreshToken, updated_at: new Date().toISOString() },
        { onConflict: "shop_id" },
      );

    back.searchParams.set("seo_connected", "1");
    return NextResponse.redirect(back);
  } catch {
    back.searchParams.set("seo_error", "exchange_failed");
    return NextResponse.redirect(back);
  }
}
