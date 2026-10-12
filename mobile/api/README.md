# tls-api

Backend API for the TLS mobile app (bespoke tailor shops).

- **Runtime:** Cloudflare Workers + [Hono](https://hono.dev) (TypeScript, `wrangler`)
- **Auth:** Clerk session tokens (`Authorization: Bearer <token>`), verified with `@clerk/backend`
- **Database:** Turso (libSQL) via `@libsql/client/web`
- **AI:** Google Gemini REST API (`GEMINI_MODEL`, default `gemini-3.1-flash-lite`) using the 4-pipeline prompt in `../shared/ai-engine-prompt.md`
- **Rate limiting:** Upstash Redis + `@upstash/ratelimit`, sliding windows of 30 AI requests and 60 emails per user per day
- **Email:** [Resend](https://resend.com) REST API (`RESEND_API_KEY`, optional - without it emails are logged as `simulated`)
- **Media:** the company's Amazon S3 bucket (signed requests via aws4fetch, `S3_*` settings) for the photo / video attached to a post, served back at `GET /media/<key>`
- **Contract:** every request/response shape lives in [`../shared/types.ts`](../shared/types.ts); the API imports those types so it can't drift from the app.

## Layout

```
api/
  wrangler.toml            worker config (name, compat flags, non-secret vars incl. S3 bucket / region / prefix)
  .dev.vars.example        every secret the worker needs (copy to .dev.vars for local dev)
  migrations/*.sql         database schema (0001 shops/clients/fittings/generations, 0002 orders, 0003 messages,
                           0004 shop details + fitting garment types/measurements + order prices, 0005 posts)
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
    ai/schemas.ts          zod output schemas for the 4 pipelines
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

The sender defaults to `<shop name> via Magick TLS <onboarding@resend.dev>`. Resend's shared `onboarding@resend.dev` address only delivers to the email on your own Resend account (fine for demos). To send to real clients, verify your domain in Resend and set `RESEND_FROM` to either a bare address (`hello@yourdomain.com`, shown as `<shop name> via Magick TLS <hello@yourdomain.com>`) or a full sender (`Shop <hello@yourdomain.com>`, used as is). `GET /shop` returns the effective sender as `email.from`.

**Footer and Reply-To.** Every email goes out with a footer built from the shop's details (`PUT /shop`: `address`, `phone`, `openingHours`, `replyToEmail`, all optional). After a blank line: `— <shop name>`, then the address (if set), then `<phone> · <opening hours>` (whichever are set), then `Reply to this email to reach the shop.` only when `replyToEmail` is set - in which case it is also sent to Resend as `reply_to`, so client replies land in the shop's inbox instead of the sender address. The HTML version carries the same footer as a muted paragraph. The footer is presentation only: `messages.body` stores the text exactly as the app sent it. `buildEmailFooter(shop)` in `src/email.ts` is pure and can be unit-tested.

### 7. Media storage (Amazon S3)

Post photos / videos are stored in the company's Amazon S3 bucket, reached with signed HTTPS requests through [aws4fetch](https://github.com/mhart/aws4fetch) (`src/media.ts`; no AWS SDK). Settings: `S3_BUCKET`, `S3_REGION` and `S3_PREFIX` (the folder inside the bucket, `magicktls/prod` in `wrangler.toml` `[vars]`, `magicktls/dev` in `.dev.vars`) plus the secrets `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. The IAM user needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` and `s3:ListBucket` on the bucket; nothing in the bucket needs to be public. `S3_ENDPOINT` (path-style, e.g. `https://s3.example.com`) switches to S3-compatible storage such as MinIO.

Leave any of the four required values unset and the worker still deploys with media switched off: `PUT /posts/:id/media` answers 400 "Photo and video uploads are switched off in this version", `GET /media/<key>` answers 404, duplicates are made without media, and the best-effort media deletes are no-ops (hide the UI with `postMedia: false` in `mobile/app/constants/features.ts` in that case).

Objects are stored as `<S3_PREFIX>/<shopId>/<postId>/<random uuid>.<ext>` with their `Content-Type` and `x-amz-meta-shopid` / `x-amz-meta-postid`. The API serves them itself at `GET /media/<key>` (`<key>` without the prefix) - unguessable, so the route needs no token and the app can hand the URL straight to an `<Image>` / video player. Local development uses the real bucket under the dev prefix, so `.dev.vars` needs the S3 values too.

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

All routes except `GET /health`, `GET /privacy`, `GET /support` and `GET /media/<key>` require `Authorization: Bearer <Clerk session token>`. Errors are always `{ "error": { "code", "message" } }` with codes `unauthorized` (401), `not_found` (404), `bad_request` (400, also used for 413 on oversized uploads), `rate_limited` (429), `ai_failed` (502), `server_error` (500). Request/response types are in `../shared/types.ts`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | - | `{ ok: true }` |
| GET | `/privacy` | - | HTML privacy policy |
| GET | `/support` | - | HTML support page |
| GET | `/shop` | - | `{ shop, email }` or 404 if not onboarded (`email: EmailStatus` = whether sending is configured + the sender) |
| PUT | `/shop` | `UpsertShopRequest` (`address`, `phone`, `openingHours`, `replyToEmail` optional: omit = unchanged, `""` = clear) | `{ shop, email }` (creates on first call, updates after) |
| GET | `/home` | - | `HomeResponse` (`clientsCount`, `fittingsThisMonth`, `inactiveCount`, `ordersOpen`, `ordersDueSoon`, `ordersOverdue`) |
| GET | `/clients?search=&inactive=true` | - | `{ clients }` (name search, optional inactive-only filter) |
| POST | `/clients` | `CreateClientRequest` | 201 `{ client }` |
| GET | `/clients/:id` | - | `{ client }` |
| PATCH | `/clients/:id` | `UpdateClientRequest` (`null` clears a field) | `{ client }` |
| DELETE | `/clients/:id` | - | 204 (also deletes the client's messages, orders and fittings) |
| GET | `/clients/:id/fittings` | - | `{ fittings }` newest first |
| POST | `/clients/:id/fittings` | `CreateFittingRequest` (`garmentType` default `jacket`; `measurements` may be partial) | 201 `{ fitting }`; sets `client.lastOrderAt = now` |
| GET | `/clients/:id/orders` | - | `{ orders }` newest first |
| POST | `/clients/:id/orders` | `CreateOrderRequest` (optional `price`, `deposit` in THB) | 201 `{ order }` with status `measured`; sets `client.lastOrderAt = now` |
| GET | `/clients/:id/orders/:orderId` | - | `{ order }` |
| PATCH | `/clients/:id/orders/:orderId` | `UpdateOrderRequest` (`null` clears a field / unlinks `fittingId`) | `{ order }` |
| DELETE | `/clients/:id/orders/:orderId` | - | 204 |
| GET | `/orders?open=true\|false&status=<OrderStatus>` | - | `{ orders }` shop-wide, each with `clientName` |
| GET | `/clients/:id/messages` | - | `{ messages }` newest first |
| POST | `/clients/:id/messages` | `SendMessageRequest` (`kind`, `subject`, `body`, optional `orderId`) | 201 `{ message }` with status `sent`, `simulated` or `failed` |
| POST | `/ai/fit` | `{ fittingId }` | `{ fitting }` with `analysis` filled (pipeline 1, saved on the fitting); 400 when the garment's required measurements are missing |
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
| DELETE | `/account` | - | 204; deletes the shop's media files, posts, messages, orders, fittings, clients, generations, shop and the Clerk user |

Notes:

- `/home`, `/clients*`, `/orders*`, `/posts*` and `/ai/*` return 404 `not_found` ("Set up your shop first.") until `PUT /shop` has been called.
- Posts (`posts` table): `title`, `body`, `caption`, `callToAction` plus the brief they came from (`topic`, `tone`, `audience`); all required text (limits 200 / 20,000 / 2,000 / 1,000 / 200 characters). `status` is `draft` until `POST /posts/:id/shared` sets it to `shared` and stamps `sharedAt` (sharing itself happens on the phone via the OS share sheet). `POST /ai/post` always inserts a draft from what it generated, so the Content Studio result is never lost. `GET /posts?q=` is a case-insensitive `LIKE` on title or topic with wildcards escaped, like the client search.
- Post media: `PUT /posts/:id/media` takes the raw file as the body. `Content-Type` must be `image/jpeg`, `image/png`, `image/webp`, `video/mp4` or `video/quicktime` (else 400 "Use a JPEG, PNG or WebP photo, or an MP4/MOV video."). Limits are in `MEDIA_LIMITS` (`../shared/types.ts`): photos 10 MB, videos 60 MB and 60 seconds. Size is checked twice - `Content-Length` up front (413, code `bad_request`, "Photos up to 10 MB, videos up to 60 MB.") and again while streaming into S3, so a chunked upload or a wrong header can't get around it (the object is not stored). Duration can only be checked from `X-Media-Duration` (the API doesn't decode the video); over 60 s is a 400. The file is stored under a fresh key `<shopId>/<postId>/<uuid>.<ext>` with its `Content-Type`, the previous file (if any) is deleted, and the `media_*` columns are updated. `media.url` is built from `PUBLIC_URL` (`https://api.magicktls.generalmagickindustries.com` in `wrangler.toml`; `http://localhost:8787` in `.dev.vars`, or `http://10.0.2.2:8787` for the Android emulator - needed because `wrangler dev` rewrites request URLs and the Host header to the custom domain), falling back to the request's own origin when unset. `DELETE /posts/:id/media` clears the columns and deletes the object (no-op when there was none). Duplicating a post copies the object server-side (`x-amz-copy-source`). Deleting a post, and deleting the account (ListObjectsV2 under `<shopId>/` + one DELETE per key), also removes the files, best effort.
- `GET /media/<key>` fetches the object from S3 and streams it back with its `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Accept-Ranges: bytes` and a one-year immutable `Cache-Control` (a replaced file always gets a new key). `Range` and `If-None-Match` are forwarded to S3, so a single-range request gets 206 + `Content-Range` (video players need this to scrub), an out-of-bounds one 416, and an unchanged ETag 304. Unknown keys and keys containing `..` are 404; a 403 from S3 (bad keys / IAM policy, or a missing object when `s3:ListBucket` isn't granted) is logged and served as 404.
- A client is `inactive` when `coalesce(lastOrderAt, createdAt)` is 90+ days ago. `fittingsThisMonth` counts fittings created in the current calendar month (UTC).
- Shop details: `address`, `phone`, `openingHours` and `replyToEmail` (`shops.address`, `phone`, `opening_hours`, `reply_to_email`) are `null` until set. `replyToEmail` must be a valid email address when non-empty. They feed the email footer / Reply-To (see Setup 6).
- Fittings: `garmentType` (`jacket` | `trousers` | `shirt` | `suit`, column `fittings.garment_type`, default `jacket` so older rows read as jackets) says which measurement set applies. `measurements` always comes back with all 14 keys (`chest`, `waist`, `overArm`, `shoulder`, `sleeve`, `jacketLength`, `hip`, `inseam`, `outseam`, `thigh`, `hem`, `neck`, `cuff`, `shirtLength`; columns are the snake_case names), `null` when not taken; the request may send any subset.
- Orders: `fittingId` must be a fitting of the same client (404 if unknown, 400 `bad_request` if it belongs to another client). `PATCH` with `status: "delivered"` stamps `deliveredAt` (and `client.lastOrderAt`); moving to any other status clears it. `overdue` is computed: `dueAt` before the start of today (UTC) and status not `delivered`. `ordersOpen` counts orders with status != `delivered`; `ordersDueSoon` counts open orders due before today + 7 days (so overdue ones are included); `ordersOverdue` counts open orders due before today.
- Order prices: `price` and `deposit` (THB, 0 to 10,000,000, columns `orders.price` / `deposit` as REAL) are optional; `PATCH` accepts `null` to clear either. `balance` is computed, never stored: `max(price - deposit, 0)` when `price` is set (a missing deposit counts as 0), otherwise `null`.
- `GET /orders` defaults to open orders sorted overdue first, then by `dueAt` ascending, then undated (newest first). `open=false` or `status=delivered` lists delivered orders, most recently delivered first; any other `status=` filters to that status.
- Messages: `POST /clients/:id/messages` sends an email to the client's `email` right away and logs it. 400 `bad_request` ("Add an email address to this client's file first.") when the client has no email; `orderId` must be an order of the same client (404 if unknown, 400 if it belongs to another client). With `RESEND_API_KEY` set the row is `sent` (or `failed` with `error` = Resend's message when the provider rejects it - still 201, so the app can show it); without a key it is `simulated`. Sending does not change the client's `lastOrderAt`. Limited to 60 per user per rolling day (429 `rate_limited`) when Upstash is configured.
- `/ai/*` routes are limited to 30 requests per user per rolling day (429 `rate_limited`); the limit is checked after validation so bad requests don't consume quota. Responses carry `X-RateLimit-*` headers.
- `/ai/fit` needs `chest` + `waist` for `jacket`, `suit` and `shirt` fittings and `waist` + `hip` for `trousers`; otherwise 400 `bad_request` naming the missing measurements (checked before the rate limit). The pipeline-1 payload's `iot_data` keeps the prompt's `chest`, `waist`, `over_arm`, `posture_radar` and adds `garment_type` plus every other measurement that was taken, under its snake_case name (`hip`, `inseam`, `outseam`, `thigh`, `hem`, `neck`, `cuff`, `shirt_length`, `shoulder`, `sleeve`, `jacket_length`).
- Gemini output is validated against a zod schema per pipeline; on failure the call is retried once, then 502 `ai_failed`. Each call times out after 25s.
- `/ai/seo` makes two Gemini calls. The first (`ai/maps.ts`) uses Gemini's Google Maps grounding to find tailor shops near the district; its summary is passed to pipeline 2 as `nearby_competitors` and the shops are returned as `places`. If that lookup fails or returns no Maps sources, pipeline 2 runs without it and `places` is `null`. The Maps findings and places are not stored in `generations`. Google's terms require showing each place with its Maps link and the text "Google Maps", only to the user who asked.
