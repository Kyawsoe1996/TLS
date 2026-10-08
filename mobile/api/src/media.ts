import type { Context } from "hono";
import { MEDIA_LIMITS, type MediaKind } from "../../shared/types";
import type { AppEnv, Bindings } from "./env";
import { badRequest } from "./errors";

// Post photos / videos live in the R2 bucket bound as MEDIA. Keys are `<shopId>/<postId>/<uuid>.<ext>`:
// the shop prefix makes "delete everything for this shop" a prefix listing, and the random uuid makes
// the public GET /media/<key> URL unguessable (so it needs no auth).
// The binding is optional (see wrangler.toml): without it uploads are refused with 400 and the
// best-effort deletes become no-ops, so the worker deploys without a bucket.

/** Public path prefix the file is served at (see routes/media.ts). */
export const MEDIA_PATH = "/media/";

/** The media bucket, or a 400 the app can show when uploads are switched off. */
export function requireBucket(env: Bindings): R2Bucket {
  if (!env.MEDIA) throw badRequest("Photo and video uploads are switched off in this version.");
  return env.MEDIA;
}

/** Content type -> file extension, for every type PUT /posts/:id/media accepts. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/** "image/jpeg; charset=..." -> "image/jpeg" */
export function normalizeContentType(header: string | undefined): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Which kind of media a content type is, or null when it isn't one we accept. */
export function mediaKindFor(contentType: string): MediaKind | null {
  if ((MEDIA_LIMITS.imageTypes as readonly string[]).includes(contentType)) return "image";
  if ((MEDIA_LIMITS.videoTypes as readonly string[]).includes(contentType)) return "video";
  return null;
}

/** Size limit in bytes for a kind of media. */
export const mediaByteLimit = (kind: MediaKind): number =>
  kind === "image" ? MEDIA_LIMITS.imageBytes : MEDIA_LIMITS.videoBytes;

/** A fresh, unguessable object key for a post's media. */
export function newMediaKey(shopId: string, postId: string, contentType: string): string {
  return `${shopId}/${postId}/${crypto.randomUUID()}.${EXTENSIONS[contentType] ?? "bin"}`;
}

/**
 * Absolute URL the app can load a media key from. Built from the request's own origin so it points at
 * whatever host served the API (localhost in `wrangler dev`, the workers.dev host in production).
 */
export const mediaUrl = (origin: string, key: string): string => `${origin}${MEDIA_PATH}${key}`;

export const requestOrigin = (c: Context<AppEnv>): string => new URL(c.req.url).origin;

/** Thrown by storeUpload when the body is bigger than the limit (declared or measured). */
export class MediaTooLarge extends Error {
  constructor() {
    super("media over limit");
    this.name = "MediaTooLarge";
  }
}

/**
 * Store an upload body in R2 without ever keeping more than `limit` bytes.
 * The declared Content-Length is checked first (cheap, before reading anything). The bytes are then
 * counted as they stream, so a chunked upload (no Content-Length) or a mismatching header can't push a
 * bigger file into the bucket: the counter errors the stream, which fails the put, and nothing is stored.
 * Throws MediaTooLarge; any other failure (cut-short body, R2 error) is rethrown as is.
 */
export async function storeUpload(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  declaredLength: number | null,
  limit: number,
  options: R2PutOptions,
): Promise<R2Object> {
  if (declaredLength != null && declaredLength > limit) throw new MediaTooLarge();

  let received = 0;
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > limit) throw new MediaTooLarge();
        controller.enqueue(chunk);
      },
    }),
  );

  try {
    if (declaredLength != null) {
      // R2 needs a stream of known length: declare it, and FixedLengthStream errors if the body disagrees.
      const fixed = new FixedLengthStream(declaredLength);
      const piping = counted.pipeTo(fixed.writable).catch(() => {}); // surfaces through the put instead
      const stored = await bucket.put(key, fixed.readable, options);
      await piping;
      return stored;
    }
    // No Content-Length (chunked): buffer up to the limit, then store.
    return await bucket.put(key, await new Response(counted).arrayBuffer(), options);
  } catch (err) {
    if (received > limit) throw new MediaTooLarge();
    throw err;
  }
}

/** Best-effort delete of one object; a failure here must never fail the request that already updated the DB. */
export async function deleteMediaObject(bucket: R2Bucket | undefined, key: string | null | undefined): Promise<void> {
  if (!key || !bucket) return;
  try {
    await bucket.delete(key);
  } catch (err) {
    console.warn(`[media] could not delete ${key}:`, err instanceof Error ? err.message : err);
  }
}

/** Delete every object under a prefix (e.g. `${shopId}/` when an account is deleted), in pages. Returns the count. */
export async function deleteMediaByPrefix(bucket: R2Bucket | undefined, prefix: string): Promise<number> {
  if (!bucket) return 0;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 500 });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
