import { createClient, type Client as DbClient, type ResultSet, type Row } from "@libsql/client/web";
import {
  type Appointment,
  type AppointmentKind,
  type AppointmentStatus,
  type Audience,
  type BrandTone,
  type Client,
  FABRIC_KINDS,
  type Fabric,
  type FabricKind,
  type FabricMovement,
  type FabricMovementReason,
  type FitAnalysis,
  type Fitting,
  GARMENT_TYPES,
  type GarmentType,
  type Measurements,
  type MediaKind,
  type Message,
  type MessageChannel,
  type MessageKind,
  type MessageStatus,
  type Order,
  type OrderPayment,
  type OrderPhoto,
  type OrderStatus,
  type Post,
  type PostStatus,
  REFERRAL_PREFERRED,
  type ReferralLead,
  type ReferralLeadStatus,
  type ReferralPreferred,
  type ReferralReward,
  type ReferralRewardStatus,
  type Shop,
} from "../../shared/types";
import type { Bindings } from "./env";
import { serverError } from "./errors";
import { mediaUrl } from "./media";

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

export const UPCOMING_DAYS = 7;
/** How far back "upcoming" reaches, so a slot earlier today stays listed until it is marked done, whatever the shop's time zone. */
export const UPCOMING_GRACE_HOURS = 12;

/** Window for "this week" appointments: 12 h back to 7 days ahead, as UTC ISO bounds (`from` inclusive, `to` exclusive). */
export function upcomingWindow(now: Date = new Date()): { from: string; to: string } {
  const t = now.getTime();
  return {
    from: new Date(t - UPCOMING_GRACE_HOURS * 3_600_000).toISOString(),
    to: new Date(t + UPCOMING_DAYS * 86_400_000).toISOString(),
  };
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

const JACKET_KEYS: readonly (keyof Measurements)[] = ["chest", "waist", "overArm", "shoulder", "sleeve", "jacketLength"];
const TROUSER_KEYS: readonly (keyof Measurements)[] = ["waist", "hip", "inseam", "outseam", "thigh", "hem"];

/** The measurement keys each garment uses (the `Measurements` doc in shared/types.ts); suit = jacket + trousers (waist once). */
export const GARMENT_MEASUREMENTS: Record<GarmentType, readonly (keyof Measurements)[]> = {
  jacket: JACKET_KEYS,
  trousers: TROUSER_KEYS,
  shirt: ["neck", "chest", "waist", "shoulder", "sleeve", "cuff", "shirtLength"],
  suit: [...JACKET_KEYS, ...TROUSER_KEYS.filter((key) => !JACKET_KEYS.includes(key))],
};

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
    googleReviewUrl: textOrNull(row, "google_review_url"),
    aiConsentAt: textOrNull(row, "ai_consent_at"),
    referralFriendOffer: textOrNull(row, "referral_friend_offer"),
    referralClientOffer: textOrNull(row, "referral_client_offer"),
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
    referredByClientId: textOrNull(row, "referred_by_client_id"),
    createdAt,
    inactive: (lastOrderAt ?? createdAt) < cutoff,
  };
}

const isFabricKind = (v: string): v is FabricKind => (FABRIC_KINDS as readonly string[]).includes(v);
const isReferralPreferred = (v: string): v is ReferralPreferred => (REFERRAL_PREFERRED as readonly string[]).includes(v);

/** Lengths are stored as REAL; one decimal is what the app shows, so round away float noise here. */
const metres = (n: number | null): number => (n == null ? 0 : Math.round(n * 10) / 10);

export function rowToFabric(row: Row): Fabric {
  const kind = text(row, "kind");
  const metresLeft = metres(numberOrNull(row, "metres_left"));
  const lowAtMetres = metres(numberOrNull(row, "low_at_metres"));
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    supplier: textOrNull(row, "supplier"),
    colour: textOrNull(row, "colour"),
    kind: isFabricKind(kind) ? kind : "other",
    widthCm: numberOrNull(row, "width_cm"),
    metresLeft,
    lowAtMetres,
    costPerMetre: numberOrNull(row, "cost_per_metre"),
    swatch: textOrNull(row, "swatch"),
    notes: textOrNull(row, "notes"),
    low: metresLeft < lowAtMetres,
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

export function rowToFabricMovement(row: Row): FabricMovement {
  return {
    id: text(row, "id"),
    fabricId: text(row, "fabric_id"),
    orderId: textOrNull(row, "order_id"),
    metres: metres(numberOrNull(row, "metres")),
    reason: text(row, "reason") as FabricMovementReason,
    note: textOrNull(row, "note"),
    createdAt: text(row, "created_at"),
  };
}

export function rowToPayment(row: Row): OrderPayment {
  return {
    id: text(row, "id"),
    orderId: text(row, "order_id"),
    clientId: text(row, "client_id"),
    amount: numberOrNull(row, "amount") ?? 0,
    paidAt: text(row, "paid_at"),
  };
}

/** `referrer_name` comes from a JOIN on clients (the ambassador); "" when the query didn't join. */
export function rowToReferralLead(row: Row): ReferralLead {
  const preferred = text(row, "preferred");
  return {
    id: text(row, "id"),
    referrerClientId: text(row, "referrer_client_id"),
    referrerName: text(row, "referrer_name"),
    name: text(row, "name"),
    contact: text(row, "contact"),
    preferred: isReferralPreferred(preferred) ? preferred : null,
    status: text(row, "status") as ReferralLeadStatus,
    clientId: textOrNull(row, "client_id"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

/** `ambassador_name` and `friend_name` come from JOINs on clients; "" when the query didn't join. */
export function rowToReferralReward(row: Row): ReferralReward {
  return {
    id: text(row, "id"),
    ambassadorClientId: text(row, "ambassador_client_id"),
    ambassadorName: text(row, "ambassador_name"),
    friendClientId: text(row, "friend_client_id"),
    friendName: text(row, "friend_name"),
    status: text(row, "status") as ReferralRewardStatus,
    readyAt: textOrNull(row, "ready_at"),
    givenAt: textOrNull(row, "given_at"),
    createdAt: text(row, "created_at"),
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
 * `photos` come from a separate query (getOrderPhotos / getClientOrderPhotos); the shop-wide list leaves them `[]`.
 */
export function rowToOrder(row: Row, opts: { clientName?: string; today?: string; photos?: OrderPhoto[] } = {}): Order {
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
    reviewRequestedAt: textOrNull(row, "review_requested_at"),
    fabricId: textOrNull(row, "fabric_id"),
    metresNeeded: numberOrNull(row, "metres_needed"),
    metresTakenAt: textOrNull(row, "metres_taken_at"),
    photos: opts.photos ?? [],
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    overdue: status !== "delivered" && dueAt != null && dueAt < today,
  };
  if (opts.clientName !== undefined) order.clientName = opts.clientName;
  return order;
}

/** `origin` as in rowToPost: turns the stored object key into the absolute `url`. */
export function rowToOrderPhoto(row: Row, origin: string): OrderPhoto {
  return {
    id: text(row, "id"),
    stage: text(row, "stage") as OrderStatus,
    url: mediaUrl(origin, text(row, "media_key")),
    contentType: text(row, "content_type"),
    width: numberOrNull(row, "width"),
    height: numberOrNull(row, "height"),
    sizeBytes: numberOrNull(row, "size") ?? 0,
    createdAt: text(row, "created_at"),
  };
}

/** `clientName` is only attached on the shop-wide list (GET /appointments) and the Home summary. */
export function rowToAppointment(row: Row, opts: { clientName?: string } = {}): Appointment {
  const appointment: Appointment = {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    orderId: textOrNull(row, "order_id"),
    kind: text(row, "kind") as AppointmentKind,
    startsAt: text(row, "starts_at"),
    notes: textOrNull(row, "notes"),
    status: text(row, "status") as AppointmentStatus,
    reminderSentAt: textOrNull(row, "reminder_sent_at"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
  if (opts.clientName !== undefined) appointment.clientName = opts.clientName;
  return appointment;
}

/** `provider_id` (Resend's email id) is internal and not part of the API shape. */
export function rowToMessage(row: Row): Message {
  return {
    id: text(row, "id"),
    clientId: text(row, "client_id"),
    orderId: textOrNull(row, "order_id"),
    appointmentId: textOrNull(row, "appointment_id"),
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

/**
 * `origin` (scheme + host of the current request, see media.ts publicOrigin) turns the stored R2 key into
 * the absolute `media.url`. `media` is null when the post has no file attached.
 */
export function rowToPost(row: Row, origin: string): Post {
  const mediaKey = textOrNull(row, "media_key");
  return {
    id: text(row, "id"),
    title: text(row, "title"),
    body: text(row, "body"),
    caption: text(row, "caption"),
    callToAction: text(row, "call_to_action"),
    topic: text(row, "topic"),
    tone: text(row, "tone") as BrandTone,
    audience: text(row, "audience") as Audience,
    status: text(row, "status") as PostStatus,
    sharedAt: textOrNull(row, "shared_at"),
    media:
      mediaKey == null
        ? null
        : {
            kind: text(row, "media_kind") as MediaKind,
            url: mediaUrl(origin, mediaKey),
            contentType: text(row, "media_content_type"),
            width: numberOrNull(row, "media_width"),
            height: numberOrNull(row, "media_height"),
            durationSec: numberOrNull(row, "media_duration"),
            sizeBytes: numberOrNull(row, "media_size") ?? 0,
          },
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
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

export async function getOrderPhotoRow(db: Db, shopId: string, photoId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM order_photos WHERE id = ? AND shop_id = ?",
    args: [photoId, shopId],
  });
  return rs.rows[0] ?? null;
}

/** An order's progress photos, oldest first, ready for `Order.photos` (`origin` from media.ts publicOrigin). */
export async function getOrderPhotos(db: Db, shopId: string, orderId: string, origin: string): Promise<OrderPhoto[]> {
  const rs = await db.execute({
    sql: "SELECT * FROM order_photos WHERE order_id = ? AND shop_id = ? ORDER BY created_at ASC",
    args: [orderId, shopId],
  });
  return rs.rows.map((row) => rowToOrderPhoto(row, origin));
}

/** The photos of every order of a client in one query, grouped by order id (GET /clients/:id/orders). */
export async function getClientOrderPhotos(db: Db, shopId: string, clientId: string, origin: string): Promise<Map<string, OrderPhoto[]>> {
  const rs = await db.execute({
    sql: "SELECT * FROM order_photos WHERE client_id = ? AND shop_id = ? ORDER BY created_at ASC",
    args: [clientId, shopId],
  });
  const byOrder = new Map<string, OrderPhoto[]>();
  for (const row of rs.rows) {
    const orderId = text(row, "order_id");
    const photos = byOrder.get(orderId) ?? [];
    photos.push(rowToOrderPhoto(row, origin));
    byOrder.set(orderId, photos);
  }
  return byOrder;
}

export async function getAppointmentRow(db: Db, shopId: string, appointmentId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM appointments WHERE id = ? AND shop_id = ?",
    args: [appointmentId, shopId],
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

export async function getPostRow(db: Db, shopId: string, postId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM posts WHERE id = ? AND shop_id = ?",
    args: [postId, shopId],
  });
  return rs.rows[0] ?? null;
}

export async function getFabricRow(db: Db, shopId: string, fabricId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: "SELECT * FROM fabrics WHERE id = ? AND shop_id = ?",
    args: [fabricId, shopId],
  });
  return rs.rows[0] ?? null;
}

/** A referral lead with the ambassador's name joined in (`referrer_name`). */
export async function getReferralLeadRow(db: Db, shopId: string, leadId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: `SELECT l.*, c.name AS referrer_name
          FROM referral_leads l LEFT JOIN clients c ON c.id = l.referrer_client_id
          WHERE l.id = ? AND l.shop_id = ?`,
    args: [leadId, shopId],
  });
  return rs.rows[0] ?? null;
}

/** A referral reward with both names joined in (`ambassador_name`, `friend_name`). */
export async function getReferralRewardRow(db: Db, shopId: string, rewardId: string): Promise<Row | null> {
  const rs = await db.execute({
    sql: `SELECT r.*, a.name AS ambassador_name, f.name AS friend_name
          FROM referral_rewards r
          LEFT JOIN clients a ON a.id = r.ambassador_client_id
          LEFT JOIN clients f ON f.id = r.friend_client_id
          WHERE r.id = ? AND r.shop_id = ?`,
    args: [rewardId, shopId],
  });
  return rs.rows[0] ?? null;
}
