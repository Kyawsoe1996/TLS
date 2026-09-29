import mock from "@/seed/mock-seo.json";
import { createClient } from "@/lib/supabase/server";

// One normalized row shape for both live (GSC) and sample data.
export type SeoRow = {
  keyword: string;
  position: number;
  clicks: number;
  impressions: number;
};

export type SeoData = {
  connected: boolean;
  source: "gsc" | "sample";
  siteUrl?: string;
  rows: SeoRow[];
};

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

// Sample fallback, derived from seed/mock-seo.json (synthetic clicks for a consistent table).
const SAMPLE: SeoData = {
  connected: false,
  source: "sample",
  rows: mock.tracked_keywords.map((k) => ({
    keyword: k.keyword,
    position: k.rank,
    impressions: k.monthly_searches,
    clicks: Math.round(k.monthly_searches * 0.04),
  })),
};

export function oauthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Build the Google consent-screen URL (offline access → we get a refresh token).
export function buildConsentUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_OAUTH_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GSC_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

// Exchange an authorization code for tokens (callback step).
export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("code exchange failed");
  const json = await res.json();
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

// List the user's verified Search Console properties.
export async function listSites(accessToken: string): Promise<string[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.siteEntry ?? [])
    .filter((s: { permissionLevel?: string }) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: { siteUrl: string }) => s.siteUrl);
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("token refresh failed");
  const json = await res.json();
  return json.access_token as string;
}

async function querySearchAnalytics(siteUrl: string, accessToken: string): Promise<SeoRow[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ["query"],
        rowLimit: 15,
      }),
    },
  );
  if (!res.ok) throw new Error("search analytics query failed");
  const json = await res.json();

  return (json.rows ?? []).map(
    (r: { keys?: string[]; position?: number; clicks?: number; impressions?: number }) => ({
      keyword: r.keys?.[0] ?? "",
      position: Math.round((r.position ?? 0) * 10) / 10,
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }),
  );
}

// Page entry point: live GSC rankings for the signed-in shop, or sample fallback.
export async function getSeoData(): Promise<SeoData> {
  if (!oauthConfigured() || !supabaseConfigured()) return SAMPLE;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return SAMPLE;

    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .single();
    if (!shop) return SAMPLE;

    const { data: conn } = await supabase
      .from("seo_connections")
      .select("site_url, refresh_token")
      .eq("shop_id", shop.id)
      .single();
    if (!conn?.refresh_token) return SAMPLE;

    const accessToken = await refreshAccessToken(conn.refresh_token);
    const rows = await querySearchAnalytics(conn.site_url, accessToken);
    if (!rows.length) return { connected: true, source: "gsc", siteUrl: conn.site_url, rows: [] };
    return { connected: true, source: "gsc", siteUrl: conn.site_url, rows };
  } catch {
    return SAMPLE;
  }
}
