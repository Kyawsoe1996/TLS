import { Hono } from "hono";
import type { HomeResponse } from "../../../shared/types";
import { countOf, dueSoonCutoff, inactiveCutoff, rowToAppointment, startOfMonthUtc, startOfTodayUtc, upcomingWindow } from "../db";
import type { AppEnv } from "../env";

const homeRoutes = new Hono<AppEnv>();

/** How many upcoming appointments Home lists; the agenda screen (GET /appointments) has the rest. */
const UPCOMING_LIMIT = 5;

/** GET /home -> dashboard counters */
homeRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");

  const window = upcomingWindow();
  const [clients, fittings, inactive, ordersOpen, ordersDueSoon, ordersOverdue, appointmentsCount, appointmentsNext, fabricsLow, leadsNew] = await db.batch(
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
      {
        sql: "SELECT count(*) AS n FROM orders WHERE shop_id = ? AND status != 'delivered' AND due_at IS NOT NULL AND due_at < ?",
        args: [shop.id, startOfTodayUtc()],
      },
      {
        sql: "SELECT count(*) AS n FROM appointments WHERE shop_id = ? AND status = 'scheduled' AND starts_at >= ? AND starts_at < ?",
        args: [shop.id, window.from, window.to],
      },
      {
        sql: `SELECT a.*, c.name AS client_name
              FROM appointments a JOIN clients c ON c.id = a.client_id
              WHERE a.shop_id = ? AND a.status = 'scheduled' AND a.starts_at >= ? AND a.starts_at < ?
              ORDER BY a.starts_at ASC LIMIT ?`,
        args: [shop.id, window.from, window.to, UPCOMING_LIMIT],
      },
      { sql: "SELECT count(*) AS n FROM fabrics WHERE shop_id = ? AND metres_left < low_at_metres", args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM referral_leads WHERE shop_id = ? AND status = 'new'", args: [shop.id] },
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
    ordersOverdue: countOf(ordersOverdue),
    appointmentsThisWeek: countOf(appointmentsCount),
    upcomingAppointments: (appointmentsNext?.rows ?? []).map((row) => {
      const name = row["client_name"];
      return rowToAppointment(row, { clientName: name == null ? "" : String(name) });
    }),
    fabricsLow: countOf(fabricsLow),
    referralLeadsNew: countOf(leadsNew),
  };
  return c.json(body);
});

export default homeRoutes;
