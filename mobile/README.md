# TLS mobile

The TLS mobile MVP: an Expo app for bespoke tailor shops, backed by a small Cloudflare Worker API. Everything for the mobile product lives in this folder; the Next.js web app in `web/` is separate and untouched by anything here.

## What's here

| Folder | What it is |
|---|---|
| `app/` | Expo SDK 54 app (Expo Router, TypeScript, TanStack Query, Clerk for sign-in). Screens are under `app/app/`, the UI kit under `app/components/`, design tokens in `app/constants/theme.ts`, the API client and hooks in `app/lib/`. |
| `api/` | Cloudflare Worker (Hono) that the app talks to. Turso (libSQL) for data, Clerk for token verification, Google Gemini for the four AI pipelines, Upstash Redis for the daily AI rate limit. Also serves the public `/privacy` and `/support` pages. See `api/README.md` for the endpoint table and deploy steps. |
| `shared/` | `types.ts` is the API contract: every request/response shape, imported by both `app/` (as `@shared/types`) and `api/`, so the two cannot drift. `ai-engine-prompt.md` is the Gemini system prompt (mirrored in `api/src/ai/prompt.ts`). |
| `docs/` | `release-checklist.md` (store submission, top to bottom), `store-listing.md` (App Store / Play copy), `privacy-policy.md` (source for `/privacy`), `app-config.md` (`app.json` / `eas.json` notes), `brand/` (icon sources and the script that renders them). |

## Local development

Prerequisites: Node 22, npm, a Clerk application (development instance, email-code sign-in enabled), a Turso database, and a Gemini API key. Upstash is optional locally: without it the API logs a warning and skips AI rate limiting.

1. **API secrets.** `cd api && npm install && cp .dev.vars.example .dev.vars`, then fill in `CLERK_SECRET_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `GEMINI_API_KEY` (`.dev.vars` is git-ignored).
2. **Database.** `npm run db:migrate` applies `api/migrations/*.sql` to the Turso database named in `.dev.vars`. Safe to re-run.
3. **Run the API.** `npm run dev` starts `wrangler dev` on `http://localhost:8787`. Check `curl localhost:8787/health` returns `{"ok":true}`.
4. **App env.** `cd ../app && npm install && cp .env.example .env`, then set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (the `pk_test_...` key from the same Clerk instance) and `EXPO_PUBLIC_API_URL` (`http://localhost:8787` for a simulator; your machine's LAN IP for a physical phone). `.env` is git-ignored.
5. **Run the app.** `npx expo start`, then press `i` / `a` or scan the QR code with Expo Go. Without the publishable key the app shows a "Missing configuration" screen instead of crashing.
6. **Sign up.** Tap *Create an account*, enter an email, type the 6-digit code from the email, then complete the shop setup screen (name, district, city, brand tone). You land on Home.

Before declaring a change done, run `npx tsc --noEmit && npx expo lint` in `app/` and `npm run typecheck` in `api/`.

## MVP feature list (v1)

- **Sign-in** by email + one-time code (Clerk), session kept in secure storage.
- **Shop setup** (onboarding) and editing from Settings: name, district, city, brand tone.
- **Home**: clients count, fittings this month, clients inactive 90+ days, shortcuts to each feature.
- **Clients**: list with name search and an "inactive 90+ days" filter; add, edit, delete (deleting removes the client's fittings); phone / email / LINE ID / notes / last-order date.
- **Fittings**: manual measurements in cm (chest, waist, over-arm, shoulder, sleeve, jacket length), style, fabric, posture note. Logging a fitting sets the client's last-order date.
- **AI fit analysis** (pipeline 1): pattern adjustments for the cutter, a fit profile, and a follow-up message, stored on the fitting.
- **Local SEO** (pipeline 2): target-market summary and keyword map for the shop's district, with a one-tap hand-off of any keyword into Content Studio.
- **Content Studio** (pipeline 3): blog post, social caption and call to action in the shop's tone; copy, or hand the caption to the phone's share sheet.
- **Win-back email** (pipeline 4): for a chosen client and incentive; copy, share, or open in Mail.
- **Settings**: privacy policy and support pages, sign out, and **Delete account** (erases the shop, all clients, fittings, AI outputs and the Clerk user).
- AI routes are rate limited to 30 requests per user per day; the app shows the server's message when the limit is hit.

## Intentionally not in v1

- Bluetooth / smart measuring tape (measurements are typed in; the UI says so).
- Real posting to Facebook, Instagram, TikTok or LINE. "Post now" opens the phone's share sheet; the platform toggles and the "Shared" screen are a UI preview.
- Photo or video upload, and post scheduling (both show a "coming soon" notice).
- Referrals, reports and analytics.
- Staff accounts or multiple users per shop (one Clerk user owns one shop).
- Payments, subscriptions or in-app purchases.

## Shipping to the stores

Follow `docs/release-checklist.md` from the top. It covers the accounts to create, deploying the API (`wrangler secret put` for each secret, then `npm run deploy`), the Clerk production instance, EAS environment variables, App Store Connect and Play Console forms, the reviewer demo account, and `eas build` / `eas submit`. Before a store build, replace the `[COMPANY NAME]`, `[SUPPORT EMAIL]`, `[DATE]` and `[RESPONSE TIME]` placeholders in `api/src/routes/public.ts` and the submit placeholders in `app/eas.json`.
