import { Hono } from "hono";
import { z } from "zod";
import {
  type Audience,
  type CreatePostRequest,
  type ListPostsResponse,
  MEDIA_LIMITS,
  type PostResponse,
  type PostStatus,
  type UpdatePostRequest,
} from "../../../shared/types";
import { type Db, getPostRow, newId, nowIso, rowToPost } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import {
  deleteMediaObject,
  mediaByteLimit,
  mediaKindFor,
  MediaTooLarge,
  newMediaKey,
  normalizeContentType,
  requestOrigin,
  requireBucket,
  storeUpload,
} from "../media";
import { type AssertAccepts, oneOf, parseBody, requiredText } from "../validate";
import { BRAND_TONES } from "./shop";

export const AUDIENCES = ["Expatriates", "Local executives", "Grooms", "Tourists"] as const satisfies readonly Audience[];
export const POST_STATUSES = ["draft", "shared"] as const satisfies readonly PostStatus[];

const TITLE_MAX = 200;

const createPostSchema = z.object({
  title: requiredText(TITLE_MAX),
  body: requiredText(20_000),
  caption: requiredText(2000),
  callToAction: requiredText(1000),
  topic: requiredText(200),
  tone: oneOf(BRAND_TONES),
  audience: oneOf(AUDIENCES),
});
type _CreateAccepted = AssertAccepts<typeof createPostSchema, CreatePostRequest>;

/** PATCH accepts any subset of the text fields (no nulls: every field is required on a post). */
const updatePostSchema = createPostSchema.partial();
type _UpdateAccepted = AssertAccepts<typeof updatePostSchema, UpdatePostRequest>;

const isPostStatus = (v: string): v is PostStatus => (POST_STATUSES as readonly string[]).includes(v);

/** The media_* columns of a posts row. */
interface MediaColumns {
  key: string;
  kind: string;
  contentType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  size: number;
}

/**
 * Insert a draft post and return its id. Shared by POST /posts, POST /posts/:id/duplicate and POST /ai/post.
 * `id` can be allocated up front when a media key (which embeds the post id) has to be written first.
 */
export async function insertPost(
  db: Db,
  shopId: string,
  input: CreatePostRequest,
  opts: { id?: string; media?: MediaColumns | null } = {},
): Promise<string> {
  const id = opts.id ?? newId();
  const media = opts.media ?? null;
  const now = nowIso();
  await db.execute({
    sql: `INSERT INTO posts
            (id, shop_id, title, body, caption, call_to_action, topic, tone, audience, status, shared_at,
             media_key, media_kind, media_content_type, media_width, media_height, media_duration, media_size,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      shopId,
      input.title,
      input.body,
      input.caption,
      input.callToAction,
      input.topic,
      input.tone,
      input.audience,
      media?.key ?? null,
      media?.kind ?? null,
      media?.contentType ?? null,
      media?.width ?? null,
      media?.height ?? null,
      media?.duration ?? null,
      media?.size ?? null,
      now,
      now,
    ],
  });
  return id;
}

/** Optional numeric upload header (X-Media-Width etc.): absent -> null, present but not a number -> 400. */
function numberHeader(value: string | undefined, name: string): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${name} must be a number of 0 or more.`);
  return n;
}

// ---------- Routes (mounted at /posts) ----------

const postRoutes = new Hono<AppEnv>();

/** GET /posts?status=draft|shared&q=<title/topic search> -> { posts } newest first */
postRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const statusParam = c.req.query("status");
  const q = (c.req.query("q") ?? "").trim();

  let sql = "SELECT * FROM posts WHERE shop_id = ?";
  const args: string[] = [shop.id];
  if (statusParam !== undefined) {
    if (!isPostStatus(statusParam)) throw badRequest(`status must be one of: ${POST_STATUSES.join(", ")}.`);
    sql += " AND status = ?";
    args.push(statusParam);
  }
  if (q) {
    // Escape LIKE wildcards in user input; LIKE is case-insensitive for ASCII in SQLite.
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    sql += " AND (title LIKE ? ESCAPE '\\' OR topic LIKE ? ESCAPE '\\')";
    args.push(pattern, pattern);
  }
  sql += " ORDER BY created_at DESC";

  const rs = await db.execute({ sql, args });
  const origin = requestOrigin(c);
  const body: ListPostsResponse = { posts: rs.rows.map((row) => rowToPost(row, origin)) };
  return c.json(body);
});

/** POST /posts -> 201 { post } (status draft, no media) */
postRoutes.post("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createPostSchema);

  const id = await insertPost(db, shop.id, input);

  const row = await getPostRow(db, shop.id, id);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body, 201);
});

/** GET /posts/:id -> { post } */
postRoutes.get("/:id", async (c) => {
  const row = await getPostRow(c.get("db"), c.get("shop").id, c.req.param("id"));
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body);
});

/** PATCH /posts/:id -> { post }. Updates only the keys sent; always bumps updatedAt. */
postRoutes.patch("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const input = await parseBody(c, updatePostSchema);

  const existing = await getPostRow(db, shop.id, id);
  if (!existing) throw notFound("Post not found.");

  const columns: Record<keyof UpdatePostRequest, string> = {
    title: "title",
    body: "body",
    caption: "caption",
    callToAction: "call_to_action",
    topic: "topic",
    tone: "tone",
    audience: "audience",
  };
  const sets: string[] = [];
  const args: string[] = [];
  for (const key of Object.keys(columns) as (keyof UpdatePostRequest)[]) {
    const value = input[key];
    if (value === undefined) continue; // not sent -> leave unchanged
    sets.push(`${columns[key]} = ?`);
    args.push(value);
  }
  sets.push("updated_at = ?");
  args.push(nowIso(), id, shop.id);
  await db.execute({ sql: `UPDATE posts SET ${sets.join(", ")} WHERE id = ? AND shop_id = ?`, args });

  const row = await getPostRow(db, shop.id, id);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body);
});

/** DELETE /posts/:id -> 204 (also deletes its media file, best effort) */
postRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getPostRow(db, shop.id, id);
  if (!existing) throw notFound("Post not found.");

  await db.execute({ sql: "DELETE FROM posts WHERE id = ? AND shop_id = ?", args: [id, shop.id] });
  await deleteMediaObject(c.env.MEDIA, existing["media_key"] as string | null);
  return c.body(null, 204);
});

/**
 * POST /posts/:id/duplicate -> 201 { post }: a draft copy with " (copy)" after the title.
 * The media file is copied to a new key when possible; if that fails the copy is created without media.
 */
postRoutes.post("/:id/duplicate", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const source = await getPostRow(db, shop.id, id);
  if (!source) throw notFound("Post not found.");
  const sourcePost = rowToPost(source, requestOrigin(c));

  const suffix = " (copy)";
  const title = `${sourcePost.title.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`;
  const input: CreatePostRequest = {
    title,
    body: sourcePost.body,
    caption: sourcePost.caption,
    callToAction: sourcePost.callToAction,
    topic: sourcePost.topic,
    tone: sourcePost.tone,
    audience: sourcePost.audience,
  };

  // The copy's id goes into its media key, so allocate it before inserting.
  const copyId = newId();
  const sourceKey = source["media_key"] as string | null;
  const bucket = c.env.MEDIA;
  let media: MediaColumns | null = null;
  if (sourceKey && sourcePost.media && bucket) {
    const key = newMediaKey(shop.id, copyId, sourcePost.media.contentType);
    try {
      const object = await bucket.get(sourceKey);
      if (object) {
        // R2 put needs a known-length stream; FixedLengthStream gives the copied body one.
        await bucket.put(key, object.body.pipeThrough(new FixedLengthStream(object.size)), {
          httpMetadata: object.httpMetadata,
          customMetadata: { shopId: shop.id, postId: copyId },
        });
        media = {
          key,
          kind: sourcePost.media.kind,
          contentType: sourcePost.media.contentType,
          width: sourcePost.media.width,
          height: sourcePost.media.height,
          duration: sourcePost.media.durationSec,
          size: object.size,
        };
      }
    } catch (err) {
      console.warn(`[posts] could not copy media ${sourceKey}:`, err instanceof Error ? err.message : err);
    }
  }

  await insertPost(db, shop.id, input, { id: copyId, media });
  const row = await getPostRow(db, shop.id, copyId);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body, 201);
});

/** POST /posts/:id/shared -> { post } with status "shared" and sharedAt = now */
postRoutes.post("/:id/shared", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getPostRow(db, shop.id, id);
  if (!existing) throw notFound("Post not found.");

  const now = nowIso();
  await db.execute({
    sql: "UPDATE posts SET status = 'shared', shared_at = ?, updated_at = ? WHERE id = ? AND shop_id = ?",
    args: [now, now, id, shop.id],
  });

  const row = await getPostRow(db, shop.id, id);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body);
});

/**
 * PUT /posts/:id/media -> { post }. Raw file body; Content-Type says what it is (see MEDIA_LIMITS for the
 * accepted types and sizes), X-Media-Width / X-Media-Height / X-Media-Duration are optional numbers from
 * the app. Replaces (and deletes) any previous file. 413 when over the size limit.
 */
postRoutes.put("/:id/media", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getPostRow(db, shop.id, id);
  if (!existing) throw notFound("Post not found.");
  const bucket = requireBucket(c.env);

  const contentType = normalizeContentType(c.req.header("Content-Type"));
  const kind = mediaKindFor(contentType);
  if (!kind) throw badRequest("Use a JPEG, PNG or WebP photo, or an MP4/MOV video.");
  const limit = mediaByteLimit(kind);

  const width = numberHeader(c.req.header("X-Media-Width"), "X-Media-Width");
  const height = numberHeader(c.req.header("X-Media-Height"), "X-Media-Height");
  const duration = kind === "video" ? numberHeader(c.req.header("X-Media-Duration"), "X-Media-Duration") : null;
  if (duration != null && duration > MEDIA_LIMITS.videoSeconds) {
    throw badRequest(`Videos must be ${MEDIA_LIMITS.videoSeconds} seconds or shorter.`);
  }

  const lengthHeader = c.req.header("Content-Length");
  const declared = lengthHeader === undefined ? null : Number(lengthHeader);
  if (declared != null && (!Number.isInteger(declared) || declared < 0)) {
    throw badRequest("Content-Length must be a whole number of bytes.");
  }
  if (declared != null && declared > limit) throw payloadTooLarge();
  if (declared === 0) throw badRequest("The file is empty.");
  const raw = c.req.raw.body;
  if (!raw) throw badRequest("Send the file as the request body.");

  // Stored under a fresh key (never overwriting), then the row is pointed at it and the old file removed.
  const key = newMediaKey(shop.id, id, contentType);
  let stored: R2Object;
  try {
    stored = await storeUpload(bucket, key, raw, declared, limit, {
      httpMetadata: { contentType },
      customMetadata: { shopId: shop.id, postId: id },
    });
  } catch (err) {
    if (err instanceof MediaTooLarge) throw payloadTooLarge();
    console.warn(`[posts] media upload for ${id} failed:`, err instanceof Error ? err.message : err);
    throw badRequest("The upload didn't complete. Please try again.");
  }
  if (stored.size === 0) {
    await deleteMediaObject(c.env.MEDIA, key);
    throw badRequest("The file is empty.");
  }

  await db.execute({
    sql: `UPDATE posts
          SET media_key = ?, media_kind = ?, media_content_type = ?, media_width = ?, media_height = ?,
              media_duration = ?, media_size = ?, updated_at = ?
          WHERE id = ? AND shop_id = ?`,
    args: [key, kind, contentType, width, height, duration, stored.size, nowIso(), id, shop.id],
  });
  // The previous file is unreachable now that the row points elsewhere; remove it best effort.
  const previousKey = existing["media_key"] as string | null;
  if (previousKey && previousKey !== key) await deleteMediaObject(c.env.MEDIA, previousKey);

  const row = await getPostRow(db, shop.id, id);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body);
});

/** DELETE /posts/:id/media -> { post } with media null (no-op when there was none) */
postRoutes.delete("/:id/media", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getPostRow(db, shop.id, id);
  if (!existing) throw notFound("Post not found.");

  const key = existing["media_key"] as string | null;
  if (key) {
    await db.execute({
      sql: `UPDATE posts
            SET media_key = NULL, media_kind = NULL, media_content_type = NULL, media_width = NULL,
                media_height = NULL, media_duration = NULL, media_size = NULL, updated_at = ?
            WHERE id = ? AND shop_id = ?`,
      args: [nowIso(), id, shop.id],
    });
    await deleteMediaObject(c.env.MEDIA, key);
  }

  const row = await getPostRow(db, shop.id, id);
  if (!row) throw notFound("Post not found.");
  const body: PostResponse = { post: rowToPost(row, requestOrigin(c)) };
  return c.json(body);
});

export default postRoutes;
