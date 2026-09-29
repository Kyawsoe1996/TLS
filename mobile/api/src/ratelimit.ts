import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";
import type { Context } from "hono";
import type { AppEnv, Bindings } from "./env";
import { rateLimited } from "./errors";

/** Sliding window: 30 AI requests per user per day. */
export const AI_DAILY_LIMIT = 30;
const AI_WINDOW = "1 d";

let cached: { url: string; limiter: Ratelimit } | null = null;
let warnedMissing = false;

function getLimiter(env: Bindings): Ratelimit | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissing) {
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set - AI rate limiting is DISABLED.",
      );
      warnedMissing = true;
    }
    return null;
  }
  if (!cached || cached.url !== url) {
    cached = {
      url,
      limiter: new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(AI_DAILY_LIMIT, AI_WINDOW),
        prefix: "tls:ai",
      }),
    };
  }
  return cached.limiter;
}

/**
 * Enforce the per-user AI quota. Call right before invoking Gemini so that
 * 400/404s don't consume the user's daily allowance. Throws 429 rate_limited.
 */
export async function enforceAiRateLimit(c: Context<AppEnv>): Promise<void> {
  const limiter = getLimiter(c.env);
  if (!limiter) return;

  const result = await limiter.limit(`user:${c.get("userId")}`);

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

  if (!result.success) throw rateLimited();
}
