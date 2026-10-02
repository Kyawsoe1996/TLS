import { createClient, type Client as DbClient, type ResultSet, type Row } from "@libsql/client/web";
import {
  type BrandTone,
  type Client,
  type FitAnalysis,
  type Fitting,
  GARMENT_TYPES,
  type GarmentType,
  type Measurements,
  type Message,
  type MessageChannel,
  type MessageKind,
  type MessageStatus,
  type Order,
  type OrderStatus,
  type Shop,
} from "../../shared/types";
import type { Bindings } from "./env";
import { serverError } from "./errors";

export type Db = DbClient;

export function createDb(env: Bindings): Db {
  if (!env.TURSO_DATABASE_URL) {
    console.error("[db] TURSO_DATABASE_URL is not set");
    throw serverError("Database is not configured.");
  }
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
}

// ---------- Time helpers (all timestamps are stored as UTC ISO 8601 TEXT) ----------

export const INACTIVE_DAYS = 90;

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();

/** Clients whose coalesce(last_order_at, created_at) is before this are "inactive". */
export function inactiveCutoff(now: number = Date.now()): string {
  return new Date(now - INACTIVE_DAYS * 86_400_000).toISOString();
}

/** First instant of the current calendar month (UTC). */
export function startOfMonthUtc(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export const DUE_SOON_DAYS = 7;

/** First instant of the current calendar day (UTC). Open orders with due_at before this are overdue. */
export function startOfTodayUtc(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Start of today + 7 days (UTC). Open orders with due_at before this are "due soon" (includes overdue). */
export function dueSoonCutoff(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + DUE_SOON_DAYS)).toISOString();
}

// ---------- Row readers ----------

function text(row: Row, key: string): string {
  const v = row[key];
  return v == null ? "" : String(v);
}

function textOrNull(row: Row, key: string): string | null {
  const v = row[key];
  return v == null ? null : String(v);
}

function numberOrNull(row: Row, key: string): number | null {
  const v = row[key];
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Read `SELECT count(*) AS n ...` from a result set. */
export function countOf(rs: ResultSet | undefined): number {
  const v = rs?.rows[0]?.["n"];
  return v == null ? 0 : Number(v);
}

// ---------- Fittings: measurement keys <-> columns ----------

/** `Measurements` key -> fittings column (all REAL, cm). Also the snake_case names sent to AI pipeline 1. */
export const MEASUREMENT_COLUMNS = {
  chest: "chest",
  waist: "waist",
  overArm: "over_arm",
  shoulder: "shoulder",
  sleeve: "sleeve",
  jacketLength: "jacket_length",
  hip: "hip",
  inseam: "inseam",
  outseam: "outseam",
  thigh: "thigh",
  hem: "hem",
  neck: "neck",
  cuff: "cuff",
  shirtLength: "shirt_length",
} as const satisfies Record<keyof Measurements, string>;

export const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_COLUMNS) as (keyof Measurements)[];

/** Fittings created before `garment_type` existed (and rows with an unknown value) read as jackets. */
export const DEFAULT_GARMENT_TYPE: GarmentType = "jacket";

const isGarmentType = (v: string): v is GarmentType => (GARMENT_TYPES as readonly string[]).includes(v);

// ---------- Row mappers (snake_case columns -> shared/types.ts shapes) ----------

export function rowToShop(row: Row): Shop {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    district: text(row, "district"),
    city: text(row, "city"),
    tone: text(row, "tone") as BrandTone,
    address: textOrNull(row, "address"),
    phone: textOrNull(row, "phone"),
    openingHours: textOrNull(row, "opening_hours"),
    replyToEmail: textOrNull(row, "reply_to_email"),
    createdAt: text(row, "created_at"),
  };
}

export function rowToClient(row: Row, cutoff: string = inactiveCutoff()): Client {
  const lastOrderAt = textOrNull(row, "last_order_at");
  const createdAt = text(row, "created_at");
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    phone: textOrNull(row, "phone"),
    email: textOrNull(row, "email"),
    lineId: textOrNull(row, "line_id"),
    notes: textOrNull(row, "notes"),
    lastOrderAt,
    createdAt,
    inactive: (lastOrderAt ?? createdAt) < cutoff,
  };
}

export function parseAnalysis(json: string | null): FitAnalysis | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<FitAnalysis> | null;
    if (
      parsed &&
      typeof parsed.pattern_adjustments === "string" &&
      typeof parsed.fit_profile === "string" &&
      typeof parsed.automated_marketing_hook === "string"
    ) {
      return {
        pattern_adjustments: parsed.pattern_adjustments,
        fit_profile: parsed.fit_profile,
        automated_marketing_hook: parsed.automated_marketing_hook,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function rowToFitting(row: Row): Fitting {
  const garmentType = text(row, "garment_type");
  const measurements = {} as Measurements;
  for (const key of MEASUREMENT_KEYS) measurements[key] = numberOrNull(row, MEASUREMENT_COLUMNS[key]);
  return {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    garmentType: isGarmentType(garmentType) ? garmentType : DEFAULT_GARMENT_TYPE,
    style: text(row, "style"),
    fabric: text(row, "fabric"),
    measurements,
    postureNote: textOrNull(row, "posture_note"),
    analysis: parseAnalysis(textOrNull(row, "ai_json")),
    createdAt: text(row, "created_at"),
  };
}

/**
 * `clientName` is only attached on the shop-wide list (GET /orders).
 * `today` lets list mappers compute startOfTodayUtc() once instead of per row.
 */
export function rowToOrder(row: Row, opts: { clientName?: string; today?: string } = {}): Order {
  const status = text(row, "status") as OrderStatus;
  const dueAt = textOrNull(row, "due_at");
  const today = opts.today ?? startOfTodayUtc();
  const price = numberOrNull(row, "price");
  const deposit = numberOrNull(row, "deposit");
  const order: Order = {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    fittingId: textOrNull(row, "fitting_id"),
    garment: text(row, "garment"),
    fabric: textOrNull(row, "fabric"),
    status,
    dueAt,
    deliveredAt: textOrNull(row, "delivered_at"),
    notes: textOrNull(row, "notes"),
    price,
    deposit,
    balance: price == null ? null : Math.max(price - (deposit ?? 0), 0),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    overdue: status !== "delivered" && dueAt != null && dueAt < today,
  };
  if (opts.clientName !== undefined) order.clientName = opts.clientName;
  return order;
}

/** `provider_id` (Resend's email id) is internal and not part of the API shape. */
export function rowToMessage(row: Row): Message {
  return {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    orderId: textOrNull(row, "order_id"),
    kind: text(row, "kind") as MessageKind,
    channel: text(row, "channel") as MessageChannel,
    to: text(row, "to_address"),
    subject: text(row, "subject"),
    body: text(row, "body"),
    status: text(row, "status") as MessageStatus,
    error: textOrNull(row, "error"),
    createdAt: text(row, "created_at"),
  };
}

// ---------- Common lookups ----------

export async function getShopByOwner(db: Db, userId: string): Promise<Shop | null> {
  const rs = await db.execute({ sql: "SELECT * FROM shops WHERE owner_user_id = ?", args: [userId] });
  const row = rs.rows[0];
  return row ? rowToShop(row) : null;
}

export async function getClientRow(db: Db, shopId: string, clientId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM clients WHERE id = ? AND shop_id = ?",
    args: [clientId, shopId],
  });
  return rs.rows[0] ?? null;
}

export async function getFittingRow(db: Db, shopId: string, fittingId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM fittings WHERE id = ? AND shop_id = ?",
    args: [fittingId, shopId],
  });
  return rs.rows[0] ?? null;
}

export async function getOrderRow(db: Db, shopId: string, orderId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM orders WHERE id = ? AND shop_id = ?",
    args: [orderId, shopId],
  });
  return rs.rows[0] ?? null;
}

export async function getMessageRow(db: Db, shopId: string, messageId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM messages WHERE id = ? AND shop_id = ?",
    args: [messageId, shopId],
  });
  return rs.rows[0] ?? null;
}
