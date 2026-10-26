import { type Duration, Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";
import type { Context } from "hono";
import type { AppEnv, Bindings } from "./env";
import { rateLimited } from "./errors";

/** Sliding window: 30 AI requests per user per day. */
export const AI_DAILY_LIMIT = 30;
/** Sliding window: 60 emails per user per day. */
export const EMAIL_DAILY_LIMIT = 60;
/** Sliding window: 10 referral-form submissions per client address per hour (the public /r/:code page). */
export const REFERRAL_HOURLY_LIMIT = 10;

interface Bucket {
  /** Redis key prefix - keeps each quota separate. */
  prefix: string;
  limit: number;
  window: Duration;
  /** 429 message shown in the app. */
  message: string;
}

const BUCKETS = {
  ai: {
    prefix: "tls:ai",
    limit: AI_DAILY_LIMIT,
    window: "1 d",
    message: "You've reached today's AI limit. Try again tomorrow.",
  },
  email: {
    prefix: "tls:email",
    limit: EMAIL_DAILY_LIMIT,
    window: "1 d",
    message: "You've reached today's email limit. Try again tomorrow.",
  },
  referral: {
    prefix: "tls:referral",
    limit: REFERRAL_HOURLY_LIMIT,
    window: "1 h",
    message: "Too many requests from this address. Please try again in an hour.",
  },
} as const satisfies Record<string, Bucket>;
type BucketName = keyof typeof BUCKETS;

let cached: { url: string; redis: Redis; limiters: Partial<Record<BucketName, Ratelimit>> } | null = null;
let warnedMissing = false;

function getLimiter(env: Bindings, name: BucketName): Ratelimit | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissing) {
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set - AI, email and referral-form rate limiting is DISABLED.",
      );
      warnedMissing = true;
    }
    return null;
  }
  if (!cached || cached.url !== url) {
    cached = { url, redis: new Redis({ url, token }), limiters: {} };
  }
  let limiter = cached.limiters[name];
  if (!limiter) {
    const bucket = BUCKETS[name];
    limiter = new Ratelimit({
      redis: cached.redis,
      limiter: Ratelimit.slidingWindow(bucket.limit, bucket.window),
      prefix: bucket.prefix,
    });
    cached.limiters[name] = limiter;
  }
  return limiter;
}

/**
 * Enforce one bucket's quota for `identifier` (default: the signed-in user), setting X-RateLimit-* headers.
 * Throws 429 rate_limited.
 */
async function enforceRateLimit(c: Context<AppEnv>, name: BucketName, identifier?: string): Promise<void> {
  const limiter = getLimiter(c.env, name);
  if (!limiter) return;

  const result = await limiter.limit(identifier ?? `user:${c.get("userId")}`);

  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  c.header("X-RateLimit-Reset", String(result.reset));

  if (result.pending) {
    try {
      c.executionCtx.waitUntil(result.pending);
    } catch {
      // executionCtx is unavailable outside a real Worker request; ignore.
    }
  }

  if (!result.success) throw rateLimited(BUCKETS[name].message);
}

/**
 * Enforce the per-user AI quota. Call right before invoking Gemini so that
 * 400/404s don't consume the user's daily allowance. Throws 429 rate_limited.
 */
export const enforceAiRateLimit = (c: Context<AppEnv>): Promise<void> => enforceRateLimit(c, "ai");

/** Enforce the per-user email quota. Call after validation, right before sending. Throws 429 rate_limited. */
export const enforceEmailRateLimit = (c: Context<AppEnv>): Promise<void> => enforceRateLimit(c, "email");

/**
 * Enforce the public referral form's per-address quota (no signed-in user there: `ip` is the client address,
 * e.g. the cf-connecting-ip header). Throws 429 rate_limited.
 */
export const enforceReferralRateLimit = (c: Context<AppEnv>, ip: string): Promise<void> => enforceRateLimit(c, "referral", `ip:${ip}`);
