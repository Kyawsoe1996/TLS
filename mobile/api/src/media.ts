import { AwsClient } from "aws4fetch";
import type { Context } from "hono";
import { MEDIA_LIMITS, type MediaKind } from "../../shared/types";
import type { AppEnv, Bindings } from "./env";
import { badRequest } from "./errors";

// Post photos / videos live in an Amazon S3 bucket (the company's), reached with plain SigV4-signed HTTPS
// requests through aws4fetch - the AWS SDK is far too heavy for a Worker. Keys are `<shopId>/<postId>/<uuid>.<ext>`
// (kept under S3_PREFIX inside the bucket when one is set): the shop prefix makes "delete everything for
// this shop" a prefix listing, and the random uuid makes the public GET /media/<key> URL unguessable (so it
// needs no auth). The bucket stays private; the API fetches objects itself and streams them back
// (routes/media.ts), so the bucket needs no public access and the app sees one stable URL per file.
// Configuration is optional (see env.ts): without it uploads are refused with 400 and the best-effort
// deletes become no-ops, so the worker deploys without a bucket.

/** Public path prefix the file is served at (see routes/media.ts). */
export const MEDIA_PATH = "/media/";

export interface MediaObjectOptions {
  contentType: string;
  /** Stored as `x-amz-meta-*` on the object (lower-case names), handy when looking at the bucket directly. */
  metadata?: Record<string, string>;
}

export interface MediaObjectHead {
  size: number;
  contentType: string;
}

/** The handful of S3 operations the API needs, over one bucket. */
export class MediaStore {
  private readonly client: AwsClient;
  /** Bucket URL without a trailing slash (virtual-hosted on AWS, path-style with S3_ENDPOINT). */
  private readonly baseUrl: string;
  /** Folder inside the bucket, without slashes at either end; "" for the bucket root. */
  private readonly prefix: string;
  readonly bucket: string;

  constructor(config: { bucket: string; region: string; accessKeyId: string; secretAccessKey: string; prefix?: string; endpoint?: string }) {
    // No automatic retries: a retried PUT would re-send an already-consumed upload stream.
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
      retries: 0,
    });
    this.bucket = config.bucket;
    this.prefix = (config.prefix ?? "").replace(/^\/+|\/+$/g, "");
    this.baseUrl = config.endpoint
      ? `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  }

  /** The key as stored in the bucket (prefix included). */
  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  /** Percent-encode each path segment once; S3 (and aws4fetch's canonical URI) expect exactly that. */
  private encodedKey(key: string): string {
    return this.fullKey(key).split("/").map(encodeURIComponent).join("/");
  }

  private objectUrl(key: string): string {
    return `${this.baseUrl}/${this.encodedKey(key)}`;
  }

  /** Store a body under `key`. A stream body needs `length`, so the request carries Content-Length (S3 refuses chunked uploads). */
  async put(key: string, body: ReadableStream<Uint8Array> | ArrayBuffer, options: MediaObjectOptions & { length?: number }): Promise<void> {
    const headers = this.objectHeaders(options);
    if (options.length != null) headers["Content-Length"] = String(options.length);
    const res = await this.client.fetch(this.objectUrl(key), { method: "PUT", headers, body });
    await expectOk(res, `put ${key}`);
  }

  /**
   * The raw S3 GET response for `key`, with the caller's Range / If-None-Match forwarded so S3 does the
   * 206 / 304 / 416 work. The caller owns the body (read it or cancel it).
   */
  get(key: string, conditions: { range?: string; ifNoneMatch?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (conditions.range) headers["Range"] = conditions.range;
    if (conditions.ifNoneMatch) headers["If-None-Match"] = conditions.ifNoneMatch;
    return this.client.fetch(this.objectUrl(key), { method: "GET", headers });
  }

  async head(key: string): Promise<MediaObjectHead | null> {
    const res = await this.client.fetch(this.objectUrl(key), { method: "HEAD" });
    if (res.status === 404) return null;
    await expectOk(res, `head ${key}`);
    return {
      size: Number(res.headers.get("Content-Length") ?? 0),
      contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    };
  }

  /** Deleting a missing key is not an error (S3 answers 204 either way). */
  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.objectUrl(key), { method: "DELETE" });
    if (res.status !== 404) await expectOk(res, `delete ${key}`);
  }

  /** Server-side copy to a new key (a duplicated post keeps its photo without the bytes passing through the Worker). */
  async copy(fromKey: string, toKey: string, options: MediaObjectOptions): Promise<void> {
    const headers = this.objectHeaders(options);
    headers["x-amz-copy-source"] = `/${this.bucket}/${this.encodedKey(fromKey)}`;
    headers["x-amz-metadata-directive"] = "REPLACE"; // so Content-Type and the metadata above are what we say
    const res = await this.client.fetch(this.objectUrl(toKey), { method: "PUT", headers });
    await expectOk(res, `copy ${fromKey}`);
    // S3 can answer a copy with 200 and an <Error> body when it fails late; the body is always small.
    const text = await res.text();
    if (text.includes("<Error>")) throw new Error(`[s3] copy ${fromKey} -> ${toKey}: ${errorSummary(text)}`);
  }

  /** Keys (without the bucket prefix) under `prefix`, a page of up to 1000 at a time. */
  async *listKeys(prefix: string): AsyncGenerator<string[]> {
    const stored = this.fullKey(prefix);
    const strip = this.prefix ? `${this.prefix}/` : "";
    let token: string | undefined;
    do {
      const url = new URL(`${this.baseUrl}/`);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", stored);
      if (token) url.searchParams.set("continuation-token", token);
      const res = await this.client.fetch(url.toString(), { method: "GET" });
      await expectOk(res, `list ${prefix}`);
      const xml = await res.text();
      const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)]
        .map((m) => decodeXml(m[1] ?? ""))
        .filter((key) => key.startsWith(strip))
        .map((key) => key.slice(strip.length));
      if (keys.length > 0) yield keys;
      const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
      token = next ? decodeXml(next) : undefined;
    } while (token);
  }

  private objectHeaders(options: MediaObjectOptions): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": options.contentType };
    for (const [name, value] of Object.entries(options.metadata ?? {})) {
      headers[`x-amz-meta-${name.toLowerCase()}`] = value;
    }
    return headers;
  }
}

/** Throws with the S3 error code when the response isn't a success; drains the body either way. */
async function expectOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`[s3] ${what} -> ${res.status} ${errorSummary(text)}`.trim());
}

/** "<Code>AccessDenied</Code>…" -> "AccessDenied", else the first 200 characters. */
function errorSummary(xml: string): string {
  const code = /<Code>([^<]*)<\/Code>/.exec(xml)?.[1];
  const message = /<Message>([^<]*)<\/Message>/.exec(xml)?.[1];
  return code ? `${code}${message ? `: ${decodeXml(message)}` : ""}` : xml.slice(0, 200);
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The media store, or undefined while the S3 settings are missing (uploads off, deletes no-ops). */
export function mediaStore(env: Bindings): MediaStore | undefined {
  const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return undefined;
  return new MediaStore({
    bucket: S3_BUCKET,
    region: S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    endpoint: env.S3_ENDPOINT,
  });
}

/** The media store, or a 400 the app can show when uploads are switched off. */
export function requireMediaStore(env: Bindings): MediaStore {
  const store = mediaStore(env);
  if (!store) throw badRequest("Photo and video uploads are switched off in this version.");
  return store;
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

/** Absolute URL the app can load a media key from (`origin` from publicOrigin). */
export const mediaUrl = (origin: string, key: string): string => `${origin}${MEDIA_PATH}${key}`;

/**
 * Origin for the absolute URLs handed to the app (media links): PUBLIC_URL when set, else the request's own
 * origin. PUBLIC_URL matters locally: `wrangler dev` rewrites every request's URL and Host to the custom domain
 * in wrangler.toml, so without it local media links would point at production, where the dev files don't exist.
 */
export const publicOrigin = (c: Context<AppEnv>): string => c.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(c.req.url).origin;

/** Thrown by storeUpload when the body is bigger than the limit (declared or measured). */
export class MediaTooLarge extends Error {
  constructor() {
    super("media over limit");
    this.name = "MediaTooLarge";
  }
}

/**
 * Store an upload body in S3 without ever keeping more than `limit` bytes.
 * The declared Content-Length is checked first (cheap, before reading anything). The bytes are then
 * counted as they stream, so a chunked upload (no Content-Length) or a mismatching header can't push a
 * bigger file into the bucket: the counter errors the stream, which fails the put, and nothing is stored.
 * Throws MediaTooLarge; any other failure (cut-short body, S3 error) is rethrown as is.
 */
export async function storeUpload(
  store: MediaStore,
  key: string,
  body: ReadableStream<Uint8Array>,
  declaredLength: number | null,
  limit: number,
  options: MediaObjectOptions,
): Promise<{ size: number }> {
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
      // S3 needs Content-Length, so the body is streamed through FixedLengthStream, which errors (failing the
      // put, so nothing is stored) if the client sends fewer or more bytes than it declared.
      const fixed = new FixedLengthStream(declaredLength);
      const piping = counted.pipeTo(fixed.writable).catch(() => {}); // surfaces through the put instead
      await store.put(key, fixed.readable, { ...options, length: declaredLength });
      await piping;
      return { size: declaredLength };
    }
    // No Content-Length (chunked): buffer up to the limit, then store.
    const buffer = await new Response(counted).arrayBuffer();
    await store.put(key, buffer, { ...options, length: buffer.byteLength });
    return { size: buffer.byteLength };
  } catch (err) {
    if (received > limit) throw new MediaTooLarge();
    throw err;
  }
}

/** Best-effort delete of one object; a failure here must never fail the request that already updated the DB. */
export async function deleteMediaObject(store: MediaStore | undefined, key: string | null | undefined): Promise<void> {
  if (!key || !store) return;
  try {
    await store.delete(key);
  } catch (err) {
    console.warn(`[media] could not delete ${key}:`, err instanceof Error ? err.message : err);
  }
}

/** Delete every object under a prefix (e.g. `${shopId}/` when an account is deleted), in pages. Returns the count. */
export async function deleteMediaByPrefix(store: MediaStore | undefined, prefix: string): Promise<number> {
  if (!store) return 0;
  let deleted = 0;
  for await (const keys of store.listKeys(prefix)) {
    // One DELETE per object: S3's batch delete needs a checksummed XML body, and a shop has a handful of files.
    await Promise.all(keys.map((key) => store.delete(key)));
    deleted += keys.length;
  }
  return deleted;
}
