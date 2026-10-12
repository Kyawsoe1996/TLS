# Changelog

All notable changes to TLS, newest first. Written in plain language so anyone on the team can follow.

## Unreleased

### Changed
- **Contact email is now `account@globalmagicko.com`** on the served privacy and support pages and in
  `docs/privacy-policy.md` (it replaces the `support@generalmagickindustries.com` address, which was never
  created). Changed 2026-10-12.
- **Permission before the first AI feature.** The app now asks once, before the first AI request, whether
  it may send the details involved (a client's first name and measurements for a fitting, the client's
  name and last order for a win-back email, the shop's name, tone and topic for a post) to Google
  Gemini, and explains what is sent. Tapping Continue records the agreement on the shop
  (`POST /shop/ai-consent`, new `ai_consent_at` column, migration 0006); "Not now" sends nothing. The
  API refuses every `/ai/*` call with 403 `consent_required` until the shop has agreed, so no client
  detail reaches Google unasked. Onboarding mentions the prompt, the sign-up screen links to the
  privacy policy, and the served privacy page says the app asks first and that database backups are
  purged within 30 days. (App Store guideline 5.1.2(i), from the submission review.)
- **Truthful AI prompts.** The Gemini instructions no longer describe an "IoT smart measuring tape",
  "posture radar" or "3D fit dimensions in the shop's IoT cloud"; measurements are taken by hand, and
  the win-back email now says the client's measurements are kept on file. Generated emails sent on a
  tailor's behalf no longer claim technology the shop doesn't have.
- **New app icon: the Atelier crest.** The placeholder gold-ring "TLS" monogram is replaced by the
  "J · Atelier crest" chosen from the MagickTLS Logo design canvas: a stitched M under three sparkles
  inside a round frame, with a measuring-tape banner reading MAGICKTLS, in the app's navy, gold and
  ivory. `mobile/docs/brand/make-icons.mjs` now draws it and renders the iOS icon, Android adaptive
  foreground, splash mark and favicon in `mobile/app/assets/`. One icon set is used by every build
  (simulator, preview and production).
- **Local SEO fully hidden for v1 (it comes back in a later release).** The feature switches moved to
  `mobile/shared/features.ts` so the app and the API read the same ones. While `localSeo` is off the
  screen redirects to the Grow hub if someone deep-links to it, `POST /ai/seo` answers 404, the
  onboarding message no longer mentions SEO and the support page's daily-limit answer no longer lists
  the SEO map. The served privacy page now also mentions the API's technical logs, and the markdown
  policy says where each kind of data is stored (Turso in Tokyo, S3 in Thailand, Upstash in Singapore).
  The store listing mentions the photo / video attachment. The preview EAS profile builds an iOS
  simulator app (v1 ships to the App Store only; Android is deferred); the stale `docs/app-config.md`
  is gone because `app.json` and `eas.json` are the real thing.
- **Post photos and videos are back, stored on Amazon S3.** The content library's photo / video
  attachment is switched on again (`postMedia: true`), and the API now keeps the files in the company's
  Amazon S3 bucket instead of a Cloudflare R2 bucket (which the Cloudflare account can't enable).
  Uploads, the `GET /media/<key>` links, duplicates and deletes behave as before; the bucket stays
  private and the API serves the files itself. The `expo-image-picker` plugin and its photo-library
  prompt are back in `app.json`, and the privacy pages name Amazon Web Services as the storage
  provider. The worker needs the `S3_*` settings (see `mobile/api/.dev.vars.example`); without them
  media stays switched off. Media links are now built from a `PUBLIC_URL` setting instead of the
  request URL, because `wrangler dev` rewrites local requests to the production domain (local photos
  were pointing at the live API and never loaded).
- **Store-readiness fixes from the submission review.** The served privacy and support pages and
  `docs/privacy-policy.md` now describe everything the app stores (shop details, orders with prices,
  the copies of emails sent to clients, posts) and name Resend as the email provider; the last
  placeholder (company address) is gone. The store listing no longer advertises Local SEO (hidden in
  1.0) or says win-back emails are sent "from your own mail app"; it describes orders, the content
  library and in-app email instead. In the app, the empty "Photo or video" header no longer shows on
  post screens while media is off, the post-delete confirmation only mentions a photo when there is
  one, the "next step" sentence on the post screen is gone, and the delete-account confirmation
  lists orders, emails and posts. The `expo-image-picker` plugin and its photo-library prompt are
  out of `app.json` for 1.0 (Android storage/media permissions blocked); `constants/features.ts`
  says how to put them back with the feature.

### Added
- **Content library.** Everything written in Content Studio is now saved as a post. A new **Posts**
  screen under Grow lists them (search, Drafts / Shared), and each post can be opened, edited,
  duplicated, deleted and shared again. A **photo or short video** (up to 60 seconds) can be attached
  from the camera roll; it is stored by the API and shared together with the caption. The
  preview-only social-media switches, Schedule button and "Shared to N apps" screen were removed;
  **Share** opens the phone's share sheet and marks the post as shared. Posting straight to social
  apps is a later step. (New `posts` table, migration 0005; photo/video storage on Cloudflare R2,
  bucket `tls-media`; the app asks for photo-library access only when attaching media.)
- **Email to clients, sent from the app.** Win-back emails, "your order is ready" notices (when an
  order reaches Ready) and the AI fitting follow-up can now be edited and sent with one tap, after a
  confirmation. Every email is logged in a new **Messages** section on the client's file with a
  status: Sent, Simulated (email sending not set up yet) or Failed. Settings shows whether email
  sending is connected. Emails go through Resend; until a domain is verified they use the test sender
  and only reach the account owner's own address.
- **Shop details.** Settings → Shop details: address, phone, opening hours and a reply-to email. They
  appear in the footer of every email, replies go to the reply-to address, and the order-ready email
  uses the real opening hours.
- **Order price & deposit.** Price, deposit paid and balance due on each order (for the shop's records
  only), with quick 30% / 50% / paid-in-full chips, a "Record payment" action, and the balance shown
  in order lists.
- **Garment-specific measurements.** A fitting now has a garment type (Jacket, Trousers, Shirt, Full
  suit) and shows the right measurement fields for it. The AI analysis uses whatever was measured.
- **Overdue orders** get a red badge on the Clients tab and an Overdue row on Home.
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
- The API now runs under the company Cloudflare account as worker `magicktls` at
  `api.magicktls.generalmagickindustries.com`, and sign-in (Clerk app "Magick TLS") and the database
  (Turso `magicktls-prod` for the deployed worker and `magicktls-dev` for local development, both Tokyo) were re-created under company logins with fresh data. The old personal
  worker, Clerk app and database are no longer used.
- **Photo / video attachments are hidden for this release.** Storing them needs a Cloudflare R2
  bucket, which the company account can't enable until a payment method is added. The code stays:
  `postMedia: false` in `mobile/app/constants/features.ts` hides the media block, and the API deploys
  without the bucket (uploads answer 400, media links 404). To bring it back: enable R2, create the
  `tls-media` bucket, uncomment `[[r2_buckets]]` in `mobile/api/wrangler.toml`, deploy, flip the flag.
- Release details decided on 2026-10-07: the app ID is now `com.generalmagickindustries.magicktls`
  (iOS bundle id and Android package); the privacy and support pages name General Magick Industries
  Pte Ltd, `support@generalmagickindustries.com` and a 2-business-day reply time; the API gets the
  custom domain `api.magicktls.generalmagickindustries.com` (live after the next `wrangler deploy`),
  which the store listing uses for the privacy and support URLs.
- The **Orders** screen now opens with the same three rows as Home (Orders in progress / Overdue /
  Due this week), and here they filter the list: tap **Overdue** or **Due this week** to show only
  those orders (the row highlights, a "Showing … · Clear" bar appears, and the Overdue row names the
  clients concerned); tap it again, Clear, or **Orders in progress** to see everything. While
  filtered on Overdue, a suggestion card gives the next step for the oldest late order. Home no longer
  repeats these three rows; it keeps Clients, Fittings this month and Inactive 90+ days, and the AI
  suggestion still points to orders due this week.
- **Local SEO is hidden for this release** (`mobile/app/constants/features.ts`, `localSeo: false`).
  The screens and API stay in the code; the tile is gone from Home and Grow, and Home's quick tiles
  are now Smart Fitting · Orders · Content Studio · Win-back.
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
- Done 2026-10-12: the privacy and support pages now name `account@globalmagicko.com` (an existing mailbox)
  instead of a new `support@` alias, and fill the company address in `mobile/docs/privacy-policy.md`.
- Switch the mobile API to Clerk production keys. (Upstash rate limiting for the AI and email routes is
  now on: database `magicktls`, Singapore region, secrets set locally and on the worker on 2026-10-12.)
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
