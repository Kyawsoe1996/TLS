# TLS — AI Growth Platform for Tailor Shops

An AI-powered platform that helps tailor shops grow: AI marketing content, SEO, analytics,
and AI business insights. Built to start **free** and scale **cheap**.

This repo holds two tracks:

| Track | What it is | Where |
|---|---|---|
| **Demo** | A clickable prototype for client pitches, built with the Lovable AI app builder | live at your `*.lovable.app` URL; runbook in `docs/` |
| **Product** | The real, owned codebase — **Next.js + Supabase + Gemini** | this folder (`app/`, `lib/`, `components/`) |

---

## Quick start (run the product locally)

```bash
npm install            # if peer-dep errors: npm install --legacy-peer-deps
cp .env.example .env.local   # then paste your real GEMINI_API_KEY
npm run dev            # → http://localhost:3000  (redirects to /dashboard/marketing)
```

You only need `GEMINI_API_KEY` to run the AI features today. Supabase keys are for the next
phase (auth + database). Get a free Gemini key: https://aistudio.google.com/apikey

> Sanity-check your key first (no app needed): `bash scripts/test-gemini.sh`
>
> If you ran `npm run build` and then `npm run dev` see a "Cannot find the middleware
> module" error, clear the stale cache: `rm -rf .next` and restart `npm run dev`.

## Connect Supabase (auth + database)

The app runs on **demo data** until you connect Supabase; then it gains real **login** and
**per-shop data**. ~10 min, free:

1. Create a project at https://supabase.com (free tier).
2. **Project Settings → API** → copy the **Project URL** and **anon public key** into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → **Run**.
   This creates the tables, Row-Level Security, and a trigger that **seeds a populated demo
   shop for every new signup**.
4. **Authentication → Providers → Email** → turn **off "Confirm email"** (so sign-up logs you
   straight in — best for demos).
5. Restart `npm run dev`, open `/login`, click **Sign up** → you land on a fully populated
   dashboard scoped to your account.

**Graceful degradation:** with no Supabase env, `/dashboard` is open and shows demo data;
once configured, middleware protects it and every query is scoped to the signed-in shop via RLS.

## Connect Google Search Console (real SEO rankings)

The SEO tab shows **sample** rankings until you connect Search Console; then each shop sees
**live keyword data** for their own verified site. All free. Requires Supabase connected first.

1. In **Google Cloud Console** → create/select a project → **APIs & Services → Library** →
   enable **"Google Search Console API"**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   Add an authorized redirect URI: `http://localhost:3000/api/seo/callback` (and your prod URL
   later). Copy the **Client ID** + **Client secret** into `.env.local`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/seo/callback
   ```
3. Run `supabase/migrations/0002_seo.sql` in the Supabase SQL editor (stores the connection).
4. The Google account you connect must have a **verified property** in Search Console
   (search.google.com/search-console).
5. Restart `npm run dev` → SEO tab → **Connect Google Search Console** → authorize → live
   rankings (last 28 days, top queries) appear. Until then, sample data shows automatically.

> The OAuth refresh token is stored per-shop under RLS. For production, encrypt it at rest.

## Customer engagement (email via Resend)

The Customers tab lists customers, flags those **inactive 90+ days**, and lets you AI-draft
and send a re-engagement email. Works on sample data; sending requires Supabase + Resend.

1. Run `supabase/migrations/0003_engagement.sql` (adds a `messages` log + seeds demo customers).
2. Free account at https://resend.com → **API Keys** → into `.env.local`:
   ```
   RESEND_API_KEY=re_...
   RESEND_FROM=TLS <onboarding@resend.dev>
   ```
   Without a verified domain, `onboarding@resend.dev` can send to your own account email.
3. Restart `npm run dev` → Customers → on an inactive customer click **Re-engage** →
   **Draft with AI** → **Send email**.

**Without Resend:** sends are **simulated** and still logged to `messages`, so the whole flow
is demoable before you set up email.

## Benchmarking + Reporting

The Benchmarking tab compares your shop to **anonymized cross-shop averages**; the Reports tab
gives a monthly summary with an AI narrative, exportable as CSV / print-to-PDF.

1. Run `supabase/migrations/0004_benchmarking.sql`. It adds two `SECURITY DEFINER` functions that
   read across all shops but return **only aggregates** (no shop ids), so individual data never
   leaks. The app hides live benchmarks until **≥ 3 shops** exist — with fewer it shows a
   synthetic "industry sample".
2. **Benchmarking** → comparison cards + a "you vs industry" index chart (industry avg = 100) +
   AI interpretation.
3. **Reports** → KPI summary + **Generate report summary** (AI) + **Download CSV** +
   **Print / Save as PDF**.

No new env vars.

## Project structure

```
app/
  layout.tsx                 # root layout
  page.tsx                   # redirects to the dashboard
  api/ai/route.ts            # ★ BACKEND: the AI endpoint (key stays server-side)
  dashboard/
    layout.tsx               # sidebar nav
    marketing/page.tsx       # AI marketing (real Gemini)
    seo/page.tsx             # mock rankings + AI SEO copy (real Gemini)
    analytics/page.tsx       # Recharts on demo data
    insights/page.tsx        # AI insights from the numbers (real Gemini)
lib/
  ai/gemini.ts               # ★ BACKEND: Gemini client + server-side prompt templates
  supabase/{client,server}.ts# Supabase clients (ready for the auth/DB phase)
  demo-data.ts               # seeded analytics data (replace with DB later)
components/ai-generator.tsx  # reusable form → calls /api/ai → renders result
seed/                        # seed.sql + mock-seo.json (demo data sources)
supabase/functions/gemini/   # the Lovable-track edge function (same templates)
docs/                        # build prompts + client demo script (Lovable track)
scripts/test-gemini.sh       # verify your Gemini key works
```

## How the AI backend works

The browser **never** sees your Gemini key. The flow is:

```
component (ai-generator.tsx)
  → POST /api/ai        { kind, fields }      (app/api/ai/route.ts, Node runtime)
    → generate()        reads GEMINI_API_KEY  (lib/ai/gemini.ts)
      → Gemini API      model gemini-3.1-flash-lite
  ← { text }            rendered back in the UI
```

To add a new AI feature: add a `case` in `buildPrompt()` (`lib/ai/gemini.ts`) and drop an
`<AiGenerator kind="..." />` on a page. That's it — one backend, many features.

## Free-tool stack & cost

| Concern | Tool | Free → paid |
|---|---|---|
| Frontend + backend | Next.js (App Router) | free |
| DB / Auth / Storage | Supabase | free → ~$25/mo |
| AI | Gemini `gemini-3.1-flash-lite` | free tier → pennies/1M tokens |
| Email / campaigns | Resend | 3k/mo → $20/mo |
| Hosting | Vercel (dev) / Cloudflare Pages (cheap prod) | free → $20/mo* |
| Cron / async | Supabase pg_cron + Edge Functions | free |

\* Vercel's free Hobby tier is **non-commercial** — use Vercel Pro or Cloudflare Pages for a
paid product. **$0 to develop; ~$45–65/mo at real, commercial usage.**

## Roadmap (next phases)

1. ~~**Auth + multi-tenant DB**~~ — ✓ done. Email/password auth + shops/services/customers/
   metrics tables with Row-Level Security; see "Connect Supabase" above.
2. **Real data** — replace `lib/demo-data.ts` with Supabase queries; connect Google Search
   Console (free) for real SEO rankings.
3. **Engagement** — Resend for email campaigns + re-engagement of inactive customers.
4. **Benchmarking + reporting** — cross-shop aggregated views (anonymized) and monthly
   PDF/CSV reports via a pg_cron job.

See `docs/CLIENT_DEMO_SCRIPT.md` for the pitch walkthrough and free-tier caveats
(EU/UK serving limits, no real client PII on the free AI tier).
