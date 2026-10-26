import { Hono } from "hono";
import { REFERRAL_PREFERRED, type ReferralPreferred } from "../../../shared/types";
import { type Db, createDb, newId, nowIso } from "../db";
import type { AppEnv } from "../env";
import { ApiHttpError } from "../errors";
import { enforceReferralRateLimit } from "../ratelimit";

// Smart Referral, public side (no auth, mounted at /r before requireAuth): GET /r/:code renders the friend's page,
// POST /r/:code saves the lead. The db is NOT attached by middleware here: createDb(c.env) is called per request.
// The signed-in side (overview, leads, rewards, the client's own link) is in referrals.ts.

const referralPublicRoutes = new Hono<AppEnv>();

/** Codes are "<FIRSTNAME>-<4 chars>" (referrals.ts); anything else is answered without a lookup. */
const CODE_RE = /^[A-Z0-9-]{3,40}$/;
const NAME_MAX = 120;
const CONTACT_MIN = 3;
const CONTACT_MAX = 80;

/** What the page needs about the client whose link this is and their shop. */
interface Invite {
  clientId: string;
  shopId: string;
  firstName: string;
  shopName: string;
  district: string;
  city: string;
  friendOffer: string | null;
}

/** What the friend typed, kept across a failed validation so the form re-renders filled in. */
interface FormValues {
  name: string;
  contact: string;
  preferred: string;
  consent: boolean;
}

const EMPTY_FORM: FormValues = { name: "", contact: "", preferred: "", consent: false };

function normaliseCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

async function findInvite(db: Db, code: string): Promise<Invite | null> {
  const rs = await db.execute({
    sql: `SELECT c.id AS client_id, c.name AS client_name, s.id AS shop_id, s.name AS shop_name, s.district, s.city,
                 s.referral_friend_offer
          FROM clients c JOIN shops s ON s.id = c.shop_id
          WHERE c.referral_code = ?`,
    args: [code],
  });
  const row = rs.rows[0];
  if (!row) return null;
  const text = (key: string): string => (row[key] == null ? "" : String(row[key]));
  const fullName = text("client_name").trim();
  const offer = text("referral_friend_offer").trim();
  return {
    clientId: text("client_id"),
    shopId: text("shop_id"),
    firstName: fullName.split(/\s+/)[0] || fullName || "A client",
    shopName: text("shop_name"),
    district: text("district"),
    city: text("city"),
    friendOffer: offer || null,
  };
}

const isPreferred = (v: string): v is ReferralPreferred => (REFERRAL_PREFERRED as readonly string[]).includes(v);

/** The string value of a form field ("" when missing or a file upload). */
function field(body: Record<string, string | File | (string | File)[]>, name: string): string {
  const value = body[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

/** GET /r/:code -> the invitation page (404 page for an unknown code). */
referralPublicRoutes.get("/:code", async (c) => {
  const code = normaliseCode(c.req.param("code"));
  const invite = code ? await findInvite(createDb(c.env), code) : null;
  c.header("Cache-Control", "no-store");
  if (!invite) return c.html(notFoundPage(), 404);
  return c.html(invitePage(invite, EMPTY_FORM, null));
});

/**
 * POST /r/:code (form-encoded) -> the thank-you page once the lead is saved; the form again with an error line when
 * a field is missing. Rate limited per address; a filled honeypot (`website`) is thanked and silently dropped.
 */
referralPublicRoutes.post("/:code", async (c) => {
  const db = createDb(c.env);
  const code = normaliseCode(c.req.param("code"));
  const invite = code ? await findInvite(db, code) : null;
  c.header("Cache-Control", "no-store");
  if (!invite) return c.html(notFoundPage(), 404);

  try {
    await enforceReferralRateLimit(c, c.req.header("cf-connecting-ip") ?? "unknown");
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 429) return c.html(noticePage(invite, "One moment", err.message), 429);
    throw err;
  }

  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await c.req.parseBody({ all: true });
  } catch {
    body = {};
  }
  const values: FormValues = {
    name: field(body, "name"),
    contact: field(body, "contact"),
    preferred: field(body, "preferred"),
    consent: field(body, "consent") !== "",
  };

  // Bots fill every field, including the hidden one. Thank them and save nothing.
  if (field(body, "website") !== "") return c.html(thankYouPage(invite, values.name || "friend"));

  let error: string | null = null;
  if (!values.name) error = "Please tell us your name.";
  else if (values.name.length > NAME_MAX) error = `Your name can be at most ${NAME_MAX} characters.`;
  else if (values.contact.length < CONTACT_MIN) error = "Please add a phone number or LINE ID so the shop can reach you.";
  else if (values.contact.length > CONTACT_MAX) error = `The phone number or LINE ID can be at most ${CONTACT_MAX} characters.`;
  else if (values.preferred !== "" && !isPreferred(values.preferred)) error = "Please pick when you'd like to come in.";
  else if (!values.consent) error = "Please tick the box so the shop may keep your details to arrange the fitting.";
  if (error) return c.html(invitePage(invite, values, error), 400);

  const now = nowIso();
  await db.execute({
    sql: `INSERT INTO referral_leads (id, shop_id, referrer_client_id, name, contact, preferred, status, client_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)`,
    args: [newId(), invite.shopId, invite.clientId, values.name, values.contact, values.preferred || null, now, now],
  });
  return c.html(thankYouPage(invite, values.name));
});

export default referralPublicRoutes;

// ---------- HTML ----------

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every value that came from the database or the form goes through this before it lands in the page. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const PREFERRED_LABELS: Record<ReferralPreferred, string> = { this_week: "This week", next_week: "Next week", any: "Any time" };

/** The gift line, with the offer or the generic promise when the shop hasn't written one yet. */
function giftSentence(invite: Invite): string {
  return invite.friendOffer
    ? `Book your first fitting with this link and you get ${escapeHtml(lowerFirst(invite.friendOffer))}.`
    : "Book your first fitting with this link and the shop has a welcome gift waiting for you.";
}

/** Page frame in the brand: navy band, gold spaced caps, ivory page, white cards. Mobile first. */
function layout(title: string, band: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #F4EFE6; color: #14213A; font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .band { background: #14213A; color: #F4EFE6; padding: 28px 20px 24px; text-align: center; }
  .shop { margin: 0; color: #D1AC66; font-size: 13px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
  .tagline { margin: 8px 0 0; font-size: 14px; opacity: .78; }
  main { max-width: 520px; margin: 0 auto; padding: 24px 20px 48px; }
  h1 { margin: 0 0 10px; font-family: Georgia, "Times New Roman", serif; font-weight: 600; font-size: 30px; line-height: 1.15; }
  h2 { margin: 0 0 6px; font-family: Georgia, "Times New Roman", serif; font-weight: 600; font-size: 22px; line-height: 1.2; }
  p { margin: 0 0 12px; }
  .lead { color: #4A5263; font-size: 17px; margin-bottom: 20px; }
  .card { background: #fff; border: 1px solid #DED4C1; border-radius: 16px; padding: 18px 18px 16px; margin-bottom: 18px; }
  .eyebrow { margin: 0 0 6px; color: #7A5414; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
  .gift { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 22px; line-height: 1.25; }
  .points { margin: 0; padding: 0; list-style: none; }
  .points li { position: relative; padding-left: 22px; margin: 0 0 8px; color: #4A5263; font-size: 15px; }
  .points li::before { content: ""; position: absolute; left: 4px; top: 9px; width: 7px; height: 7px; border-radius: 50%; background: #D1AC66; }
  label.field { display: block; margin: 0 0 14px; }
  .label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
  input[type=text], input[type=tel] { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid #DED4C1; border-radius: 12px; background: #fff; color: #14213A; font: inherit; }
  input[type=text]:focus, input[type=tel]:focus { outline: none; border-color: #14213A; }
  fieldset { border: 0; padding: 0; margin: 0 0 14px; }
  legend { padding: 0; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills label { cursor: pointer; }
  .pills input { position: absolute; opacity: 0; width: 0; height: 0; }
  .pills span { display: inline-block; min-height: 38px; padding: 8px 16px; border: 1px solid #DED4C1; border-radius: 20px; background: #fff; font-size: 14px; line-height: 20px; }
  .pills input:checked + span { background: #14213A; border-color: #14213A; color: #F4EFE6; }
  .pills input:focus-visible + span { outline: 2px solid #D1AC66; outline-offset: 2px; }
  .consent { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 18px; font-size: 14px; color: #4A5263; cursor: pointer; }
  .consent input { margin: 3px 0 0; width: 18px; height: 18px; flex: none; accent-color: #14213A; }
  .hp { position: absolute; left: -9999px; top: -9999px; width: 1px; height: 1px; overflow: hidden; }
  button { width: 100%; min-height: 50px; padding: 12px 22px; border: 0; border-radius: 25px; background: #D1AC66; color: #14213A; font: inherit; font-weight: 600; font-size: 16px; cursor: pointer; }
  button:hover { background: #c9a159; }
  .error { margin: 0 0 14px; padding: 10px 14px; border-radius: 12px; background: #F3E1DD; color: #8A2E24; font-size: 14px; font-weight: 500; }
  .foot { margin: 16px 0 0; text-align: center; color: #4A5263; font-size: 13px; }
  .tick { width: 56px; height: 56px; margin: 4px auto 16px; border-radius: 50%; background: #E3EBDD; color: #2F4A22; display: flex; align-items: center; justify-content: center; font-size: 28px; }
</style>
</head>
<body>
<header class="band">
${band}
</header>
<main>
${body}
</main>
</body>
</html>`;
}

function shopBand(invite: Invite): string {
  const where = [invite.district, invite.city].filter(Boolean).join(", ");
  return `<p class="shop">${escapeHtml(invite.shopName)}</p>
<p class="tagline">Bespoke tailoring${where ? ` · ${escapeHtml(where)}` : ""}</p>`;
}

/** The invitation: the offer, what to expect, and the form that asks for a fitting. */
function invitePage(invite: Invite, values: FormValues, error: string | null): string {
  const first = escapeHtml(invite.firstName);
  const shop = escapeHtml(invite.shopName);
  const pills = REFERRAL_PREFERRED.map(
    (value) => `<label><input type="radio" name="preferred" value="${value}"${values.preferred === value ? " checked" : ""}><span>${PREFERRED_LABELS[value]}</span></label>`,
  ).join("\n      ");

  const body = `<h1>${first} has invited you to the shop</h1>
<p class="lead">${giftSentence(invite)}</p>

<section class="card">
  <p class="eyebrow">Your welcome gift</p>
  <p class="gift">${invite.friendOffer ? escapeHtml(invite.friendOffer) : "A welcome gift from the shop, told to you at your first fitting"}</p>
</section>

<section class="card">
  <ul class="points">
    <li>A first fitting takes about 30 minutes.</li>
    <li>Your measurements are kept on file for every order after.</li>
    <li>You were invited personally by ${first}.</li>
  </ul>
</section>

<section class="card">
  <h2>Ask for a fitting</h2>
  <p class="lead" style="font-size:15px;margin-bottom:14px">Leave your details and ${shop} will get in touch.</p>
  ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="" novalidate>
    <label class="field"><span class="label">Your name</span>
      <input type="text" name="name" value="${escapeHtml(values.name)}" maxlength="${NAME_MAX}" autocomplete="name" required></label>
    <label class="field"><span class="label">Phone or LINE ID</span>
      <input type="text" name="contact" value="${escapeHtml(values.contact)}" maxlength="${CONTACT_MAX}" autocomplete="tel" inputmode="text" required></label>
    <fieldset>
      <legend>When would you like to come in?</legend>
      <div class="pills">
      ${pills}
      </div>
    </fieldset>
    <label class="consent"><input type="checkbox" name="consent" value="yes"${values.consent ? " checked" : ""} required>
      <span>${shop} may keep my details to arrange my fitting.</span></label>
    <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <button type="submit">Request a fitting</button>
  </form>
</section>

<p class="foot">The shop will message you to confirm a day and time.</p>`;

  return layout(`Your invitation to ${invite.shopName}`, shopBand(invite), body);
}

/** After a saved request (and, identically, after a honeypot hit). */
function thankYouPage(invite: Invite, name: string): string {
  const body = `<div class="tick" aria-hidden="true">&#10003;</div>
<h1 style="text-align:center">Thank you, ${escapeHtml(name.replace(/[.!]+$/, ""))}.</h1>
<p class="lead" style="text-align:center">${escapeHtml(invite.shopName)} will message you to confirm a time.</p>
<section class="card">
  <p class="eyebrow">Your welcome gift</p>
  <p class="gift">${invite.friendOffer ? escapeHtml(invite.friendOffer) : "A welcome gift from the shop, told to you at your first fitting"}</p>
</section>
<p class="foot">Invited by ${escapeHtml(invite.firstName)} · ${giftSentence(invite)}</p>`;
  return layout(`Thank you - ${invite.shopName}`, shopBand(invite), body);
}

/** A short message page in the shop's frame (used for the rate limit). */
function noticePage(invite: Invite, title: string, message: string): string {
  const body = `<h1>${escapeHtml(title)}</h1>
<p class="lead">${escapeHtml(message)}</p>
<p class="foot">The shop will message you to confirm a day and time once your request is in.</p>`;
  return layout(`${title} - ${invite.shopName}`, shopBand(invite), body);
}

/** Unknown or mistyped code. */
function notFoundPage(): string {
  const band = `<p class="shop">Magick Tailor</p>
<p class="tagline">Bespoke tailoring</p>`;
  const body = `<h1>This invitation link isn't valid.</h1>
<p class="lead">It may have been typed in by hand or shortened along the way. Ask the person who sent it to share the link again from their tailor's app.</p>`;
  return layout("Invitation not found", band, body);
}
