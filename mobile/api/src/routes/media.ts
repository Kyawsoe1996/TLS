import { Hono } from "hono";
import type { AppEnv } from "../env";
import { serverError } from "../errors";
import { MEDIA_PATH, mediaStore } from "../media";

// GET /media/<key> - serves a post's photo / video straight from the S3 bucket. No auth: keys contain a random
// uuid (see media.ts), so a URL is only known to whoever the API handed it to. Mounted before requireAuth.
// Range and If-None-Match are forwarded to S3 (video players scrub with Range), its 200 / 206 / 304 / 416 is
// passed back, and caches are told the file never changes (a replaced file gets a new key).

const mediaRoutes = new Hono<AppEnv>();

const CACHE_CONTROL = "public, max-age=31536000, immutable";
/** Response headers copied from S3; everything else (its request ids, server header, …) is dropped. */
const PASS_THROUGH = ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"];

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

mediaRoutes.get("/*", async (c) => {
  const key = keyFromPath(new URL(c.req.url).pathname);
  const store = mediaStore(c.env);
  if (!key || !store) return c.notFound();

  const upstream = await store.get(key, { range: c.req.header("Range"), ifNoneMatch: c.req.header("If-None-Match") });
  const status = upstream.status;

  if (status === 404) return c.notFound();
  if (status === 403) {
    // Without s3:ListBucket, S3 answers 403 for a missing key as well as for bad credentials: log, serve 404.
    await upstream.body?.cancel();
    console.warn(`[media] S3 refused ${key} (403): check the S3_* settings and the IAM policy`);
    return c.notFound();
  }
  if (status !== 200 && status !== 206 && status !== 304 && status !== 416) {
    await upstream.body?.cancel();
    console.warn(`[media] unexpected ${status} from S3 for ${key}`);
    throw serverError("That file can't be loaded right now. Please try again.");
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Accept-Ranges", "bytes");

  const hasBody = status === 200 || status === 206;
  if (!hasBody) await upstream.body?.cancel();
  return new Response(hasBody ? upstream.body : null, { status, headers });
});

export default mediaRoutes;
