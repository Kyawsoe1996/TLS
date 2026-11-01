# tls-api

Backend API for the TLS mobile app (bespoke tailor shops).

- **Runtime:** Cloudflare Workers + [Hono](https://hono.dev) (TypeScript, `wrangler`)
- **Auth:** Clerk session tokens (`Authorization: Bearer <token>`), verified with `@clerk/backend`
- **Database:** Turso (libSQL) via `@libsql/client/web`
- **AI:** Google Gemini REST API (`GEMINI_MODEL`, default `gemini-3.1-flash-lite`) using the 4-pipeline prompt in `../shared/ai-engine-prompt.md`
- **Rate limiting:** Upstash Redis + `@upstash/ratelimit`, sliding windows of 30 AI requests and 60 emails per user per day
- **Email:** [Resend](https://resend.com) REST API (`RESEND_API_KEY`, optional - without it emails are logged as `simulated`)
- **Media:** the company's Amazon S3 bucket (signed requests via aws4fetch, `S3_*` settings) for the photo / video attached to a post and the progress photos attached to orders, served back at `GET /media/<key>`
- **Contract:** every request/response shape lives in [`../shared/types.ts`](../shared/types.ts); the API imports those types so it can't drift from the app.

## Layout

```
api/
  wrangler.toml            worker config (name, compat flags, non-secret vars incl. S3 bucket / region / prefix)
  .dev.vars.example        every secret the worker needs (copy to .dev.vars for local dev)
  migrations/*.sql         database schema (0001 shops/clients/fittings/generations, 0002 orders, 0003 messages,
                           0004 shop details + fitting garment types/measurements + order prices, 0005 posts,
                           0006 AI consent, 0007 appointments, 0008 order photos + Google review link + review requests,
                           0009 fabric stock, 0010 order payments, 0011 Smart Referral,
                           0012 free shop website, 0013 portfolio website)
  scripts/migrate.mjs      `npm run db:migrate`
  src/
    index.ts               Hono app: CORS, auth, routing, error -> ApiError mapping
    env.ts                 Bindings / context variable types
    auth.ts                requireAuth (Clerk) + requireShop middleware
    db.ts                  Turso client, row -> API mappers, common lookups
    validate.ts            zod body parsing -> 400 bad_request
    ratelimit.ts           Upstash sliding-window limiters for /ai/* and POST .../messages
    errors.ts              ApiHttpError + helpers (401/404/400/413/429/502/500)
    email.ts               Resend sender (sendEmail, emailStatus, buildEmailFooter), 20s timeout
    media.ts               S3 store (put/get/head/delete/copy/list via aws4fetch), object keys, size-limited streaming upload, prefix delete, media URLs
    ai/prompt.ts           the Gemini system prompt (copy of ../shared/ai-engine-prompt.md)
    ai/gemini.ts           REST call, JSON parsing, zod validation, 1 retry, 25s timeout
    ai/schemas.ts          zod output schemas for the 4 pipelines + the measurement parser
    ai/measurements.ts     POST /ai/parse-measurements: dictated transcript -> measurements (own prompt, temperature 0)
    routes/                shop, home, clients, fittings, orders, messages, posts, media, ai, account, public
```

## Setup

### 1. Install

```bash
cd mobile/api
npm install
```

### 2. Turso database

```bash
turso db create tls-api
turso db show tls-api --url          # -> TURSO_DATABASE_URL
turso db tokens create tls-api       # -> TURSO_AUTH_TOKEN
```

Run the migrations (reads `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` from the environment, or from `.dev.vars`):

```bash
npm run db:migrate
```

`scripts/migrate.mjs` applies every `migrations/*.sql` in filename order and records each one in a `_migrations` table, so re-running is safe. Alternatively, with the Turso CLI: `turso db shell tls-api < migrations/0001_init.sql`.

### 3. Clerk

Create an application at <https://dashboard.clerk.com>. From **API keys** copy the **Secret key** (`CLERK_SECRET_KEY`) and **Publishable key** (`CLERK_PUBLISHABLE_KEY`, used by the mobile app; kept here for reference). The mobile app sends `await getToken()` from Clerk as the bearer token.

### 4. Upstash Redis (AI rate limits)

Create a Redis database at <https://console.upstash.com>, copy the **REST URL** and **REST token** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). If these are missing the worker logs a warning and skips rate limiting (handy for local dev).

### 5. Gemini

Create an API key at <https://aistudio.google.com/apikey> (`GEMINI_API_KEY`). Optionally override the model with `GEMINI_MODEL` (default `gemini-3.1-flash-lite`, set in `wrangler.toml` `[vars]`).

### 6. Email sending (Resend) - optional

Create an API key at <https://resend.com/api-keys> (`RESEND_API_KEY`). Without it the worker still accepts `POST /clients/:id/messages` but logs each message with status `simulated` instead of sending, and `GET /shop` reports `email.configured: false` so the app can say so.

The sender defaults to `<shop name> via Magick Tailor <onboarding@resend.dev>`. Resend's shared `onboarding@resend.dev` address only delivers to the email on your own Resend account (fine for demos). To send to real clients, verify your domain in Resend and set `RESEND_FROM` to either a bare address (`hello@yourdomain.com`, shown as `<shop name> via Magick Tailor <hello@yourdomain.com>`) or a full sender (`Shop <hello@yourdomain.com>`, used as is). `GET /shop` returns the effective sender as `email.from`.

**Footer and Reply-To.** Every email goes out with a footer built from the shop's details (`PUT /shop`: `address`, `phone`, `openingHours`, `replyToEmail`, all optional). After a blank line: `— <shop name>`, then the address (if set), then `<phone> · <opening hours>` (whichever are set), then `Reply to this email to reach the shop.` only when `replyToEmail` is set - in which case it is also sent to Resend as `reply_to`, so client replies land in the shop's inbox instead of the sender address. The HTML version carries the same footer as a muted paragraph. The footer is presentation only: `messages.body` stores the text exactly as the app sent it. `buildEmailFooter(shop)` in `src/email.ts` is pure and can be unit-tested.

### 7. Media storage (Amazon S3)

Post photos / videos and order progress photos are stored in the company's Amazon S3 bucket, reached with signed HTTPS requests through [aws4fetch](https://github.com/mhart/aws4fetch) (`src/media.ts`; no AWS SDK). Settings: `S3_BUCKET`, `S3_REGION` and `S3_PREFIX` (the folder inside the bucket, `magicktls/prod` in `wrangler.toml` `[vars]`, `magicktls/dev` in `.dev.vars`) plus the secrets `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. The IAM user needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` and `s3:ListBucket` on the bucket; nothing in the bucket needs to be public. `S3_ENDPOINT` (path-style, e.g. `https://s3.example.com`) switches to S3-compatible storage such as MinIO.

Leave any of the four required values unset and the worker still deploys with media switched off: `PUT /posts/:id/media` and `PUT /clients/:id/orders/:orderId/photos` answer 400 "Photo and video uploads are switched off in this version", `GET /media/<key>` answers 404, duplicates are made without media, and the best-effort media deletes are no-ops (hide the UI with `postMedia: false` in `mobile/app/constants/features.ts` in that case).

Objects are stored as `<S3_PREFIX>/<shopId>/<postId>/<random uuid>.<ext>` with their `Content-Type` and `x-amz-meta-shopid` / `x-amz-meta-postid`; order photos as `<S3_PREFIX>/<shopId>/orders/<orderId>/<random uuid>.<ext>` with `x-amz-meta-orderid` (the `orders/` segment can't collide with a post id, and everything for a shop still sits under `<shopId>/`). The API serves them itself at `GET /media/<key>` (`<key>` without the prefix) - unguessable, so the route needs no token and the app can hand the URL straight to an `<Image>` / video player. Local development uses the real bucket under the dev prefix, so `.dev.vars` needs the S3 values too.

### 8. Local development

```bash
cp .dev.vars.example .dev.vars   # fill in the values above
npm run dev                      # wrangler dev -> http://localhost:8787
npm run typecheck                # tsc --noEmit
```

### 9. Deploy

Set each secret once on the deployed worker, fill in `S3_BUCKET` / `S3_REGION` in `wrangler.toml` (see 7), then deploy:

```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_PUBLISHABLE_KEY
wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put GEMINI_API_KEY
wrangler secret put RESEND_API_KEY     # optional, see 6
wrangler secret put RESEND_FROM        # optional
wrangler secret put S3_ACCESS_KEY_ID   # post media, see 7
wrangler secret put S3_SECRET_ACCESS_KEY
npm run deploy
```

Before release, replace the `[COMPANY NAME]`, `[SUPPORT EMAIL]`, `[DATE]` and `[RESPONSE TIME]` placeholders in `src/routes/public.ts`.

## Endpoints

All routes except `GET /health`, `GET /privacy`, `GET /support` and `GET /media/<key>` require `Authorization: Bearer <Clerk session token>`. Errors are always `{ "error": { "code", "message" } }` with codes `unauthorized` (401), `not_found` (404), `bad_request` (400, also used for 413 on oversized uploads), `consent_required` (403, `/ai/*` before `POST /shop/ai-consent`), `rate_limited` (429), `ai_failed` (502), `server_error` (500). Request/response types are in `../shared/types.ts`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | - | `{ ok: true }` |
| GET | `/privacy` | - | HTML privacy policy |
| GET | `/support` | - | HTML support page |
| GET | `/shop` | - | `{ shop, email }` or 404 if not onboarded (`email: EmailStatus` = whether sending is configured + the sender) |
| PUT | `/shop` | `UpsertShopRequest` (`address`, `phone`, `openingHours`, `replyToEmail`, `googleReviewUrl` optional: omit = unchanged, `""` = clear) | `{ shop, email }` (creates on first call, updates after) |
| POST | `/shop/ai-consent` | - | `{ shop, email }`; records `shop.aiConsentAt` (the owner agreed to send client details to Gemini); idempotent |
| GET | `/home` | - | `HomeResponse` (`clientsCount`, `fittingsThisMonth`, `inactiveCount`, `ordersOpen`, `ordersDueSoon`, `ordersOverdue`) |
| GET | `/clients?search=&inactive=true` | - | `{ clients }` (name search, optional inactive-only filter) |
| POST | `/clients` | `CreateClientRequest` | 201 `{ client }` |
| GET | `/clients/:id` | - | `{ client }` |
| PATCH | `/clients/:id` | `UpdateClientRequest` (`null` clears a field) | `{ client }` |
| DELETE | `/clients/:id` | - | 204 (also deletes the client's appointments, messages, orders with their photos, and fittings) |
| GET | `/clients/:id/fittings` | - | `{ fittings }` newest first |
| POST | `/clients/:id/fittings` | `CreateFittingRequest` (`garmentType` default `jacket`; `measurements` may be partial) | 201 `{ fitting }`; sets `client.lastOrderAt = now` |
| GET | `/clients/:id/orders` | - | `{ orders }` newest first, each with its `photos` |
| POST | `/clients/:id/orders` | `CreateOrderRequest` (optional `price`, `deposit` in THB) | 201 `{ order }` with status `measured` and `photos: []`; sets `client.lastOrderAt = now` |
| GET | `/clients/:id/orders/:orderId` | - | `{ order }` with `photos` oldest first |
| PATCH | `/clients/:id/orders/:orderId` | `UpdateOrderRequest` (`null` clears a field / unlinks `fittingId`) | `{ order }` |
| DELETE | `/clients/:id/orders/:orderId` | - | 204 (also deletes its photos) |
| PUT | `/clients/:id/orders/:orderId/photos` | raw image body; headers `Content-Type` (`image/jpeg`, `image/png`, `image/webp`), optional `X-Media-Width`, `X-Media-Height`, `X-Photo-Stage` (an `OrderStatus`, default the order's current status) | 201 `{ order }` with the new photo appended to `photos`; 413 over 10 MB, 400 at 6 photos |
| DELETE | `/clients/:id/orders/:orderId/photos/:photoId` | - | `{ order }` without that photo (its file is deleted too) |
| GET | `/orders?open=true\|false&status=<OrderStatus>` | - | `{ orders }` shop-wide, each with `clientName` and `photos: []` |
| GET | `/clients/:id/messages` | - | `{ messages }` newest first |
| POST | `/clients/:id/messages` | `SendMessageRequest` (`kind`, `subject`, `body`, optional `orderId` / `appointmentId`; `orderId` required for `review_request`) | 201 `{ message }` with status `sent`, `simulated` or `failed` |
| POST | `/ai/fit` | `{ fittingId }` | `{ fitting }` with `analysis` filled (pipeline 1, saved on the fitting); 400 when the garment's required measurements are missing |
| POST | `/ai/parse-measurements` | `AiParseMeasurementsRequest` (`transcript` 1–2000 chars, `garmentType`, optional `language` `en`\|`th`) | `AiParseMeasurementsResponse` (`measurements` for that garment's keys only, `postureNote`, `unrecognised`); nothing is stored |
| POST | `/ai/seo` | `AiSeoRequest` | `AiSeoResponse` (Google Maps lookup, then pipeline 2; saved as generation `seo`) |
| POST | `/ai/post` | `AiPostRequest` | `AiPostResponse` (pipeline 3, saved as generation `post` **and** as a draft post, returned as `post`) |
| POST | `/ai/winback` | `AiWinbackRequest` | `AiWinbackResponse` (pipeline 4, saved as generation `winback`) |
| GET | `/posts?status=draft\|shared&q=` | - | `{ posts }` newest first (`q` searches title and topic) |
| POST | `/posts` | `CreatePostRequest` | 201 `{ post }` with status `draft` |
| GET | `/posts/:id` | - | `{ post }` |
| PATCH | `/posts/:id` | `UpdatePostRequest` (any subset of the text fields) | `{ post }` |
| DELETE | `/posts/:id` | - | 204 (also deletes its media file) |
| POST | `/posts/:id/duplicate` | - | 201 `{ post }`: draft copy, title + ` (copy)`, media copied when possible |
| POST | `/posts/:id/shared` | - | `{ post }` with status `shared`, `sharedAt = now` |
| PUT | `/posts/:id/media` | raw file body; headers `Content-Type`, optional `X-Media-Width`, `X-Media-Height`, `X-Media-Duration` | `{ post }` with `media` set (replaces any previous file) |
| DELETE | `/posts/:id/media` | - | `{ post }` with `media: null` |
| GET | `/media/<key>` | - | the file (no auth; supports `Range` and `If-None-Match`; `Cache-Control: public, max-age=31536000, immutable`) |
| DELETE | `/account` | - | 204; deletes the shop's media files, posts, appointments, messages, order photos, orders, fittings, clients, generations, shop and the Clerk user |

Notes:

- `/home`, `/clients*`, `/orders*`, `/posts*` and `/ai/*` return 404 `not_found` ("Set up your shop first.") until `PUT /shop` has been called.
- Posts (`posts` table): `title`, `body`, `caption`, `callToAction` plus the brief they came from (`topic`, `tone`, `audience`); all required text (limits 200 / 20,000 / 2,000 / 1,000 / 200 characters). `status` is `draft` until `POST /posts/:id/shared` sets it to `shared` and stamps `sharedAt` (sharing itself happens on the phone via the OS share sheet). `POST /ai/post` always inserts a draft from what it generated, so the Content Studio result is never lost. `GET /posts?q=` is a case-insensitive `LIKE` on title or topic with wildcards escaped, like the client search.
- Post media: `PUT /posts/:id/media` takes the raw file as the body. `Content-Type` must be `image/jpeg`, `image/png`, `image/webp`, `video/mp4` or `video/quicktime` (else 400 "Use a JPEG, PNG or WebP photo, or an MP4/MOV video."). Limits are in `MEDIA_LIMITS` (`../shared/types.ts`): photos 10 MB, videos 60 MB and 60 seconds. Size is checked twice - `Content-Length` up front (413, code `bad_request`, "Photos up to 10 MB, videos up to 60 MB.") and again while streaming into S3, so a chunked upload or a wrong header can't get around it (the object is not stored). Duration can only be checked from `X-Media-Duration` (the API doesn't decode the video); over 60 s is a 400. The file is stored under a fresh key `<shopId>/<postId>/<uuid>.<ext>` with its `Content-Type`, the previous file (if any) is deleted, and the `media_*` columns are updated. `media.url` is built from `PUBLIC_URL` (`https://api.magicktls.generalmagickindustries.com` in `wrangler.toml`; `http://localhost:8787` in `.dev.vars`, or `http://10.0.2.2:8787` for the Android emulator - needed because `wrangler dev` rewrites request URLs and the Host header to the custom domain), falling back to the request's own origin when unset. `DELETE /posts/:id/media` clears the columns and deletes the object (no-op when there was none). Duplicating a post copies the object server-side (`x-amz-copy-source`). Deleting a post, and deleting the account (ListObjectsV2 under `<shopId>/` + one DELETE per key), also removes the files, best effort.
- `GET /media/<key>` fetches the object from S3 and streams it back with its `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Accept-Ranges: bytes` and a one-year immutable `Cache-Control` (a replaced file always gets a new key). `Range` and `If-None-Match` are forwarded to S3, so a single-range request gets 206 + `Content-Range` (video players need this to scrub), an out-of-bounds one 416, and an unchanged ETag 304. Unknown keys and keys containing `..` are 404; a 403 from S3 (bad keys / IAM policy, or a missing object when `s3:ListBucket` isn't granted) is logged and served as 404.
- A client is `inactive` when `coalesce(lastOrderAt, createdAt)` is 90+ days ago. `fittingsThisMonth` counts fittings created in the current calendar month (UTC).
- Shop details: `address`, `phone`, `openingHours`, `replyToEmail` and `googleReviewUrl` (`shops.address`, `phone`, `opening_hours`, `reply_to_email`, `google_review_url`) are `null` until set. `replyToEmail` must be a valid email address when non-empty; `googleReviewUrl` must be an `http://` or `https://` URL of at most 500 characters when non-empty (400 "googleReviewUrl: must be a web address starting with http:// or https://" otherwise). The first four feed the email footer / Reply-To (see Setup 6); the review link is for the review-request email (see below).
- Fittings: `garmentType` (`jacket` | `trousers` | `shirt` | `suit`, column `fittings.garment_type`, default `jacket` so older rows read as jackets) says which measurement set applies. `measurements` always comes back with all 14 keys (`chest`, `waist`, `overArm`, `shoulder`, `sleeve`, `jacketLength`, `hip`, `inseam`, `outseam`, `thigh`, `hem`, `neck`, `cuff`, `shirtLength`; columns are the snake_case names), `null` when not taken; the request may send any subset.
- Orders: `fittingId` must be a fitting of the same client (404 if unknown, 400 `bad_request` if it belongs to another client). `PATCH` with `status: "delivered"` stamps `deliveredAt` (and `client.lastOrderAt`); moving to any other status clears it. `overdue` is computed: `dueAt` before the start of today (UTC) and status not `delivered`. `ordersOpen` counts orders with status != `delivered`; `ordersDueSoon` counts open orders due before today + 7 days (so overdue ones are included); `ordersOverdue` counts open orders due before today. `reviewRequestedAt` (`orders.review_requested_at`) is set by a `review_request` message (see below) and `photos` by the photo routes (see below).
- Order prices: `price` and `deposit` (THB, 0 to 10,000,000, columns `orders.price` / `deposit` as REAL) are optional; `PATCH` accepts `null` to clear either. `balance` is computed, never stored: `max(price - deposit, 0)` when `price` is set (a missing deposit counts as 0), otherwise `null`.
- `GET /orders` defaults to open orders sorted overdue first, then by `dueAt` ascending, then undated (newest first). `open=false` or `status=delivered` lists delivered orders, most recently delivered first; any other `status=` filters to that status.
- Messages: `POST /clients/:id/messages` sends an email to the client's `email` right away and logs it. 400 `bad_request` ("Add an email address to this client's file first.") when the client has no email; `orderId` must be an order of the same client (404 if unknown, 400 if it belongs to another client). With `RESEND_API_KEY` set the row is `sent` (or `failed` with `error` = Resend's message when the provider rejects it - still 201, so the app can show it); without a key it is `simulated`. Sending does not change the client's `lastOrderAt`. Limited to 60 per user per rolling day (429 `rate_limited`) when Upstash is configured. `kind: "review_request"` needs `orderId` (400 "A review request must be linked to an order (orderId)." otherwise) and stamps that order's `reviewRequestedAt` once the row is `sent` or `simulated` (same rule as `appointmentId` / `reminderSentAt`); a `failed` send leaves it alone so the app can offer the card again.
- `/ai/*` routes answer 403 `consent_required` until the shop has `aiConsentAt` (`POST /shop/ai-consent`, migration 0006); the app shows the consent prompt before its first AI request. They are limited to 30 requests per user per rolling day (429 `rate_limited`, `/ai/parse-measurements` included); the limit is checked after validation so bad requests don't consume quota. Responses carry `X-RateLimit-*` headers.
- `/ai/fit` needs `chest` + `waist` for `jacket`, `suit` and `shirt` fittings and `waist` + `hip` for `trousers`; otherwise 400 `bad_request` naming the missing measurements (checked before the rate limit). The pipeline-1 payload's `iot_data` keeps the prompt's `chest`, `waist`, `over_arm`, `posture_radar` and adds `garment_type` plus every other measurement that was taken, under its snake_case name (`hip`, `inseam`, `outseam`, `thigh`, `hem`, `neck`, `cuff`, `shirt_length`, `shoulder`, `sleeve`, `jacket_length`).
- Gemini output is validated against a zod schema per pipeline; on failure the call is retried once, then 502 `ai_failed`. Each call times out after 25s.
- `/ai/seo` makes two Gemini calls. The first (`ai/maps.ts`) uses Gemini's Google Maps grounding to find tailor shops near the district; its summary is passed to pipeline 2 as `nearby_competitors` and the shops are returned as `places`. If that lookup fails or returns no Maps sources, pipeline 2 runs without it and `places` is `null`. The Maps findings and places are not stored in `generations`. Google's terms require showing each place with its Maps link and the text "Google Maps", only to the user who asked.

## Order photos, review requests and dictated measurements

**Order photos** (`order_photos` table, migration 0008). `PUT /clients/:id/orders/:orderId/photos` takes the raw image as the body, like post media: `Content-Type` must be `image/jpeg`, `image/png` or `image/webp` (else 400 "Use a JPEG, PNG or WebP photo."), `X-Media-Width` / `X-Media-Height` are optional pixel sizes, and `X-Photo-Stage` is the `OrderStatus` the photo documents (400 "X-Photo-Stage must be one of: measured, cutting, fitting, ready, delivered." when it isn't one; omitted = the order's current status). Limits are `ORDER_PHOTO_LIMITS` in `../shared/types.ts`: 10 MB per photo, checked on `Content-Length` and again while streaming into S3 (413, code `bad_request`, "Photos up to 10 MB."), and 6 photos per order (400 "An order can have up to 6 photos. Remove one to add another." - checked before anything is uploaded). The object goes to `<shopId>/orders/<orderId>/<uuid>.<ext>`, the row is inserted, the order's `updatedAt` is bumped and the whole order comes back (201) with `photos` oldest first, each with `id`, `stage`, `url` (built from `PUBLIC_URL` like post media), `contentType`, `width`, `height`, `sizeBytes`, `createdAt`. `DELETE .../photos/:photoId` removes the row (404 "Photo not found." when it isn't on that order), deletes the object best effort and returns `{ order }`. Every single-order response (`GET` / `POST` / `PATCH` order and both photo routes) and the per-client list carry `photos` (the list fetches them in one extra query); the shop-wide `GET /orders` returns `photos: []` to stay a single query. Deleting an order, a client or the account removes the photo rows and their files (best effort; the account route's prefix delete covers them).

## Fabric stock, payments and reports, Smart Referral

**Fabric stock** (`fabrics` and `fabric_movements` tables, migration 0009; routes in `src/routes/fabrics.ts`). A fabric is a bolt on the shelf: name, supplier, colour, kind (`FABRIC_KINDS`), width, `metresLeft`, `lowAtMetres` (the `low` flag and Home's `fabricsLow` count use `metres_left < low_at_metres`), cost per metre, a swatch colour and notes. Every change of length is a movement: `received` (a delivery) and `correction` (a stock-take) through `POST /fabrics/:id/movements`, and `order` written by the API itself. An order can carry `fabricId` and `metresNeeded` (create or PATCH); the first time its status becomes `cutting`, `routes/orders.ts` takes `metresNeeded` off the bolt in one batch (fabric `metres_left` reduced, an `order` movement with the order id, `orders.metres_taken_at` stamped) and never repeats it. Deleting a fabric clears `fabric_id` / `metres_needed` on its orders (they keep the fabric name) and removes its movements; deleting an order keeps the movement and drops the link. `GARMENT_METRES` in `../shared/types.ts` (suit 3.3, jacket 2, trousers 1.3, shirt 2) is what the app suggests.

**Payments** (`order_payments`, migration 0010). The API records a payment whenever an order's `deposit` changes: the difference, as a signed whole-baht amount (`routes/orders.ts`: on create when a deposit is given, and on every PATCH that sends `deposit`). `orders.deposit` stays the running total the app shows; the rows exist so the monthly report can say how much money came in during a month. Deleting an order or a client removes its payments.

**Reports** (`GET /reports?month=YYYY-MM`, `src/routes/reports.ts`, no table). One month's figures from the existing data: new clients, fittings and orders created in the month, orders delivered (`delivered_at`), money collected (payments in the month), revenue delivered (price of the orders delivered), what is still owed on open orders and quiet clients today, the same for the previous month, the last six months for the bar chart, the garments made most and the clients to call. The app renders the PDF on the phone (`lib/reportHtml.ts`); the API only answers JSON.

**Smart Referral** (migration 0011; `src/routes/referrals.ts` for the signed-in side, `src/routes/referralPublic.ts` for the friend's page). `PUT /shop` stores the two offers (`referralFriendOffer`, `referralClientOffer`). `GET /clients/:id/referral` makes the client's code on first use (`FIRSTNAME-XXXX`, unique) and returns the link `<PUBLIC_URL>/r/<code>`, a ready-to-send message and the client's referral figures; `POST /clients/:id/referral/shared` counts a Share tap. The public page `GET /r/:code` (no auth, mounted before `requireAuth` in `index.ts`) shows the shop and the offer and takes a form; `POST /r/:code` saves a `referral_leads` row (`new`), rate limited per address and with an empty-field honeypot. `GET /referrals` is the overview; `POST /referrals/leads/:id/add` makes a client from the lead with `referredByClientId` set (also possible by hand through `POST`/`PATCH /clients` with `referredByClientId`, which must be another client of the shop) and inserts a `pending` reward for the (ambassador, friend) pair; the friend's first delivered order (`routes/orders.ts`) upserts that reward to `ready`; `POST /referrals/rewards/:id/given` closes it. Deleting a client removes its leads and rewards on both sides and clears `referred_by_client_id` on the clients it sent.

## Free shop website

**Free website** (migration 0012; `src/routes/website.ts` for the signed-in side, `src/routes/websitePublic.ts` for the public page). `shops` gains `website_slug` (UNIQUE), `website_enabled`, `website_about` and `website_line_id`; visitors' requests go to `website_enquiries`. `GET /website` makes the slug on first call from the shop name (lower-cased, runs of anything outside a-z0-9 to "-", trimmed, at most 40 characters, "shop" when nothing is left; padded to 3 characters and moved off reserved words; `-2`, `-3`… up to 20 tries on a UNIQUE clash) and returns the switch, the link `<PUBLIC_URL>/s/<slug>`, about / LINE ID, the enquiry counts and the shop details the page lacks (`missing`). `PUT /website` takes any of `enabled`, `slug` (`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, 400 for reserved words such as admin / api / www, 400 "That address is taken." on a clash), `about` (600) and `lineId` (60). The public `GET /s/:slug` (no auth, mounted before `requireAuth`; `Cache-Control: public, max-age=300`, indexable, with a meta description and Open Graph tags) answers a 404 page unless the website is on; it shows the shop, About (or a default sentence), opening hours, the address with a Google Maps link, Call / LINE buttons, "What we make" (distinct garments of delivered orders, top 6, else a generic list), up to 6 recent order photos, the 3 latest shared posts, the Google review link and a booking form. `POST /s/:slug` saves a `website_enquiries` row (`new`), rate limited to 10 per hour per address (bucket `website` in `src/ratelimit.ts`) and with the same empty-field honeypot as the referral page. `GET /website/enquiries` (new first, newest first, 100), `GET /website/enquiries/:id`, `POST /website/enquiries/:id/add` (201 `{ enquiry, client }`: contact filed as phone or LINE ID like referral leads, garment and message in the client's notes) and `POST /website/enquiries/:id/status` (`contacted` | `dismissed` | `new`; 400 once added). Home counts new enquiries (`websiteEnquiriesNew`). Deleting the account removes the enquiries; deleting a client unlinks the enquiry it came from (back to `contacted`).

**Portfolio website** (migration 0013; `src/routes/website.ts` settings, `src/routes/websiteContent.ts` content, `src/websiteData.ts` shared mappers / defaults, `src/routes/websitePublic.ts` pages). `shops` gains `website_theme` (`atelier` | `ivory` | `noir`, default atelier), `website_headline`, `website_about_heading`, `website_includes` (JSON array), `website_rating` (REAL 1-5), `website_cover_piece_id`, `website_tailor_photo_key` and `website_sections` (JSON `{fabrics, process, booking}`, missing = on). New tables `website_pieces` (title, category suits | jackets | trousers | shirts | wedding | other, cloth, style, line, made_at, order_id, sort), `website_piece_photos` (media_key, source order | post | upload, source_id, sort), `website_services` (name, from_price baht, line, sort) and `website_reviews` (quote, author, source default Google, sort). `GET`/`PUT /website` carry the new fields (`theme`, `headline`, `aboutHeading`, `includes`, `rating`, `coverPieceId` (must be one of the shop's pieces), `sections`; the response adds `coverUrl`, `tailorPhotoUrl`, `services`, `reviews`, `piecesCount`, `fabricsCount`). Content routes: `GET /website/portfolio` (pieces with photos, `coverPieceId`, `candidates.orders` = orders with photos (garment, fabric, month, photos, pieceId) and `candidates.posts` = posts with an image); `POST /website/pieces` (`{orderId}` copies the order's photo keys newest first plus garment / fabric / month, `{postId}` its photo and title, `{}` an empty piece for uploads; the same order or post again returns the existing piece with 200; max 40); `PATCH` / `DELETE /website/pieces/:id`; `POST /website/pieces/reorder {ids}`; `PUT /website/pieces/:id/photos` (raw image like order photos, 10 MB, max 8 per piece, key `<shop>/website/<pieceId>/<uuid>`) and `DELETE /website/pieces/:id/photos/:photoId`; `POST /website/services`, `/services/defaults` (Two-piece suit, Shirt, Alterations without prices when the list is empty), `/services/reorder`, `PATCH` / `DELETE /website/services/:id` (max 20); `POST /website/reviews`, `/reviews/reorder`, `PATCH` / `DELETE /website/reviews/:id` (max 12); `PUT` / `DELETE /website/tailor-photo`. The first piece with a photo becomes the cover when there is none (also after the cover is removed). Order and post photos are shared by key, so every file delete now goes through `unusedMediaKeys` (`db.ts`): a file is removed only when no order photo, post, piece photo or tailor photo still points at it; deleting an order or client keeps the pieces (their `order_id` is cleared). `POST /ai/website-piece-line {pieceId}` → `{line}` (own short prompt in `ai/prompt.ts`, title / garment group / cloth / style / brand tone only; behind AI consent and the AI rate limit; not saved). Public pages (no auth, `Cache-Control: public, max-age=300`, canonical link, Open Graph image = the cover's first photo, theme colours as CSS variables, every shop text escaped, images `loading="lazy"` except the cover): `GET /s/:slug` Home, `/s/:slug/work?c=<category>`, `/s/:slug/work/:pieceId` (404 page in the shop's frame for an unknown piece; the linked order's photos with their stage labels as "From cloth to collection"; "Time to make" from the order's created and delivered dates), `/s/:slug/services` (up to 4 fabric swatches with a hex colour and metres left), `/s/:slug/about` (`?piece=<title>` prefills the message). The booking form moved to About (`#book`); `POST /s/:slug/about` and the old `POST /s/:slug` both save the enquiry. With the booking section off, Book buttons call the shop (or open LINE).

**Review requests.** `PUT /shop` stores `googleReviewUrl`, the shop's Google "write a review" link (Google Business Profile → Get more reviews); the app shows a review card on delivered orders only while it is set. The app composes the thank-you email itself and sends it as `POST /clients/:id/messages` with `kind: "review_request"` and the order's `orderId`; the API sends it like any other message (same footer, Reply-To and 60/day limit) and stamps `orders.review_requested_at` when the row is `sent` or `simulated`, so `Order.reviewRequestedAt` tells the app it has been offered already.

**Dictated measurements.** `POST /ai/parse-measurements` is for the fitting form's voice entry: the phone's own speech recognition produces the transcript, the app parses what it can locally and sends the rest here. The request is `{ transcript, garmentType, language? }`; the response has `measurements` (cm, only keys the garment uses - jacket: chest, waist, overArm, shoulder, sleeve, jacketLength; trousers: waist, hip, inseam, outseam, thigh, hem; shirt: neck, chest, waist, shoulder, sleeve, cuff, shirtLength; suit: jacket + trousers), `postureNote` (one cleaned sentence or `null`) and `unrecognised` (phrases that looked like a measurement but couldn't be read, or named a key the garment doesn't use). `ai/measurements.ts` runs the same `runPipeline` helper with its own system prompt (`ACTION: "PARSE_DICTATED_MEASUREMENTS"`, temperature 0), which understands digits, English number words ("one-oh-two", "eighty-eight point five") and Thai numerals / number words, converts inches to cm, keeps the last value when one is repeated and skips anything outside 10–250 cm; the API then drops any key the model returned that isn't valid for the garment and any value outside that range, rounding to one decimal. Nothing is stored - no generation row, no transcript - and the call counts towards the 30/day AI limit like the other `/ai/*` routes.
