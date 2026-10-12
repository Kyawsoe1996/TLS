import { Hono } from "hono";
import type { AppEnv } from "../env";

// Unauthenticated routes: /health, /privacy, /support.

const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/health", (c) => c.json({ ok: true }));

publicRoutes.get("/privacy", (c) => c.html(page("Privacy Policy", PRIVACY_HTML)));

publicRoutes.get("/support", (c) => c.html(page("Support", SUPPORT_HTML)));

export default publicRoutes;

// ---------- HTML ----------

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Magick TLS</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px 16px 64px; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } a { color: #9cc4ff; } }
  main { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 28px 0 8px; }
  p, li { margin: 6px 0; }
  .meta { opacity: .7; font-size: 14px; margin-bottom: 24px; }
  code { font-size: 14px; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

const PRIVACY_HTML = `
<h1>Privacy Policy</h1>
<p class="meta">Magick TLS - the app for bespoke tailor shops. Provided by General Magick Industries Pte Ltd. Last updated: 8 October 2026.</p>

<p>This policy explains, in plain English, what information the Magick TLS app stores, who helps us process it, and how you stay in control of it.</p>

<h2>What we store</h2>
<ul>
  <li><strong>Your account.</strong> The email address you sign in with (managed by Clerk) and your shop profile: shop name, district, city and brand tone.</li>
  <li><strong>Your shop details.</strong> The address, phone number, opening hours and reply-to email you add in Settings. They appear at the bottom of the emails you send.</li>
  <li><strong>Your clients.</strong> The client details you enter: names, phone numbers, email addresses, LINE IDs, notes and last-order dates.</li>
  <li><strong>Measurements and fittings.</strong> The garment type, all the measurements that garment needs, the style, fabric and posture notes you record for each fitting.</li>
  <li><strong>Orders.</strong> Each order's garment, status, due date, price and deposit.</li>
  <li><strong>Emails you send.</strong> When you email a client from the app (win-back, order ready, follow-up) we keep a copy on the client's file: the address it went to, the subject, the text, whether it was delivered and the provider's reference.</li>
  <li><strong>AI outputs.</strong> The fit analyses, marketing posts and email drafts generated for you, so you can find them again.</li>
  <li><strong>Posts and media.</strong> The posts in your content library and any photo or video you attach to them.</li>
</ul>
<p>We do not collect anything you don't enter yourself. We don't use advertising trackers.</p>

<h2>Who processes it</h2>
<p>We rely on a small number of service providers to run the app. Each one only receives what it needs to do its job:</p>
<ul>
  <li><strong>Clerk</strong> - sign-in and account security.</li>
  <li><strong>Turso</strong> - the database where your shop, client, fitting and AI data is stored.</li>
  <li><strong>Cloudflare</strong> - hosting for the API that the app talks to.</li>
  <li><strong>Amazon Web Services (S3)</strong> - storage for the photos and videos you attach to posts. Files are kept privately under a random name and only served through the API.</li>
  <li><strong>Google Gemini</strong> - AI generation. When you tap an AI feature, the relevant inputs (for example a client's first name, style, fabric and measurements, or your district and brand tone) are sent to Google to produce the result.</li>
  <li><strong>Resend</strong> - delivers the emails you send to clients. Each email goes out from the app's own sender address, shows your shop's name, and uses your shop's reply-to email so replies reach you. Resend receives the client's address, the subject and the text.</li>
  <li><strong>Upstash</strong> - counts your AI requests and emails so we can apply the daily usage limits. It only sees an anonymous user identifier, not your data.</li>
  <li><strong>Expo (EAS)</strong> - builds the app itself. It does not receive any user data.</li>
</ul>

<h2>How we use it</h2>
<p>Only to provide the app's features to you: keeping your client records and orders, producing fit analyses and marketing content, sending an email to a client only when you tap Send, and keeping your account secure. We never sell your data or your clients' data, and we never share it with anyone for marketing purposes.</p>

<h2>Your clients' information</h2>
<p>You are responsible for making sure you're allowed to record your clients' details and measurements in the app. Please only enter what you need to serve them.</p>

<h2>Deleting your data</h2>
<p>You can delete your account at any time from inside the app: <strong>Settings &rarr; Delete account</strong>. This permanently erases your shop and its details, all client records, all fittings and measurements, all orders, the copies of emails you sent, all AI outputs, your posts and their photos and videos, and your sign-in account. It cannot be undone.</p>

<h2>Security</h2>
<p>Data is sent over encrypted connections (HTTPS) and stored with providers that encrypt data at rest. Access to the API always requires your signed-in session.</p>

<h2>Changes</h2>
<p>If we change this policy in a meaningful way we will update the date at the top and let you know in the app.</p>

<h2>Contact</h2>
<p>Questions about privacy or your data? Email <a href="mailto:support@generalmagickindustries.com">support@generalmagickindustries.com</a>.</p>
`;

const SUPPORT_HTML = `
<h1>Support</h1>
<p class="meta">Magick TLS - the app for bespoke tailor shops. Provided by General Magick Industries Pte Ltd.</p>

<h2>Get help</h2>
<p>Email us at <a href="mailto:support@generalmagickindustries.com">support@generalmagickindustries.com</a>. We reply within 2 business days.</p>
<p>To help us solve things quickly, please include:</p>
<ul>
  <li>The email address you sign in with</li>
  <li>Your device and app version</li>
  <li>What you were doing and what happened (screenshots are welcome)</li>
</ul>

<h2>Common questions</h2>
<p><strong>The AI says I've reached today's limit.</strong> Each account can run up to 30 AI generations per day (fit analysis, SEO map, posts and win-back emails combined). The limit resets over a rolling 24 hours.</p>
<p><strong>The AI couldn't produce a result.</strong> This happens occasionally. Wait a moment and try again; if it keeps failing, email us with the time it happened.</p>
<p><strong>How do I delete my account?</strong> In the app go to <strong>Settings &rarr; Delete account</strong>. This erases your shop, clients, fittings, orders, sent emails, posts, AI outputs and your sign-in account immediately and permanently.</p>
<p><strong>An email to a client shows "Failed".</strong> Check the client's email address on their file and send again. If it still fails, email us with the client's address and the time you sent it.</p>
<p><strong>Where is my data stored and who can see it?</strong> See our <a href="/privacy">Privacy Policy</a>.</p>
`;
