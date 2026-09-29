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
