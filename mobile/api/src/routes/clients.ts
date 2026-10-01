import { Hono } from "hono";
import { z } from "zod";
import type {
  ClientResponse,
  CreateClientRequest,
  ListClientsResponse,
  UpdateClientRequest,
} from "../../../shared/types";
import { getClientRow, inactiveCutoff, newId, nowIso, rowToClient } from "../db";
import type { AppEnv } from "../env";
import { notFound } from "../errors";
import { type AssertAccepts, isoDate, optionalText, parseBody, requiredText } from "../validate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createClientSchema = z.object({
  name: requiredText(120),
  phone: optionalText(40),
  email: optionalText(254).refine((v) => !v || EMAIL_RE.test(v), "must be a valid email address"),
  lineId: optionalText(80),
  notes: optionalText(2000),
  lastOrderAt: isoDate.nullable().optional(),
});
type _CreateAccepted = AssertAccepts<typeof createClientSchema, CreateClientRequest>;

/** PATCH accepts any subset; `null` clears a field. */
const updateClientSchema = createClientSchema.partial();
type _UpdateAccepted = AssertAccepts<typeof updateClientSchema, UpdateClientRequest>;

const clientRoutes = new Hono<AppEnv>();

/** GET /clients?search=&inactive=true -> { clients } */
clientRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const search = (c.req.query("search") ?? "").trim();
  const inactiveOnly = ["true", "1"].includes((c.req.query("inactive") ?? "").toLowerCase());
  const cutoff = inactiveCutoff();

  let sql = "SELECT * FROM clients WHERE shop_id = ?";
  const args: (string | number)[] = [shop.id];
  if (search) {
    // Escape LIKE wildcards in user input; LIKE is case-insensitive for ASCII in SQLite.
    const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    sql += " AND name LIKE ? ESCAPE '\\'";
    args.push(`%${escaped}%`);
  }
  if (inactiveOnly) {
    sql += " AND coalesce(last_order_at, created_at) < ?";
    args.push(cutoff);
  }
  sql += " ORDER BY name COLLATE NOCASE ASC, created_at DESC";

  const rs = await db.execute({ sql, args });
  const body: ListClientsResponse = { clients: rs.rows.map((row) => rowToClient(row, cutoff)) };
  return c.json(body);
});

/** POST /clients -> 201 { client } */
clientRoutes.post("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const input = await parseBody(c, createClientSchema);

  const id = newId();
  await db.execute({
    sql: `INSERT INTO clients (id, shop_id, name, phone, email, line_id, notes, last_order_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      shop.id,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.lineId ?? null,
      input.notes ?? null,
      input.lastOrderAt ?? null,
      nowIso(),
    ],
  });

  const row = await getClientRow(db, shop.id, id);
  if (!row) throw notFound("Client not found.");
  const body: ClientResponse = { client: rowToClient(row) };
  return c.json(body, 201);
});

/** GET /clients/:id -> { client } */
clientRoutes.get("/:id", async (c) => {
  const row = await getClientRow(c.get("db"), c.get("shop").id, c.req.param("id"));
  if (!row) throw notFound("Client not found.");
  const body: ClientResponse = { client: rowToClient(row) };
  return c.json(body);
});

/** PATCH /clients/:id -> { client } */
clientRoutes.patch("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");
  const input = await parseBody(c, updateClientSchema);

  const existing = await getClientRow(db, shop.id, id);
  if (!existing) throw notFound("Client not found.");

  const columns: Record<keyof UpdateClientRequest, string> = {
    name: "name",
    phone: "phone",
    email: "email",
    lineId: "line_id",
    notes: "notes",
    lastOrderAt: "last_order_at",
  };
  const sets: string[] = [];
  const args: (string | null)[] = [];
  for (const key of Object.keys(columns) as (keyof UpdateClientRequest)[]) {
    const value = input[key];
    if (value === undefined) continue; // not sent -> leave unchanged
    sets.push(`${columns[key]} = ?`);
    args.push(value);
  }

  if (sets.length > 0) {
    args.push(id, shop.id);
    await db.execute({ sql: `UPDATE clients SET ${sets.join(", ")} WHERE id = ? AND shop_id = ?`, args });
  }

  const row = await getClientRow(db, shop.id, id);
  if (!row) throw notFound("Client not found.");
  const body: ClientResponse = { client: rowToClient(row) };
  return c.json(body);
});

/** DELETE /clients/:id -> 204 (also deletes the client's orders and fittings) */
clientRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getClientRow(db, shop.id, id);
  if (!existing) throw notFound("Client not found.");

  await db.batch(
    [
      { sql: "DELETE FROM orders WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM fittings WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM clients WHERE id = ? AND shop_id = ?", args: [id, shop.id] },
    ],
    "write",
  );
  return c.body(null, 204);
});

export default clientRoutes;
