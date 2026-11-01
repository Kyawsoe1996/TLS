import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AddWebsiteEnquiryResponse,
  type ListWebsiteEnquiriesResponse,
  type SetWebsiteEnquiryStatusRequest,
  type Shop,
  type UpdateWebsiteRequest,
  WEBSITE_LIMITS,
  WEBSITE_THEMES,
  type WebsiteEnquiry,
  type WebsiteEnquiryResponse,
  type WebsiteResponse,
} from "../../../shared/types";
import type { Row } from "@libsql/client/web";
import { type Db, countOf, getClientRow, getWebsiteEnquiryRow, newId, nowIso, rowToClient, rowToShop, rowToWebsiteEnquiry } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound, serverError } from "../errors";
import { mediaUrl, publicOrigin } from "../media";
import { type AssertAccepts, oneOf, optionalText, parseBody } from "../validate";
import { isTheme, readIncludes, readSections, rowToWebsiteReview, rowToWebsiteService } from "../websiteData";
import { splitContact } from "./referrals";

// Free website, signed-in side (mounted at /website, needs a shop): GET / and PUT / for the settings screen,
// GET /enquiries, GET /enquiries/:id, POST /enquiries/:id/add, POST /enquiries/:id/status. The portfolio, services,
// reviews and tailor photo routes are in websiteContent.ts, also mounted at /website (index.ts).
// The public page itself (GET/POST /s/:slug) lives in websitePublic.ts. See shared/types.ts "Free website".

// ---------- The address part ("slug"), kept in step with app/lib/website.ts ----------

/** 3-40 of a-z, 0-9 and "-", starting and ending with a letter or digit. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
/** Words that look like app or system paths; refused as a slug (and skipped when one is made from the name). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "app", "s", "r", "www", "media", "privacy", "support", "health", "help", "login", "signin", "signup",
  "account", "settings", "static", "assets", "magick", "magicktailor", "shop-admin",
]);
const SLUG_ATTEMPTS = 20;

/**
 * The shop name lower-cased, every run of characters outside a-z / 0-9 turned into one "-", dashes trimmed from both
 * ends, at most 40 characters; "shop" when nothing is left (e.g. a name in Thai script). Mirrors app/lib/website.ts.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WEBSITE_LIMITS.slugMax)
    .replace(/-+$/g, "");
  return slug || "shop";
}

/** True when `slug` matches SLUG_RE and isn't reserved. */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** "<base>-<n>", with the base shortened so the whole stays within 40 characters. */
function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, WEBSITE_LIMITS.slugMax - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

/** The first candidate made from the name: padded to 3 characters ("ab" -> "ab-shop") and never a reserved word. */
function baseSlug(name: string): string {
  let base = slugify(name);
  if (base.length < 3) base = `${base}-shop`;
  if (RESERVED_SLUGS.has(base)) base = `${base}-shop`;
  return base;
}

export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) || /UNIQUE constraint failed/i.test(err.message);
}

/**
 * The shop's slug, made on first use from its name: "<name>", then "<name>-2", "-3"… up to 20 tries while the UNIQUE
 * index refuses one. The UPDATE only fills a NULL slug, so two parallel first calls both end up with the one that won.
 */
async function ensureSlug(db: Db, shop: Shop): Promise<string> {
  if (shop.websiteSlug) return shop.websiteSlug;
  const base = baseSlug(shop.name);
  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 1 ? base : withSuffix(base, attempt);
    try {
      const rs = await db.execute({
        sql: "UPDATE shops SET website_slug = ? WHERE id = ? AND website_slug IS NULL",
        args: [slug, shop.id],
      });
      if (rs.rowsAffected > 0) return slug;
      const again = await db.execute({ sql: "SELECT website_slug FROM shops WHERE id = ?", args: [shop.id] });
      const theirs = again.rows[0]?.["website_slug"];
      if (typeof theirs === "string" && theirs) return theirs;
      throw serverError("Couldn't make the website address. Please try again.");
    } catch (err) {
      if (isUniqueViolation(err) && attempt < SLUG_ATTEMPTS) continue;
      if (isUniqueViolation(err)) break;
      throw err;
    }
  }
  throw serverError("Couldn't make the website address. Please choose one yourself.");
}

// ---------- Shared ----------

/** The shop details the public page would like to show but the shop hasn't added (WebsiteResponse.missing). */
export function missingDetails(shop: Pick<Shop, "openingHours" | "address" | "phone" | "googleReviewUrl">): string[] {
  const missing: string[] = [];
  if (!shop.openingHours?.trim()) missing.push("opening hours");
  if (!shop.address?.trim()) missing.push("address");
  if (!shop.phone?.trim()) missing.push("phone");
  if (!shop.googleReviewUrl?.trim()) missing.push("Google review link");
  return missing;
}

/** The shop row (the website columns aren't all on Shop) and the Shop shape. */
async function loadShopRow(db: Db, shopId: string): Promise<{ row: Row; shop: Shop }> {
  const rs = await db.execute({ sql: "SELECT * FROM shops WHERE id = ?", args: [shopId] });
  const row = rs.rows[0];
  if (!row) throw notFound("Shop not found.");
  return { row, shop: rowToShop(row) };
}

/** Everything the settings screen shows, from the shop row plus one batch of counts and lists. */
export async function websiteResponse(c: Context<AppEnv>, shopId: string): Promise<WebsiteResponse> {
  const db = c.get("db");
  const origin = publicOrigin(c);
  const { row, shop } = await loadShopRow(db, shopId);
  const slug = shop.websiteSlug ?? (await ensureSlug(db, shop));
  const coverPieceId = typeof row["website_cover_piece_id"] === "string" ? row["website_cover_piece_id"] : null;
  const [fresh, total, services, reviews, pieces, fabrics, cover] = await db.batch(
    [
      { sql: "SELECT count(*) AS n FROM website_enquiries WHERE shop_id = ? AND status = 'new'", args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM website_enquiries WHERE shop_id = ?", args: [shop.id] },
      { sql: "SELECT * FROM website_services WHERE shop_id = ? ORDER BY sort ASC, name ASC", args: [shop.id] },
      { sql: "SELECT * FROM website_reviews WHERE shop_id = ? ORDER BY sort ASC", args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM website_pieces WHERE shop_id = ?", args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM fabrics WHERE shop_id = ? AND swatch IS NOT NULL AND trim(swatch) != ''", args: [shop.id] },
      {
        sql: "SELECT media_key FROM website_piece_photos WHERE shop_id = ? AND piece_id = ? ORDER BY sort ASC, created_at ASC LIMIT 1",
        args: [shop.id, coverPieceId ?? ""],
      },
    ],
    "read",
  );
  const coverKey = cover?.rows[0]?.["media_key"];
  const tailorKey = row["website_tailor_photo_key"];
  const rating = row["website_rating"] == null ? null : Number(row["website_rating"]);
  return {
    enabled: shop.websiteEnabled,
    slug,
    url: `${origin}/s/${slug}`,
    about: shop.websiteAbout,
    lineId: shop.websiteLineId,
    enquiriesNew: countOf(fresh),
    enquiriesTotal: countOf(total),
    missing: missingDetails(shop),
    theme: isTheme(row["website_theme"]) ? row["website_theme"] : "atelier",
    headline: typeof row["website_headline"] === "string" && row["website_headline"] ? row["website_headline"] : null,
    aboutHeading: typeof row["website_about_heading"] === "string" && row["website_about_heading"] ? row["website_about_heading"] : null,
    includes: readIncludes(row["website_includes"]),
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    coverPieceId,
    coverUrl: typeof coverKey === "string" ? mediaUrl(origin, coverKey) : null,
    tailorPhotoUrl: typeof tailorKey === "string" && tailorKey ? mediaUrl(origin, tailorKey) : null,
    sections: readSections(row["website_sections"]),
    services: (services?.rows ?? []).map(rowToWebsiteService),
    reviews: (reviews?.rows ?? []).map(rowToWebsiteReview),
    piecesCount: countOf(pieces),
    fabricsCount: countOf(fabrics),
  };
}

async function enquiryOr404(db: Db, shopId: string, id: string): Promise<WebsiteEnquiry> {
  const row = await getWebsiteEnquiryRow(db, shopId, id);
  if (!row) throw notFound("Enquiry not found.");
  return rowToWebsiteEnquiry(row);
}

// ---------- Routes ----------

const updateWebsiteSchema = z.object({
  enabled: z.boolean({ error: "must be true or false" }).optional(),
  slug: z
    .string({ error: "must be text" })
    .trim()
    .toLowerCase()
    .optional()
    .refine((v) => v === undefined || SLUG_RE.test(v), "must be 3-40 letters, digits or dashes, starting and ending with a letter or digit"),
  about: optionalText(WEBSITE_LIMITS.aboutMax),
  lineId: optionalText(WEBSITE_LIMITS.lineIdMax).refine((v) => !v || !/\s/.test(v), "must not contain spaces"),
  theme: oneOf(WEBSITE_THEMES).optional(),
  headline: optionalText(WEBSITE_LIMITS.headlineMax),
  aboutHeading: optionalText(WEBSITE_LIMITS.aboutHeadingMax),
  includes: z
    .array(z.string({ error: "must be text" }).trim().max(WEBSITE_LIMITS.includeMax, `each line at most ${WEBSITE_LIMITS.includeMax} characters`))
    .max(WEBSITE_LIMITS.includesMax, `at most ${WEBSITE_LIMITS.includesMax} lines`)
    .nullable()
    .optional(),
  rating: z.number({ error: "must be a number" }).min(1, "must be 1 to 5").max(5, "must be 1 to 5").nullable().optional(),
  coverPieceId: z.string({ error: "must be text" }).max(64).nullable().optional(),
  sections: z
    .object({ fabrics: z.boolean().optional(), process: z.boolean().optional(), booking: z.boolean().optional() })
    .optional(),
});
type _UpdateAccepted = AssertAccepts<typeof updateWebsiteSchema, UpdateWebsiteRequest>;

const statusSchema = z.object({ status: z.enum(["contacted", "dismissed", "new"], { error: "must be one of: contacted, dismissed, new" }) });
type _StatusAccepted = AssertAccepts<typeof statusSchema, SetWebsiteEnquiryStatusRequest>;

const websiteRoutes = new Hono<AppEnv>();

/** GET /website -> the settings screen (slug made from the shop name on first call). */
websiteRoutes.get("/", async (c) => {
  const shop = c.get("shop");
  await ensureSlug(c.get("db"), shop);
  return c.json(await websiteResponse(c, shop.id));
});

/**
 * PUT /website { enabled?, slug?, about?, lineId?, theme?, headline?, aboutHeading?, includes?, rating?, coverPieceId?,
 * sections? } -> WebsiteResponse. 400 for a reserved or taken slug, or a cover that isn't one of the shop's pieces.
 */
websiteRoutes.put("/", async (c) => {
  const db = c.get("db");
  const input = await parseBody(c, updateWebsiteSchema);
  const current = await ensureSlug(db, c.get("shop"));
  const { row, shop } = await loadShopRow(db, c.get("shop").id);

  if (input.slug !== undefined && input.slug !== current && RESERVED_SLUGS.has(input.slug)) {
    throw badRequest("That address is reserved. Please choose another one.");
  }
  if (input.coverPieceId) {
    const piece = await db.execute({ sql: "SELECT id FROM website_pieces WHERE id = ? AND shop_id = ?", args: [input.coverPieceId, shop.id] });
    if (!piece.rows[0]) throw badRequest("Pick the cover from your portfolio.");
  }

  const keep = <T>(value: T | undefined, column: string): T | unknown => (value === undefined ? row[column] ?? null : value);
  let includes: unknown = row["website_includes"] ?? null;
  if (input.includes !== undefined) {
    const lines = (input.includes ?? []).filter((l) => l !== "");
    includes = lines.length > 0 ? JSON.stringify(lines) : null;
  }
  const sections = input.sections === undefined ? row["website_sections"] ?? null : JSON.stringify({ ...readSections(row["website_sections"]), ...input.sections });
  const rating = input.rating === undefined ? row["website_rating"] ?? null : input.rating === null ? null : Math.round(input.rating * 10) / 10;

  try {
    await db.execute({
      sql: `UPDATE shops SET website_slug = ?, website_enabled = ?, website_about = ?, website_line_id = ?, website_theme = ?,
              website_headline = ?, website_about_heading = ?, website_includes = ?, website_rating = ?,
              website_cover_piece_id = ?, website_sections = ?
            WHERE id = ?`,
      args: [
        input.slug ?? current,
        (input.enabled ?? shop.websiteEnabled) ? 1 : 0,
        input.about === undefined ? shop.websiteAbout : input.about,
        input.lineId === undefined ? shop.websiteLineId : input.lineId,
        input.theme ?? (isTheme(row["website_theme"]) ? row["website_theme"] : "atelier"),
        keep(input.headline, "website_headline") as string | null,
        keep(input.aboutHeading, "website_about_heading") as string | null,
        includes as string | null,
        rating as number | null,
        keep(input.coverPieceId, "website_cover_piece_id") as string | null,
        sections as string | null,
        shop.id,
      ],
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw badRequest("That address is taken.");
    throw err;
  }

  return c.json(await websiteResponse(c, shop.id));
});

/** GET /website/enquiries -> new first, then the rest; newest first; up to 100. */
websiteRoutes.get("/enquiries", async (c) => {
  const rs = await c.get("db").execute({
    sql: `SELECT * FROM website_enquiries WHERE shop_id = ?
          ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC
          LIMIT 100`,
    args: [c.get("shop").id],
  });
  const body: ListWebsiteEnquiriesResponse = { enquiries: rs.rows.map((row) => rowToWebsiteEnquiry(row)) };
  return c.json(body);
});

/** GET /website/enquiries/:id -> { enquiry } */
websiteRoutes.get("/enquiries/:id", async (c) => {
  const body: WebsiteEnquiryResponse = { enquiry: await enquiryOr404(c.get("db"), c.get("shop").id, c.req.param("id")) };
  return c.json(body);
});

/** The client's notes from what the visitor wrote: the garment they asked about and their message. */
export function enquiryNotes(enquiry: Pick<WebsiteEnquiry, "garment" | "message">): string {
  const lines = [enquiry.garment ? `Asked on the website about: ${enquiry.garment}` : "Asked for a fitting on the website"];
  if (enquiry.message) lines.push(`Message: ${enquiry.message}`);
  return lines.join("\n").slice(0, 2000);
}

/**
 * POST /website/enquiries/:id/add -> 201 { enquiry, client }
 * Makes a client from the enquiry (name as given, the contact as phone or LINE ID, notes from the garment and the
 * message) and marks the enquiry added. 400 once already added.
 */
websiteRoutes.post("/enquiries/:id/add", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const enquiry = await enquiryOr404(db, shop.id, id);
  if (enquiry.status === "added") throw badRequest("This enquiry is already a client.");

  const clientId = newId();
  const now = nowIso();
  const { phone, lineId } = splitContact(enquiry.contact);
  await db.batch(
    [
      {
        sql: `INSERT INTO clients (id, shop_id, name, phone, email, line_id, notes, last_order_at, referred_by_client_id, created_at)
              VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)`,
        args: [clientId, shop.id, enquiry.name, phone, lineId, enquiryNotes(enquiry), now],
      },
      {
        sql: "UPDATE website_enquiries SET status = 'added', client_id = ?, updated_at = ? WHERE id = ? AND shop_id = ?",
        args: [clientId, now, id, shop.id],
      },
    ],
    "write",
  );

  const [enquiryRow, clientRow] = await Promise.all([getWebsiteEnquiryRow(db, shop.id, id), getClientRow(db, shop.id, clientId)]);
  if (!enquiryRow || !clientRow) throw serverError("Couldn't add the client. Please try again.");
  const body: AddWebsiteEnquiryResponse = { enquiry: rowToWebsiteEnquiry(enquiryRow), client: rowToClient(clientRow) };
  return c.json(body, 201);
});

/** POST /website/enquiries/:id/status { status: contacted | dismissed | new } -> { enquiry }. 400 once added. */
websiteRoutes.post("/enquiries/:id/status", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const { status } = await parseBody(c, statusSchema);

  const enquiry = await enquiryOr404(db, shop.id, id);
  if (enquiry.status === "added") throw badRequest("This enquiry is already a client.");

  await db.execute({
    sql: "UPDATE website_enquiries SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ?",
    args: [status, nowIso(), id, shop.id],
  });
  const body: WebsiteEnquiryResponse = { enquiry: await enquiryOr404(db, shop.id, id) };
  return c.json(body);
});

export default websiteRoutes;
