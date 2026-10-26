import { Hono } from "hono";
import { z } from "zod";
import {
  type AddFabricMovementRequest,
  type CreateFabricRequest,
  FABRIC_KINDS,
  FABRIC_LIMITS,
  type FabricDetailResponse,
  type FabricMovementResponse,
  type FabricResponse,
  type ListFabricsResponse,
  type UpdateFabricRequest,
} from "../../../shared/types";
import { countOf, type Db, getFabricRow, newId, nowIso, rowToFabric, rowToFabricMovement, rowToOrder, startOfTodayUtc } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { type AssertAccepts, oneOf, optionalText, parseBody, requiredText } from "../validate";

// Fabric stock: GET /fabrics, POST /fabrics, GET /fabrics/:id, PATCH /fabrics/:id, DELETE /fabrics/:id,
// POST /fabrics/:id/movements. See shared/types.ts "Fabric stock". Mounted at /fabrics behind auth + requireShop.

const DEFAULT_KIND = "suiting" as const;
const DEFAULT_LOW_AT = 3;

/** Lengths are kept to one decimal (what the app shows), so round away anything finer before it reaches the DB. */
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

/** Metres on the shelf: 0–FABRIC_LIMITS.maxMetres, one decimal. */
const metresOnShelf = z
  .number({ error: "must be a number (metres)" })
  .min(0, "must be 0 or more")
  .max(FABRIC_LIMITS.maxMetres, `must be at most ${FABRIC_LIMITS.maxMetres} m`)
  .transform(oneDecimal);

/** The "warn me below" line: 0–100 m, one decimal. */
const lowAtMetres = z
  .number({ error: "must be a number (metres)" })
  .min(0, "must be 0 or more")
  .max(100, "must be at most 100 m")
  .transform(oneDecimal);

/** Optional whole number in a range; like optionalText, `undefined` = not sent and `null` = clear. */
const optionalInt = (min: number, max: number, what: string) =>
  z
    .number({ error: `must be a number (${what})` })
    .int(`must be a whole number (${what})`)
    .min(min, `must be at least ${min}`)
    .max(max, `must be at most ${max}`)
    .nullable()
    .optional();

/** Swatch colour as "#RRGGBB" (stored upper-case); `null` / "" clears it. */
const swatch = z
  .string({ error: "must be text" })
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v.toUpperCase() : null))
  .refine((v) => !v || /^#[0-9A-F]{6}$/.test(v), "must be a colour like #1E2D4D");

const createFabricSchema = z.object({
  name: requiredText(120),
  supplier: optionalText(80),
  colour: optionalText(80),
  kind: oneOf(FABRIC_KINDS).optional(),
  widthCm: optionalInt(50, 400, "cm"),
  metresLeft: metresOnShelf.optional(),
  lowAtMetres: lowAtMetres.optional(),
  costPerMetre: optionalInt(0, 1_000_000, "THB"),
  swatch,
  notes: optionalText(2000),
});
type _CreateAccepted = AssertAccepts<typeof createFabricSchema, CreateFabricRequest>;

/** PATCH accepts any subset except metresLeft (that goes through a movement); `null` clears an optional field. */
const updateFabricSchema = createFabricSchema.omit({ metresLeft: true }).partial();
type _UpdateAccepted = AssertAccepts<typeof updateFabricSchema, UpdateFabricRequest>;

/** A delivery (+) or a stock-take correction (+/−): non-zero, one decimal, within ±maxMetres. */
const movementSchema = z.object({
  metres: z
    .number({ error: "must be a number (metres)" })
    .min(-FABRIC_LIMITS.maxMetres, `must be at least −${FABRIC_LIMITS.maxMetres} m`)
    .max(FABRIC_LIMITS.maxMetres, `must be at most ${FABRIC_LIMITS.maxMetres} m`)
    .transform(oneDecimal)
    .refine((v) => v !== 0, "must not be 0"),
  reason: oneOf(["received", "correction"] as const),
  note: optionalText(200),
});
type _MovementAccepted = AssertAccepts<typeof movementSchema, AddFabricMovementRequest>;

type Statement = { sql: string; args: (string | number | null)[] };

/** `{ fabric }` for the single-fabric responses. */
async function fabricResponse(db: Db, shopId: string, fabricId: string): Promise<FabricResponse> {
  const row = await getFabricRow(db, shopId, fabricId);
  if (!row) throw notFound("Fabric not found.");
  return { fabric: rowToFabric(row) };
}

function movementStatement(shopId: string, fabricId: string, metres: number, reason: "received" | "correction", note: string | null, now: string): Statement {
  return {
    sql: `INSERT INTO fabric_movements (id, shop_id, fabric_id, order_id, metres, reason, note, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    args: [newId(), shopId, fabricId, metres, reason, note, now],
  };
}

const fabricRoutes = new Hono<AppEnv>();

/** GET /fabrics?low=true -> { fabrics }: low ones first, then by name; `low=true` keeps only the ones under their minimum. */
fabricRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const lowOnly = ["true", "1"].includes((c.req.query("low") ?? "").toLowerCase());

  let sql = "SELECT * FROM fabrics WHERE shop_id = ?";
  if (lowOnly) sql += " AND metres_left < low_at_metres";
  sql += " ORDER BY (metres_left < low_at_metres) DESC, name COLLATE NOCASE ASC";

  const rs = await db.execute({ sql, args: [shop.id] });
  const body: ListFabricsResponse = { fabrics: rs.rows.map(rowToFabric) };
  return c.json(body);
});

/** POST /fabrics -> 201 { fabric }. A starting length is also recorded as a "received" movement ("Opening stock"). */
fabricRoutes.post("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createFabricSchema);

  const count = countOf(await db.execute({ sql: "SELECT count(*) AS n FROM fabrics WHERE shop_id = ?", args: [shop.id] }));
  if (count >= FABRIC_LIMITS.perShop) {
    throw badRequest(`A shop can keep up to ${FABRIC_LIMITS.perShop} fabrics. Remove one to add another.`);
  }

  const id = newId();
  const now = nowIso();
  const metresLeft = input.metresLeft ?? 0;
  const statements: Statement[] = [
    {
      sql: `INSERT INTO fabrics
              (id, shop_id, name, supplier, colour, kind, width_cm, metres_left, low_at_metres, cost_per_metre, swatch, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        shop.id,
        input.name,
        input.supplier ?? null,
        input.colour ?? null,
        input.kind ?? DEFAULT_KIND,
        input.widthCm ?? null,
        metresLeft,
        input.lowAtMetres ?? DEFAULT_LOW_AT,
        input.costPerMetre ?? null,
        input.swatch ?? null,
        input.notes ?? null,
        now,
        now,
      ],
    },
  ];
  if (metresLeft > 0) statements.push(movementStatement(shop.id, id, metresLeft, "received", "Opening stock", now));
  await db.batch(statements, "write");

  return c.json(await fabricResponse(db, shop.id, id), 201);
});

/** GET /fabrics/:id -> { fabric, movements (newest first), orders (newest first, with clientName) } */
fabricRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const fabricId = c.req.param("id");

  const row = await getFabricRow(db, shop.id, fabricId);
  if (!row) throw notFound("Fabric not found.");

  const [movements, orders] = await db.batch(
    [
      { sql: "SELECT * FROM fabric_movements WHERE fabric_id = ? AND shop_id = ? ORDER BY created_at DESC", args: [fabricId, shop.id] },
      {
        sql: `SELECT o.*, c.name AS client_name
              FROM orders o JOIN clients c ON c.id = o.client_id
              WHERE o.fabric_id = ? AND o.shop_id = ?
              ORDER BY o.created_at DESC`,
        args: [fabricId, shop.id],
      },
    ],
    "read",
  );
  const today = startOfTodayUtc();
  const body: FabricDetailResponse = {
    fabric: rowToFabric(row),
    movements: (movements?.rows ?? []).map(rowToFabricMovement),
    orders: (orders?.rows ?? []).map((o) => {
      const name = o["client_name"];
      return rowToOrder(o, { clientName: name == null ? "" : String(name), today, photos: [] });
    }),
  };
  return c.json(body);
});

/**
 * PATCH /fabrics/:id -> { fabric }. Updates only the keys sent (`null` / "" clears an optional field) and bumps
 * updatedAt. A new name is copied onto the orders cut from this bolt so they keep showing the current one.
 */
fabricRoutes.patch("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const fabricId = c.req.param("id");
  const input = await parseBody(c, updateFabricSchema);

  const existing = await getFabricRow(db, shop.id, fabricId);
  if (!existing) throw notFound("Fabric not found.");

  const columns: Record<keyof UpdateFabricRequest, string> = {
    name: "name",
    supplier: "supplier",
    colour: "colour",
    kind: "kind",
    widthCm: "width_cm",
    lowAtMetres: "low_at_metres",
    costPerMetre: "cost_per_metre",
    swatch: "swatch",
    notes: "notes",
  };
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const key of Object.keys(columns) as (keyof UpdateFabricRequest)[]) {
    const value = input[key];
    if (value === undefined) continue; // not sent -> leave unchanged
    sets.push(`${columns[key]} = ?`);
    args.push(value);
  }
  const now = nowIso();
  sets.push("updated_at = ?");
  args.push(now, fabricId, shop.id);

  const statements: Statement[] = [{ sql: `UPDATE fabrics SET ${sets.join(", ")} WHERE id = ? AND shop_id = ?`, args }];
  if (input.name !== undefined && input.name !== String(existing["name"] ?? "")) {
    statements.push({
      sql: "UPDATE orders SET fabric = ?, updated_at = ? WHERE fabric_id = ? AND shop_id = ?",
      args: [input.name, now, fabricId, shop.id],
    });
  }
  await db.batch(statements, "write");

  return c.json(await fabricResponse(db, shop.id, fabricId));
});

/**
 * POST /fabrics/:id/movements -> { fabric, movement }: a delivery ("received", positive) or a stock-take
 * correction (either sign). The bolt can't go below 0 m. Orders take their own length off at Cutting (routes/orders.ts).
 */
fabricRoutes.post("/:id/movements", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const fabricId = c.req.param("id");
  const input = await parseBody(c, movementSchema);

  const existing = await getFabricRow(db, shop.id, fabricId);
  if (!existing) throw notFound("Fabric not found.");
  if (input.reason === "received" && input.metres <= 0) throw badRequest("A delivery adds cloth: enter the metres received as a positive number.");
  const left = oneDecimal(Number(existing["metres_left"] ?? 0));
  if (oneDecimal(left + input.metres) < 0) throw badRequest("That would take the bolt below 0 m.");

  const now = nowIso();
  const movement = movementStatement(shop.id, fabricId, input.metres, input.reason, input.note ?? null, now);
  const movementId = movement.args[0] as string;
  await db.batch(
    [
      {
        sql: "UPDATE fabrics SET metres_left = round(metres_left + ?, 1), updated_at = ? WHERE id = ? AND shop_id = ?",
        args: [input.metres, now, fabricId, shop.id],
      },
      movement,
    ],
    "write",
  );

  const [fabricRs, movementRs] = await db.batch(
    [
      { sql: "SELECT * FROM fabrics WHERE id = ? AND shop_id = ?", args: [fabricId, shop.id] },
      { sql: "SELECT * FROM fabric_movements WHERE id = ? AND shop_id = ?", args: [movementId, shop.id] },
    ],
    "read",
  );
  const fabricRow = fabricRs?.rows[0];
  const movementRow = movementRs?.rows[0];
  if (!fabricRow || !movementRow) throw notFound("Fabric not found.");
  const body: FabricMovementResponse = { fabric: rowToFabric(fabricRow), movement: rowToFabricMovement(movementRow) };
  return c.json(body);
});

/** DELETE /fabrics/:id -> 204. Orders keep their fabric name but lose the link (and the length); the history goes with the bolt. */
fabricRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const fabricId = c.req.param("id");

  const existing = await getFabricRow(db, shop.id, fabricId);
  if (!existing) throw notFound("Fabric not found.");

  await db.batch(
    [
      {
        sql: "UPDATE orders SET fabric_id = NULL, metres_needed = NULL, updated_at = ? WHERE fabric_id = ? AND shop_id = ?",
        args: [nowIso(), fabricId, shop.id],
      },
      { sql: "DELETE FROM fabric_movements WHERE fabric_id = ? AND shop_id = ?", args: [fabricId, shop.id] },
      { sql: "DELETE FROM fabrics WHERE id = ? AND shop_id = ?", args: [fabricId, shop.id] },
    ],
    "write",
  );
  return c.body(null, 204);
});

export default fabricRoutes;
