# Privacy Policy – TLS

**Effective date:** [DATE]
**Operator:** [COMPANY NAME], [COMPANY ADDRESS] ("we", "us")
**Contact:** [SUPPORT EMAIL]

This policy is served at `https://[WORKER]/privacy` and linked from both app stores. Everything in `[BRACKETS]` must be filled in before publishing; do not publish it with placeholders.

---

TLS is an app for tailor shops. It stores the shop's client and fitting records and uses AI to draft cutter notes, marketing copy, local search keywords and re-engagement emails. This policy explains what data the app handles, who processes it and how to delete it.

## 1. Data we collect

**Account.** Your email address, used to sign you in with a one-time code. Authentication is handled by Clerk, which also stores session and device information needed to keep you signed in.

**Shop profile.** The shop name, district, city and brand tone you enter during onboarding.

**Client records you enter.** Client names, phone numbers, email addresses, LINE IDs, free-text notes, last-order dates, and fitting records: style, fabric, body measurements in centimetres (chest, waist, over-arm, shoulder, sleeve, jacket length) and posture notes. We only hold what you type in. The app does not read your contacts, camera, microphone, photos or location.

**AI outputs.** Text generated for you (cutter notes, fit profiles, marketing hooks, blog posts, captions, keyword lists, email drafts) is stored with the record it belongs to so you can see it again.

**Technical data.** Our API logs request metadata (time, route, response status, an anonymised user id) for security and debugging. Rate-limit counters are kept per account. We do not use advertising or analytics SDKs and do not build behavioural profiles.

## 2. How we use it

- To run the app: show you your clients, fittings and generated content.
- To generate AI text: the relevant fields (for example a fitting's measurements, style, fabric and posture note, or a client's name and last purchase for a win-back email) are sent to Google's Gemini API and the reply is stored for you.
- To keep the service reliable: rate limiting, abuse prevention and debugging.
- To contact you about your account or this policy at the email you signed up with.

We do not show ads, do not sell or rent data, and do not share it with anyone except the processors below.

## 3. Processors

| Provider | Purpose | Data it handles |
|---|---|---|
| Clerk | Sign-in and sessions | Email address, session tokens, device info |
| Turso | Database | All shop, client, fitting and AI-output records |
| Cloudflare | API hosting (Workers) | All data in transit through the API; request logs |
| Google (Gemini API) | AI text generation | The fields sent for each generation request (see §2) |
| Upstash | Rate limiting | Anonymised user id and request counters only |
| Expo (EAS) | Building and distributing the app | No user data; used to compile the app binaries |

Each provider processes data only on our instructions under its own terms and data-processing agreement. [Confirm the region of the Turso database and state it here, e.g. "Data is stored in Singapore."]

[If the Gemini API key is on Google's free (unpaid) tier, Google's terms allow it to use submitted content to improve its services. Use a billing-enabled key for production so that client data is not used that way, then delete this note.]

## 4. Retention and deletion

Your data is kept for as long as your account exists.

**Delete your account in the app:** Settings → Delete account. This permanently erases the shop, every client and fitting record, all AI outputs and your login with Clerk. It cannot be undone. Backups held by our database provider are purged on their normal schedule [confirm and state the period, e.g. "within 30 days"].

You can also delete individual clients (which deletes their fittings) at any time from the client's page.

To request deletion or a copy of your data by email, write to [SUPPORT EMAIL] from the address you signed up with.

## 5. Your clients' data and Thailand's PDPA

If you run a shop, the client information you enter into TLS belongs to your clients. Under Thailand's Personal Data Protection Act B.E. 2562 (2019) and similar laws elsewhere, **you are the data controller** for that information and we act as your processor. That means you are responsible for:

- telling your clients that you keep their contact details and measurements, and obtaining consent or relying on another lawful basis where the law requires it;
- entering only what you need for the tailoring relationship;
- responding to your clients' requests to see, correct or delete their data (the app lets you edit and delete any client record);
- deciding whether to send the AI-drafted emails and messages, which the app does not send on your behalf.

We will help you meet those obligations by deleting data on request and by keeping this policy accurate.

## 6. Security

Data travels over HTTPS. Sign-in tokens are stored in the device's secure storage (Keychain on iOS, Keystore on Android). Access to each shop's data is checked on every API request against the signed-in account. No system is perfectly secure; if we learn of a breach affecting your data we will notify you at your account email.

## 7. Children

TLS is a business tool and is not directed at children. We do not knowingly collect data from anyone under 13 (or the applicable age in your country).

## 8. International transfers

The processors above operate in several countries, including the United States [and Singapore / other regions as applicable]. By using TLS you accept that data is processed where they operate, under their contractual safeguards.

## 9. Changes

We will post changes here with a new effective date and, for material changes, tell you in the app or by email.

## 10. Contact

Questions, corrections or deletion requests: [SUPPORT EMAIL]
[COMPANY NAME], [COMPANY ADDRESS]
