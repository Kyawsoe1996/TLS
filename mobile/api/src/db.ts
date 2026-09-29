import { createClient, type Client as DbClient, type ResultSet, type Row } from "@libsql/client/web";
import type { Client, FitAnalysis, Fitting, Shop, BrandTone } from "../../shared/types";
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

// ---------- Row mappers (snake_case columns -> shared/types.ts shapes) ----------

export function rowToShop(row: Row): Shop {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    district: text(row, "district"),
    city: text(row, "city"),
    tone: text(row, "tone") as BrandTone,
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
  return {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    style: text(row, "style"),
    fabric: text(row, "fabric"),
    measurements: {
      chest: numberOrNull(row, "chest"),
      waist: numberOrNull(row, "waist"),
      overArm: numberOrNull(row, "over_arm"),
      shoulder: numberOrNull(row, "shoulder"),
      sleeve: numberOrNull(row, "sleeve"),
      jacketLength: numberOrNull(row, "jacket_length"),
    },
    postureNote: textOrNull(row, "posture_note"),
    analysis: parseAnalysis(textOrNull(row, "ai_json")),
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
