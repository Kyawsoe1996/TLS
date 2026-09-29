# tls-api

Backend API for the TLS mobile app (bespoke tailor shops).

- **Runtime:** Cloudflare Workers + [Hono](https://hono.dev) (TypeScript, `wrangler`)
- **Auth:** Clerk session tokens (`Authorization: Bearer <token>`), verified with `@clerk/backend`
- **Database:** Turso (libSQL) via `@libsql/client/web`
- **AI:** Google Gemini REST API (`GEMINI_MODEL`, default `gemini-3.1-flash-lite`) using the 4-pipeline prompt in `../shared/ai-engine-prompt.md`
- **Rate limiting:** Upstash Redis + `@upstash/ratelimit`, sliding window of 30 AI requests per user per day
- **Contract:** every request/response shape lives in [`../shared/types.ts`](../shared/types.ts); the API imports those types so it can't drift from the app.

## Layout

```
api/
  wrangler.toml            worker config (name, compat flags, non-secret vars)
  .dev.vars.example        every secret the worker needs (copy to .dev.vars for local dev)
  migrations/0001_init.sql database schema
  scripts/migrate.mjs      `npm run db:migrate`
  src/
    index.ts               Hono app: CORS, auth, routing, error -> ApiError mapping
    env.ts                 Bindings / context variable types
    auth.ts                requireAuth (Clerk) + requireShop middleware
    db.ts                  Turso client, row -> API mappers, common lookups
    validate.ts            zod body parsing -> 400 bad_request
    ratelimit.ts           Upstash sliding-window limiter for /ai/*
    errors.ts              ApiHttpError + helpers (401/404/400/429/502/500)
    ai/prompt.ts           the Gemini system prompt (copy of ../shared/ai-engine-prompt.md)
    ai/gemini.ts           REST call, JSON parsing, zod validation, 1 retry, 25s timeout
    ai/schemas.ts          zod output schemas for the 4 pipelines
    routes/                shop, home, clients, fittings, ai, account, public
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

### 6. Local development

```bash
cp .dev.vars.example .dev.vars   # fill in the values above
npm run dev                      # wrangler dev -> http://localhost:8787
npm run typecheck                # tsc --noEmit
```

### 7. Deploy

Set each secret once on the deployed worker, then deploy:

```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_PUBLISHABLE_KEY
wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put GEMINI_API_KEY
npm run deploy
```

Before release, replace the `[COMPANY NAME]`, `[SUPPORT EMAIL]`, `[DATE]` and `[RESPONSE TIME]` placeholders in `src/routes/public.ts`.

## Endpoints

All routes except `GET /health`, `GET /privacy`, `GET /support` require `Authorization: Bearer <Clerk session token>`. Errors are always `{ "error": { "code", "message" } }` with codes `unauthorized` (401), `not_found` (404), `bad_request` (400), `rate_limited` (429), `ai_failed` (502), `server_error` (500). Request/response types are in `../shared/types.ts`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | - | `{ ok: true }` |
| GET | `/privacy` | - | HTML privacy policy |
| GET | `/support` | - | HTML support page |
| GET | `/shop` | - | `{ shop }` or 404 if not onboarded |
| PUT | `/shop` | `UpsertShopRequest` | `{ shop }` (creates on first call, updates after) |
| GET | `/home` | - | `HomeResponse` (`clientsCount`, `fittingsThisMonth`, `inactiveCount`) |
| GET | `/clients?search=&inactive=true` | - | `{ clients }` (name search, optional inactive-only filter) |
| POST | `/clients` | `CreateClientRequest` | 201 `{ client }` |
| GET | `/clients/:id` | - | `{ client }` |
| PATCH | `/clients/:id` | `UpdateClientRequest` (`null` clears a field) | `{ client }` |
| DELETE | `/clients/:id` | - | 204 (also deletes the client's fittings) |
| GET | `/clients/:id/fittings` | - | `{ fittings }` newest first |
| POST | `/clients/:id/fittings` | `CreateFittingRequest` | 201 `{ fitting }`; sets `client.lastOrderAt = now` |
| POST | `/ai/fit` | `{ fittingId }` | `{ fitting }` with `analysis` filled (pipeline 1, saved on the fitting) |
| POST | `/ai/seo` | `AiSeoRequest` | `AiSeoResponse` (pipeline 2, saved as generation `seo`) |
| POST | `/ai/post` | `AiPostRequest` | `AiPostResponse` (pipeline 3, saved as generation `post`) |
| POST | `/ai/winback` | `AiWinbackRequest` | `AiWinbackResponse` (pipeline 4, saved as generation `winback`) |
| DELETE | `/account` | - | 204; deletes fittings, clients, generations, shop and the Clerk user |

Notes:

- `/home`, `/clients*` and `/ai/*` return 404 `not_found` ("Set up your shop first.") until `PUT /shop` has been called.
- A client is `inactive` when `coalesce(lastOrderAt, createdAt)` is 90+ days ago. `fittingsThisMonth` counts fittings created in the current calendar month (UTC).
- `/ai/*` routes are limited to 30 requests per user per rolling day (429 `rate_limited`); the limit is checked after validation so bad requests don't consume quota. Responses carry `X-RateLimit-*` headers.
- Gemini output is validated against a zod schema per pipeline; on failure the call is retried once, then 502 `ai_failed`. Each call times out after 25s.
