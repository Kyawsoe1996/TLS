import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type CreateOrderRequest,
  type ListOrdersResponse,
  ORDER_PHOTO_LIMITS,
  ORDER_STATUSES,
  type OrderResponse,
  type OrderStatus,
  type UpdateOrderRequest,
} from "../../../shared/types";
import {
  countOf,
  type Db,
  getClientOrderPhotos,
  getClientRow,
  getFittingRow,
  getOrderPhotoRow,
  getOrderPhotos,
  getOrderRow,
  newId,
  nowIso,
  rowToOrder,
  startOfTodayUtc,
} from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import {
  declaredLength,
  deleteMediaObject,
  deleteMediaObjects,
  mediaStore,
  MediaTooLarge,
  newOrderPhotoKey,
  normalizeContentType,
  numberHeader,
  publicOrigin,
  requireMediaStore,
  storeUpload,
} from "../media";
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

/** Photo size limit in whole MB, for the 413 message. */
const PHOTO_MB = Math.round(ORDER_PHOTO_LIMITS.bytes / (1024 * 1024));
const isPhotoType = (contentType: string): boolean => (ORDER_PHOTO_LIMITS.types as readonly string[]).includes(contentType);

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

/** `{ order }` for every single-order response: the row plus its photos, oldest first. */
async function orderResponse(c: Context<AppEnv>, orderId: string): Promise<OrderResponse> {
  const db = c.get("db");
  const shop = c.get("shop");
  const row = await getOrderRow(db, shop.id, orderId);
  if (!row) throw notFound("Order not found.");
  const photos = await getOrderPhotos(db, shop.id, orderId, publicOrigin(c));
  return { order: rowToOrder(row, { photos }) };
}

// ---------- Per-client routes. Mounted at /clients, so paths are /clients/:clientId/orders[/:orderId] ----------

const orderRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/orders -> { orders } newest first, each with its photos (one extra query for the lot) */
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
  const photos = await getClientOrderPhotos(db, shop.id, clientId, publicOrigin(c));
  const today = startOfTodayUtc();
  const body: ListOrdersResponse = {
    orders: rs.rows.map((row) => {
      const order = rowToOrder(row, { today });
      order.photos = photos.get(order.id) ?? [];
      return order;
    }),
  };
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

  return c.json(await orderResponse(c, id), 201);
});

/** GET /clients/:clientId/orders/:orderId -> { order } */
orderRoutes.get("/:clientId/orders/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const row = await getClientOrderRow(c.get("db"), c.get("shop").id, c.req.param("clientId"), orderId);
  if (!row) throw notFound("Order not found.");
  return c.json(await orderResponse(c, orderId));
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

  return c.json(await orderResponse(c, orderId));
});

/**
 * DELETE /clients/:clientId/orders/:orderId -> 204. Appointments linked to the order stay, unlinked.
 * The order's photo rows go with it; their files are removed afterwards, best effort.
 */
orderRoutes.delete("/:clientId/orders/:orderId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const orderId = c.req.param("orderId");

  const existing = await getClientOrderRow(db, shop.id, clientId, orderId);
  if (!existing) throw notFound("Order not found.");

  const photoRows = await db.execute({
    sql: "SELECT media_key FROM order_photos WHERE order_id = ? AND shop_id = ?",
    args: [orderId, shop.id],
  });
  await db.batch(
    [
      {
        sql: "UPDATE appointments SET order_id = NULL, updated_at = ? WHERE order_id = ? AND shop_id = ?",
        args: [nowIso(), orderId, shop.id],
      },
      { sql: "DELETE FROM order_photos WHERE order_id = ? AND shop_id = ?", args: [orderId, shop.id] },
      { sql: "DELETE FROM orders WHERE id = ? AND client_id = ? AND shop_id = ?", args: [orderId, clientId, shop.id] },
    ],
    "write",
  );
  await deleteMediaObjects(mediaStore(c.env), photoRows.rows.map((row) => row["media_key"] as string | null));
  return c.body(null, 204);
});

// ---------- Progress photos: /clients/:clientId/orders/:orderId/photos[/:photoId] ----------

/**
 * PUT /clients/:clientId/orders/:orderId/photos -> 201 { order } with the new photo appended.
 * Raw image body; Content-Type must be one of ORDER_PHOTO_LIMITS.types, X-Media-Width / X-Media-Height are
 * optional numbers and X-Photo-Stage an optional OrderStatus (default: the order's current status).
 * 413 over ORDER_PHOTO_LIMITS.bytes, 400 once the order has ORDER_PHOTO_LIMITS.perOrder photos.
 */
orderRoutes.put("/:clientId/orders/:orderId/photos", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const orderId = c.req.param("orderId");

  const existing = await getClientOrderRow(db, shop.id, clientId, orderId);
  if (!existing) throw notFound("Order not found.");
  const store = requireMediaStore(c.env);

  const contentType = normalizeContentType(c.req.header("Content-Type"));
  if (!isPhotoType(contentType)) throw badRequest("Use a JPEG, PNG or WebP photo.");
  const width = numberHeader(c.req.header("X-Media-Width"), "X-Media-Width");
  const height = numberHeader(c.req.header("X-Media-Height"), "X-Media-Height");

  const stageHeader = (c.req.header("X-Photo-Stage") ?? "").trim();
  let stage: OrderStatus;
  if (stageHeader) {
    if (!isOrderStatus(stageHeader)) throw badRequest(`X-Photo-Stage must be one of: ${ORDER_STATUSES.join(", ")}.`);
    stage = stageHeader;
  } else {
    const current = String(existing["status"] ?? "");
    stage = isOrderStatus(current) ? current : INITIAL_STATUS;
  }

  const count = countOf(
    await db.execute({ sql: "SELECT count(*) AS n FROM order_photos WHERE order_id = ? AND shop_id = ?", args: [orderId, shop.id] }),
  );
  if (count >= ORDER_PHOTO_LIMITS.perOrder) {
    throw badRequest(`An order can have up to ${ORDER_PHOTO_LIMITS.perOrder} photos. Remove one to add another.`);
  }

  const limit = ORDER_PHOTO_LIMITS.bytes;
  const declared = declaredLength(c);
  if (declared != null && declared > limit) throw payloadTooLarge(`Photos up to ${PHOTO_MB} MB.`);
  const raw = c.req.raw.body;
  if (!raw) throw badRequest("Send the photo as the request body.");

  const key = newOrderPhotoKey(shop.id, orderId, contentType);
  let stored: { size: number };
  try {
    stored = await storeUpload(store, key, raw, declared, limit, { contentType, metadata: { shopId: shop.id, orderId } });
  } catch (err) {
    if (err instanceof MediaTooLarge) throw payloadTooLarge(`Photos up to ${PHOTO_MB} MB.`);
    console.warn(`[orders] photo upload for ${orderId} failed:`, err instanceof Error ? err.message : err);
    throw badRequest("The upload didn't complete. Please try again.");
  }
  if (stored.size === 0) {
    await deleteMediaObject(mediaStore(c.env), key);
    throw badRequest("The file is empty.");
  }

  const now = nowIso();
  await db.batch(
    [
      {
        sql: `INSERT INTO order_photos
                (id, shop_id, client_id, order_id, media_key, stage, content_type, width, height, size, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [newId(), shop.id, clientId, orderId, key, stage, contentType, width, height, stored.size, now],
      },
      { sql: "UPDATE orders SET updated_at = ? WHERE id = ? AND shop_id = ?", args: [now, orderId, shop.id] },
    ],
    "write",
  );

  return c.json(await orderResponse(c, orderId), 201);
});

/** DELETE /clients/:clientId/orders/:orderId/photos/:photoId -> { order } (the file is deleted too, best effort) */
orderRoutes.delete("/:clientId/orders/:orderId/photos/:photoId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const orderId = c.req.param("orderId");
  const photoId = c.req.param("photoId");

  const existing = await getClientOrderRow(db, shop.id, clientId, orderId);
  if (!existing) throw notFound("Order not found.");
  const photo = await getOrderPhotoRow(db, shop.id, photoId);
  if (!photo || photo["order_id"] !== orderId) throw notFound("Photo not found.");

  const now = nowIso();
  await db.batch(
    [
      { sql: "DELETE FROM order_photos WHERE id = ? AND order_id = ? AND shop_id = ?", args: [photoId, orderId, shop.id] },
      { sql: "UPDATE orders SET updated_at = ? WHERE id = ? AND shop_id = ?", args: [now, orderId, shop.id] },
    ],
    "write",
  );
  await deleteMediaObject(mediaStore(c.env), photo["media_key"] as string | null);

  return c.json(await orderResponse(c, orderId));
});

export default orderRoutes;

// ---------- Shop-wide list. Mounted at /orders ----------

export const shopOrderRoutes = new Hono<AppEnv>();

/**
 * GET /orders?open=true|false&status=<OrderStatus> -> { orders } with clientName (and `photos: []`).
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
