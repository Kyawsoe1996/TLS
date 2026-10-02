import { Hono } from "hono";
import { z } from "zod";
import {
  type CreateOrderRequest,
  type ListOrdersResponse,
  ORDER_STATUSES,
  type OrderResponse,
  type OrderStatus,
  type UpdateOrderRequest,
} from "../../../shared/types";
import {
  type Db,
  getClientRow,
  getFittingRow,
  getOrderRow,
  newId,
  nowIso,
  rowToOrder,
  startOfTodayUtc,
} from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { type AssertAccepts, baht, isoDate, optionalText, parseBody, requiredText } from "../validate";

const INITIAL_STATUS: OrderStatus = "measured";

const createOrderSchema = z.object({
  garment: requiredText(80),
  fabric: optionalText(120),
  fittingId: optionalText(64), // uuid; `null`/"" unlinks on PATCH
  dueAt: isoDate.nullable().optional(),
  notes: optionalText(2000),
  price: baht, // THB; `null` clears on PATCH
  deposit: baht,
});
type _CreateAccepted = AssertAccepts<typeof createOrderSchema, CreateOrderRequest>;

/** PATCH accepts any subset; `null` clears a field. */
const updateOrderSchema = createOrderSchema.partial().extend({
  status: z.enum(ORDER_STATUSES).optional(),
});
type _UpdateAccepted = AssertAccepts<typeof updateOrderSchema, UpdateOrderRequest>;

const isOrderStatus = (v: string): v is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(v);

/** The order, only if it belongs to this shop AND this client. */
async function getClientOrderRow(db: Db, shopId: string, clientId: string, orderId: string) {
  const row = await getOrderRow(db, shopId, orderId);
  return row && row["client_id"] === clientId ? row : null;
}

/** 404 if the fitting isn't in this shop; 400 if it belongs to another client. */
async function assertFittingBelongsToClient(db: Db, shopId: string, clientId: string, fittingId: string): Promise<void> {
  const fitting = await getFittingRow(db, shopId, fittingId);
  if (!fitting) throw notFound("Fitting not found.");
  if (fitting["client_id"] !== clientId) throw badRequest("That fitting belongs to a different client.");
}

// ---------- Per-client routes. Mounted at /clients, so paths are /clients/:clientId/orders[/:orderId] ----------

const orderRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/orders -> { orders } newest first */
orderRoutes.get("/:clientId/orders", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  const rs = await db.execute({
    sql: "SELECT * FROM orders WHERE client_id = ? AND shop_id = ? ORDER BY created_at DESC",
    args: [clientId, shop.id],
  });
  const today = startOfTodayUtc();
  const body: ListOrdersResponse = { orders: rs.rows.map((row) => rowToOrder(row, { today })) };
  return c.json(body);
});

/** POST /clients/:clientId/orders -> 201 { order } (status "measured"); also sets client.lastOrderAt = now */
orderRoutes.post("/:clientId/orders", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const input = await parseBody(c, createOrderSchema);

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");
  if (input.fittingId) await assertFittingBelongsToClient(db, shop.id, clientId, input.fittingId);

  const id = newId();
  const now = nowIso();
  await db.batch(
    [
      {
        sql: `INSERT INTO orders
                (id, shop_id, client_id, fitting_id, garment, fabric, status, due_at, delivered_at, notes, price, deposit, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        args: [
          id,
          shop.id,
          clientId,
          input.fittingId ?? null,
          input.garment,
          input.fabric ?? null,
          INITIAL_STATUS,
          input.dueAt ?? null,
          input.notes ?? null,
          input.price ?? null,
          input.deposit ?? null,
          now,
          now,
        ],
      },
      { sql: "UPDATE clients SET last_order_at = ? WHERE id = ? AND shop_id = ?", args: [now, clientId, shop.id] },
    ],
    "write",
  );

  const row = await getOrderRow(db, shop.id, id);
  if (!row) throw notFound("Order not found.");
  const body: OrderResponse = { order: rowToOrder(row) };
  return c.json(body, 201);
});

/** GET /clients/:clientId/orders/:orderId -> { order } */
orderRoutes.get("/:clientId/orders/:orderId", async (c) => {
  const row = await getClientOrderRow(c.get("db"), c.get("shop").id, c.req.param("clientId"), c.req.param("orderId"));
  if (!row) throw notFound("Order not found.");
  const body: OrderResponse = { order: rowToOrder(row) };
  return c.json(body);
});

/**
 * PATCH /clients/:clientId/orders/:orderId -> { order }
 * Updates only the keys sent (`null` clears). Always bumps updatedAt. Moving to "delivered" stamps
 * deliveredAt (and client.lastOrderAt); moving to any other status clears deliveredAt.
 */
orderRoutes.patch("/:clientId/orders/:orderId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const orderId = c.req.param("orderId");
  const input = await parseBody(c, updateOrderSchema);

  const existing = await getClientOrderRow(db, shop.id, clientId, orderId);
  if (!existing) throw notFound("Order not found.");
  if (input.fittingId) await assertFittingBelongsToClient(db, shop.id, clientId, input.fittingId);

  const columns: Record<keyof UpdateOrderRequest, string> = {
    garment: "garment",
    fabric: "fabric",
    fittingId: "fitting_id",
    dueAt: "due_at",
    notes: "notes",
    status: "status",
    price: "price",
    deposit: "deposit",
  };
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const key of Object.keys(columns) as (keyof UpdateOrderRequest)[]) {
    const value = input[key];
    if (value === undefined) continue; // not sent -> leave unchanged
    sets.push(`${columns[key]} = ?`);
    args.push(value);
  }

  const now = nowIso();
  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  if (input.status === "delivered" && existing["delivered_at"] == null) {
    sets.push("delivered_at = ?");
    args.push(now);
    statements.push({
      sql: "UPDATE clients SET last_order_at = ? WHERE id = ? AND shop_id = ?",
      args: [now, clientId, shop.id],
    });
  } else if (input.status !== undefined && input.status !== "delivered") {
    sets.push("delivered_at = NULL");
  }
  sets.push("updated_at = ?");
  args.push(now, orderId, clientId, shop.id);
  statements.unshift({
    sql: `UPDATE orders SET ${sets.join(", ")} WHERE id = ? AND client_id = ? AND shop_id = ?`,
    args,
  });
  await db.batch(statements, "write");

  const row = await getOrderRow(db, shop.id, orderId);
  if (!row) throw notFound("Order not found.");
  const body: OrderResponse = { order: rowToOrder(row) };
  return c.json(body);
});

/** DELETE /clients/:clientId/orders/:orderId -> 204 */
orderRoutes.delete("/:clientId/orders/:orderId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const orderId = c.req.param("orderId");

  const existing = await getClientOrderRow(db, shop.id, clientId, orderId);
  if (!existing) throw notFound("Order not found.");

  await db.execute({
    sql: "DELETE FROM orders WHERE id = ? AND client_id = ? AND shop_id = ?",
    args: [orderId, clientId, shop.id],
  });
  return c.body(null, 204);
});

export default orderRoutes;

// ---------- Shop-wide list. Mounted at /orders ----------

export const shopOrderRoutes = new Hono<AppEnv>();

/**
 * GET /orders?open=true|false&status=<OrderStatus> -> { orders } with clientName.
 * Default: open orders (status != delivered), overdue first, then by due date, then undated, newest first.
 * `open=false` or `status=delivered`: delivered orders, most recently delivered first.
 */
shopOrderRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const openParam = (c.req.query("open") ?? "").toLowerCase();
  const statusParam = c.req.query("status");

  let status: OrderStatus | undefined;
  if (statusParam !== undefined) {
    if (!isOrderStatus(statusParam)) throw badRequest(`status must be one of: ${ORDER_STATUSES.join(", ")}.`);
    status = statusParam;
  }
  const delivered = status ? status === "delivered" : ["false", "0"].includes(openParam);

  let sql = `SELECT o.*, c.name AS client_name
             FROM orders o JOIN clients c ON c.id = o.client_id
             WHERE o.shop_id = ?`;
  const args: string[] = [shop.id];
  if (status) {
    sql += " AND o.status = ?";
    args.push(status);
  } else {
    sql += delivered ? " AND o.status = 'delivered'" : " AND o.status != 'delivered'";
  }
  sql += delivered
    ? " ORDER BY o.delivered_at DESC, o.created_at DESC"
    : " ORDER BY (o.due_at IS NULL), o.due_at ASC, o.created_at DESC";

  const rs = await db.execute({ sql, args });
  const today = startOfTodayUtc();
  const body: ListOrdersResponse = {
    orders: rs.rows.map((row) => {
      const name = row["client_name"];
      return rowToOrder(row, { clientName: name == null ? "" : String(name), today });
    }),
  };
  return c.json(body);
});
