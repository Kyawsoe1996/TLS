import type { ResultSet, Row } from "@libsql/client/web";
import { Hono } from "hono";
import type {
  AddReferralLeadResponse,
  ClientReferralResponse,
  ReferralLeadResponse,
  ReferralOverviewResponse,
  ReferralRewardResponse,
  ReferralSharedResponse,
} from "../../../shared/types";
import {
  type Db,
  countOf,
  getClientRow,
  getReferralLeadRow,
  getReferralRewardRow,
  newId,
  nowIso,
  rowToClient,
  rowToReferralLead,
  rowToReferralReward,
} from "../db";
import type { AppEnv } from "../env";
import { badRequest, notFound, serverError } from "../errors";
import { publicOrigin } from "../media";

// Smart Referral, signed-in side: GET /referrals, GET /referrals/leads/:id, POST /referrals/leads/:id/add,
// POST /referrals/leads/:id/dismiss, POST /referrals/rewards/:id/given, plus the per-client routes mounted at
// /clients: GET /clients/:clientId/referral, POST /clients/:clientId/referral/shared.
// The public page the link opens (GET/POST /r/:code) lives in referralPublic.ts. See shared/types.ts "Smart Referral".

// ---------- The personal code: "<FIRSTNAME>-<4 chars>" ----------

/** No 0/O/1/I, so the code survives being read out loud or typed from a screenshot. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_SUFFIX_LENGTH = 4;
const CODE_PREFIX_LENGTH = 8;
const CODE_ATTEMPTS = 5;

/** The client's first name with only A-Z kept, upper-cased, at most 8 letters; "CLIENT" when nothing is left. */
export function referralCodePrefix(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const letters = first.toUpperCase().replace(/[^A-Z]/g, "").slice(0, CODE_PREFIX_LENGTH);
  return letters || "CLIENT";
}

function randomSuffix(): string {
  const bytes = new Uint8Array(CODE_SUFFIX_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 is a multiple of the alphabet length (32), so the modulo stays uniform.
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** libsql reports a UNIQUE index hit as SQLITE_CONSTRAINT(_UNIQUE); the message carries the index/column name. */
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) || /UNIQUE constraint failed/i.test(err.message);
}

/**
 * The client's referral code, made on first use. A fresh suffix is tried up to 5 times when the UNIQUE index on
 * clients.referral_code rejects one; the UPDATE only fills a NULL code, so two parallel first calls both end up
 * with the single code that won.
 */
async function ensureReferralCode(db: Db, shopId: string, client: Row): Promise<string> {
  const current = client["referral_code"];
  if (typeof current === "string" && current) return current;
  const clientId = String(client["id"]);
  const prefix = referralCodePrefix(String(client["name"] ?? ""));

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = `${prefix}-${randomSuffix()}`;
    try {
      const rs = await db.execute({
        sql: "UPDATE clients SET referral_code = ? WHERE id = ? AND shop_id = ? AND referral_code IS NULL",
        args: [code, clientId, shopId],
      });
      if (rs.rowsAffected > 0) return code;
      // Nothing updated: another request set the code in the meantime, so read theirs back.
      const again = await getClientRow(db, shopId, clientId);
      const theirs = again?.["referral_code"];
      if (typeof theirs === "string" && theirs) return theirs;
      throw serverError("Couldn't make the invitation link. Please try again.");
    } catch (err) {
      if (isUniqueViolation(err) && attempt < CODE_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw serverError("Couldn't make the invitation link. Please try again.");
}

// ---------- The share message (kept in step with app/lib/referral.ts referralMessage) ----------

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "Hi! I'm a client of <shop> in <district>. Book your first fitting with my link and you get <offer>: <url>" */
export function referralMessage(shopName: string, district: string, friendOffer: string | null, url: string): string {
  const offer = friendOffer?.trim();
  const gift = offer ? lowerFirst(offer) : "a welcome gift";
  return `Hi! I'm a client of ${shopName} in ${district}. Book your first fitting with my link and you get ${gift}: ${url}`;
}

// ---------- Shared SQL ----------

/** The rows of a batch result (db.batch entries are typed as possibly missing). */
const rowsOf = (rs: ResultSet | undefined): Row[] => rs?.rows ?? [];

/** Rewards with both names joined, ready first, then pending, then given; newest change first within a group. */
const REWARDS_SELECT = `SELECT r.*, a.name AS ambassador_name, f.name AS friend_name
  FROM referral_rewards r
  LEFT JOIN clients a ON a.id = r.ambassador_client_id
  LEFT JOIN clients f ON f.id = r.friend_client_id`;
const REWARDS_ORDER = `ORDER BY CASE r.status WHEN 'ready' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
  coalesce(r.given_at, r.ready_at, r.created_at) DESC`;

/** Referred clients (optionally of one ambassador) with at least one delivered order. */
const BECAME_CLIENTS_WHERE = `f.shop_id = ? AND f.referred_by_client_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders o WHERE o.client_id = f.id AND o.shop_id = f.shop_id AND o.status = 'delivered')`;

/** Same as clients.ts: the ambassador's reward for this friend starts pending; orders.ts readies it on the first delivery. */
function pendingRewardStatement(shopId: string, ambassadorId: string, friendId: string, now: string) {
  return {
    sql: `INSERT INTO referral_rewards (id, shop_id, ambassador_client_id, friend_client_id, status, ready_at, given_at, created_at)
          VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?)
          ON CONFLICT(ambassador_client_id, friend_client_id) DO NOTHING`,
    args: [newId(), shopId, ambassadorId, friendId, now],
  };
}

/**
 * Where a lead's contact goes on the new client: `phone` when more than half of its non-space characters are
 * digits or "+" (spaces stripped), otherwise `line_id`. Mirrors app/lib/referral.ts contactKind.
 */
export function splitContact(contact: string): { phone: string | null; lineId: string | null } {
  const compact = contact.replace(/\s+/g, "");
  const digitish = compact.replace(/[^0-9+]/g, "").length;
  if (compact && digitish > compact.length / 2) return { phone: compact, lineId: null };
  return { phone: null, lineId: contact.trim() };
}

// ---------- Per-client routes. Mounted at /clients, so paths are /clients/:clientId/referral[/shared] ----------

export const clientReferralRoutes = new Hono<AppEnv>();

/** GET /clients/:clientId/referral -> the client's link, ready-made message and what it brought in (code made on first call). */
clientReferralRoutes.get("/:clientId/referral", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");
  const code = await ensureReferralCode(db, shop.id, client);
  const url = `${publicOrigin(c)}/r/${code}`;

  const [booked, became, rewards] = await db.batch(
    [
      { sql: "SELECT count(*) AS n FROM referral_leads WHERE shop_id = ? AND referrer_client_id = ?", args: [shop.id, clientId] },
      { sql: `SELECT count(*) AS n FROM clients f WHERE ${BECAME_CLIENTS_WHERE} AND f.referred_by_client_id = ?`, args: [shop.id, clientId] },
      { sql: `${REWARDS_SELECT} WHERE r.shop_id = ? AND r.ambassador_client_id = ? ${REWARDS_ORDER}`, args: [shop.id, clientId] },
    ],
    "read",
  );

  const shares = client["referral_shares"];
  const body: ClientReferralResponse = {
    code,
    url,
    message: referralMessage(shop.name, shop.district, shop.referralFriendOffer, url),
    sharedCount: shares == null ? 0 : Number(shares),
    friendsBooked: countOf(booked),
    becameClients: countOf(became),
    rewards: rowsOf(rewards).map((row) => rowToReferralReward(row)),
  };
  return c.json(body);
});

/** POST /clients/:clientId/referral/shared -> { sharedCount } (one more Share tap). */
clientReferralRoutes.post("/:clientId/referral/shared", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const clientId = c.req.param("clientId");

  const client = await getClientRow(db, shop.id, clientId);
  if (!client) throw notFound("Client not found.");

  await db.execute({
    sql: "UPDATE clients SET referral_shares = referral_shares + 1 WHERE id = ? AND shop_id = ?",
    args: [clientId, shop.id],
  });
  const rs = await db.execute({ sql: "SELECT referral_shares AS n FROM clients WHERE id = ? AND shop_id = ?", args: [clientId, shop.id] });
  const body: ReferralSharedResponse = { sharedCount: countOf(rs) };
  return c.json(body);
});

// ---------- Shop-wide routes. Mounted at /referrals ----------

const referralRoutes = new Hono<AppEnv>();

/** GET /referrals -> the Smart Referral overview: offer, counters, leads, top ambassadors and rewards. */
referralRoutes.get("/", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");

  const [shared, booked, became, ready, leads, ambassadors, rewards] = await db.batch(
    [
      { sql: "SELECT coalesce(sum(referral_shares), 0) AS n FROM clients WHERE shop_id = ?", args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM referral_leads WHERE shop_id = ?", args: [shop.id] },
      { sql: `SELECT count(*) AS n FROM clients f WHERE ${BECAME_CLIENTS_WHERE}`, args: [shop.id] },
      { sql: "SELECT count(*) AS n FROM referral_rewards WHERE shop_id = ? AND status = 'ready'", args: [shop.id] },
      {
        sql: `SELECT l.*, c.name AS referrer_name
              FROM referral_leads l LEFT JOIN clients c ON c.id = l.referrer_client_id
              WHERE l.shop_id = ?
              ORDER BY CASE l.status WHEN 'new' THEN 0 ELSE 1 END, l.created_at DESC
              LIMIT 50`,
        args: [shop.id],
      },
      {
        // One row per ambassador whose link brought at least one friend, busiest first.
        sql: `SELECT c.id AS client_id, c.name AS name, count(l.id) AS friends_booked,
                (SELECT count(*) FROM clients f
                   WHERE f.shop_id = c.shop_id AND f.referred_by_client_id = c.id
                     AND EXISTS (SELECT 1 FROM orders o WHERE o.client_id = f.id AND o.shop_id = f.shop_id AND o.status = 'delivered')) AS became_clients,
                (SELECT count(*) FROM referral_rewards r
                   WHERE r.shop_id = c.shop_id AND r.ambassador_client_id = c.id AND r.status = 'ready') AS rewards_ready
              FROM referral_leads l JOIN clients c ON c.id = l.referrer_client_id
              WHERE l.shop_id = ?
              GROUP BY c.id, c.name, c.shop_id
              ORDER BY friends_booked DESC, c.name COLLATE NOCASE ASC
              LIMIT 10`,
        args: [shop.id],
      },
      { sql: `${REWARDS_SELECT} WHERE r.shop_id = ? ${REWARDS_ORDER} LIMIT 50`, args: [shop.id] },
    ],
    "read",
  );

  const asNumber = (v: unknown): number => (v == null ? 0 : Number(v));
  const body: ReferralOverviewResponse = {
    friendOffer: shop.referralFriendOffer,
    clientOffer: shop.referralClientOffer,
    linksShared: countOf(shared),
    friendsBooked: countOf(booked),
    becameClients: countOf(became),
    rewardsReady: countOf(ready),
    leads: rowsOf(leads).map((row) => rowToReferralLead(row)),
    ambassadors: rowsOf(ambassadors).map((row) => ({
      clientId: String(row["client_id"]),
      name: row["name"] == null ? "" : String(row["name"]),
      friendsBooked: asNumber(row["friends_booked"]),
      becameClients: asNumber(row["became_clients"]),
      rewardsReady: asNumber(row["rewards_ready"]),
    })),
    rewards: rowsOf(rewards).map((row) => rowToReferralReward(row)),
  };
  return c.json(body);
});

/** GET /referrals/leads/:id -> { lead } */
referralRoutes.get("/leads/:id", async (c) => {
  const row = await getReferralLeadRow(c.get("db"), c.get("shop").id, c.req.param("id"));
  if (!row) throw notFound("Friend not found.");
  const body: ReferralLeadResponse = { lead: rowToReferralLead(row) };
  return c.json(body);
});

/**
 * POST /referrals/leads/:id/add -> 201 { lead, client }
 * Makes a client from the lead (name as given, the contact as phone or LINE ID, referredByClientId = the
 * ambassador), opens the ambassador's pending reward for them and marks the lead added. 400 once already added.
 */
referralRoutes.post("/leads/:id/add", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const row = await getReferralLeadRow(db, shop.id, id);
  if (!row) throw notFound("Friend not found.");
  const lead = rowToReferralLead(row);
  if (lead.status === "added") throw badRequest("This friend is already a client.");

  // The ambassador is normally still here (deleting a client removes their leads); if not, the friend is added
  // without a referrer and no reward is opened.
  const referrer = await getClientRow(db, shop.id, lead.referrerClientId);
  const referrerId = referrer ? lead.referrerClientId : null;

  const clientId = newId();
  const now = nowIso();
  const { phone, lineId } = splitContact(lead.contact);
  const statements = [
    {
      sql: `INSERT INTO clients (id, shop_id, name, phone, email, line_id, notes, last_order_at, referred_by_client_id, created_at)
            VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)`,
      args: [clientId, shop.id, lead.name, phone, lineId, referrerId, now],
    },
    {
      sql: "UPDATE referral_leads SET status = 'added', client_id = ?, updated_at = ? WHERE id = ? AND shop_id = ?",
      args: [clientId, now, id, shop.id],
    },
  ];
  if (referrerId) statements.push(pendingRewardStatement(shop.id, referrerId, clientId, now));
  await db.batch(statements, "write");

  const [leadRow, clientRow] = await Promise.all([getReferralLeadRow(db, shop.id, id), getClientRow(db, shop.id, clientId)]);
  if (!leadRow || !clientRow) throw serverError("Couldn't add the friend. Please try again.");
  const body: AddReferralLeadResponse = { lead: rowToReferralLead(leadRow), client: rowToClient(clientRow) };
  return c.json(body, 201);
});

/** POST /referrals/leads/:id/dismiss -> { lead } (status dismissed; it can still be added later). */
referralRoutes.post("/leads/:id/dismiss", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const row = await getReferralLeadRow(db, shop.id, id);
  if (!row) throw notFound("Friend not found.");
  if (rowToReferralLead(row).status === "added") throw badRequest("This friend is already a client.");

  await db.execute({
    sql: "UPDATE referral_leads SET status = 'dismissed', updated_at = ? WHERE id = ? AND shop_id = ?",
    args: [nowIso(), id, shop.id],
  });
  const updated = await getReferralLeadRow(db, shop.id, id);
  if (!updated) throw notFound("Friend not found.");
  const body: ReferralLeadResponse = { lead: rowToReferralLead(updated) };
  return c.json(body);
});

/** POST /referrals/rewards/:id/given -> { reward }. 400 unless the reward is ready (the friend's first order was delivered). */
referralRoutes.post("/rewards/:id/given", async (c) => {
  const db = c.get("db");
  const shop = c.get("shop");
  const id = c.req.param("id");

  const row = await getReferralRewardRow(db, shop.id, id);
  if (!row) throw notFound("Reward not found.");
  const reward = rowToReferralReward(row);
  if (reward.status === "given") throw badRequest("This reward was already given.");
  if (reward.status !== "ready") throw badRequest("This reward isn't ready yet: it's released when the friend's first order is delivered.");

  await db.execute({
    sql: "UPDATE referral_rewards SET status = 'given', given_at = ? WHERE id = ? AND shop_id = ?",
    args: [nowIso(), id, shop.id],
  });
  const updated = await getReferralRewardRow(db, shop.id, id);
  if (!updated) throw notFound("Reward not found.");
  const body: ReferralRewardResponse = { reward: rowToReferralReward(updated) };
  return c.json(body);
});

export default referralRoutes;
