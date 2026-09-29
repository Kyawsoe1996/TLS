# Lovable Build Prompts (paste in order)

Paste these into Lovable one at a time, in order. Each is a single, batched prompt to
keep within the free credit budget (**5 build credits/day, 30/month** — they don't roll
over). If you run low mid-build, push the Lovable repo to GitHub and continue in
**Bolt.new** (1M free tokens/month).

> Reminder: free Lovable projects are **public**. Never paste the `GEMINI_API_KEY` here —
> it goes only in Lovable Cloud → Settings → Secrets.

---

## Prompt 1 — App shell + auth

```
Build a SaaS dashboard web app for tailor shops called "TLS". Use Lovable Cloud auth
(email login + signup). After login, show a dashboard with a left sidebar nav and these
4 tabs: "AI Marketing", "SEO", "Analytics", "AI Insights", plus a small "Shop Profile"
section at the top showing shop name and services. Use shadcn/ui + Tailwind, a clean
modern look with a refined tailor/fashion feel (deep navy + warm gold accent, generous
whitespace, rounded cards). Make it responsive for mobile.
```

## Prompt 2 — Seeded data + Analytics tab

```
Add Postgres tables and seed them with fictional demo data:
- monthly_metrics(month, revenue, orders, new_customers, returning_customers) — 10 months
- campaign_performance(campaign, channel, spend, reach, clicks, conversions) — 5 rows
- services(name, price, unit) — 5 rows
Use the values from my seed/seed.sql file. On the Analytics tab, use Recharts to show:
(1) a revenue line chart by month, (2) a grouped bar chart of new vs returning customers
by month, (3) a bar chart of conversions by campaign. Add 4 KPI stat cards on top
(total revenue, total orders, new customers, best campaign).
```

## Prompt 3 — Gemini edge function

```
Add a Supabase Edge Function named "gemini" that reads GEMINI_API_KEY from secrets and
calls the Google Gemini API using the @google/genai SDK with model
"gemini-3.1-flash-lite". It accepts a JSON body { kind, fields } where kind is one of
"marketing", "seo", or "insights", builds the prompt server-side per kind, and returns
{ text }. Include CORS handling. Use my supabase/functions/gemini/index.ts as the exact
reference implementation.
```

Then: **Lovable Cloud → Settings → Secrets → add `GEMINI_API_KEY`** (your AI Studio key).

## Prompt 4 — AI Marketing tab

```
On the AI Marketing tab, add a form with fields: Occasion/season (text), Tone (dropdown:
festive, warm, professional, playful, luxury), Featured service (dropdown from the
services table). A "Generate" button calls the "gemini" edge function with
{ kind: "marketing", fields: { occasion, tone, service, shopName } } and renders the
returned markdown in a results card with a copy-to-clipboard button. Show a loading
spinner while generating.
```

## Prompt 5 — AI Insights + SEO

```
On the AI Insights tab, add a "Generate insights" button that sends the monthly_metrics
and campaign_performance data to the "gemini" edge function with kind "insights" and
renders the returned markdown recommendations.

On the SEO tab, render mock keyword-ranking cards from my seed/mock-seo.json (keyword,
current rank, change vs previous, monthly searches, difficulty) plus a small summary row.
Add a "Generate SEO blog intro" button with a keyword input that calls the "gemini" edge
function with kind "seo" and renders the result.
```

## Prompt 6 — Publish

Click **Publish** in Lovable to get the live `*.lovable.app` URL. Connect GitHub for a
backup of the code.

---

### If quality of AI output needs a nudge
The prompt templates are server-side in `supabase/functions/gemini/index.ts` — edit the
`buildPrompt()` sections there to tune tone/length/format without touching the frontend.
