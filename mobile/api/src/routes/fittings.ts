import { Hono } from "hono";
import { z } from "zod";
import type { CreateFittingRequest, FittingResponse, ListFittingsResponse } from "../../../shared/types";
import { getClientRow, getFittingRow, newId, nowIso, rowToFitting } from "../db";
import type { AppEnv } from "../env";
import { notFound } from "../errors";
import { type AssertAccepts, centimetres, optionalText, parseBody, requiredText } from "../validate";

const measurementsSchema = z.object({
  chest: centimetres,
  waist: centimetres,
  overArm: centimetres,
  shoulder: centimetres,
  sleeve: centimetres,
  jacketLength: centimetres,
});

const createFittingSchema = z.object({
  style: requiredText(120),
  fabric: requiredText(120),
  measurements: measurementsSchema,
  postureNote: optionalText(500),
});
type _CreateAccepted = AssertAccepts<typeof createFittingSchema, CreateFittingRequest>;

// Mounted at /clients, so paths are /clients/:clientId/fittings
const fittingRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/fittings -> { fittings } newest first */
fittingRoutes.get("/:clientId/fittings", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  const rs = await db.execute({
    sql: "SELECT * FROM fittings WHERE client_id = ? AND shop_id = ? ORDER BY created_at DESC",
    args: [clientId, shop.id],
  });
  const body: ListFittingsResponse = { fittings: rs.rows.map(rowToFitting) };
  return c.json(body);
});

/** POST /clients/:clientId/fittings -> 201 { fitting }; also sets client.lastOrderAt = now */
fittingRoutes.post("/:clientId/fittings", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const input = await parseBody(c, createFittingSchema);

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  const id = newId();
  const now = nowIso();
  const m = input.measurements;
  await db.batch(
    [
      {
        sql: `INSERT INTO fittings
                (id, shop_id, client_id, style, fabric, chest, waist, over_arm, shoulder, sleeve, jacket_length, posture_note, ai_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        args: [
          id,
          shop.id,
          clientId,
          input.style,
          input.fabric,
          m.chest,
          m.waist,
          m.overArm,
          m.shoulder,
          m.sleeve,
          m.jacketLength,
          input.postureNote ?? null,
          now,
        ],
      },
      { sql: "UPDATE clients SET last_order_at = ? WHERE id = ? AND shop_id = ?", args: [now, clientId, shop.id] },
    ],
    "write",
  );

  const row = await getFittingRow(db, shop.id, id);
  if (!row) throw notFound("Fitting not found.");
  const body: FittingResponse = { fitting: rowToFitting(row) };
  return c.json(body, 201);
});

export default fittingRoutes;
