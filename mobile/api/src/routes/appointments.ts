import { Hono } from "hono";
import { z } from "zod";
import {
  APPOINTMENT_KINDS,
  APPOINTMENT_STATUSES,
  type AppointmentResponse,
  type AppointmentStatus,
  type CreateAppointmentRequest,
  type ListAppointmentsResponse,
  type UpdateAppointmentRequest,
} from "../../../shared/types";
import { type Db, getAppointmentRow, getClientRow, newId, nowIso, rowToAppointment, upcomingWindow } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { type AssertAccepts, isoDate, oneOf, optionalText, parseBody } from "../validate";
import { assertOrderBelongsToClient } from "./messages";

const INITIAL_STATUS: AppointmentStatus = "scheduled";

const createAppointmentSchema = z.object({
  kind: oneOf(APPOINTMENT_KINDS),
  startsAt: isoDate,
  orderId: optionalText(64), // uuid; `null`/"" unlinks on PATCH
  notes: optionalText(2000),
});
type _CreateAccepted = AssertAccepts<typeof createAppointmentSchema, CreateAppointmentRequest>;

/** PATCH accepts any subset; `null` clears a field. */
const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: oneOf(APPOINTMENT_STATUSES).optional(),
});
type _UpdateAccepted = AssertAccepts<typeof updateAppointmentSchema, UpdateAppointmentRequest>;

const isAppointmentStatus = (v: string): v is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(v);

/** The appointment, only if it belongs to this shop AND this client. */
async function getClientAppointmentRow(db: Db, shopId: string, clientId: string, appointmentId: string) {
  const row = await getAppointmentRow(db, shopId, appointmentId);
  return row && row["client_id"] === clientId ? row : null;
}

// ---------- Per-client routes. Mounted at /clients, so paths are /clients/:clientId/appointments[/:appointmentId] ----------

const appointmentRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/appointments -> { appointments } latest start first */
appointmentRoutes.get("/:clientId/appointments", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  const rs = await db.execute({
    sql: "SELECT * FROM appointments WHERE client_id = ? AND shop_id = ? ORDER BY starts_at DESC",
    args: [clientId, shop.id],
  });
  const body: ListAppointmentsResponse = { appointments: rs.rows.map((row) => rowToAppointment(row)) };
  return c.json(body);
});

/** POST /clients/:clientId/appointments -> 201 { appointment } (status "scheduled"). Leaves client.lastOrderAt alone. */
appointmentRoutes.post("/:clientId/appointments", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const input = await parseBody(c, createAppointmentSchema);

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");
  if (input.orderId) await assertOrderBelongsToClient(db, shop.id, clientId, input.orderId);

  const id = newId();
  const now = nowIso();
  await db.execute({
    sql: `INSERT INTO appointments
            (id, shop_id, client_id, order_id, kind, starts_at, notes, status, reminder_sent_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    args: [id, shop.id, clientId, input.orderId ?? null, input.kind, input.startsAt, input.notes ?? null, INITIAL_STATUS, now, now],
  });

  const row = await getAppointmentRow(db, shop.id, id);
  if (!row) throw notFound("Appointment not found.");
  const body: AppointmentResponse = { appointment: rowToAppointment(row) };
  return c.json(body, 201);
});

/** GET /clients/:clientId/appointments/:appointmentId -> { appointment } */
appointmentRoutes.get("/:clientId/appointments/:appointmentId", async (c) => {
  const row = await getClientAppointmentRow(c.get("db"), c.get("shop").id, c.req.param("clientId"), c.req.param("appointmentId"));
  if (!row) throw notFound("Appointment not found.");
  const body: AppointmentResponse = { appointment: rowToAppointment(row) };
  return c.json(body);
});

/**
 * PATCH /clients/:clientId/appointments/:appointmentId -> { appointment }
 * Updates only the keys sent (`null` clears). Always bumps updatedAt. `status` moves it between
 * scheduled / done / cancelled in either direction.
 */
appointmentRoutes.patch("/:clientId/appointments/:appointmentId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const appointmentId = c.req.param("appointmentId");
  const input = await parseBody(c, updateAppointmentSchema);

  const existing = await getClientAppointmentRow(db, shop.id, clientId, appointmentId);
  if (!existing) throw notFound("Appointment not found.");
  if (input.orderId) await assertOrderBelongsToClient(db, shop.id, clientId, input.orderId);

  const columns: Record<keyof UpdateAppointmentRequest, string> = {
    kind: "kind",
    startsAt: "starts_at",
    orderId: "order_id",
    notes: "notes",
    status: "status",
  };
  const sets: string[] = [];
  const args: (string | null)[] = [];
  for (const key of Object.keys(columns) as (keyof UpdateAppointmentRequest)[]) {
    const value = input[key];
    if (value === undefined) continue; // not sent -> leave unchanged
    sets.push(`${columns[key]} = ?`);
    args.push(value);
  }
  sets.push("updated_at = ?");
  args.push(nowIso(), appointmentId, clientId, shop.id);
  await db.execute({
    sql: `UPDATE appointments SET ${sets.join(", ")} WHERE id = ? AND client_id = ? AND shop_id = ?`,
    args,
  });

  const row = await getAppointmentRow(db, shop.id, appointmentId);
  if (!row) throw notFound("Appointment not found.");
  const body: AppointmentResponse = { appointment: rowToAppointment(row) };
  return c.json(body);
});

/** DELETE /clients/:clientId/appointments/:appointmentId -> 204. Reminder emails already sent stay on the client's file. */
appointmentRoutes.delete("/:clientId/appointments/:appointmentId", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");
  const appointmentId = c.req.param("appointmentId");

  const existing = await getClientAppointmentRow(db, shop.id, clientId, appointmentId);
  if (!existing) throw notFound("Appointment not found.");

  await db.execute({
    sql: "DELETE FROM appointments WHERE id = ? AND client_id = ? AND shop_id = ?",
    args: [appointmentId, clientId, shop.id],
  });
  return c.body(null, 204);
});

export default appointmentRoutes;

// ---------- Shop-wide agenda. Mounted at /appointments ----------

export const shopAppointmentRoutes = new Hono<AppEnv>();

/**
 * GET /appointments?from=&to=&status= -> { appointments } with clientName, soonest first.
 * Defaults: status "scheduled", from = 12 h ago (same window start as Home), no upper bound.
 * `from` / `to` are ISO dates (`to` exclusive); `status=all` lifts the status filter.
 */
shopAppointmentRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const statusParam = c.req.query("status");
  const fromParam = c.req.query("from");
  const toParam = c.req.query("to");

  let status: AppointmentStatus | null = "scheduled";
  if (statusParam !== undefined) {
    if (statusParam === "all") status = null;
    else if (isAppointmentStatus(statusParam)) status = statusParam;
    else throw badRequest(`status must be one of: ${APPOINTMENT_STATUSES.join(", ")}, all.`);
  }
  const parseBound = (value: string | undefined, name: string): string | null => {
    if (value === undefined || value === "") return null;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) throw badRequest(`${name} must be an ISO 8601 date string.`);
    return new Date(ms).toISOString();
  };
  const from = parseBound(fromParam, "from") ?? (fromParam === "" ? null : upcomingWindow().from);
  const to = parseBound(toParam, "to");

  let sql = `SELECT a.*, c.name AS client_name
             FROM appointments a JOIN clients c ON c.id = a.client_id
             WHERE a.shop_id = ?`;
  const args: string[] = [shop.id];
  if (status) {
    sql += " AND a.status = ?";
    args.push(status);
  }
  if (from) {
    sql += " AND a.starts_at >= ?";
    args.push(from);
  }
  if (to) {
    sql += " AND a.starts_at < ?";
    args.push(to);
  }
  sql += " ORDER BY a.starts_at ASC";

  const rs = await db.execute({ sql, args });
  const body: ListAppointmentsResponse = {
    appointments: rs.rows.map((row) => {
      const name = row["client_name"];
      return rowToAppointment(row, { clientName: name == null ? "" : String(name) });
    }),
  };
  return c.json(body);
});
