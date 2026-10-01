# Release checklist: TLS 1.0 to App Store and Google Play

Work top to bottom. The API must be live before the app is built, because the production build bakes the API URL in.

## 0. Pre-flight (do not build until every box is ticked)

- [ ] Bundle id / package in `app.json` is the real one, not `com.generalmagickindustries.tls` unless that has been confirmed (`docs/app-config.md`).
- [ ] `app.json` `version` is `1.0.0`; `extra.eas.projectId` is a real id (written by `eas init`).
- [ ] Icons in `app/assets/` are final, not the gold-ring placeholders from `docs/brand/make-icons.mjs` (or the placeholders have been signed off as the 1.0 icon).
- [ ] No `[BRACKET]` placeholders remain: `grep -rn '\[[A-Z][A-Z ]*\]' mobile/api/src mobile/docs/privacy-policy.md` returns nothing that ships. Check the `/privacy` and `/support` pages in a browser.
- [ ] No placeholder or lorem text in the app UI; every empty state has real copy.
- [ ] `eas.json` `submit.production` values are real; `google-service-account.json` exists locally and is git-ignored.
- [ ] Demo reviewer account exists in the **production** Clerk instance with a seeded shop (section 6).
- [ ] The production API returns 401 (not 500) for an unauthenticated request and 200 for `/privacy`.

## 1. Accounts to create

| Service | Cost | What you need from it | Where it goes |
|---|---|---|---|
| Apple Developer Program (developer.apple.com) | US$99 / year | Apple ID email, Team ID (Membership page) | `eas.json` → `submit.production.ios.appleId`, `appleTeamId` |
| Google Play Console (play.google.com/console) | US$25 once | Developer account; service-account JSON (section 7) | `./google-service-account.json` |
| Expo (expo.dev) | Free | Login for `eas login`; project id from `eas init` | `app.json` → `extra.eas.projectId` |
| Clerk (clerk.com) | Free tier | Production publishable key `pk_live_…`, secret key `sk_live_…`, JWT issuer / JWKS URL | App: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; API: `wrangler secret put` |
| Turso (turso.tech) | Free tier | Database URL `libsql://…`, auth token | API secrets |
| Upstash (upstash.com) | Free tier | Redis REST URL and token | API secrets |
| Cloudflare (dash.cloudflare.com) | Free tier (Workers) | Account for `wrangler login`; worker URL after deploy | App: `EXPO_PUBLIC_API_URL` |
| Google AI Studio (aistudio.google.com/apikey) | Free tier; enable billing for production | Gemini API key | API secrets |

Apple enrollment as a company requires a D-U-N-S number and can take days; as an individual it is usually same-day. Google Play identity verification also takes time. Start both first.

**Google Play policy for new personal developer accounts:** before you can publish to production you must run a closed test with at least 12 testers opted in for 14 continuous days, then apply for production access. Organisation accounts are exempt. Plan for this.

## 2. Deploy the API first

```bash
cd mobile/api
npx wrangler login
# secrets: these are the exact names the worker reads (see mobile/api/.dev.vars.example)
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put UPSTASH_REDIS_REST_URL    # optional: without it, AI rate limiting is skipped
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GEMINI_MODEL              # optional, defaults to gemini-3.1-flash-lite
npx wrangler deploy
```

- Note the URL it prints (`https://tls-api.<account>.workers.dev`, or your custom domain). That is `EXPO_PUBLIC_API_URL`.
- Fill in `docs/privacy-policy.md` and make sure the worker serves it at `/privacy` and a support page at `/support`. Both are required by the stores. Open them in a browser.
- Run the database migrations against the production Turso DB (whatever the API README says, e.g. `turso db shell tls < schema.sql`).
- Use a **billing-enabled** Gemini key in production. On the free tier Google may use prompts to improve its models, which is inconsistent with the privacy policy.
- Local SEO uses Gemini's **Google Maps grounding**. Before submitting, read the "Grounding with Google Maps" section of the Gemini API terms (ai.google.dev/gemini-api/terms): check the monthly usage allowance for your tier, and exclude the terms' prohibited territories from the store availability lists.

## 3. Clerk production instance

1. Dashboard → top-left instance switcher → **Create production instance** (clone from development). Production instances need a domain you own; add the DNS records Clerk lists (frontend API, accounts, email sending) and wait until they verify.
2. **User & authentication → Email, phone, username:** enable **Email address** with **Email verification code** as the sign-in method. Disable password, phone, username and passkeys.
3. **SSO connections:** disable Google/Apple/etc. unless the app implements them. (Apple requires "Sign in with Apple" only if you offer another third-party social login; email-code alone does not trigger that rule.)
4. Copy the production **publishable key** and **secret key**. Put the publishable key in the app env (section 4) and the secret key in the worker (section 2). Redeploy the worker.
5. **Settings → Test mode (production):** turn on if you want the fixed-code reviewer account (section 6). Confirm this option exists on your plan; if not, use a real mailbox you control and answer reviewer code requests promptly.

## 4. Expo / EAS setup

```bash
npm i -g eas-cli
eas login
cd mobile/app
eas init --force            # writes extra.eas.projectId (force overwrites the placeholder)
eas build:configure         # accept; keep the eas.json from docs/app-config.md if it asks to overwrite
```

Environment variables (baked into the JS bundle; not secret):

```bash
eas env:create --environment production --scope project --visibility plaintext \
  --name EXPO_PUBLIC_API_URL --value "https://tls-api.<account>.workers.dev"
eas env:create --environment production --scope project --visibility plaintext \
  --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_..."
# repeat with --environment preview / development and the test-instance values
eas env:list --environment production
```

Or put them in `eas.json` under each build profile's `env` (see `docs/app-config.md`). Either way the names must match what the app reads.

Sanity check before any store build:

```bash
npx expo-doctor
npx tsc --noEmit && npx expo lint
eas build -p android --profile preview      # APK: install on a real phone, sign in against production API
```

## 5. App Store Connect

1. **Certificates, Identifiers & Profiles:** nothing to do by hand; `eas build` registers the bundle id and manages the distribution certificate and provisioning profile (choose "Let EAS handle" when prompted, sign in with the Apple ID).
2. **My Apps → + → New App:** platform iOS, name `TLS – Tailor Growth`, primary language English, bundle id (select the one EAS registered), SKU `tls-ios`, full access.
3. **App Information:** category Business / Productivity; Content rights: does not contain third-party content; Age rating: answer No to everything → 4+. Privacy policy URL `https://<worker>/privacy`.
4. **Pricing and Availability:** Free, all territories (or Thailand + chosen countries).
5. **App Privacy** (nutrition labels). "Yes, we collect data." Then:
   - **Contact Info → Name, Email Address, Phone Number:** collected, **linked to the user**, used for **App Functionality**, **not used for tracking**.
   - **User Content → Other User Content** (measurements, notes, generated text): linked to the user, App Functionality, not for tracking.
   - **Identifiers → User ID:** linked, App Functionality, not for tracking.
   - Everything else: not collected. "Do you or your third-party partners use data for tracking?" → **No**.
6. **Version 1.0 page:** upload screenshots (`docs/store-listing.md`), description, keywords, support URL, marketing URL (optional), promotional text, copyright. What's New text.
7. **App Review Information:** Sign-in required → **Yes**; enter the demo account (section 6); contact phone and email; paste the review notes from `docs/store-listing.md`, which state that account deletion is available in-app at Settings → Delete account (required by guideline 5.1.1(v)).
8. **Export compliance:** `ITSAppUsesNonExemptEncryption = false` is already in `app.json`, so App Store Connect will not ask on each upload. If it does ask: "No" to non-exempt encryption (the app only uses HTTPS).
9. Copy the numeric **Apple ID** of the app (App Information → General) into `eas.json` → `ascAppId`.

## 6. Demo reviewer account

Both stores reject apps they cannot get past the login screen. Because sign-in is by emailed code, give the reviewer an account with a **fixed code**:

1. In the production Clerk instance enable test mode (section 3, step 5). Test addresses use the form `reviewer+clerk_test@[YOURDOMAIN]` and accept the code `424242` without any email being sent.
2. Sign in to the production app with that address, complete onboarding as a fictional shop (for example "Demo Tailor, Sathorn, Bangkok"), add four or five fictional clients, at least one with `lastOrderAt` older than 90 days, and one or two fittings with measurements and a posture note. Run each AI feature once so results are already saved.
3. Put the email and code in App Store Connect → App Review Information and in Play Console → App content → App access ("All or some functionality is restricted" → add instructions).
4. Do not delete this account between releases; reviewers reuse it for every update.

If Clerk test mode is not available on your plan, create a real mailbox (e.g. `reviewer@[YOURDOMAIN]`) that you can read, and write in the notes that you will forward the code within minutes during business hours [TIMEZONE]. This is slower and sometimes rejected; prefer the fixed code.

## 7. Google Play Console

1. **Create app:** name `TLS – Tailor Growth`, default language English (US or UK), App, Free. Accept the declarations.
2. **Set up your app (Dashboard tasks):**
   - Privacy policy: `https://<worker>/privacy`.
   - App access: "All or some functionality is restricted" → add the demo account instructions (section 6).
   - Ads: No.
   - Content rating: fill the IARC questionnaire as a Utility/Productivity app, no violence, no user-to-user content, no sharing of location → Everyone.
   - Target audience: 18 and over (business tool), not designed for children.
   - News app: No. COVID-19 contact tracing: No. Government app: No. Financial features: None. Health apps: No (tailoring measurements are not health data).
   - **Data safety:**
     - Collects data: Yes. Shares data: **No** (transfers to service providers acting on your behalf do not count as sharing).
     - Encrypted in transit: Yes. Users can request deletion: Yes (in-app, Settings → Delete account; give the privacy policy URL as the deletion-request link).
     - Data types collected, each "Required", purpose "App functionality", not ephemeral: **Personal info → Name, Email address, Phone number, Other info** (shop and client details, measurements); **App activity → Other user-generated content** (notes, AI text); **App info and performance → Crash logs / Diagnostics: No** (none collected unless you add a crash SDK); **Device or other IDs: No**.
3. **Store listing:** short description, full description (`docs/store-listing.md`), 512×512 icon, 1024×500 feature graphic, phone screenshots (at least 2), contact email (becomes public), external marketing default.
4. **App signing:** accept Play App Signing. EAS generates and stores the upload keystore.
5. **Service account for `eas submit`:** Google Cloud Console → IAM → Service accounts → create → Keys → JSON → save as `mobile/app/google-service-account.json` (git-ignored). Then Play Console → **Users and permissions → Invite new users** → the service account email → app permissions: Release manager (or Admin) for this app.
6. **First upload must be manual.** Google does not let the API create the first release. Download the first production `.aab` from the EAS build page and upload it to **Testing → Internal testing → Create new release**. After that, `eas submit` works.
7. Add yourself and testers to the internal testing list, install from the opt-in link, sign in, smoke test. Then promote to closed testing (needed for the 14-day requirement on personal accounts) and finally to production.

## 8. Build and submit

```bash
cd mobile/app
eas build -p all --profile production          # ~15–25 min each; iOS asks for Apple login the first time
eas submit -p ios --profile production --latest
eas submit -p android --profile production --latest   # only after the manual first upload (7.6)
```

- `autoIncrement` bumps the build number / version code on EAS each time. Bump `version` in `app.json` yourself for each store release.
- iOS submit uploads to TestFlight. The build appears in App Store Connect after Apple processes it (10–30 min), then attach it to version 1.0 and click **Add for Review → Submit**.
- Android submit lands in the **internal** track (`eas.json`). Promote it through the Console.

## 9. After submitting

- **TestFlight:** add internal testers (App Store Connect users) immediately; external testers need a short beta review. Test sign-in, one AI generation, and account deletion on a real device before submitting to review.
- **Review times:** Apple typically 1–3 days for a first submission; Google's first review of a new account can take a week.
- **Common rejection reasons and the fix:**
  - *Cannot log in / no demo account* → section 6; make sure the code still works and the account was not deleted.
  - *Privacy policy URL missing or 404* → check `https://<worker>/privacy` in a browser; must be plain HTML, not a download.
  - *Crash on launch* → almost always a missing `EXPO_PUBLIC_*` variable in the production environment or the API rejecting the production Clerk key. Run the `preview` build against production first.
  - *Placeholder text / incomplete metadata* → search the UI and the API pages for `[`, "lorem", "TODO", "coming soon".
  - *Account deletion not found* → the Settings entry must be reachable within two taps and must actually delete server data (`DELETE /account`).
  - *Guideline 4.2 minimum functionality* → screenshots and notes should make the AI features and fitting records obvious; a seeded demo shop does this.
  - *Google "App access" instructions incomplete* → give the exact email, code and the path to each restricted feature.
- After approval: release manually (Apple: "Manually release this version" is safer for a 1.0), then tag the commit with the version, and record the build numbers EAS assigned (`eas build:list`).

## Next release in one screen

1. Bump `version` in `app.json`. 2. `npx expo-doctor && npx tsc --noEmit`. 3. `eas build -p all --profile production`. 4. `eas submit -p ios --latest`, `eas submit -p android --latest`. 5. Update What's New in both consoles. 6. Submit for review.
