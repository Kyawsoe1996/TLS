import { createClerkClient } from "@clerk/backend";
import { Hono } from "hono";
import { getShopByOwner } from "../db";
import type { AppEnv } from "../env";
import { deleteMediaByPrefix } from "../media";

const accountRoutes = new Hono<AppEnv>();

/** DELETE /account -> 204. Erases the shop and all its data (including media files), then deletes the Clerk user. */
accountRoutes.delete("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const shop = await getShopByOwner(db, userId);
  if (shop) {
    // Media first, while the posts rows (and their keys) still exist; best effort - every key for this shop
    // sits under `<shopId>/`, so a retry or a later sweep can find anything left behind.
    try {
      await deleteMediaByPrefix(c.env.MEDIA, `${shop.id}/`);
    } catch (err) {
      console.warn(`[account] could not delete media for shop ${shop.id}:`, err instanceof Error ? err.message : err);
    }
    await db.batch(
      [
        { sql: "DELETE FROM posts WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM messages WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM orders WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM fittings WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM clients WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM generations WHERE shop_id = ?", args: [shop.id] },
        { sql: "DELETE FROM shops WHERE id = ?", args: [shop.id] },
      ],
      "write",
    );
  }

  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
  try {
    await clerk.users.deleteUser(userId);
  } catch (err) {
    // Already gone in Clerk? Treat as success - the data is deleted either way.
    if (!isClerkNotFound(err)) throw err;
    console.warn(`[account] Clerk user ${userId} was already deleted`);
  }

  return c.body(null, 204);
});

function isClerkNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status?: unknown }).status === 404;
}

export default accountRoutes;
