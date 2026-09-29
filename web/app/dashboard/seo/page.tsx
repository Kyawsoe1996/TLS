import { getSeoData, oauthConfigured } from "@/lib/seo/gsc";
import { AiGenerator } from "@/components/ai-generator";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  oauth_state: "Connection expired or was tampered with — please try again.",
  no_refresh_token:
    "Google didn't return a refresh token. Revoke access at myaccount.google.com/permissions and retry.",
  no_sites: "No verified Search Console properties found for that Google account.",
  not_signed_in: "Please sign in first.",
  no_shop: "No shop found for your account.",
  exchange_failed: "Couldn't complete the Google connection — check your OAuth setup.",
};

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<{ seo_error?: string; seo_connected?: string }>;
}) {
  const [params, seo, shop] = await Promise.all([searchParams, getSeoData(), getShop()]);
  const errorMsg = params.seo_error ? (ERRORS[params.seo_error] ?? "Connection failed.") : null;

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">SEO</h1>
        <p className="text-white/60">Keyword rankings and AI-generated SEO content.</p>
      </header>

      {/* Connection status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        {seo.connected ? (
          <span className="text-sm text-emerald-300">
            ● Live · Google Search Console{seo.siteUrl ? ` — ${seo.siteUrl}` : ""}
          </span>
        ) : (
          <span className="text-sm text-amber-300">● Sample data</span>
        )}

        {oauthConfigured() ? (
          <a
            href="/api/seo/connect"
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-slate-900"
          >
            {seo.connected ? "Reconnect" : "Connect Google Search Console"}
          </a>
        ) : (
          <span className="text-xs text-white/40">
            Set GOOGLE_OAUTH_* env to enable live data (see README)
          </span>
        )}
      </div>

      {params.seo_connected && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Connected to Google Search Console.
        </p>
      )}
      {errorMsg && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorMsg}
        </p>
      )}

      {/* Rankings */}
      <section className="overflow-hidden rounded-xl border border-white/10">
        {seo.rows.length === 0 ? (
          <p className="p-4 text-sm text-white/50">
            No query data yet — new properties or low-traffic sites can take a few days.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="p-3 text-left">Keyword</th>
                <th className="p-3">Avg position</th>
                <th className="p-3">Clicks</th>
                <th className="p-3">Impressions</th>
              </tr>
            </thead>
            <tbody>
              {seo.rows.map((r) => (
                <tr key={r.keyword} className="border-t border-white/5">
                  <td className="p-3">{r.keyword}</td>
                  <td className="p-3 text-center">{r.position}</td>
                  <td className="p-3 text-center">{r.clicks.toLocaleString()}</td>
                  <td className="p-3 text-center">{r.impressions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AI SEO content (unchanged — real Gemini) */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Generate SEO content</h2>
        <AiGenerator
          kind="seo"
          buttonLabel="Generate SEO copy"
          staticFields={{ shopName: shop.name }}
          fields={[
            { name: "keyword", label: "Target keyword", placeholder: "e.g. bespoke tailor near me" },
            { name: "city", label: "City / area", placeholder: "Dubai" },
          ]}
        />
      </section>
    </div>
  );
}
