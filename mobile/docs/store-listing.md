# Store listing: TLS 1.0

Copy for App Store Connect and Google Play Console. Character limits are noted; counts were checked with `wc -m` (see the bottom of this file). No statistics or customer claims are made, so nothing needs substantiating.

## Names and short copy

| Field | Limit | Value |
|---|---|---|
| App name (both stores) | 30 | `Magick TLS – Tailor Growth` |
| Subtitle (Apple) | 30 | `AI growth for bespoke tailors` |
| Short description (Google) | 80 | `Fittings, orders, AI cutter notes and win-back emails for bespoke tailors` |
| Promotional text (Apple, editable without a new build) | 170 | `Keep every client's measurements and cutter notes in one place, publish content in your shop's own voice, and bring quiet clients back. Built for bespoke tailor shops.` |
| Keywords (Apple) | 100 | `bespoke,suit,fitting,measurements,clients,CRM,marketing,orders,Bangkok,atelier,menswear,shirt` |
| Category | | Primary **Business**; secondary Productivity |
| Age rating | | Apple **4+** (answer "No" to every content descriptor). Google IARC questionnaire → **Everyone** (no user-generated content shared publicly, no ads, no purchases). |
| Price | | Free |
| Support URL | | `https://api.magicktls.generalmagickindustries.com/support` |
| Privacy policy URL | | `https://api.magicktls.generalmagickindustries.com/privacy` |
| Copyright | | `2026 General Magick Industries Pte Ltd` |

Apple's keyword field should not repeat words from the name or subtitle (they are already indexed), which is why `tailor`, `growth` and `AI` are left out. `SEO` was removed with the Local SEO feature, which is hidden in 1.0.

## Full description (Apple ≤ 4000, Google ≤ 4000)

```
TLS is a working tool for bespoke tailor shops. It keeps your client records, fitting measurements and orders in one place and uses AI to draft the things you would otherwise write yourself: cutter notes, marketing copy and win-back emails.

CLIENTS AND FITTINGS
Add each client with their phone, email or LINE ID. Record a fitting by hand – pick the garment and enter the measurements it needs, in centimetres – along with the style, the fabric and a posture note such as a low shoulder. Every fitting is saved to the client's file, so a returning client never has to be measured from scratch.

AI CUTTER NOTES
Send a saved fitting to the AI and get back pattern-adjustment notes for the cutter, a fit profile for the client's file and a short personalised message suggesting a complementary piece.

ORDERS
Track every order on the client's file: the garment, its status, the due date, the price and the deposit. Overdue orders are flagged, and when a garment is ready you can email the client straight from the order.

CONTENT STUDIO
Choose a topic, an audience (expatriates, local executives, grooms or tourists) and your brand tone. TLS drafts a blog post, a social caption and a call to action. Everything you write is saved to your content library, where you can attach a photo or a short video, edit it, duplicate it and share it through your phone's share sheet.

WIN-BACK
Clients who have not ordered in 90 days are flagged on the home screen. Pick an incentive and TLS writes a courteous re-engagement email and sends it to the client for you, keeping a copy on their file.

PRIVATE BY DESIGN
Your data belongs to your shop. No ads, no selling of data, and you can delete your account and everything in it from Settings at any time.

TLS requires an account: sign in with your email address and a one-time code, no password to remember.
```

## What's new (1.0)

```
First release.
• Client list with search and a 90-day inactive filter
• Manual fitting records with AI cutter notes and fit profile
• Orders with status, due dates, price and deposit
• Content Studio: blog post, social caption and call to action, saved to a content library with a photo or video
• Email clients from the app: win-back, order ready and follow-up
• Delete your account and all data from Settings
```

## Screenshots

Capture from the simulator/emulator with a seeded demo shop (see `release-checklist.md` → demo reviewer account) so the AI screens show real output rather than empty states. Use a plausible but fictional shop name and client names. Do not add device frames or marketing text unless someone designs them; plain captures are accepted by both stores.

Order (first two matter most; the stores show them in search results):

| # | Screen | What must be visible |
|---|---|---|
| 1 | Home | Shop name, clients count, fittings this month, inactive count |
| 2 | Clients | List with a few clients, one marked inactive, search field |
| 3 | New fitting | Measurement form partly filled (cm), style, fabric, posture note |
| 4 | AI fitting result | Pattern adjustments, fit profile, marketing hook |
| 5 | Content Studio | Generated blog title/body and social caption, a post with a photo attached |
| 6 | Orders | A client's orders with statuses, one overdue, prices |
| 7 | Win-back | Inactive client, chosen incentive, generated subject and body |
| 8 | Messages | A client's file with a sent email and its status |

Sizes:

| Store / device | Pixel size (portrait) | Notes |
|---|---|---|
| Apple iPhone 6.9" (required) | 1320 × 2868 | iPhone 16 Pro Max / 17 Pro Max simulator, `Cmd+S` saves at native size |
| Apple iPhone 6.5" (recommended) | 1284 × 2778 | iPhone 11 Pro Max / XS Max class; Apple scales it for older sizes |
| Google Play phone | 1080 × 1920 minimum; 1080 × 2340 fine | 2–8 images, 16:9 or 9:16, JPEG or 24-bit PNG, ≤ 8 MB each |
| Google Play feature graphic (required) | 1024 × 500 | Navy background, the crest from `docs/brand/icon.svg`, app name; no screenshots inside it |
| Google Play hi-res icon (required) | 512 × 512 | `sips -z 512 512 app/assets/icon.png --out play-icon-512.png` |

Apple only requires the 6.9" set for iPhone; iPad screenshots are not needed because `supportsTablet` is false. Google may additionally ask for 7" and 10" tablet screenshots; these can be reused phone captures if the app is phone-only, but the listing will note limited tablet support.

## Review notes (paste into "Notes" / "App access instructions")

```
TLS is a business tool for tailor shops; an account is required to reach any screen.

Sign in with:
  Email: reviewer+clerk_test@generalmagickindustries.com
  Code:  424242
(this address is a test account and the code above is accepted instead of an emailed one)

The first AI action shows a one-time permission prompt ("Use AI with Google Gemini?") explaining which details are sent to Google; tap Continue.
The demo shop ("Sathorn Bespoke Demo") already contains five clients, two fittings with AI cutter notes, two orders (one overdue) and a saved post, so every feature can be tried:
  Clients → open any client → Fittings → "AI cutter notes"
  Content Studio → Generate
  Clients → a client → Orders (add an order, mark it ready, email the client)
  Clients → an inactive client → Win-back → Draft email with AI → Send
Emails are delivered for real; the demo clients' addresses (reviewer+client1…5@generalmagickindustries.com) are mailboxes we control, so test sends go nowhere else.

Account deletion: Settings → Delete account (removes the shop, all clients, fittings, orders, sent emails, posts and the login).
Privacy policy: https://api.magicktls.generalmagickindustries.com/privacy
```

## Character counts

```bash
printf '%s' 'Magick TLS – Tailor Growth' | wc -m                            # 26
printf '%s' 'AI growth for bespoke tailors' | wc -m                          # 29
printf '%s' 'Fittings, orders, AI cutter notes and win-back emails for bespoke tailors' | wc -m   # 73
printf '%s' 'bespoke,suit,fitting,measurements,clients,CRM,marketing,orders,Bangkok,atelier,menswear,shirt' | wc -m   # 93
```
