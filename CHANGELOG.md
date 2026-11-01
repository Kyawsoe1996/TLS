# Changelog

All notable changes to TLS, newest first. Written in plain language so anyone on the team can follow.

## Unreleased

### Added
- **The free website is now a portfolio site.** Instead of one page, a shop's website has five: Home (a big cover
  photo, a headline the owner writes, the services, four pieces of work, how it works, a review and how to find the
  shop), Work (every piece, filterable by suits, jackets, trousers and so on), a page for each piece (its photos,
  cloth, style, the month it was made, the workshop photos of its order from cloth to collection, and "Book one like
  this"), Services (what the shop makes with "from ฿…" prices, swatches of the cloth in the shop now and what every
  garment includes) and About (the shop's story with a tailor photo, the rating and reviews, the booking form and the
  opening hours). In the app, Your free website gets a Look picker (Atelier navy and gold, Ivory, Noir) and a list of
  sections to edit or switch off. Portfolio lets the owner pick the work clients see from order photos, posts or new
  uploads, set the cover, write a line about each piece (or let AI suggest one), and reorder or remove them. The
  owner lists services with prices and pastes in reviews. Client names never appear on the site. (Migration 0013:
  look, headline, about heading, includes, rating, cover, tailor photo and sections on the shop; `website_pieces`,
  `website_piece_photos`, `website_services`, `website_reviews`; routes `/website/portfolio`, `/website/pieces`,
  `/website/services`, `/website/reviews`, `/website/tailor-photo`, `POST /ai/website-piece-line`, public
  `/s/:slug/work`, `/s/:slug/work/:pieceId`, `/s/:slug/services`, `/s/:slug/about`.) Photos taken from an order or a
  post are shared with it, so deleting the order or post keeps a piece's photos, and taking a piece off the website
  never deletes the order's photos.
- **Fabric stock.** A Fabrics screen next to Orders (and a tile on Home) lists the cloth on the shelf in metres:
  name, mill, colour, kind, width, metres left, a "warn me below" level, cost per metre and a swatch colour.
  Each fabric shows what it is still enough for (jacket 2 m, trousers 1.3 m, suit 3.3 m, shirt 2 m), its
  history (bolts received, stock-take corrections, and every order that was cut from it) and the orders using
  it. A new order can pick a fabric "From stock" with the length it needs; the first time the order reaches
  Cutting the length comes off the bolt by itself. Home counts fabrics running low. (Tables `fabrics` and
  `fabric_movements`, `orders.fabric_id` / `metres_needed` / `metres_taken_at`; migration 0009; routes
  `/fabrics`.)
- **Monthly report.** Grow → Reports shows a month at a glance: new clients, fittings, orders delivered,
  money collected, still owed, quiet clients, the last six months of deliveries, the garments made most and
  the clients to call, with "Share as a PDF" built on the phone like the receipt. Money collected comes
  from a new `order_payments` table that the API fills whenever an order's deposit changes (migration 0010;
  route `GET /reports?month=`).
- **Smart Referral.** Grow → Smart Referral: the shop sets what a friend gets and what the client who sent
  them gets; every client file gains "Invite a friend", a personal link (`<API>/r/<CODE>`) with a ready-made
  message for LINE, WhatsApp or Mail. The friend opens a small web page served by the API, sees the offer and
  asks for a fitting; the shop sees them as a new friend, adds them as a client in one tap, and when their
  first order is delivered the sender's reward turns "ready" on both files until it is marked given. "Who
  sent you?" on New client covers friends who walk in without the link. (Migration 0011: offers on the shop,
  code / shares / referred-by on clients, `referral_leads`, `referral_rewards`; routes `/referrals`,
  `/clients/:id/referral`, public `/r/:code`.)
- **Free shop website.** Settings → Your free website: one switch gives a shop without a website its own page
  (`<API>/s/<name>`), built from what is already in the app: shop name and district, a short About text, opening
  hours, the address with a map link, Call and LINE buttons, the garments the shop delivers, recent order photos,
  the posts it shared and its Google reviews link. The screen shows the link with Copy / Share / Open, lets the
  owner change the address part, and ticks what the page shows with "Add …" hints for missing shop details.
  Visitors can ask for a fitting on the page; the request appears under Enquiries (and on Home as "Website
  enquiries · Reply today"), where the shop marks it contacted, dismisses it or adds the person as a client in
  one tap. The page is meant to be found on Google (description and preview tags, cached for five minutes); the
  form is rate limited and has a hidden bot trap. (Migration 0012: website columns on the shop,
  `website_enquiries`; routes `/website`, public `/s/:slug`.)
- **Native modules loaded on demand no longer red-screen a build that lacks them.** The PDF, speech and
  notification loaders (`lib/pdf.ts`, `lib/speech.ts`, `lib/notifications.ts`) now ask Expo whether the
  native module exists (`requireOptionalNativeModule`) before requiring the package. A `require` that
  fails at runtime is reported by Metro as a fatal error rather than thrown, so the earlier try/catch
  could not protect an older development build; the Reports screen crashed that way on the simulator.
- **Deposit receipt.** Once an order has a price and something paid, the Payment card offers "Share
  receipt": the phone builds a one-page A5 PDF (the shop's name, district, address, phone and reply-to
  email from Shop details; the client; the garment and fabric; price, paid to date and balance due or
  "Paid in full"; a reference made from the order id) and opens the share sheet, so it goes to the
  client by LINE, WhatsApp, Mail or Files. Right after "Record payment" the receipt also carries that
  payment as its own line ("Payment receipt"); otherwise it is a "Statement of payments". Everything
  happens on the phone (`expo-print` renders the HTML, `expo-sharing` opens the sheet,
  `expo-file-system` names the file `Receipt-<shop>-<date>.pdf`): no server, no cost, no new
  permission. The modules are native, so they load on demand (`lib/receipt.ts`) and the button is
  hidden in a build made before they were added; development builds and the next store build need a
  rebuild to show it. Node tests cover the receipt content.
- **`progress-deck` agent and `/weekly-update` command.** `.claude/agents/progress-deck.md` builds or
  refreshes the boss presentation as a Slides artifact in the house style (navy, ivory, gold;
  Cormorant Garamond and DM Sans) from the changelog, the git log for the period, the memory notes
  and fresh simulator screenshots, and `.claude/skills/weekly-update/SKILL.md` runs it with a period
  argument (`/weekly-update 21-27 Oct`, plus a deck link to update an earlier one). Same idea as the
  `app-store-reviewer` agent: one file that captures how the deck is made so later weeks are one
  command.
- **Measurement history.** A fitting now shows "Changes since last fitting" when the client has an
  earlier fitting of the same garment: each measurement before → after with the difference, and a
  "Fit note" written on the phone (no AI call) that names anything that moved 1 cm or more and what
  to re-check before cutting.
- **Progress photos on an order.** Up to six photos per order, each tagged with the stage it was taken
  at (API: `PUT /clients/:id/orders/:orderId/photos`, `DELETE …/photos/:photoId`, new `order_photos`
  table, same S3 storage as post media, keys under `<shop>/orders/<order>/`). Tap a photo for the
  full-screen viewer with Share (phone share sheet) and Delete. Deleting an order, a client or the
  account removes the files.
- **Google review request.** Settings → Shop details gains a "Google review link"; once an order is
  delivered, the order offers "Ask for a review": a thank-you email with the link, editable before
  sending, saved on the client's file as a "Review request" message. Sent once per order (new message
  kind `review_request`; the API stamps `orders.review_requested_at`). Migration 0008 (review link,
  review stamp, order photos).
- **Reminders on the phone.** Settings → Reminders: tomorrow's appointments (the evening before),
  **before each appointment on the day** (a chosen lead time, so same-day bookings are covered too),
  orders due this week (Monday morning), overdue orders (every morning) and ready-but-not-collected
  (off by default). The evening time, morning time and lead time are the owner's to set — a tap opens
  hour / minute wheels (a pure-JS picker, `components/ui/TimePickerSheet.tsx`), with quick-pick chips
  for the usual values. Scheduled locally with `expo-notifications` from the appointments and orders
  already in the app, re-planned whenever they change; nothing is sent to clients and no server is
  involved. The screen lists what is coming up on this phone and has "Send a test reminder" (shown at
  once) so the owner can see one without waiting. Needs the notification permission (declared in the
  release checklist).
- **Voice-dictated fitting.** On New fitting, "Dictate the measurements" opens a listening sheet that
  uses the phone's own speech recognition (`expo-speech-recognition`, English or Thai, audio never
  leaves the device). Default is the **guided** mode: the sheet names one field at a time (Chest …
  Waist …) and the tailor says only the number — "one oh two", "102", "หนึ่งร้อยสอง", "forty inches" —
  it ticks, moves to the next field, and finishes with "Any posture notes?"; several numbers in one
  breath fill the next fields, and "skip", "back", "done" (ข้าม / ย้อน / เสร็จ) work by voice. "Say
  everything at once" switches to free dictation, where the transcript is parsed on the phone
  (`lib/measurementParser.ts`, with node tests) and only an unreadable part is sent as text to Gemini
  (`POST /ai/parse-measurements`, behind the AI consent and the daily limit). Both end on a "We heard"
  card; "Fill the form" fills the fields (gold border) for the tailor to check before saving. Needs
  the microphone and speech-recognition permissions and a new build; the row is hidden in Expo Go.
- **Google / Facebook sign-in returns to `tls://sso-callback`** (new `app/sso-callback.tsx`, a spinner
  outside the auth guards) instead of the bare `tls://`, which made the router resolve "/" against the
  signed-out navigator and show a console error on every social sign-in in development builds. The
  production Clerk instance needs that URL in its mobile OAuth redirect allowlist (release checklist §3).
- **Appointments as a day view.** The diary now opens on a Mon–Sun strip (arrows move a week, a
  calendar button opens a month grid to jump to any date; dots mark busy days, today has a gold ring)
  with the chosen day's appointments on a timeline — time on the left, client, kind, the linked
  garment, "Reminded" when a reminder went out, done ones ticked and faded — plus "Free until …" /
  "Free after …" notes for the gaps. An empty day shows "A free day" with the rest of that week
  underneath. "New appointment on <day>" asks which client, then opens the schedule form with the
  day already filled in (`date` parameter on the form). Uses `GET /appointments?from&to&status=all`
  per week; no API change. Helpers in `components/clients/agenda.ts` with node tests.
- **Development builds.** `expo-dev-client` is in the app and `eas.json` has a `development-simulator`
  profile (a development client for the iOS Simulator), because the reminders and dictation modules
  are native and Expo Go can't run them; `expo start` now opens the development build when one is
  installed. Local `expo run:ios` needs an Apple signing certificate since the Sign in with Apple and
  notification entitlements were added, so simulator builds come from EAS.
- **Sign in with Apple, Google and Facebook.** Both auth screens now offer the three social logins above
  the email field; the emailed one-time code stays as the fallback. Apple uses the native iOS sheet
  (`expo-apple-authentication`, new config plugin, so it needs a new build), Google and Facebook use Clerk's
  browser flow and return to the app through the `tls://` scheme. Clerk links a social login to an existing
  email account when the verified email matches. Settings shows "Signed in with Google/Apple/Facebook". No
  API change. Before the production build the Clerk production instance needs real Google, Facebook and
  Apple credentials (see `mobile/docs/release-checklist.md` §3).

### Changed
- **New sign-in and create-account design.** Chosen from three directions on the design canvas
  ("Night atelier" layout on the ivory ground): the Atelier crest centred over a large serif title,
  Apple / Google / Facebook as white pills, an "or" divider, an underline email field with a gold
  label and a gold "Send me a code" button; links sit at the foot of the screen. The code step shows
  six digit boxes (the active one in gold; keyboard autofill and paste still work) under "Check your
  email", with resend / change-email links and a back button. New `components/auth/` pieces
  (`AuthScreen`, `AuthField`, `CodeInput`, `SwitchLine`, `PrivacyLine`); `Button` accepts a custom
  `iconNode`. Sign-in logic is unchanged.
- **The app is now called Magick Tailor** (was Magick TLS). Renamed the display name in `app.json`, the
  photo-library permission text, every in-app mention (welcome, sign-in, settings, AI consent), the email
  sender ("<shop> via Magick Tailor"), the hosted privacy and support pages, the store copy (store name is
  now just `Magick Tailor`; the subtitle carries the growth message) and the icon's banner, which now
  reads MAGICK TAILOR (icons regenerated with `docs/brand/make-icons.mjs`). Technical identifiers are
  unchanged on purpose: bundle id / package `com.generalmagickindustries.magicktls`, Expo slug `tls`,
  the `magicktls` worker, API domain and database names. The new name reaches phones with the next
  build, and the App Store Connect / Play Console app names must be changed by hand to match.

### Added
- **Appointments.** A tailor can schedule a fitting, collection or consultation with a client from the
  client's file (date, time, optional link to an order, private notes). Home shows "This week" with the
  next five scheduled appointments and a link to the full diary; the client file lists upcoming and past
  ones; an appointment can be marked done, cancelled, reopened, rescheduled, unlinked from its order or
  deleted; and a reminder email can be sent from it, saved to the client's file like every other email
  (new message kind `appointment_reminder`, which also stamps the appointment's `reminderSentAt`). A ready
  order offers "Schedule collection". New `appointments` table and `messages.appointment_id` column
  (migration 0007), new `/clients/:id/appointments` and `/appointments` routes, and `/home` now returns
  `appointmentsThisWeek` and `upcomingAppointments`. Times are stored in UTC and shown in the phone's time
  zone; "this week" runs from 12 hours ago to 7 days ahead so a slot earlier today stays listed until it is
  marked done. No push notifications or device-calendar integration in this version. Built 2026-10-14 on
  the development API only; before release: run migration 0007 on `magicktls-prod` ahead of the worker
  deploy, and add appointments to the store listing, privacy pages and release checklist.

### Changed
- **First TestFlight build.** Version 1.0.0 (2) was built with EAS and uploaded to App Store Connect on
  2026-10-14; it runs against the live API and is available to the internal TestFlight group.
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
