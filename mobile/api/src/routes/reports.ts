import { Hono } from "hono";
import type { ResultSet, Row } from "@libsql/client/web";
import type { ReportResponse } from "../../../shared/types";
import { countOf, inactiveCutoff, type Db } from "../db";
import type { AppEnv } from "../env";
import { badRequest } from "../errors";

// Monthly report: GET /reports?month=YYYY-MM. See shared/types.ts "Payments and reports".
// Every timestamp is UTC ISO 8601 TEXT, so a month is the half-open range [YYYY-MM-01T00:00:00.000Z, next month)
// compared as plain strings.
const reportRoutes = new Hono<AppEnv>();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** How many months the bar chart covers (the selected month and the five before it). */
const MONTHS_SHOWN = 6;
const GARMENTS_SHOWN = 5;
const QUIET_TO_CALL = 4;
const BALANCES_TO_CALL = 2;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "2026-10" for `now`, in UTC (the same calendar startOfMonthUtc uses). */
export function monthKeyUtc(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}

/** The month `offset` months away from `month`: shiftMonth("2026-01", -1) → "2025-12". */
export function shiftMonth(month: string, offset: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** First instant of a month as stored ISO text. */
const monthStart = (month: string): string => `${month}-01T00:00:00.000Z`;

/** `[from, to)` ISO bounds covering `month` and the `count - 1` months before it. */
function monthRange(month: string, count = 1): { from: string; to: string } {
  return { from: monthStart(shiftMonth(month, 1 - count)), to: monthStart(shiftMonth(month, 1)) };
}

/** Read `SELECT coalesce(sum(...), 0) AS total ...` as whole baht (prices are REAL in the table). */
function sumOf(rs: ResultSet | undefined): number {
  const v = rs?.rows[0]?.["total"];
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const str = (row: Row, key: string): string => {
  const v = row[key];
  return v == null ? "" : String(v);
};

const num = (row: Row, key: string): number => {
  const v = row[key];
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 12000 → "฿12,000" (whole baht; same shape as the app's formatThb). */
function thb(value: number): string {
  const whole = Math.round(Math.abs(value));
  return `${value < 0 ? "-" : ""}฿${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Whole calendar months between an ISO instant and now (UTC): "this month", "1 month ago", "4 months ago". */
function monthsAgo(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "a while ago";
  let months = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
  if (now.getUTCDate() < d.getUTCDate()) months -= 1;
  if (months <= 0) return "this month";
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** "12 Oct" for a stored ISO instant (UTC calendar day). */
function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

interface MonthFigures {
  newClients: number;
  fittings: number;
  ordersCreated: number;
  ordersDelivered: number;
  moneyCollected: number;
  revenueDelivered: number;
}

/** One read batch for everything that is counted inside a month. */
async function monthFigures(db: Db, shopId: string, month: string): Promise<MonthFigures> {
  const { from, to } = monthRange(month);
  const inMonth = (column: string) => `${column} >= ? AND ${column} < ?`;
  const [clients, fittings, created, delivered, collected, revenue] = await db.batch(
    [
      { sql: `SELECT count(*) AS n FROM clients WHERE shop_id = ? AND ${inMonth("created_at")}`, args: [shopId, from, to] },
      { sql: `SELECT count(*) AS n FROM fittings WHERE shop_id = ? AND ${inMonth("created_at")}`, args: [shopId, from, to] },
      { sql: `SELECT count(*) AS n FROM orders WHERE shop_id = ? AND ${inMonth("created_at")}`, args: [shopId, from, to] },
      { sql: `SELECT count(*) AS n FROM orders WHERE shop_id = ? AND ${inMonth("delivered_at")}`, args: [shopId, from, to] },
      {
        sql: `SELECT coalesce(sum(amount), 0) AS total FROM order_payments WHERE shop_id = ? AND ${inMonth("paid_at")}`,
        args: [shopId, from, to],
      },
      {
        sql: `SELECT coalesce(sum(price), 0) AS total FROM orders WHERE shop_id = ? AND ${inMonth("delivered_at")}`,
        args: [shopId, from, to],
      },
    ],
    "read",
  );
  return {
    newClients: countOf(clients),
    fittings: countOf(fittings),
    ordersCreated: countOf(created),
    ordersDelivered: countOf(delivered),
    moneyCollected: sumOf(collected),
    revenueDelivered: sumOf(revenue),
  };
}

/** GET /reports?month=YYYY-MM → ReportResponse (default: the current month, UTC). */
reportRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const now = new Date();

  const monthParam = c.req.query("month")?.trim();
  if (monthParam && !MONTH_RE.test(monthParam)) throw badRequest("month must look like 2026-10");
  const month = monthParam || monthKeyUtc(now);
  const previousMonth = shiftMonth(month, -1);

  const chart = monthRange(month, MONTHS_SHOWN);
  const thisMonth = monthRange(month);
  const cutoff = inactiveCutoff(now.getTime());

  const [current, previous, today] = await Promise.all([
    monthFigures(db, shop.id, month),
    monthFigures(db, shop.id, previousMonth),
    db.batch(
      [
        // Today's figures: what is still open and who has gone quiet, whatever month is being looked at.
        {
          sql: `SELECT coalesce(sum(max(price - coalesce(deposit, 0), 0)), 0) AS total
                FROM orders WHERE shop_id = ? AND status != 'delivered' AND price IS NOT NULL`,
          args: [shop.id],
        },
        { sql: "SELECT count(*) AS n FROM orders WHERE shop_id = ? AND status != 'delivered'", args: [shop.id] },
        {
          sql: "SELECT count(*) AS n FROM clients WHERE shop_id = ? AND coalesce(last_order_at, created_at) < ?",
          args: [shop.id, cutoff],
        },
        // The six-month chart, grouped by the month in the ISO text.
        {
          sql: `SELECT substr(delivered_at, 1, 7) AS month, count(*) AS n
                FROM orders WHERE shop_id = ? AND delivered_at >= ? AND delivered_at < ?
                GROUP BY substr(delivered_at, 1, 7)`,
          args: [shop.id, chart.from, chart.to],
        },
        {
          sql: `SELECT substr(paid_at, 1, 7) AS month, coalesce(sum(amount), 0) AS total
                FROM order_payments WHERE shop_id = ? AND paid_at >= ? AND paid_at < ?
                GROUP BY substr(paid_at, 1, 7)`,
          args: [shop.id, chart.from, chart.to],
        },
        {
          sql: `SELECT garment, count(*) AS n FROM orders WHERE shop_id = ? AND delivered_at >= ? AND delivered_at < ?
                GROUP BY garment ORDER BY n DESC LIMIT ?`,
          args: [shop.id, thisMonth.from, thisMonth.to, GARMENTS_SHOWN],
        },
        // Clients to call: the quietest clients first, with what they last ordered...
        {
          sql: `SELECT c.id, c.name, c.last_order_at, c.created_at,
                       (SELECT o.garment FROM orders o WHERE o.client_id = c.id AND o.shop_id = c.shop_id
                        ORDER BY o.created_at DESC LIMIT 1) AS garment
                FROM clients c
                WHERE c.shop_id = ? AND coalesce(c.last_order_at, c.created_at) < ?
                ORDER BY coalesce(c.last_order_at, c.created_at) ASC LIMIT ?`,
          args: [shop.id, cutoff, QUIET_TO_CALL],
        },
        // ...then ready orders still owing money, the longest-waiting first.
        {
          sql: `SELECT o.client_id, c.name, o.price, o.deposit, o.updated_at
                FROM orders o JOIN clients c ON c.id = o.client_id
                WHERE o.shop_id = ? AND o.status = 'ready' AND o.price IS NOT NULL AND o.price - coalesce(o.deposit, 0) > 0
                ORDER BY o.updated_at ASC LIMIT ?`,
          args: [shop.id, BALANCES_TO_CALL],
        },
      ],
      "read",
    ),
  ]);
  const [stillOwed, openOrders, quietClients, deliveredByMonth, collectedByMonth, garments, quietRows, balanceRows] = today;

  const delivered = new Map<string, number>();
  for (const row of deliveredByMonth?.rows ?? []) delivered.set(str(row, "month"), num(row, "n"));
  const collected = new Map<string, number>();
  for (const row of collectedByMonth?.rows ?? []) collected.set(str(row, "month"), Math.round(num(row, "total")));
  const months: ReportResponse["months"] = [];
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const key = shiftMonth(month, -i);
    months.push({ month: key, ordersDelivered: delivered.get(key) ?? 0, moneyCollected: collected.get(key) ?? 0 });
  }

  const clientsToCall: ReportResponse["clientsToCall"] = [];
  for (const row of quietRows?.rows ?? []) {
    const lastOrderAt = row["last_order_at"] == null ? null : str(row, "last_order_at");
    const garment = row["garment"] == null ? null : str(row, "garment").trim();
    const detail = lastOrderAt
      ? `Last order ${monthsAgo(lastOrderAt, now)}${garment ? ` · ${garment.toLowerCase()}` : ""}`
      : `No order yet · added ${monthsAgo(str(row, "created_at"), now)}`;
    clientsToCall.push({ clientId: str(row, "id"), name: str(row, "name"), reason: "quiet", detail });
  }
  for (const row of balanceRows?.rows ?? []) {
    const clientId = str(row, "client_id");
    if (clientsToCall.some((entry) => entry.clientId === clientId)) continue;
    const balance = Math.round(num(row, "price") - num(row, "deposit"));
    const since = shortDay(str(row, "updated_at"));
    clientsToCall.push({
      clientId,
      name: str(row, "name"),
      reason: "balance",
      detail: `Balance ${thb(balance)} outstanding${since ? ` · ready since ${since}` : ""}`,
    });
  }

  const body: ReportResponse = {
    month,
    ...current,
    stillOwed: sumOf(stillOwed),
    openOrders: countOf(openOrders),
    quietClients: countOf(quietClients),
    previous: {
      month: previousMonth,
      newClients: previous.newClients,
      fittings: previous.fittings,
      ordersDelivered: previous.ordersDelivered,
      moneyCollected: previous.moneyCollected,
    },
    months,
    garments: (garments?.rows ?? []).map((row) => ({ garment: str(row, "garment"), delivered: num(row, "n") })),
    clientsToCall,
  };
  return c.json(body);
});

export default reportRoutes;
