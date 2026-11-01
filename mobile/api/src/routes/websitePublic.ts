import { type Context, Hono } from "hono";
import {
  type OrderStatus,
  REFERRAL_PREFERRED,
  type ReferralPreferred,
  type WebsitePiece,
  type WebsitePieceCategory,
  type WebsiteReview,
  type WebsiteSections,
  type WebsiteService,
  type WebsiteTheme,
} from "../../../shared/types";
import { type Db, createDb, newId, nowIso } from "../db";
import type { AppEnv } from "../env";
import { ApiHttpError } from "../errors";
import { mediaUrl, publicOrigin } from "../media";
import { enforceWebsiteRateLimit } from "../ratelimit";
import {
  DEFAULT_INCLUDES,
  isTheme,
  loadPieces,
  readIncludes,
  readSections,
  rowToWebsiteReview,
  rowToWebsiteService,
} from "../websiteData";
import { escapeHtml } from "./referralPublic";
import { SLUG_RE } from "./website";

// Free website, public side (no auth, mounted at /s before requireAuth): a small portfolio site per shop.
//   GET /s/:slug                 Home: cover, headline, services strip, selected work, how it works, a review, visit us
//   GET /s/:slug/work[?c=]       Work: every piece, filterable by garment group
//   GET /s/:slug/work/:pieceId   One piece: photos, spec card, the workshop photos of its order, more work
//   GET /s/:slug/services        Services with "from" prices, cloth in the shop now, what every garment includes
//   GET /s/:slug/about[?piece=]  The story, reviews, the booking form (#book) and opening hours
//   POST /s/:slug, POST /s/:slug/about   the booking form -> thank-you page (rate limited per address, honeypot)
// The db is NOT attached by middleware here: createDb(c.env) is called per request. Pages are meant to be found by
// search engines (description, Open Graph, canonical; no noindex). Every shop-written text is escaped. No client name
// is ever shown: pieces carry only the owner's own title and line. The look comes from the shop's theme as CSS variables.

const websitePublicRoutes = new Hono<AppEnv>();

const NAME_MAX = 120;
const CONTACT_MIN = 3;
const CONTACT_MAX = 80;
const GARMENT_MAX = 80;
const MESSAGE_MAX = 1000;
const GARMENTS_MAX = 6;
const PIECE_PARAM_MAX = 80;

/** The form's chips (and the Home strip) until the shop lists services, when it has no delivered orders either. */
const DEFAULT_GARMENTS = ["Suits", "Jackets", "Shirts", "Trousers", "Wedding wear", "Alterations"];

const CATEGORY_LABELS: Record<WebsitePieceCategory, string> = {
  suits: "Suits",
  jackets: "Jackets",
  trousers: "Trousers",
  shirts: "Shirts",
  wedding: "Wedding",
  other: "Other",
};
/** The spec card's "Garment" row; "other" leaves the row out. */
const CATEGORY_SINGULAR: Record<WebsitePieceCategory, string | null> = {
  suits: "Suit",
  jackets: "Jacket",
  trousers: "Trousers",
  shirts: "Shirt",
  wedding: "Wedding wear",
  other: null,
};
const STAGE_LABELS: Record<OrderStatus, string> = {
  measured: "Measured",
  cutting: "Cutting",
  fitting: "Fitting",
  ready: "Ready",
  delivered: "Delivered",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Everything the pages show, read in one go (pages are cached for 5 minutes). */
interface Site {
  shopId: string;
  slug: string;
  name: string;
  district: string;
  city: string;
  address: string | null;
  phone: string | null;
  openingHours: string | null;
  googleReviewUrl: string | null;
  about: string | null;
  lineId: string | null;
  theme: WebsiteTheme;
  headline: string | null;
  aboutHeading: string | null;
  includes: string[];
  rating: number | null;
  sections: WebsiteSections;
  coverUrl: string | null;
  tailorPhotoUrl: string | null;
  services: WebsiteService[];
  reviews: WebsiteReview[];
  pieces: WebsitePiece[];
  fabrics: { name: string; swatch: string }[];
  /** Distinct garments from delivered orders (or the generic list): the fallback when no services are listed. */
  garments: string[];
}

/** What the visitor typed, kept across a failed validation so the form re-renders filled in. */
interface FormValues {
  name: string;
  contact: string;
  garment: string;
  preferred: string;
  message: string;
  consent: boolean;
}

const EMPTY_FORM: FormValues = { name: "", contact: "", garment: "", preferred: "", message: "", consent: false };

function normaliseSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

const textOf = (v: unknown): string => (v == null ? "" : String(v));
const textOrNull = (v: unknown): string | null => {
  const s = textOf(v).trim();
  return s ? s : null;
};

/** "two-piece suit" -> "Two-piece suit". */
const upperFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const SWATCH_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

/** The shop behind an enabled slug, with everything its pages show; null when unknown or switched off. */
async function findSite(db: Db, origin: string, slug: string): Promise<Site | null> {
  const rs = await db.execute({ sql: "SELECT * FROM shops WHERE website_slug = ? AND website_enabled = 1", args: [slug] });
  const shop = rs.rows[0];
  if (!shop) return null;
  const shopId = textOf(shop["id"]);

  const [garments, services, reviews, fabrics] = await db.batch(
    [
      {
        // Distinct garments (case and spaces ignored) from delivered orders, most made first.
        sql: `SELECT min(trim(garment)) AS garment, count(*) AS n FROM orders
              WHERE shop_id = ? AND status = 'delivered' AND trim(garment) != ''
              GROUP BY lower(trim(garment))
              ORDER BY n DESC, garment ASC
              LIMIT ?`,
        args: [shopId, GARMENTS_MAX],
      },
      { sql: "SELECT * FROM website_services WHERE shop_id = ? ORDER BY sort ASC, name ASC", args: [shopId] },
      { sql: "SELECT * FROM website_reviews WHERE shop_id = ? ORDER BY sort ASC", args: [shopId] },
      {
        sql: `SELECT name, swatch FROM fabrics
              WHERE shop_id = ? AND swatch IS NOT NULL AND trim(swatch) != '' AND metres_left > 0
              ORDER BY metres_left DESC, name ASC
              LIMIT 4`,
        args: [shopId],
      },
    ],
    "read",
  );
  const pieces = await loadPieces(db, shopId, origin);
  const coverId = textOrNull(shop["website_cover_piece_id"]);
  const cover = coverId ? pieces.find((p) => p.id === coverId) : undefined;
  const tailorKey = textOrNull(shop["website_tailor_photo_key"]);
  const rating = shop["website_rating"] == null ? null : Number(shop["website_rating"]);
  const madeFromOrders = (garments?.rows ?? []).map((row) => upperFirst(textOf(row["garment"]))).filter(Boolean);

  return {
    shopId,
    slug,
    name: textOf(shop["name"]),
    district: textOf(shop["district"]),
    city: textOf(shop["city"]),
    address: textOrNull(shop["address"]),
    phone: textOrNull(shop["phone"]),
    openingHours: textOrNull(shop["opening_hours"]),
    googleReviewUrl: textOrNull(shop["google_review_url"]),
    about: textOrNull(shop["website_about"]),
    lineId: textOrNull(shop["website_line_id"]),
    theme: isTheme(shop["website_theme"]) ? shop["website_theme"] : "atelier",
    headline: textOrNull(shop["website_headline"]),
    aboutHeading: textOrNull(shop["website_about_heading"]),
    includes: readIncludes(shop["website_includes"]) ?? [...DEFAULT_INCLUDES],
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    sections: readSections(shop["website_sections"]),
    coverUrl: cover?.photos[0]?.url ?? null,
    tailorPhotoUrl: tailorKey ? mediaUrl(origin, tailorKey) : null,
    services: (services?.rows ?? []).map(rowToWebsiteService),
    reviews: (reviews?.rows ?? []).map(rowToWebsiteReview),
    pieces,
    fabrics: (fabrics?.rows ?? [])
      .map((row) => ({ name: textOf(row["name"]), swatch: textOf(row["swatch"]).trim() }))
      .filter((f) => SWATCH_RE.test(f.swatch)),
    garments: madeFromOrders.length > 0 ? madeFromOrders : DEFAULT_GARMENTS,
  };
}

/** The workshop photos of the order a piece came from (oldest first), and how long it took when delivered. */
async function pieceOrder(db: Db, origin: string, shopId: string, orderId: string | null) {
  if (!orderId) return { photos: [] as { url: string; stage: string }[], weeks: null as number | null };
  const [order, photos] = await db.batch(
    [
      { sql: "SELECT created_at, delivered_at FROM orders WHERE id = ? AND shop_id = ?", args: [orderId, shopId] },
      { sql: "SELECT media_key, stage FROM order_photos WHERE order_id = ? AND shop_id = ? ORDER BY created_at ASC", args: [orderId, shopId] },
    ],
    "read",
  );
  const row = order?.rows[0];
  let weeks: number | null = null;
  if (row && row["delivered_at"]) {
    const days = (Date.parse(textOf(row["delivered_at"])) - Date.parse(textOf(row["created_at"]))) / 86_400_000;
    if (Number.isFinite(days) && days > 0) weeks = Math.max(1, Math.round(days / 7));
  }
  return {
    photos: (photos?.rows ?? []).map((p) => ({
      url: mediaUrl(origin, textOf(p["media_key"])),
      stage: STAGE_LABELS[textOf(p["stage"]) as OrderStatus] ?? "",
    })),
    weeks,
  };
}

const isPreferred = (v: string): v is ReferralPreferred => (REFERRAL_PREFERRED as readonly string[]).includes(v);

/** The string value of a form field ("" when missing or a file upload). */
function field(body: Record<string, string | File | (string | File)[]>, name: string): string {
  const value = body[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

// ---------- Routes ----------

type Page = (site: Site, c: Context<AppEnv>, db: Db) => Promise<string | null> | string | null;

/** Shared GET handling: 404 page when the site is off / unknown or the page returns null; 5 minutes of cache otherwise. */
async function servePage(c: Context<AppEnv>, page: Page) {
  const slug = normaliseSlug(c.req.param("slug") ?? "");
  const db = createDb(c.env);
  const site = slug ? await findSite(db, publicOrigin(c), slug) : null;
  const html = site ? await page(site, c, db) : null;
  if (!html) {
    c.header("Cache-Control", "no-store");
    return c.html(notFoundPage(site), 404);
  }
  c.header("Cache-Control", "public, max-age=300");
  return c.html(html);
}

websitePublicRoutes.get("/:slug", (c) => servePage(c, (site) => homePage(site, publicOrigin(c))));
websitePublicRoutes.get("/:slug/work", (c) => servePage(c, (site) => workPage(site, publicOrigin(c), c.req.query("c") ?? "")));
websitePublicRoutes.get("/:slug/work/:pieceId", (c) =>
  servePage(c, async (site, _c, db) => {
    const piece = site.pieces.find((p) => p.id === c.req.param("pieceId"));
    if (!piece) return null;
    const order = await pieceOrder(db, publicOrigin(c), site.shopId, piece.orderId);
    return piecePage(site, publicOrigin(c), piece, order);
  }),
);
websitePublicRoutes.get("/:slug/services", (c) => servePage(c, (site) => servicesPage(site, publicOrigin(c))));
websitePublicRoutes.get("/:slug/about", (c) =>
  servePage(c, (site) => {
    const piece = (c.req.query("piece") ?? "").trim().slice(0, PIECE_PARAM_MAX);
    const values = piece ? { ...EMPTY_FORM, message: `I'd like one like "${piece}".` } : EMPTY_FORM;
    return aboutPage(site, publicOrigin(c), values, null);
  }),
);

/**
 * POST /s/:slug and /s/:slug/about (form-encoded) -> the thank-you page once the enquiry is saved; the About page again
 * with an error line when a field is missing. Rate limited per address; a filled honeypot (`website`) is thanked and
 * silently dropped.
 */
async function submitBooking(c: Context<AppEnv>) {
  const db = createDb(c.env);
  const slug = normaliseSlug(c.req.param("slug") ?? "");
  const origin = publicOrigin(c);
  const site = slug ? await findSite(db, origin, slug) : null;
  c.header("Cache-Control", "no-store");
  if (!site) return c.html(notFoundPage(null), 404);

  try {
    await enforceWebsiteRateLimit(c, c.req.header("cf-connecting-ip") ?? "unknown");
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 429) return c.html(noticePage(site, "One moment", err.message), 429);
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
    garment: field(body, "garment"),
    preferred: field(body, "preferred"),
    message: field(body, "message"),
    consent: field(body, "consent") !== "",
  };

  // Bots fill every field, including the hidden one. Thank them and save nothing.
  if (field(body, "website") !== "") return c.html(thankYouPage(site, values.name || "you"));

  let error: string | null = null;
  if (!values.name) error = "Please tell us your name.";
  else if (values.name.length > NAME_MAX) error = `Your name can be at most ${NAME_MAX} characters.`;
  else if (values.contact.length < CONTACT_MIN) error = "Please add a phone number or LINE ID so the shop can reach you.";
  else if (values.contact.length > CONTACT_MAX) error = `The phone number or LINE ID can be at most ${CONTACT_MAX} characters.`;
  else if (values.garment.length > GARMENT_MAX) error = "Please pick what you'd like from the list.";
  else if (values.preferred !== "" && !isPreferred(values.preferred)) error = "Please pick when you'd like to come in.";
  else if (values.message.length > MESSAGE_MAX) error = `Your message can be at most ${MESSAGE_MAX} characters.`;
  else if (!values.consent) error = "Please tick the box so the shop may keep your details to arrange the fitting.";
  if (error) return c.html(aboutPage(site, origin, values, error), 400);

  const now = nowIso();
  await db.execute({
    sql: `INSERT INTO website_enquiries (id, shop_id, name, contact, garment, preferred, message, status, client_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)`,
    args: [newId(), site.shopId, values.name, values.contact, values.garment || null, values.preferred || null, values.message || null, now, now],
  });
  return c.html(thankYouPage(site, values.name));
}

websitePublicRoutes.post("/:slug", submitBooking);
websitePublicRoutes.post("/:slug/about", submitBooking);

export default websitePublicRoutes;

// ---------- Small helpers for the HTML ----------

const whereOf = (site: Pick<Site, "district" | "city">): string => [site.district, site.city].filter(Boolean).join(", ");
const base = (site: Site): string => `/s/${encodeURIComponent(site.slug)}`;
const e = escapeHtml;

/** The About paragraph, or a default sentence built from the shop's name and district. */
function aboutText(site: Site): string {
  if (site.about) return site.about;
  const where = site.district ? ` in ${site.district}` : site.city ? ` in ${site.city}` : "";
  return `${site.name} is a tailoring shop${where}. Suits, jackets, shirts and trousers made to your measurements, with fittings until the fit is right.`;
}

function headlineOf(site: Site): string {
  if (site.headline) return site.headline;
  const where = site.district || site.city;
  return where ? `Made to measure in ${where}` : "Made to measure";
}

/** Up to ~160 characters for the meta description, cut on a word. */
function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 100 ? space : max - 3)}…`;
}

/** Escaped, with line breaks kept (addresses, opening hours, the About paragraph). */
const multiline = (s: string): string => e(s).replace(/\r?\n/g, "<br>");

/** tel: link: digits and a leading "+" only. */
const telHref = (phone: string): string => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/** LINE add-friend link: "@id" is an official account (line.me/ti/p/@id), anything else a personal ID (~id). */
function lineHref(id: string): string {
  const clean = id.trim();
  return clean.startsWith("@") ? `https://line.me/ti/p/${encodeURIComponent(clean)}` : `https://line.me/ti/p/~${encodeURIComponent(clean)}`;
}

const mapsHref = (query: string): string => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
const mapsFor = (site: Site): string =>
  mapsHref([site.name, site.address ? site.address.replace(/\s*\n+\s*/g, ", ") : whereOf(site)].filter(Boolean).join(", "));

/** "from ฿18,000"; "" without a price. Mirrors app/lib/website.ts priceLabel. */
const priceLabel = (price: number | null): string => (price == null ? "" : `from ฿${Math.round(price).toLocaleString("en-US")}`);

/** "October 2026" (UTC). */
function monthLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Where every "Book" button goes: the form when it's on, otherwise a call, LINE, or the About page. */
function bookHref(site: Site, piece?: string): string {
  if (site.sections.booking) return `${base(site)}/about${piece ? `?piece=${encodeURIComponent(piece)}` : ""}#book`;
  if (site.phone) return telHref(site.phone);
  if (site.lineId) return lineHref(site.lineId);
  return `${base(site)}/about`;
}

/** The services' names for the strip and the form; the garments list until services are added. */
const serviceNames = (site: Site): string[] => (site.services.length > 0 ? site.services.map((s) => s.name) : site.garments);

/** "★★★★★" rounded to the owner's rating; "" without one (no invented stars). */
const stars = (rating: number | null): string => (rating == null ? "" : "★".repeat(Math.max(0, Math.min(5, Math.round(rating)))));

/** Opening hours as table rows: "Mon-Sat 10:00-19:00" splits into day and time where it can. */
function hoursRows(hours: string): string {
  return hours
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.+?)[\s:]+((?:\d|closed|by appointment).*)$/i.exec(line);
      return m ? `<tr><th scope="row">${e(m[1] ?? "")}</th><td>${e(m[2] ?? "")}</td></tr>` : `<tr><td colspan="2">${e(line)}</td></tr>`;
    })
    .join("");
}

function pieceCard(site: Site, piece: WebsitePiece, tall = false): string {
  const photo = piece.photos[0];
  return `<a class="piece${tall ? " tall" : ""}" href="${base(site)}/work/${encodeURIComponent(piece.id)}">
    ${photo ? `<img src="${e(photo.url)}" alt="${e(piece.title)}" loading="lazy">` : `<span class="ph" aria-hidden="true"></span>`}
    <span class="pt">${e(piece.title)}</span>
    ${piece.cloth ? `<span class="pc">${e(piece.cloth)}</span>` : ""}
  </a>`;
}

// ---------- Layout ----------

/** Theme colours as CSS variables; the pages only ever use the variables. */
const THEMES: Record<WebsiteTheme, string> = {
  atelier: `--page:#F4EFE6;--card:#FFFFFF;--ink:#14213A;--muted:#4A5263;--line:#DED4C1;--sand:#EAE1CF;--accent:#D1AC66;--accent-ink:#7A5414;
    --hero:#14213A;--hero-ink:#F4EFE6;--hero-shade:linear-gradient(180deg,rgba(20,33,58,.15) 0%,rgba(20,33,58,.55) 45%,rgba(20,33,58,.92) 100%);
    --dark:#14213A;--dark-ink:#F4EFE6;--btn:#D1AC66;--btn-ink:#14213A;--top:#F4EFE6`,
  ivory: `--page:#FBF8F2;--card:#FFFFFF;--ink:#14213A;--muted:#4A5263;--line:#E4DCCB;--sand:#F1EADC;--accent:#B88E45;--accent-ink:#7A5414;
    --hero:#F4EFE6;--hero-ink:#14213A;--hero-shade:linear-gradient(180deg,rgba(244,239,230,.05) 0%,rgba(244,239,230,.6) 50%,rgba(244,239,230,.97) 100%);
    --dark:#14213A;--dark-ink:#F4EFE6;--btn:#14213A;--btn-ink:#F4EFE6;--top:#FBF8F2`,
  noir: `--page:#121212;--card:#1C1C1C;--ink:#F3EEE6;--muted:#B8B1A6;--line:#2F2D2A;--sand:#23211E;--accent:#CDAA6E;--accent-ink:#CDAA6E;
    --hero:#0A0A0A;--hero-ink:#F3EEE6;--hero-shade:linear-gradient(180deg,rgba(10,10,10,.2) 0%,rgba(10,10,10,.6) 45%,rgba(10,10,10,.95) 100%);
    --dark:#050505;--dark-ink:#F3EEE6;--btn:#F3EEE6;--btn-ink:#121212;--top:#121212`,
};

const CSS = `
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--page); color: var(--ink); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  a { color: inherit; }
  img { display: block; max-width: 100%; }
  .serif, h1, h2, h3 { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; font-weight: 600; }
  h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.1; }
  h2 { margin: 0 0 10px; font-size: 26px; line-height: 1.15; }
  h3 { margin: 0; font-size: 20px; line-height: 1.2; }
  p { margin: 0 0 12px; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 0 20px; }
  .top { position: sticky; top: 0; z-index: 5; background: var(--top); border-bottom: 1px solid var(--line); }
  .top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; min-width: 0; }
  .mono { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--dark); color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-size: 17px; font-weight: 700; }
  .brand b { font-size: 15px; letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  nav { display: flex; gap: 14px; font-size: 14px; font-weight: 600; }
  nav a { text-decoration: none; color: var(--muted); padding: 6px 0; }
  nav a.on { color: var(--accent-ink); border-bottom: 2px solid var(--accent); }
  .eyebrow { margin: 0 0 8px; color: var(--accent-ink); font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }
  .muted { color: var(--muted); }
  .lead { color: var(--muted); font-size: 17px; }
  section.block { padding: 30px 0 6px; }
  .row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .row h2 { margin: 0; }
  .more { color: var(--accent-ink); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-bottom: 16px; }
  .sand { background: var(--sand); border-radius: 16px; padding: 18px; margin-bottom: 16px; }
  .navy { background: var(--dark); color: var(--dark-ink); border-radius: 16px; padding: 22px 20px; margin-bottom: 16px; }
  .navy .eyebrow { color: var(--accent); }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 24px; border-radius: 24px; background: var(--btn); color: var(--btn-ink); font-size: 15px; font-weight: 600; text-decoration: none; border: 0; cursor: pointer; font-family: inherit; }
  .btn.ghost { background: transparent; color: inherit; border: 1px solid currentColor; }
  .btn.full { display: flex; width: 100%; }
  .navy .btn { background: var(--accent); color: #14213A; }
  .hero { position: relative; min-height: 470px; display: flex; align-items: flex-end; color: var(--hero-ink); background: var(--hero); overflow: hidden; }
  .hero.woven { background-color: var(--hero); background-image: repeating-linear-gradient(45deg, rgba(209,172,102,.10) 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, rgba(255,255,255,.05) 0 2px, transparent 2px 9px); }
  .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .hero::after { content: ""; position: absolute; inset: 0; background: var(--hero-shade); }
  .hero.woven::after { background: none; }
  .hero .wrap { position: relative; z-index: 1; width: 100%; padding-top: 40px; padding-bottom: 34px; }
  .hero .eyebrow { color: var(--accent); }
  .hero h1 { font-size: 42px; line-height: 1.05; color: var(--hero-ink); max-width: 15ch; }
  .hero .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .strip { background: var(--sand); padding: 14px 0; font-size: 14px; color: var(--muted); }
  .strip .wrap { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .strip span + span::before { content: "·"; margin-right: 10px; color: var(--accent); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .piece { display: block; text-decoration: none; }
  .piece img, .piece .ph { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 12px; background: var(--sand); display: block; }
  .piece.tall img, .piece.tall .ph { aspect-ratio: 3 / 4; }
  .pt { display: block; margin-top: 8px; font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600; font-size: 18px; line-height: 1.2; }
  .pc { display: block; color: var(--muted); font-size: 13px; }
  .stagger { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  .stagger .col { display: grid; gap: 18px; }
  .stagger .col + .col { margin-top: 36px; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .steps li { display: flex; gap: 14px; align-items: flex-start; }
  .num { flex: none; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--accent); color: var(--accent-ink); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .steps b { display: block; }
  .steps span { color: var(--muted); font-size: 14px; }
  blockquote { margin: 0 0 12px; font-family: "Cormorant Garamond", Georgia, serif; font-size: 21px; line-height: 1.35; }
  .stars { color: var(--accent); letter-spacing: 2px; margin-bottom: 8px; }
  .by { font-size: 13px; opacity: .8; margin: 0 0 12px; }
  .navy a.link, a.link { color: var(--accent); font-weight: 600; font-size: 14px; text-decoration: none; }
  .map { display: block; position: relative; height: 150px; border-radius: 14px; margin-bottom: 14px; border: 1px solid var(--line); background-color: var(--sand);
    background-image: linear-gradient(var(--line) 2px, transparent 2px), linear-gradient(90deg, var(--line) 2px, transparent 2px), linear-gradient(35deg, transparent 47%, var(--card) 47%, var(--card) 53%, transparent 53%);
    background-size: 46px 46px, 46px 46px, 100% 100%; }
  .pin { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -22px 0 0 -11px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--accent); border: 3px solid var(--dark); }
  .map em { position: absolute; right: 10px; bottom: 8px; font-style: normal; font-size: 12px; font-weight: 600; background: var(--card); color: var(--ink); padding: 4px 10px; border-radius: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
  .chip { display: inline-block; padding: 7px 14px; border-radius: 18px; border: 1px solid var(--line); background: var(--card); font-size: 14px; text-decoration: none; }
  .chip.on { background: var(--dark); border-color: var(--dark); color: var(--dark-ink); }
  .bigphoto { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: var(--sand); }
  .scroll { display: flex; gap: 10px; overflow-x: auto; padding: 12px 20px 4px; scroll-snap-type: x mandatory; max-width: 640px; margin: 0 auto; }
  .scroll img { flex: none; width: 120px; height: 150px; object-fit: cover; border-radius: 10px; scroll-snap-align: start; background: var(--sand); }
  .scroll figure { margin: 0; flex: none; }
  .scroll figcaption { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .back { display: inline-block; margin: 16px 0 6px; font-size: 14px; color: var(--muted); text-decoration: none; }
  dl.spec { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 10px 18px; }
  dl.spec dt { color: var(--muted); font-size: 14px; }
  dl.spec dd { margin: 0; font-weight: 600; font-size: 15px; }
  .svc { padding: 14px 0; border-top: 1px solid var(--line); }
  .svc:first-child { border-top: 0; padding-top: 0; }
  .svc:last-child { padding-bottom: 0; }
  .svc .top2 { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .price { color: var(--accent-ink); font-weight: 700; font-size: 14px; white-space: nowrap; }
  .svc p { margin: 4px 0 0; color: var(--muted); font-size: 14px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 16px; }
  .sw { width: 74px; text-align: center; font-size: 12px; color: var(--muted); }
  .sw i { display: block; width: 58px; height: 58px; margin: 0 auto 6px; border-radius: 50%; border: 3px solid var(--card); box-shadow: 0 0 0 1px var(--line); }
  ul.ticks { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  ul.ticks li { padding-left: 24px; position: relative; }
  ul.ticks li::before { content: "✓"; position: absolute; left: 0; color: var(--accent-ink); font-weight: 700; }
  .tailor { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 14px; margin-bottom: 14px; background: var(--sand); }
  .rating { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
  .rating b { font-family: "Cormorant Garamond", Georgia, serif; font-size: 44px; line-height: 1; }
  .quote { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 12px; }
  .quote blockquote { font-size: 19px; }
  .quote .by { margin: 0; color: var(--muted); }
  table.hours { width: 100%; border-collapse: collapse; font-size: 15px; }
  table.hours th, table.hours td { text-align: left; padding: 8px 0; border-top: 1px solid var(--line); font-weight: 400; }
  table.hours th { color: var(--muted); padding-right: 12px; }
  table.hours tr:first-child th, table.hours tr:first-child td { border-top: 0; }
  label.field { display: block; margin: 0 0 14px; }
  .label, legend { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 600; padding: 0; }
  input[type=text], textarea { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--ink); font: inherit; }
  textarea { min-height: 96px; resize: vertical; }
  input[type=text]:focus, textarea:focus { outline: none; border-color: var(--accent); }
  fieldset { border: 0; padding: 0; margin: 0 0 14px; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills label { cursor: pointer; }
  .pills input { position: absolute; opacity: 0; width: 0; height: 0; }
  .pills span { display: inline-block; min-height: 38px; padding: 8px 16px; border: 1px solid var(--line); border-radius: 20px; background: var(--card); font-size: 14px; line-height: 20px; }
  .pills input:checked + span { background: var(--dark); border-color: var(--dark); color: var(--dark-ink); }
  .pills input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
  .consent { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 18px; font-size: 14px; color: var(--muted); cursor: pointer; }
  .consent input { margin: 3px 0 0; width: 18px; height: 18px; flex: none; accent-color: var(--accent); }
  .hp { position: absolute; left: -9999px; top: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .error { margin: 0 0 14px; padding: 10px 14px; border-radius: 12px; background: #F3E1DD; color: #8A2E24; font-size: 14px; font-weight: 500; }
  footer { margin-top: 36px; background: var(--dark); color: var(--dark-ink); padding: 30px 0 26px; }
  footer h3 { font-size: 24px; margin-bottom: 10px; }
  footer p { opacity: .85; font-size: 14px; }
  footer .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 20px; }
  footer .btn { min-height: 42px; padding: 9px 18px; font-size: 14px; background: transparent; color: var(--dark-ink); border: 1px solid rgba(244,239,230,.35); }
  footer .btn.line { background: #06C755; border-color: #06C755; color: #fff; }
  footer .made { font-size: 12px; opacity: .6; margin: 0; }
  .tick { width: 56px; height: 56px; margin: 30px auto 16px; border-radius: 50%; background: #E3EBDD; color: #2F4A22; display: flex; align-items: center; justify-content: center; font-size: 28px; }
  .center { text-align: center; }
  @media (min-width: 720px) { .hero { min-height: 560px; } .hero h1 { font-size: 54px; } }
`;

interface Meta {
  title: string;
  description: string;
  url?: string;
  image?: string | null;
  /** Error and thank-you pages are not for search engines. */
  noindex?: boolean;
}

type NavKey = "home" | "work" | "services" | "about" | null;

function topBar(site: Site, active: NavKey): string {
  const initial = Array.from(site.name.trim())[0]?.toUpperCase() ?? "M";
  const link = (key: Exclude<NavKey, null | "home">, label: string) =>
    `<a href="${base(site)}/${key}"${active === key ? ` class="on" aria-current="page"` : ""}>${label}</a>`;
  return `<header class="top"><div class="wrap">
  <a class="brand" href="${base(site)}"><span class="mono" aria-hidden="true">${e(initial)}</span><b>${e(site.name)}</b></a>
  <nav aria-label="Main">${link("work", "Work")}${link("services", "Services")}${link("about", "About")}</nav>
</div></header>`;
}

function footer(site: Site): string {
  const buttons: string[] = [];
  if (site.phone) buttons.push(`<a class="btn" href="${e(telHref(site.phone))}">Call</a>`);
  if (site.lineId) buttons.push(`<a class="btn line" href="${e(lineHref(site.lineId))}" target="_blank" rel="noopener">LINE</a>`);
  if (site.address || site.district) buttons.push(`<a class="btn" href="${e(mapsFor(site))}" target="_blank" rel="noopener">Map</a>`);
  return `<footer><div class="wrap">
  <h3>${e(site.name)}</h3>
  ${site.address ? `<p>${multiline(site.address)}</p>` : whereOf(site) ? `<p>${e(whereOf(site))}</p>` : ""}
  ${site.openingHours ? `<p>${multiline(site.openingHours)}</p>` : ""}
  ${buttons.length > 0 ? `<div class="actions">${buttons.join("")}</div>` : ""}
  <p class="made">Made with Magick Tailor</p>
</div></footer>`;
}

/** Page frame: theme variables, the top bar, the page, the footer. Mobile first. */
function layout(site: Site | null, theme: WebsiteTheme, meta: Meta, active: NavKey, main: string): string {
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${e(meta.title)}">`,
    `<meta property="og:description" content="${e(meta.description)}">`,
    meta.url ? `<meta property="og:url" content="${e(meta.url)}">` : "",
    meta.image ? `<meta property="og:image" content="${e(meta.image)}">` : "",
    meta.url ? `<link rel="canonical" href="${e(meta.url)}">` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${meta.noindex ? `<meta name="robots" content="noindex">\n` : ""}<title>${e(meta.title)}</title>
<meta name="description" content="${e(meta.description)}">
${og}
<style>
  :root { ${THEMES[theme]}; }
${CSS}
</style>
</head>
<body>
${site ? topBar(site, active) : ""}
<main>
${main}
</main>
${site ? footer(site) : `<footer><div class="wrap"><p class="made">Made with Magick Tailor</p></div></footer>`}
</body>
</html>`;
}

const pageUrl = (origin: string, site: Site, path = ""): string => `${origin}${base(site)}${path}`;
const titleOf = (site: Site, page?: string): string => {
  const where = whereOf(site);
  const main = `${site.name} · Bespoke tailoring${where ? ` in ${where}` : ""}`;
  return page ? `${page} · ${main}` : main;
};

// ---------- Pages ----------

/** Home: cover, headline, services strip, selected work, how it works, a review, visit us. */
function homePage(site: Site, origin: string): string {
  const where = whereOf(site);
  const cover = site.coverUrl
    ? `<section class="hero"><img src="${e(site.coverUrl)}" alt="" fetchpriority="high">`
    : `<section class="hero woven">`;
  const hero = `${cover}
  <div class="wrap">
    <p class="eyebrow">Bespoke tailoring${where ? ` · ${e(where)}` : ""}</p>
    <h1>${e(headlineOf(site))}</h1>
    <div class="actions">
      <a class="btn" href="${e(bookHref(site))}">Book a fitting</a>
      <a class="btn ghost" href="${base(site)}/work">See our work</a>
    </div>
  </div>
</section>`;

  const names = serviceNames(site);
  const strip = names.length > 0 ? `<div class="strip"><div class="wrap">${names.map((n) => `<span>${e(n)}</span>`).join("")}</div></div>` : "";

  const selected = site.pieces.slice(0, 4);
  const work =
    selected.length > 0
      ? `<section class="block"><div class="wrap">
  <p class="eyebrow">Selected work</p>
  <div class="row"><h2>From our workshop</h2><a class="more" href="${base(site)}/work">All work →</a></div>
  <div class="grid2">${selected.map((p) => pieceCard(site, p)).join("")}</div>
</div></section>`
      : "";

  const process = site.sections.process
    ? `<section class="block"><div class="wrap"><div class="card">
  <p class="eyebrow">How it works</p>
  <h2>From first visit to collection</h2>
  <ol class="steps">
    <li><span class="num">1</span><div><b>Consultation</b><span>Tell us what you need. Choose the cloth, the cut and the details.</span></div></li>
    <li><span class="num">2</span><div><b>Measurements</b><span>We measure you by hand and keep your measurements on file.</span></div></li>
    <li><span class="num">3</span><div><b>Two fittings</b><span>You try it on while it's made, and we adjust until it fits.</span></div></li>
    <li><span class="num">4</span><div><b>Collection</b><span>Collect your garment, finished and pressed.</span></div></li>
  </ol>
</div></div></section>`
    : "";

  const first = site.reviews[0];
  const reviewsLink = site.googleReviewUrl
    ? `<a class="link" href="${e(site.googleReviewUrl)}" target="_blank" rel="noopener">Read all reviews on Google →</a>`
    : "";
  const quote = first
    ? `<section class="block"><div class="wrap"><div class="navy">
  ${site.rating != null ? `<div class="stars" aria-label="${e(String(site.rating))} out of 5">${stars(site.rating)}</div>` : ""}
  <blockquote>“${e(first.quote)}”</blockquote>
  <p class="by">${e(first.author)} · ${e(first.source)}</p>
  ${reviewsLink}
</div></div></section>`
    : site.googleReviewUrl
      ? `<section class="block"><div class="wrap"><div class="navy"><p class="eyebrow">Reviews</p><p>See what clients say about ${e(site.name)}.</p>${reviewsLink}</div></div></section>`
      : "";

  const visit = `<section class="block"><div class="wrap">
  <p class="eyebrow">Visit us</p>
  <h2>${e(site.district || site.city || site.name)}</h2>
  <a class="map" href="${e(mapsFor(site))}" target="_blank" rel="noopener" aria-label="Open in Google Maps"><span class="pin"></span><em>Open in Google Maps</em></a>
  ${site.address ? `<p>${multiline(site.address)}</p>` : ""}
  ${site.openingHours ? `<p class="muted">${multiline(site.openingHours)}</p>` : ""}
  <a class="btn full" href="${e(bookHref(site))}">Book a fitting</a>
</div></section>`;

  return layout(
    site,
    site.theme,
    { title: titleOf(site), description: clip(aboutText(site)), url: pageUrl(origin, site), image: site.coverUrl },
    "home",
    [hero, strip, work, process, quote, visit].filter(Boolean).join("\n"),
  );
}

const bookCard = (site: Site): string => `<div class="navy">
  <h2>Like something you see?</h2>
  <p>Come in for a fitting and we'll make one for you, cut to your measurements.</p>
  <a class="btn" href="${e(bookHref(site))}">Book a fitting</a>
</div>`;

/** Work: every piece, with filter chips by garment group. */
function workPage(site: Site, origin: string, rawCategory: string): string {
  const counts = new Map<WebsitePieceCategory, number>();
  for (const p of site.pieces) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const category = counts.has(rawCategory as WebsitePieceCategory) ? (rawCategory as WebsitePieceCategory) : null;
  const shown = category ? site.pieces.filter((p) => p.category === category) : site.pieces;

  const chips = [
    `<a class="chip${category ? "" : " on"}" href="${base(site)}/work">All · ${site.pieces.length}</a>`,
    ...(Object.keys(CATEGORY_LABELS) as WebsitePieceCategory[])
      .filter((k) => counts.has(k))
      .map((k) => `<a class="chip${category === k ? " on" : ""}" href="${base(site)}/work?c=${k}">${CATEGORY_LABELS[k]} · ${counts.get(k)}</a>`),
  ];
  const left = shown.filter((_, i) => i % 2 === 0);
  const right = shown.filter((_, i) => i % 2 === 1);
  const grid =
    shown.length > 0
      ? `<div class="stagger"><div class="col">${left.map((p, i) => pieceCard(site, p, i % 2 === 1)).join("")}</div><div class="col">${right
          .map((p, i) => pieceCard(site, p, i % 2 === 0))
          .join("")}</div></div>`
      : `<p class="muted">New work is on its way. Come and see the cloth in the shop in the meantime.</p>`;

  const where = site.district || site.city;
  const main = `<div class="wrap"><section class="block">
  <p class="eyebrow">Portfolio</p>
  <h1>Our work</h1>
  <p class="lead">Every piece here was cut and made in our workshop${where ? ` in ${e(where)}` : ""}.</p>
  ${site.pieces.length > 0 ? `<div class="chips">${chips.join("")}</div>` : ""}
  ${grid}
</section>
<section class="block">${bookCard(site)}</section></div>`;
  return layout(
    site,
    site.theme,
    { title: titleOf(site, "Our work"), description: clip(`Suits, jackets, shirts and more made to measure by ${site.name}.`), url: pageUrl(origin, site, "/work"), image: site.coverUrl },
    "work",
    main,
  );
}

/** One piece: the photos, the spec card, its order's workshop photos and two more pieces. */
function piecePage(site: Site, origin: string, piece: WebsitePiece, order: { photos: { url: string; stage: string }[]; weeks: number | null }): string {
  const [main, ...extra] = piece.photos;
  const photos = `${main ? `<img class="bigphoto" src="${e(main.url)}" alt="${e(piece.title)}">` : ""}
${extra.length > 0 ? `<div class="scroll">${extra.map((p) => `<img src="${e(p.url)}" alt="${e(piece.title)}" loading="lazy">`).join("")}</div>` : ""}`;

  const spec: [string, string][] = [];
  const garment = CATEGORY_SINGULAR[piece.category];
  if (garment) spec.push(["Garment", garment]);
  if (piece.cloth) spec.push(["Cloth", piece.cloth]);
  if (piece.style) spec.push(["Style", piece.style]);
  const made = monthLabel(piece.madeAt);
  if (made) spec.push(["Made", made]);
  if (order.weeks != null) spec.push(["Time to make", `About ${order.weeks} ${order.weeks === 1 ? "week" : "weeks"}`]);

  const process =
    order.photos.length > 0
      ? `<section class="block"><p class="eyebrow">From cloth to collection</p>
  <div class="scroll" style="padding-left:0;padding-right:0">${order.photos
    .map((p) => `<figure><img src="${e(p.url)}" alt="${e(p.stage)}" loading="lazy"><figcaption>${e(p.stage)}</figcaption></figure>`)
    .join("")}</div></section>`
      : "";

  const others = site.pieces.filter((p) => p.id !== piece.id).slice(0, 2);
  const more =
    others.length > 0
      ? `<section class="block"><div class="row"><h2>More work</h2><a class="more" href="${base(site)}/work">All work →</a></div>
  <div class="grid2">${others.map((p) => pieceCard(site, p)).join("")}</div></section>`
      : "";

  const body = `${photos}
<div class="wrap">
  <a class="back" href="${base(site)}/work">← All work</a>
  <p class="eyebrow">${e(CATEGORY_LABELS[piece.category])}</p>
  <h1>${e(piece.title)}</h1>
  ${piece.line ? `<p class="lead">${multiline(piece.line)}</p>` : ""}
  ${spec.length > 0 ? `<div class="card"><dl class="spec">${spec.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl></div>` : ""}
  ${process}
  <p style="margin-top:18px"><a class="btn full" href="${e(bookHref(site, piece.title))}">Book one like this</a></p>
  ${more}
</div>`;
  const description = clip(piece.line ?? `${piece.title}${piece.cloth ? ` in ${piece.cloth}` : ""}, made to measure by ${site.name}.`);
  return layout(
    site,
    site.theme,
    { title: titleOf(site, piece.title), description, url: pageUrl(origin, site, `/work/${encodeURIComponent(piece.id)}`), image: main?.url ?? site.coverUrl },
    "work",
    body,
  );
}

/** Services: the list with "from" prices, cloth in the shop, what every garment includes. */
function servicesPage(site: Site, origin: string): string {
  const list =
    site.services.length > 0
      ? site.services
          .map(
            (s) => `<div class="svc"><div class="top2"><h3>${e(s.name)}</h3>${s.fromPrice != null ? `<span class="price">${e(priceLabel(s.fromPrice))}</span>` : ""}</div>
    ${s.line ? `<p>${e(s.line)}</p>` : ""}</div>`,
          )
          .join("")
      : site.garments.map((g) => `<div class="svc"><div class="top2"><h3>${e(g)}</h3></div></div>`).join("");
  const anyPrice = site.services.some((s) => s.fromPrice != null);

  const fabrics =
    site.sections.fabrics && site.fabrics.length > 0
      ? `<section class="block"><p class="eyebrow">Cloth in the shop now</p>
  <div class="swatches">${site.fabrics.map((f) => `<div class="sw"><i style="background:${f.swatch}"></i>${e(f.name)}</div>`).join("")}</div>
  <p class="muted" style="margin-top:12px;font-size:14px">Come in to see and feel the full range.</p></section>`
      : "";

  const main = `<div class="wrap"><section class="block">
  <p class="eyebrow">Services</p>
  <h1>What we make</h1>
  <p class="lead">${anyPrice ? "Prices start here. The final price depends on the cloth and the details you choose." : "Made to your measurements. Ask us for a price for the cloth and details you choose."}</p>
  <div class="card">${list}</div>
</section>
${fabrics}
<section class="block"><div class="sand">
  <p class="eyebrow">Every garment includes</p>
  <ul class="ticks">${site.includes.map((l) => `<li>${e(l)}</li>`).join("")}</ul>
</div>
<a class="btn full" href="${e(bookHref(site))}">Book a fitting</a></section></div>`;
  return layout(
    site,
    site.theme,
    {
      title: titleOf(site, "Services and prices"),
      description: clip(`${serviceNames(site).join(", ")}. Made to measure by ${site.name}.`),
      url: pageUrl(origin, site, "/services"),
      image: site.coverUrl,
    },
    "services",
    main,
  );
}

/** About: heading, tailor photo and story, reviews, the booking form (#book), opening hours. */
function aboutPage(site: Site, origin: string, values: FormValues, error: string | null): string {
  const heading = site.aboutHeading ?? `About ${site.name}`;
  const story = `<section class="block">
  <p class="eyebrow">About the shop</p>
  <h1>${e(heading)}</h1>
  ${site.tailorPhotoUrl ? `<img class="tailor" src="${e(site.tailorPhotoUrl)}" alt="At work in ${e(site.name)}" loading="lazy">` : ""}
  <p class="lead">${multiline(aboutText(site))}</p>
</section>`;

  const reviewsLink = site.googleReviewUrl
    ? `<a class="link" href="${e(site.googleReviewUrl)}" target="_blank" rel="noopener">Read all reviews on Google →</a>`
    : "";
  const reviews =
    site.reviews.length > 0 || site.rating != null || site.googleReviewUrl
      ? `<section class="block">
  <p class="eyebrow">Reviews</p>
  ${site.rating != null ? `<div class="rating"><b>${e(site.rating.toFixed(1))}</b><span><span class="stars">${stars(site.rating)}</span><br><span class="muted">on Google</span></span></div>` : ""}
  ${site.reviews.map((r) => `<div class="quote"><blockquote>“${e(r.quote)}”</blockquote><p class="by">${e(r.author)} · ${e(r.source)}</p></div>`).join("")}
  ${reviewsLink}
</section>`
      : "";

  const form = site.sections.booking ? bookingForm(site, values, error) : "";

  const hours = site.openingHours
    ? `<section class="block"><p class="eyebrow">Opening hours</p><div class="card"><table class="hours">${hoursRows(site.openingHours)}</table></div></section>`
    : "";

  return layout(
    site,
    site.theme,
    { title: titleOf(site, heading), description: clip(aboutText(site)), url: pageUrl(origin, site, "/about"), image: site.coverUrl },
    "about",
    `<div class="wrap">${[story, reviews, form, hours].filter(Boolean).join("\n")}</div>`,
  );
}

function bookingForm(site: Site, values: FormValues, error: string | null): string {
  const choices = [...serviceNames(site), "Not sure"];
  const pills = choices
    .map(
      (g) => `<label><input type="radio" name="garment" value="${e(g)}"${values.garment === g ? " checked" : ""}><span>${e(g)}</span></label>`,
    )
    .join("\n      ");
  return `<section class="block" id="book"><div class="card">
  <h2>Book a fitting</h2>
  <p class="muted">Leave your details and ${e(site.name)} will get in touch to confirm a day and time.</p>
  ${error ? `<p class="error" role="alert">${e(error)}</p>` : ""}
  <form method="post" action="${base(site)}/about#book" novalidate>
    <label class="field"><span class="label">Your name</span>
      <input type="text" name="name" value="${e(values.name)}" maxlength="${NAME_MAX}" autocomplete="name" required></label>
    <label class="field"><span class="label">Phone or LINE ID</span>
      <input type="text" name="contact" value="${e(values.contact)}" maxlength="${CONTACT_MAX}" autocomplete="tel" inputmode="text" required></label>
    <fieldset>
      <legend>What would you like?</legend>
      <div class="pills">
      ${pills}
      </div>
    </fieldset>
    <label class="field"><span class="label">Message (optional)</span>
      <textarea name="message" maxlength="${MESSAGE_MAX}" rows="3">${e(values.message)}</textarea></label>
    <label class="consent"><input type="checkbox" name="consent" value="yes"${values.consent ? " checked" : ""} required>
      <span>${e(site.name)} may keep my details to arrange my fitting.</span></label>
    <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn full" type="submit">Request a fitting</button>
  </form>
</div></section>`;
}

/** After a saved request (and, identically, after a honeypot hit). */
function thankYouPage(site: Site, name: string): string {
  const main = `<div class="wrap center"><div class="tick" aria-hidden="true">&#10003;</div>
<h1>Thank you, ${e(name.replace(/[.!]+$/, ""))}.</h1>
<p class="lead">${e(site.name)} will message you to confirm a time for your fitting.</p>
<p><a class="btn" href="${base(site)}">Back to ${e(site.name)}</a></p></div>`;
  return layout(site, site.theme, { title: `Thank you - ${site.name}`, description: `Your fitting request was sent to ${site.name}.`, noindex: true }, null, main);
}

/** A short message page in the shop's frame (used for the rate limit). */
function noticePage(site: Site, title: string, message: string): string {
  const main = `<div class="wrap"><section class="block"><h1>${e(title)}</h1>
<p class="lead">${e(message)}</p>
<p><a class="btn" href="${base(site)}">Back to ${e(site.name)}</a></p></section></div>`;
  return layout(site, site.theme, { title: `${title} - ${site.name}`, description: message, noindex: true }, null, main);
}

/** Unknown slug, the shop has switched its website off, or (with the shop's frame) an unknown piece. */
function notFoundPage(site: Site | null): string {
  const main = site
    ? `<div class="wrap"><section class="block"><h1>This page isn't here.</h1>
<p class="lead">The piece may have been taken down. Have a look at the rest of our work.</p>
<p><a class="btn" href="${base(site)}/work">See our work</a></p></section></div>`
    : `<div class="wrap"><section class="block"><p class="eyebrow">Magick Tailor</p><h1>This page isn't available.</h1>
<p class="lead">The address may be mistyped, or the shop has taken its page down for now. Check the link with the shop.</p></section></div>`;
  return layout(site, site?.theme ?? "atelier", { title: "Page not found", description: "This page isn't available.", noindex: true }, null, main);
}
