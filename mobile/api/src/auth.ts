import { verifyToken } from "@clerk/backend";
import type { MiddlewareHandler } from "hono";
import { getShopByOwner } from "./db";
import type { AppEnv } from "./env";
import { notFound, serverError, unauthorized } from "./errors";

/**
 * Requires `Authorization: Bearer <Clerk session token>`.
 * On success sets `userId` (the Clerk user id) on the context.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    throw unauthorized("Missing bearer token.");
  }

  if (!c.env.CLERK_SECRET_KEY) {
    console.error("[auth] CLERK_SECRET_KEY is not set");
    throw serverError("Authentication is not configured.");
  }

  let userId: string | undefined;
  try {
    const payload = await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY });
    userId = payload.sub;
  } catch (err) {
    console.warn("[auth] token verification failed:", err instanceof Error ? err.message : err);
  }
  if (!userId) throw unauthorized("Invalid or expired session token.");

  c.set("userId", userId);
  await next();
};

/**
 * For routes that need an onboarded shop. Loads the caller's shop and sets `shop` on the context.
 * 404 not_found if the user hasn't done PUT /shop yet.
 */
export const requireShop: MiddlewareHandler<AppEnv> = async (c, next) => {
  const shop = await getShopByOwner(c.get("db"), c.get("userId"));
  if (!shop) throw notFound("Set up your shop first.");
  c.set("shop", shop);
  await next();
};
