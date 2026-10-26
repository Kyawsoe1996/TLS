import { Hono } from "hono";
import { z } from "zod";
import type {
  ClientResponse,
  CreateClientRequest,
  ListClientsResponse,
  UpdateClientRequest,
} from "../../../shared/types";
import { type Db, getClientRow, inactiveCutoff, newId, nowIso, rowToClient } from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound } from "../errors";
import { deleteMediaObjects, mediaStore } from "../media";
import { type AssertAccepts, isoDate, optionalText, parseBody, requiredText } from "../validate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createClientSchema = z.object({
  name: requiredText(120),
  phone: optionalText(40),
  email: optionalText(254).refine((v) => !v || EMAIL_RE.test(v), "must be a valid email address"),
  lineId: optionalText(80),
  notes: optionalText(2000),
  lastOrderAt: isoDate.nullable().optional(),
  referredByClientId: optionalText(64), // Smart Referral: who sent them; `null`/"" clears on PATCH
});
type _CreateAccepted = AssertAccepts<typeof createClientSchema, CreateClientRequest>;

/** The referrer must be another client of this shop. Also creates the pending reward for the pair (idempotent). */
async function assertReferrer(db: Db, shopId: string, referrerId: string, clientId: string | null): Promise<void> {
  if (clientId && referrerId === clientId) throw badRequest("A client can't refer themselves.");
  const referrer = await getClientRow(db, shopId, referrerId);
  if (!referrer) throw badRequest("The referring client isn't in your shop.");
}

/** The ambassador's reward for this friend starts pending and becomes ready on the friend's first delivery (orders.ts). */
function pendingRewardStatement(shopId: string, ambassadorId: string, friendId: string, now: string) {
  return {
    sql: `INSERT INTO referral_rewards (id, shop_id, ambassador_client_id, friend_client_id, status, ready_at, given_at, created_at)
          VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?)
          ON CONFLICT(ambassador_client_id, friend_client_id) DO NOTHING`,
    args: [newId(), shopId, ambassadorId, friendId, now],
  };
}

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
  if (input.referredByClientId) await assertReferrer(db, shop.id, input.referredByClientId, null);

  const id = newId();
  const now = nowIso();
  const statements = [
    {
      sql: `INSERT INTO clients (id, shop_id, name, phone, email, line_id, notes, last_order_at, referred_by_client_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        shop.id,
        input.name,
        input.phone ?? null,
        input.email ?? null,
        input.lineId ?? null,
        input.notes ?? null,
        input.lastOrderAt ?? null,
        input.referredByClientId ?? null,
        now,
      ],
    },
  ];
  if (input.referredByClientId) statements.push(pendingRewardStatement(shop.id, input.referredByClientId, id, now));
  await db.batch(statements, "write");

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
  if (input.referredByClientId) await assertReferrer(db, shop.id, input.referredByClientId, id);

  const columns: Record<keyof UpdateClientRequest, string> = {
    name: "name",
    phone: "phone",
    email: "email",
    lineId: "line_id",
    notes: "notes",
    lastOrderAt: "last_order_at",
    referredByClientId: "referred_by_client_id",
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
    const statements = [{ sql: `UPDATE clients SET ${sets.join(", ")} WHERE id = ? AND shop_id = ?`, args }];
    if (input.referredByClientId) statements.push(pendingRewardStatement(shop.id, input.referredByClientId, id, nowIso()));
    await db.batch(statements, "write");
  }

  const row = await getClientRow(db, shop.id, id);
  if (!row) throw notFound("Client not found.");
  const body: ClientResponse = { client: rowToClient(row) };
  return c.json(body);
});

/** DELETE /clients/:id -> 204 (also deletes the client's appointments, messages, orders with their photos, and fittings) */
clientRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const existing = await getClientRow(db, shop.id, id);
  if (!existing) throw notFound("Client not found.");

  // The photo keys are read first so the files can be removed once the rows are gone (best effort).
  const photoRows = await db.execute({
    sql: "SELECT media_key FROM order_photos WHERE client_id = ? AND shop_id = ?",
    args: [id, shop.id],
  });
  await db.batch(
    [
      { sql: "DELETE FROM appointments WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM messages WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM order_photos WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM order_payments WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM referral_rewards WHERE (ambassador_client_id = ? OR friend_client_id = ?) AND shop_id = ?", args: [id, id, shop.id] },
      { sql: "DELETE FROM referral_leads WHERE (referrer_client_id = ? OR client_id = ?) AND shop_id = ?", args: [id, id, shop.id] },
      { sql: "UPDATE clients SET referred_by_client_id = NULL WHERE referred_by_client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM orders WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM fittings WHERE client_id = ? AND shop_id = ?", args: [id, shop.id] },
      { sql: "DELETE FROM clients WHERE id = ? AND shop_id = ?", args: [id, shop.id] },
    ],
    "write",
  );
  await deleteMediaObjects(mediaStore(c.env), photoRows.rows.map((row) => row["media_key"] as string | null));
  return c.body(null, 204);
});

export default clientRoutes;
