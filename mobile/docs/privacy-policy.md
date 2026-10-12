# Privacy Policy – Magick TLS

**Effective date:** 8 October 2026
**Operator:** General Magick Industries Pte Ltd ("we", "us")
**Contact:** support@generalmagickindustries.com

This policy is served at `https://api.magicktls.generalmagickindustries.com/privacy` (the HTML in `mobile/api/src/routes/public.ts`) and linked from both app stores. Keep this file and the served HTML saying the same things; the HTML is the shorter, plain-English version.

---

TLS is an app for tailor shops. It stores the shop's client, fitting and order records, sends emails to clients on the shop's behalf, and uses AI to draft cutter notes, marketing copy and re-engagement emails. This policy explains what data the app handles, who processes it and how to delete it.

## 1. Data we collect

**Account.** Your email address, used to sign you in with a one-time code. Authentication is handled by Clerk, which also stores session and device information needed to keep you signed in.

**Shop profile.** The shop name, district, city and brand tone you enter during onboarding, plus the shop details you can add in Settings: address, phone number, opening hours and a reply-to email. The shop details are printed at the bottom of every email you send.

**Client records you enter.** Client names, phone numbers, email addresses, LINE IDs, free-text notes, last-order dates, and fitting records: the garment type, the measurements that garment needs in centimetres (for example chest, waist, hip, shoulder, sleeve, inseam, outseam, thigh, hem, neck, cuff and lengths), style, fabric and posture notes. We only hold what you type in. The app does not read your contacts, camera, microphone or location, and it only opens your photo library when you choose to attach a photo or video to a post.

**Orders.** Each order you record for a client: garment, status, due date, price and deposit.

**Emails you send.** When you email a client from the app (a win-back offer, an order-ready notice or a follow-up) we keep a copy on the client's file: the address it was sent to, the subject, the text, whether the provider accepted it, and the provider's reference for the message.

**AI outputs.** Text generated for you (cutter notes, fit profiles, marketing hooks, blog posts, captions, email drafts) is stored with the record it belongs to so you can see it again. Posts you write in Content Studio are saved to your content library, together with any photo or short video you attach to them.

**Technical data.** Our API logs request metadata (time, route, response status, an anonymised user id) for security and debugging. Rate-limit counters are kept per account. We do not use advertising or analytics SDKs and do not build behavioural profiles.

## 2. How we use it

- To run the app: show you your clients, fittings, orders, messages and generated content.
- To send emails to your clients, only when you tap Send on a drafted email.
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
| Amazon Web Services (S3) | Storage for the photos and videos attached to posts | The files you attach, kept privately under a random name and served only through the API |
| Google (Gemini API) | AI text generation | The fields sent for each generation request (see §2) |
| Resend | Delivering the emails you send to clients | The client's email address, the subject and text of the email, your shop's name and reply-to address |
| Upstash | Rate limiting | Anonymised user id and request counters only |
| Expo (EAS) | Building and distributing the app | No user data; used to compile the app binaries |

Each provider processes data only on our instructions under its own terms and data-processing agreement. Data is stored in Tokyo, Japan.

Google processes the inputs of each AI request under the Gemini API terms that apply to our account.

## 4. Retention and deletion

Your data is kept for as long as your account exists.

**Delete your account in the app:** Settings → Delete account. This permanently erases the shop and its details, every client, fitting and order record, the copies of emails you sent, all AI outputs, your posts and their photos and videos, and your login with Clerk. It cannot be undone. Backups held by our database provider are purged on their normal schedule, within 30 days.

You can also delete individual clients (which deletes their fittings, orders and messages) and individual posts at any time.

To request deletion or a copy of your data by email, write to support@generalmagickindustries.com from the address you signed up with. We reply within 2 business days.

## 5. Your clients' data and Thailand's PDPA

If you run a shop, the client information you enter into TLS belongs to your clients. Under Thailand's Personal Data Protection Act B.E. 2562 (2019) and similar laws elsewhere, **you are the data controller** for that information and we act as your processor. That means you are responsible for:

- telling your clients that you keep their contact details and measurements, and obtaining consent or relying on another lawful basis where the law requires it;
- entering only what you need for the tailoring relationship;
- responding to your clients' requests to see, correct or delete their data (the app lets you edit and delete any client record);
- deciding whether to send the AI-drafted emails. When you tap Send, the app sends the email to your client through Resend on your behalf, from the app's own sender address with your shop's reply-to, and keeps a copy on the client's file.

We will help you meet those obligations by deleting data on request and by keeping this policy accurate.

## 6. Security

Data travels over HTTPS. Sign-in tokens are stored in the device's secure storage (Keychain on iOS, Keystore on Android). Access to each shop's data is checked on every API request against the signed-in account. No system is perfectly secure; if we learn of a breach affecting your data we will notify you at your account email.

## 7. Children

TLS is a business tool and is not directed at children. We do not knowingly collect data from anyone under 13 (or the applicable age in your country).

## 8. International transfers

The processors above operate in several countries, including the United States, Singapore and Japan. By using TLS you accept that data is processed where they operate, under their contractual safeguards.

## 9. Changes

We will post changes here with a new effective date and, for material changes, tell you in the app or by email.

## 10. Contact

Questions, corrections or deletion requests: support@generalmagickindustries.com
General Magick Industries Pte Ltd
