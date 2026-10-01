# Changelog

All notable changes to TLS, newest first. Written in plain language so anyone on the team can follow.

## Unreleased

### Added
- **Order tracking** in the mobile app. Each client can have orders (a garment, fabric, due date,
  notes, optionally linked to a fitting) that move through *Measured → Cutting → Fitting → Ready →
  Delivered*. Orders show in the client's file, a fitting can be turned into an order in one tap, and
  a shop-wide **Orders** screen groups open orders by Overdue / Due this week / Later / No due date.
  Home now shows **Orders in progress** and **Due this week**, and its AI suggestion points to orders
  due soon. Deleting a client or the account also deletes its orders. (New `orders` table; API routes
  `/clients/:id/orders` and `/orders`.)
- Expo account created and the mobile app linked to the EAS project `@shamubtrs-team/tls`
  (project ID in `mobile/app/app.json`), so store builds can run in the cloud with `eas build`.

### Changed
- The mobile app is now named **Magick TLS** (store listing: "Magick TLS – Tailor Growth"). Updated the
  name under the icon, the sign-in and settings screens, the privacy and support pages, and the store
  docs. The technical app ID and the repository name are unchanged.
- Mobile Local SEO now looks up real tailor shops near the district on Google Maps (through Gemini,
  which works on the free tier) and bases its keyword ideas on them. The shops are listed under the
  results with their rating, review count and a link to Google Maps. If the lookup is unavailable,
  the screen says the ideas were written without live Google data.
- Local SEO keywords are labelled as AI suggestions, and the AI is told not to quote search volumes
  or rankings it cannot know. (API changes take effect on the live API after the next deploy.)

### Planned before the first App Store / Play Store submission
(see `mobile/docs/release-checklist.md`):

- Remove the preview-only social-posting controls from the mobile app (the platform switches, the
  "Shared to N apps" screen and the "coming soon" buttons); keep "Post now" via the phone's share sheet.
- Reviewer login for Apple's app review (Clerk test mode or a reviewer-only fallback).
- Fill in company name, support email and dates on the API's privacy and support pages; confirm the
  app ID `com.generalmagickindustries.tls`.
- Switch the mobile API to Clerk production keys and add Upstash rate limiting for the AI routes.
- Store listing: screenshots, icon polish, TestFlight check on a real iPhone.

## v0.1-mvp — 2026-09-30

First complete milestone: the web app, a working mobile app with its own backend, and the pitch material.

### Web app (`web/`)
- AI marketing content, SEO copy, analytics charts, AI business insights, win-back emails,
  cross-shop benchmarking and monthly reports (CSV / print-to-PDF).
- Login and per-shop data with Supabase; runs on demo data until Supabase is connected.
- Moved from the repository root into `web/` so the two apps sit side by side.

### Mobile app (`mobile/app/`) — new
- Expo / React Native app for iPhone and Android, in the navy-and-gold TLS design.
- Sign in and sign up by email code (Clerk); onboarding with shop name, district, city and tone.
- Home: clients, fittings this month, clients inactive 90+ days, and an AI suggestion for the day.
- Clients: search and inactive filter, add / edit / delete, client file with fitting history.
- Manual fitting: style, fabric, six measurements typed in, posture note; "Analyse with AI" returns
  cutter notes, a saved fit profile and a follow-up message to the client (copy / share).
- Win-back: choose an incentive and get an AI-written email (copy / share / open in Mail).
- Content Studio: tone, audience and topic → AI blog post, social caption and call to action;
  "Post now" opens the phone's share sheet. Direct posting to social apps is shown as a preview only.
- Local SEO: district, competitors and current Google position → AI target-market summary and
  keyword cards with a post idea each; "Write a post" opens Content Studio pre-filled.
- Settings: edit shop, privacy and support pages, sign out, delete account.
- Android APK built locally for testing (`~/Desktop/TLS-1.0.0.apk`).

### Mobile API (`mobile/api/`) — new
- Cloudflare Worker (Hono) with Clerk login checks, a Turso database and Google Gemini for the
  four AI pipelines: measurements, local SEO map, content post, retention campaign.
- Rate limiting via Upstash (optional; skipped when not configured).
- Privacy and support pages served by the API for the store listings.
- Deployed at https://tls-api.shamubtr.workers.dev.

### Design and pitch
- Clickable mobile design canvas (13 screens, including smart-tape pairing and Smart Referral).
- 25-slide product walkthrough deck and a 12-slide investor pitch deck.
- Store listing text, privacy policy, release checklist and placeholder app icons in `mobile/docs/`.

### Developer tooling
- Claude Code commands: `/start-mobile`, `/stop-mobile`, `/stop-ios`, `/stop-android`.

### Not in this version (by design)
- Bluetooth smart tape (measurements are typed in), posture photos, real posting to Facebook /
  Instagram / TikTok / LINE, Smart Referral, monthly reports on mobile, staff accounts, payments.
