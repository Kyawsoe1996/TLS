import { Hono } from "hono";
import type { HomeResponse } from "../../../shared/types";
import { countOf, dueSoonCutoff, inactiveCutoff, startOfMonthUtc } from "../db";
import type { AppEnv } from "../env";

const homeRoutes = new Hono<AppEnv>();

/** GET /home -> dashboard counters */
homeRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");

  const [clients, fittings, inactive, ordersOpen, ordersDueSoon] = await db.batch(
    [
      { sql: "SELECT count(*) AS n FROM clients WHERE shop_id = ?", args: [shop.id] },
      {
        sql: "SELECT count(*) AS n FROM fittings WHERE shop_id = ? AND created_at >= ?",
        args: [shop.id, startOfMonthUtc()],
      },
      {
        sql: "SELECT count(*) AS n FROM clients WHERE shop_id = ? AND coalesce(last_order_at, created_at) < ?",
        args: [shop.id, inactiveCutoff()],
      },
      { sql: "SELECT count(*) AS n FROM orders WHERE shop_id = ? AND status != 'delivered'", args: [shop.id] },
      {
        sql: "SELECT count(*) AS n FROM orders WHERE shop_id = ? AND status != 'delivered' AND due_at IS NOT NULL AND due_at < ?",
        args: [shop.id, dueSoonCutoff()],
      },
    ],
    "read",
  );

  const body: HomeResponse = {
    shopName: shop.name,
    clientsCount: countOf(clients),
    fittingsThisMonth: countOf(fittings),
    inactiveCount: countOf(inactive),
    ordersOpen: countOf(ordersOpen),
    ordersDueSoon: countOf(ordersDueSoon),
  };
  return c.json(body);
});

export default homeRoutes;
