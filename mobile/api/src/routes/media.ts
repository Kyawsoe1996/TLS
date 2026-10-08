import { Hono } from "hono";
import type { AppEnv } from "../env";
import { MEDIA_PATH } from "../media";

// GET /media/<key> - serves a post's photo / video straight from R2. No auth: keys contain a random uuid
// (see media.ts), so a URL is only known to whoever the API handed it to. Mounted before requireAuth.
// Supports Range (video players scrub with it) and If-None-Match, and tells caches the file never changes
// (a replaced file gets a new key).

const mediaRoutes = new Hono<AppEnv>();

const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The object key from the request path, or null when it isn't a plausible key. */
function keyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_PATH)) return null;
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(MEDIA_PATH.length));
  } catch {
    return null;
  }
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) return null;
  return key;
}

type ByteRange = { offset: number; length: number };

/**
 * Resolve a `Range: bytes=a-b` / `bytes=a-` / `bytes=-n` header against the object size.
 * null = no usable range (absent, malformed or multi-range: serve the whole file, as RFC 9110 allows);
 * "unsatisfiable" = 416. Done here rather than by handing R2 the header, because the local simulation and
 * production R2 don't agree on what to do with out-of-bounds ranges.
 */
function resolveRange(header: string | undefined, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const a = m[1] ?? "";
  const b = m[2] ?? "";
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Math.min(Number(b), size);
    if (suffix === 0) return "unsatisfiable";
    return { offset: size - suffix, length: suffix };
  }
  const start = Number(a);
  if (start >= size) return "unsatisfiable";
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return "unsatisfiable";
  return { offset: start, length: end - start + 1 };
}

mediaRoutes.get("/*", async (c) => {
  const key = keyFromPath(new URL(c.req.url).pathname);
  const bucket = c.env.MEDIA;
  if (!key || !bucket) return c.notFound();

  let range: ByteRange | null = null;
  const rangeHeader = c.req.header("Range");
  if (rangeHeader) {
    const head = await bucket.head(key);
    if (!head) return c.notFound();
    const resolved = resolveRange(rangeHeader, head.size);
    if (resolved === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    }
    range = resolved;
  }

  const onlyIf = c.req.raw.headers; // If-None-Match / If-Modified-Since
  const object = await bucket.get(key, range ? { range, onlyIf } : { onlyIf });
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers); // Content-Type etc. from the upload
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Accept-Ranges", "bytes");

  // The precondition didn't match: R2 returns the metadata without a body.
  if (!("body" in object)) return new Response(null, { status: 304, headers });

  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
});

export default mediaRoutes;
