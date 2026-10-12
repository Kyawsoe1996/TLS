import type { Client as DbClient } from "@libsql/client/web";
import type { Shop } from "../../shared/types";

/** Worker bindings: secrets (`wrangler secret put` / .dev.vars) and [vars] from wrangler.toml. */
export interface Bindings {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY?: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  /**
   * Origin the app should use for links the API hands out (media URLs), e.g. "https://api.example.com".
   * Needed locally because `wrangler dev` rewrites request URLs to the custom domain in wrangler.toml;
   * falls back to the request's own origin when unset.
   */
  PUBLIC_URL?: string;
  /** Resend (https://resend.com). Without a key, emails are logged as "simulated" instead of sent. */
  RESEND_API_KEY?: string;
  /** Sender: "Shop <hello@yourdomain.com>" (verified Resend domain) or a bare address. Default onboarding@resend.dev. */
  RESEND_FROM?: string;
  /**
   * Amazon S3 bucket for post photos / videos (see media.ts). All four are needed to switch media on; while
   * any is missing, uploads answer 400 and existing media is skipped. Bucket, region and prefix are plain
   * config ([vars] in wrangler.toml); the two keys are secrets (.dev.vars locally, `wrangler secret put` live).
   * The IAM user needs s3:PutObject, s3:GetObject, s3:DeleteObject and s3:ListBucket on the bucket (prefix).
   */
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  /** Folder inside the bucket for this app's files, e.g. "magicktls/prod" (dev uses "magicktls/dev"). Optional. */
  S3_PREFIX?: string;
  /** Path-style endpoint for S3-compatible storage (MinIO, …), e.g. "https://s3.example.com". Unset for AWS. */
  S3_ENDPOINT?: string;
}

/** Per-request values set by middleware. */
export interface Variables {
  /** Clerk user id (JWT `sub`), set by requireAuth. */
  userId: string;
  /** Turso client for this request, set in index.ts. */
  db: DbClient;
  /** The caller's shop, set by requireShop (routes that need onboarding done). */
  shop: Shop;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
