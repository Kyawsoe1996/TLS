import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type CreateWebsitePieceRequest,
  type CreateWebsiteReviewRequest,
  type CreateWebsiteServiceRequest,
  ORDER_PHOTO_LIMITS,
  ORDER_STATUSES,
  type OrderStatus,
  type PortfolioOrderCandidate,
  type PortfolioPostCandidate,
  type UpdateWebsitePieceRequest,
  type UpdateWebsiteReviewRequest,
  type UpdateWebsiteServiceRequest,
  WEBSITE_LIMITS,
  WEBSITE_PIECE_CATEGORIES,
  type WebsitePiece,
  type WebsitePieceResponse,
  type WebsitePortfolioResponse,
  type WebsiteReorderRequest,
  type WebsiteReviewResponse,
  type WebsiteServiceResponse,
  type WebsiteServicesResponse,
} from "../../../shared/types";
import { type Db, countOf, newId, nowIso, unusedMediaKeys } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import {
  declaredLength,
  deleteMediaObject,
  deleteMediaObjects,
  mediaStore,
  MediaTooLarge,
  mediaUrl,
  newWebsitePhotoKey,
  normalizeContentType,
  numberHeader,
  publicOrigin,
  requireMediaStore,
  storeUpload,
} from "../media";
import { type AssertAccepts, baht, isoDate, oneOf, optionalText, parseBody, requiredText } from "../validate";
import { categoryFromGarment, DEFAULT_SERVICES, loadPieces, rowToWebsiteReview, rowToWebsiteService } from "../websiteData";
import { websiteResponse } from "./website";

// Portfolio website content, signed-in (mounted at /website next to website.ts, needs a shop):
//   GET /portfolio; POST /pieces; PATCH|DELETE /pieces/:id; POST /pieces/reorder;
//   PUT /pieces/:id/photos (raw image body); DELETE /pieces/:id/photos/:photoId;
//   POST /services, /services/defaults, /services/reorder; PATCH|DELETE /services/:id;
//   POST /reviews, /reviews/reorder; PATCH|DELETE /reviews/:id; PUT|DELETE /tailor-photo.
// A piece made from an order or a post shares that photo's file (same media key); a file is only deleted once
// nothing points at it any more (db.ts unusedMediaKeys). No client name is ever copied onto a piece.

const websiteContentRoutes = new Hono<AppEnv>();

const PHOTO_MB = Math.round(ORDER_PHOTO_LIMITS.bytes / (1024 * 1024));
const ORDER_CANDIDATES_MAX = 60;
const POST_CANDIDATES_MAX = 40;

const isPhotoType = (v: string): boolean => (ORDER_PHOTO_LIMITS.types as readonly string[]).includes(v);
const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
const upperFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------- Shared helpers ----------

async function pieceOr404(c: Context<AppEnv>, pieceId: string): Promise<WebsitePiece> {
  const [piece] = await loadPieces(c.get("db"), c.get("shop").id, publicOrigin(c), pieceId);
  if (!piece) throw notFound("Piece not found.");
  return piece;
}

/** The next sort value at the end of a list. */
async function nextSort(db: Db, table: "website_pieces" | "website_services" | "website_reviews", shopId: string): Promise<number> {
  const rs = await db.execute({ sql: `SELECT coalesce(max(sort), -1) + 1 AS n FROM ${table} WHERE shop_id = ?`, args: [shopId] });
  return countOf(rs);
}

const reorderSchema = z.object({
  ids: z.array(z.string({ error: "must be text" }).max(64)).max(200, "at most 200 ids"),
}) satisfies z.ZodType<WebsiteReorderRequest, unknown>;

/** Puts the sent ids first, in that order; the rest keep their order after them. Unknown ids are ignored. */
async function reorder(db: Db, table: "website_pieces" | "website_services" | "website_reviews", shopId: string, ids: string[]): Promise<void> {
  const rs = await db.execute({ sql: `SELECT id FROM ${table} WHERE shop_id = ? ORDER BY sort ASC, rowid ASC`, args: [shopId] });
  const existing = rs.rows.map((row) => String(row["id"]));
  const known = new Set(existing);
  const first = [...new Set(ids)].filter((id) => known.has(id));
  const placed = new Set(first);
  const order = [...first, ...existing.filter((id) => !placed.has(id))];
  if (order.length === 0) return;
  await db.batch(
    order.map((id, index) => ({ sql: `UPDATE ${table} SET sort = ? WHERE id = ? AND shop_id = ?`, args: [index, id, shopId] })),
    "write",
  );
}

/** Reads a raw image upload (same rules as order photos) into the bucket under the website folder. */
async function receivePhoto(c: Context<AppEnv>, folder: string) {
  const shop = c.get("shop");
  const store = requireMediaStore(c.env);
  const contentType = normalizeContentType(c.req.header("Content-Type"));
  if (!isPhotoType(contentType)) throw badRequest("Use a JPEG, PNG or WebP photo.");
  const width = numberHeader(c.req.header("X-Media-Width"), "X-Media-Width");
  const height = numberHeader(c.req.header("X-Media-Height"), "X-Media-Height");

  const limit = ORDER_PHOTO_LIMITS.bytes;
  const declared = declaredLength(c);
  if (declared != null && declared > limit) throw payloadTooLarge(`Photos up to ${PHOTO_MB} MB.`);
  const raw = c.req.raw.body;
  if (!raw) throw badRequest("Send the photo as the request body.");

  const key = newWebsitePhotoKey(shop.id, folder, contentType);
  let stored: { size: number };
  try {
    stored = await storeUpload(store, key, raw, declared, limit, { contentType, metadata: { shopId: shop.id, website: folder } });
  } catch (err) {
    if (err instanceof MediaTooLarge) throw payloadTooLarge(`Photos up to ${PHOTO_MB} MB.`);
    console.warn(`[website] photo upload (${folder}) failed:`, err instanceof Error ? err.message : err);
    throw badRequest("The upload didn't complete. Please try again.");
  }
  if (stored.size === 0) {
    await deleteMediaObject(mediaStore(c.env), key);
    throw badRequest("The file is empty.");
  }
  return { key, width: width == null ? null : Math.round(width), height: height == null ? null : Math.round(height) };
}

/** When the shop has no cover (or the cover piece went away), the first piece that has a photo becomes it. */
async function ensureCover(db: Db, shopId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE shops SET website_cover_piece_id = (
            SELECT p.id FROM website_pieces p
            WHERE p.shop_id = ? AND EXISTS (SELECT 1 FROM website_piece_photos f WHERE f.piece_id = p.id)
            ORDER BY p.sort ASC, p.created_at ASC LIMIT 1)
          WHERE id = ? AND (website_cover_piece_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM website_pieces p WHERE p.id = shops.website_cover_piece_id AND p.shop_id = shops.id))`,
    args: [shopId, shopId],
  });
}

// ---------- Portfolio ----------

/** GET /website/portfolio -> { pieces, coverPieceId, candidates: { orders, posts } } */
websiteContentRoutes.get("/portfolio", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const origin = publicOrigin(c);

  const pieces = await loadPieces(db, shop.id, origin);
  const [shopRow, orders, photos, posts, postPieces] = await db.batch(
    [
      { sql: "SELECT website_cover_piece_id FROM shops WHERE id = ?", args: [shop.id] },
      {
        // Orders with at least one photo, newest first. No client name: only the garment, cloth and month.
        sql: `SELECT o.id, o.garment, o.fabric, o.created_at, o.delivered_at FROM orders o
              WHERE o.shop_id = ? AND EXISTS (SELECT 1 FROM order_photos p WHERE p.order_id = o.id AND p.shop_id = o.shop_id)
              ORDER BY coalesce(o.delivered_at, o.created_at) DESC
              LIMIT ?`,
        args: [shop.id, ORDER_CANDIDATES_MAX],
      },
      { sql: "SELECT id, order_id, media_key, stage FROM order_photos WHERE shop_id = ? ORDER BY created_at ASC", args: [shop.id] },
      {
        sql: `SELECT id, title, media_key FROM posts
              WHERE shop_id = ? AND media_key IS NOT NULL AND media_kind = 'image'
              ORDER BY coalesce(shared_at, created_at) DESC
              LIMIT ?`,
        args: [shop.id, POST_CANDIDATES_MAX],
      },
      { sql: "SELECT source_id, piece_id FROM website_piece_photos WHERE shop_id = ? AND source = 'post'", args: [shop.id] },
    ],
    "read",
  );

  const photosByOrder = new Map<string, PortfolioOrderCandidate["photos"]>();
  for (const row of photos?.rows ?? []) {
    const orderId = String(row["order_id"]);
    const list = photosByOrder.get(orderId) ?? [];
    list.push({ id: String(row["id"]), url: mediaUrl(origin, String(row["media_key"])), stage: isOrderStatus(row["stage"]) ? row["stage"] : "measured" });
    photosByOrder.set(orderId, list);
  }
  const pieceByOrder = new Map(pieces.filter((p) => p.orderId).map((p) => [p.orderId as string, p.id]));
  const pieceByPost = new Map((postPieces?.rows ?? []).map((row) => [String(row["source_id"]), String(row["piece_id"])]));

  const body: WebsitePortfolioResponse = {
    pieces,
    coverPieceId: (shopRow?.rows[0]?.["website_cover_piece_id"] as string | null | undefined) ?? null,
    candidates: {
      orders: (orders?.rows ?? []).map((row): PortfolioOrderCandidate => {
        const id = String(row["id"]);
        return {
          orderId: id,
          garment: String(row["garment"] ?? ""),
          fabric: row["fabric"] == null || row["fabric"] === "" ? null : String(row["fabric"]),
          madeAt: String(row["delivered_at"] ?? row["created_at"]),
          photos: photosByOrder.get(id) ?? [],
          pieceId: pieceByOrder.get(id) ?? null,
        };
      }),
      posts: (posts?.rows ?? []).map(
        (row): PortfolioPostCandidate => ({
          postId: String(row["id"]),
          title: String(row["title"] ?? ""),
          photoUrl: mediaUrl(origin, String(row["media_key"])),
          pieceId: pieceByPost.get(String(row["id"])) ?? null,
        }),
      ),
    },
  };
  return c.json(body);
});

const createPieceSchema = z.object({
  orderId: z.string({ error: "must be text" }).max(64).optional(),
  postId: z.string({ error: "must be text" }).max(64).optional(),
  title: z.string({ error: "must be text" }).trim().max(WEBSITE_LIMITS.pieceTitleMax).optional(),
}) satisfies z.ZodType<CreateWebsitePieceRequest, unknown>;

/**
 * POST /website/pieces { orderId? | postId? | title? } -> 201 { piece } (200 with the existing piece when that order
 * or post is already on the website). 400 at WEBSITE_LIMITS.piecesMax pieces.
 */
websiteContentRoutes.post("/pieces", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createPieceSchema);
  if (input.orderId && input.postId) throw badRequest("Send an order or a post, not both.");

  // Already on the website? Hand back that piece rather than a duplicate.
  if (input.orderId || input.postId) {
    const existing = await db.execute(
      input.orderId
        ? { sql: "SELECT id FROM website_pieces WHERE shop_id = ? AND order_id = ? LIMIT 1", args: [shop.id, input.orderId] }
        : { sql: "SELECT piece_id AS id FROM website_piece_photos WHERE shop_id = ? AND source = 'post' AND source_id = ? LIMIT 1", args: [shop.id, input.postId ?? ""] },
    );
    const id = existing.rows[0]?.["id"];
    if (typeof id === "string") {
      const body: WebsitePieceResponse = { piece: await pieceOr404(c, id) };
      return c.json(body);
    }
  }

  const count = countOf(await db.execute({ sql: "SELECT count(*) AS n FROM website_pieces WHERE shop_id = ?", args: [shop.id] }));
  if (count >= WEBSITE_LIMITS.piecesMax) {
    throw badRequest(`The website shows up to ${WEBSITE_LIMITS.piecesMax} pieces. Remove one to add another.`);
  }

  const pieceId = newId();
  const now = nowIso();
  const sort = await nextSort(db, "website_pieces", shop.id);
  let title = input.title || "New piece";
  let category = categoryFromGarment(input.title);
  let cloth: string | null = null;
  let madeAt: string | null = null;
  let orderId: string | null = null;
  const photoRows: { key: string; source: "order" | "post"; sourceId: string; width: number | null; height: number | null }[] = [];

  if (input.orderId) {
    const rs = await db.execute({
      sql: "SELECT id, garment, fabric, created_at, delivered_at FROM orders WHERE id = ? AND shop_id = ?",
      args: [input.orderId, shop.id],
    });
    const order = rs.rows[0];
    if (!order) throw notFound("Order not found.");
    const photos = await db.execute({
      // Newest first, so the finished garment leads.
      sql: "SELECT id, media_key, width, height FROM order_photos WHERE order_id = ? AND shop_id = ? ORDER BY created_at DESC LIMIT ?",
      args: [input.orderId, shop.id, WEBSITE_LIMITS.photosPerPiece],
    });
    if (photos.rows.length === 0) throw badRequest("Add a photo to this order first.");
    const garment = String(order["garment"] ?? "").trim();
    title = input.title || upperFirst(garment).slice(0, WEBSITE_LIMITS.pieceTitleMax) || "New piece";
    category = categoryFromGarment(garment);
    cloth = order["fabric"] == null || String(order["fabric"]).trim() === "" ? null : String(order["fabric"]).slice(0, WEBSITE_LIMITS.clothMax);
    madeAt = String(order["delivered_at"] ?? order["created_at"]);
    orderId = input.orderId;
    for (const row of photos.rows) {
      photoRows.push({
        key: String(row["media_key"]),
        source: "order",
        sourceId: String(row["id"]),
        width: row["width"] == null ? null : Number(row["width"]),
        height: row["height"] == null ? null : Number(row["height"]),
      });
    }
  } else if (input.postId) {
    const rs = await db.execute({
      sql: "SELECT id, title, media_key, media_kind, media_width, media_height, created_at FROM posts WHERE id = ? AND shop_id = ?",
      args: [input.postId, shop.id],
    });
    const post = rs.rows[0];
    if (!post) throw notFound("Post not found.");
    if (!post["media_key"] || post["media_kind"] !== "image") throw badRequest("This post has no photo.");
    const postTitle = String(post["title"] ?? "").trim();
    title = input.title || postTitle.slice(0, WEBSITE_LIMITS.pieceTitleMax) || "New piece";
    category = categoryFromGarment(postTitle);
    madeAt = String(post["created_at"]);
    photoRows.push({
      key: String(post["media_key"]),
      source: "post",
      sourceId: String(post["id"]),
      width: post["media_width"] == null ? null : Math.round(Number(post["media_width"])),
      height: post["media_height"] == null ? null : Math.round(Number(post["media_height"])),
    });
  }

  await db.batch(
    [
      {
        sql: `INSERT INTO website_pieces (id, shop_id, title, category, cloth, style, line, made_at, order_id, sort, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
        args: [pieceId, shop.id, title, category, cloth, madeAt, orderId, sort, now, now],
      },
      ...photoRows.map((p, index) => ({
        sql: `INSERT INTO website_piece_photos (id, shop_id, piece_id, media_key, source, source_id, width, height, sort, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [newId(), shop.id, pieceId, p.key, p.source, p.sourceId, p.width, p.height, index, now],
      })),
    ],
    "write",
  );
  await ensureCover(db, shop.id);

  const body: WebsitePieceResponse = { piece: await pieceOr404(c, pieceId) };
  return c.json(body, 201);
});

/** POST /website/pieces/reorder { ids } -> 204 */
websiteContentRoutes.post("/pieces/reorder", async (c) => {
  const { ids } = await parseBody(c, reorderSchema);
  await reorder(c.get("db"), "website_pieces", c.get("shop").id, ids);
  return c.body(null, 204);
});

const updatePieceSchema = z.object({
  title: requiredText(WEBSITE_LIMITS.pieceTitleMax).optional(),
  category: oneOf(WEBSITE_PIECE_CATEGORIES).optional(),
  cloth: optionalText(WEBSITE_LIMITS.clothMax),
  style: optionalText(WEBSITE_LIMITS.styleMax),
  line: optionalText(WEBSITE_LIMITS.pieceLineMax),
  madeAt: isoDate.nullable().optional(),
});
type _UpdatePieceAccepted = AssertAccepts<typeof updatePieceSchema, UpdateWebsitePieceRequest>;

/** PATCH /website/pieces/:id -> { piece } */
websiteContentRoutes.patch("/pieces/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const input = await parseBody(c, updatePieceSchema);
  const piece = await pieceOr404(c, id);

  await db.execute({
    sql: `UPDATE website_pieces SET title = ?, category = ?, cloth = ?, style = ?, line = ?, made_at = ?, updated_at = ?
          WHERE id = ? AND shop_id = ?`,
    args: [
      input.title ?? piece.title,
      input.category ?? piece.category,
      input.cloth === undefined ? piece.cloth : input.cloth,
      input.style === undefined ? piece.style : input.style,
      input.line === undefined ? piece.line : input.line,
      input.madeAt === undefined ? piece.madeAt : input.madeAt,
      nowIso(),
      id,
      shop.id,
    ],
  });
  const body: WebsitePieceResponse = { piece: await pieceOr404(c, id) };
  return c.json(body);
});

/** DELETE /website/pieces/:id -> 204. Uploaded files go too; order and post photos stay with their order / post. */
websiteContentRoutes.delete("/pieces/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const piece = await pieceOr404(c, id);

  const keys = await db.execute({ sql: "SELECT media_key FROM website_piece_photos WHERE piece_id = ? AND shop_id = ?", args: [id, shop.id] });
  await db.batch(
    [
      { sql: "DELETE FROM website_piece_photos WHERE piece_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM website_pieces WHERE id = ? AND shop_id = ?", args: [piece.id, shop.id] },
      { sql: "UPDATE shops SET website_cover_piece_id = NULL WHERE id = ? AND website_cover_piece_id = ?", args: [shop.id, id] },
    ],
    "write",
  );
  await ensureCover(db, shop.id);
  await deleteMediaObjects(mediaStore(c.env), await unusedMediaKeys(db, shop.id, keys.rows.map((row) => row["media_key"] as string | null)));
  return c.body(null, 204);
});

/**
 * PUT /website/pieces/:id/photos -> 201 { piece } with the photo appended. Raw image body like order photos.
 * 400 once the piece has WEBSITE_LIMITS.photosPerPiece photos.
 */
websiteContentRoutes.put("/pieces/:id/photos", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const piece = await pieceOr404(c, id);
  if (piece.photos.length >= WEBSITE_LIMITS.photosPerPiece) {
    throw badRequest(`A piece can have up to ${WEBSITE_LIMITS.photosPerPiece} photos. Remove one to add another.`);
  }

  const photo = await receivePhoto(c, id);
  const now = nowIso();
  await db.batch(
    [
      {
        sql: `INSERT INTO website_piece_photos (id, shop_id, piece_id, media_key, source, source_id, width, height, sort, created_at)
              VALUES (?, ?, ?, ?, 'upload', NULL, ?, ?, (SELECT coalesce(max(sort), -1) + 1 FROM website_piece_photos WHERE piece_id = ?), ?)`,
        args: [newId(), shop.id, id, photo.key, photo.width, photo.height, id, now],
      },
      { sql: "UPDATE website_pieces SET updated_at = ? WHERE id = ? AND shop_id = ?", args: [now, id, shop.id] },
    ],
    "write",
  );
  await ensureCover(db, shop.id);
  const body: WebsitePieceResponse = { piece: await pieceOr404(c, id) };
  return c.json(body, 201);
});

/** DELETE /website/pieces/:id/photos/:photoId -> { piece }. The file goes only when nothing else uses it. */
websiteContentRoutes.delete("/pieces/:id/photos/:photoId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const photoId = c.req.param("photoId");
  await pieceOr404(c, id);

  const rs = await db.execute({
    sql: "SELECT media_key FROM website_piece_photos WHERE id = ? AND piece_id = ? AND shop_id = ?",
    args: [photoId, id, shop.id],
  });
  const row = rs.rows[0];
  if (!row) throw notFound("Photo not found.");
  await db.batch(
    [
      { sql: "DELETE FROM website_piece_photos WHERE id = ? AND shop_id = ?", args: [photoId, shop.id] },
      { sql: "UPDATE website_pieces SET updated_at = ? WHERE id = ? AND shop_id = ?", args: [nowIso(), id, shop.id] },
    ],
    "write",
  );
  await deleteMediaObjects(mediaStore(c.env), await unusedMediaKeys(db, shop.id, [row["media_key"] as string | null]));
  const body: WebsitePieceResponse = { piece: await pieceOr404(c, id) };
  return c.json(body);
});

// ---------- Services ----------

const createServiceSchema = z.object({
  name: requiredText(WEBSITE_LIMITS.serviceNameMax),
  fromPrice: baht,
  line: optionalText(WEBSITE_LIMITS.serviceLineMax),
});
type _CreateServiceAccepted = AssertAccepts<typeof createServiceSchema, CreateWebsiteServiceRequest>;
const updateServiceSchema = createServiceSchema.partial();
type _UpdateServiceAccepted = AssertAccepts<typeof updateServiceSchema, UpdateWebsiteServiceRequest>;

async function serviceOr404(db: Db, shopId: string, id: string) {
  const rs = await db.execute({ sql: "SELECT * FROM website_services WHERE id = ? AND shop_id = ?", args: [id, shopId] });
  const row = rs.rows[0];
  if (!row) throw notFound("Service not found.");
  return rowToWebsiteService(row);
}

async function servicesCount(db: Db, shopId: string): Promise<number> {
  return countOf(await db.execute({ sql: "SELECT count(*) AS n FROM website_services WHERE shop_id = ?", args: [shopId] }));
}

/** POST /website/services { name, fromPrice?, line? } -> 201 { service } */
websiteContentRoutes.post("/services", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createServiceSchema);
  if ((await servicesCount(db, shop.id)) >= WEBSITE_LIMITS.servicesMax) {
    throw badRequest(`The website lists up to ${WEBSITE_LIMITS.servicesMax} services.`);
  }
  const id = newId();
  await db.execute({
    sql: "INSERT INTO website_services (id, shop_id, name, from_price, line, sort) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, shop.id, input.name, input.fromPrice == null ? null : Math.round(input.fromPrice), input.line ?? null, await nextSort(db, "website_services", shop.id)],
  });
  const body: WebsiteServiceResponse = { service: await serviceOr404(db, shop.id, id) };
  return c.json(body, 201);
});

/** POST /website/services/defaults -> { services }: the usual three (no prices), only when the list is empty. */
websiteContentRoutes.post("/services/defaults", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  if ((await servicesCount(db, shop.id)) === 0) {
    await db.batch(
      DEFAULT_SERVICES.map((s, index) => ({
        sql: "INSERT INTO website_services (id, shop_id, name, from_price, line, sort) VALUES (?, ?, ?, NULL, ?, ?)",
        args: [newId(), shop.id, s.name, s.line, index],
      })),
      "write",
    );
  }
  const rs = await db.execute({ sql: "SELECT * FROM website_services WHERE shop_id = ? ORDER BY sort ASC, name ASC", args: [shop.id] });
  const body: WebsiteServicesResponse = { services: rs.rows.map(rowToWebsiteService) };
  return c.json(body);
});

/** POST /website/services/reorder { ids } -> 204 */
websiteContentRoutes.post("/services/reorder", async (c) => {
  const { ids } = await parseBody(c, reorderSchema);
  await reorder(c.get("db"), "website_services", c.get("shop").id, ids);
  return c.body(null, 204);
});

/** PATCH /website/services/:id -> { service } */
websiteContentRoutes.patch("/services/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const input = await parseBody(c, updateServiceSchema);
  const service = await serviceOr404(db, shop.id, id);
  await db.execute({
    sql: "UPDATE website_services SET name = ?, from_price = ?, line = ? WHERE id = ? AND shop_id = ?",
    args: [
      input.name ?? service.name,
      input.fromPrice === undefined ? service.fromPrice : input.fromPrice == null ? null : Math.round(input.fromPrice),
      input.line === undefined ? service.line : input.line,
      id,
      shop.id,
    ],
  });
  const body: WebsiteServiceResponse = { service: await serviceOr404(db, shop.id, id) };
  return c.json(body);
});

/** DELETE /website/services/:id -> 204 */
websiteContentRoutes.delete("/services/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  await serviceOr404(db, shop.id, id);
  await db.execute({ sql: "DELETE FROM website_services WHERE id = ? AND shop_id = ?", args: [id, shop.id] });
  return c.body(null, 204);
});

// ---------- Reviews ----------

const createReviewSchema = z.object({
  quote: requiredText(WEBSITE_LIMITS.quoteMax),
  author: requiredText(WEBSITE_LIMITS.authorMax),
  source: optionalText(WEBSITE_LIMITS.sourceMax),
});
type _CreateReviewAccepted = AssertAccepts<typeof createReviewSchema, CreateWebsiteReviewRequest>;
const updateReviewSchema = createReviewSchema.partial();
type _UpdateReviewAccepted = AssertAccepts<typeof updateReviewSchema, UpdateWebsiteReviewRequest>;

async function reviewOr404(db: Db, shopId: string, id: string) {
  const rs = await db.execute({ sql: "SELECT * FROM website_reviews WHERE id = ? AND shop_id = ?", args: [id, shopId] });
  const row = rs.rows[0];
  if (!row) throw notFound("Review not found.");
  return rowToWebsiteReview(row);
}

/** POST /website/reviews { quote, author, source? } -> 201 { review } */
websiteContentRoutes.post("/reviews", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createReviewSchema);
  const count = countOf(await db.execute({ sql: "SELECT count(*) AS n FROM website_reviews WHERE shop_id = ?", args: [shop.id] }));
  if (count >= WEBSITE_LIMITS.reviewsMax) throw badRequest(`The website shows up to ${WEBSITE_LIMITS.reviewsMax} reviews.`);
  const id = newId();
  await db.execute({
    sql: "INSERT INTO website_reviews (id, shop_id, quote, author, source, sort) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, shop.id, input.quote, input.author, input.source ?? "Google", await nextSort(db, "website_reviews", shop.id)],
  });
  const body: WebsiteReviewResponse = { review: await reviewOr404(db, shop.id, id) };
  return c.json(body, 201);
});

/** POST /website/reviews/reorder { ids } -> 204 */
websiteContentRoutes.post("/reviews/reorder", async (c) => {
  const { ids } = await parseBody(c, reorderSchema);
  await reorder(c.get("db"), "website_reviews", c.get("shop").id, ids);
  return c.body(null, 204);
});

/** PATCH /website/reviews/:id -> { review } */
websiteContentRoutes.patch("/reviews/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const input = await parseBody(c, updateReviewSchema);
  const review = await reviewOr404(db, shop.id, id);
  await db.execute({
    sql: "UPDATE website_reviews SET quote = ?, author = ?, source = ? WHERE id = ? AND shop_id = ?",
    args: [input.quote ?? review.quote, input.author ?? review.author, input.source === undefined ? review.source : (input.source ?? "Google"), id, shop.id],
  });
  const body: WebsiteReviewResponse = { review: await reviewOr404(db, shop.id, id) };
  return c.json(body);
});

/** DELETE /website/reviews/:id -> 204 */
websiteContentRoutes.delete("/reviews/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  await reviewOr404(db, shop.id, id);
  await db.execute({ sql: "DELETE FROM website_reviews WHERE id = ? AND shop_id = ?", args: [id, shop.id] });
  return c.body(null, 204);
});

// ---------- Tailor photo (About page) ----------

async function currentTailorKey(db: Db, shopId: string): Promise<string | null> {
  const rs = await db.execute({ sql: "SELECT website_tailor_photo_key FROM shops WHERE id = ?", args: [shopId] });
  const key = rs.rows[0]?.["website_tailor_photo_key"];
  return typeof key === "string" && key ? key : null;
}

/** PUT /website/tailor-photo (raw image body) -> 201 WebsiteResponse. Replaces the previous photo. */
websiteContentRoutes.put("/tailor-photo", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const previous = await currentTailorKey(db, shop.id);
  const photo = await receivePhoto(c, "tailor");
  await db.execute({ sql: "UPDATE shops SET website_tailor_photo_key = ? WHERE id = ?", args: [photo.key, shop.id] });
  if (previous && previous !== photo.key) await deleteMediaObjects(mediaStore(c.env), await unusedMediaKeys(db, shop.id, [previous]));
  return c.json(await websiteResponse(c, shop.id), 201);
});

/** DELETE /website/tailor-photo -> WebsiteResponse */
websiteContentRoutes.delete("/tailor-photo", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const previous = await currentTailorKey(db, shop.id);
  if (previous) {
    await db.execute({ sql: "UPDATE shops SET website_tailor_photo_key = NULL WHERE id = ?", args: [shop.id] });
    await deleteMediaObjects(mediaStore(c.env), await unusedMediaKeys(db, shop.id, [previous]));
  }
  return c.json(await websiteResponse(c, shop.id));
});

export default websiteContentRoutes;
