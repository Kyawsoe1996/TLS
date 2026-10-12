// TLS mobile API contract — shared by mobile/app and mobile/api.
// Every route except /privacy and /support requires `Authorization: Bearer <Clerk session token>`.
// Errors always come back as ApiError with a non-2xx status.

export type ISODate = string; // ISO 8601, e.g. "2026-09-29T10:00:00.000Z"

export interface ApiError {
  error: {
    code: "unauthorized" | "not_found" | "bad_request" | "consent_required" | "rate_limited" | "ai_failed" | "server_error";
    message: string; // human-readable, safe to show in the app
  };
}

// ---------- Shop ----------
export type BrandTone = "Sophisticated" | "Welcoming" | "Premium";

export interface Shop {
  id: string;
  name: string;
  district: string; // e.g. "Thonglor"
  city: string; // e.g. "Bangkok"
  tone: BrandTone;
  // Shop details: shown in the footer of every email sent from the app (all optional).
  address: string | null;
  phone: string | null;
  openingHours: string | null; // free text, e.g. "Mon–Sat 10:00–19:00"; used in the order-ready email
  replyToEmail: string | null; // Reply-To on outgoing emails so client replies reach the shop
  // When the owner agreed to send client details to Google Gemini (POST /shop/ai-consent); null until then.
  // Every /ai/* route answers 403 consent_required while this is null, so the app asks first.
  aiConsentAt: ISODate | null;
  createdAt: ISODate;
}

/** GET /shop → 200 { shop, email } or 404 (not onboarded yet) */
export interface GetShopResponse {
  shop: Shop;
  email: EmailStatus; // see Messages section below
}
/** PUT /shop — creates the shop on first call (onboarding), updates afterwards */
export interface UpsertShopRequest {
  name: string;
  district: string;
  city: string;
  tone?: BrandTone; // default "Sophisticated"
  // Shop details; omit to leave unchanged, send "" to clear.
  address?: string;
  phone?: string;
  openingHours?: string;
  replyToEmail?: string; // validated as an email when non-empty
}
export type UpsertShopResponse = GetShopResponse;
/** POST /shop/ai-consent — records the owner's agreement to the AI data sharing (idempotent) → { shop, email } */
export type AiConsentResponse = GetShopResponse;

// ---------- Home ----------
/** GET /home */
export interface HomeResponse {
  shopName: string;
  clientsCount: number;
  fittingsThisMonth: number;
  inactiveCount: number; // clients whose lastOrderAt (or createdAt) is 90+ days ago
  ordersOpen: number; // orders with status != "delivered"
  ordersDueSoon: number; // open orders that are overdue or due within the next 7 days
  ordersOverdue: number; // open orders whose due date is before today (shown as the Clients tab badge)
}

// ---------- Clients ----------
export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  notes: string | null;
  lastOrderAt: ISODate | null;
  createdAt: ISODate;
  inactive: boolean; // computed: 90+ days since lastOrderAt (or createdAt if never ordered)
}

/** GET /clients?search=&inactive=true */
export interface ListClientsResponse {
  clients: Client[];
}
/** POST /clients */
export interface CreateClientRequest {
  name: string;
  phone?: string;
  email?: string;
  lineId?: string;
  notes?: string;
  lastOrderAt?: ISODate;
}
/** PATCH /clients/:id — any subset of CreateClientRequest */
export type UpdateClientRequest = Partial<CreateClientRequest>;
/** GET /clients/:id, POST /clients, PATCH /clients/:id */
export interface ClientResponse {
  client: Client;
}
/** DELETE /clients/:id → 204 (also deletes its fittings) */

// ---------- Fittings (manual measurements, cm) ----------
/** Which measurement set a fitting uses. "suit" = jacket + trousers fields. */
export const GARMENT_TYPES = ["jacket", "trousers", "shirt", "suit"] as const;
export type GarmentType = (typeof GARMENT_TYPES)[number];

/**
 * All measurements in cm, null when not taken. Which keys matter depends on the fitting's garmentType:
 * jacket: chest, waist, overArm, shoulder, sleeve, jacketLength
 * trousers: waist, hip, inseam, outseam, thigh, hem
 * shirt: neck, chest, waist, shoulder, sleeve, cuff, shirtLength
 * suit: jacket + trousers keys
 */
export interface Measurements {
  chest: number | null;
  waist: number | null;
  overArm: number | null;
  shoulder: number | null;
  sleeve: number | null;
  jacketLength: number | null;
  hip: number | null;
  inseam: number | null;
  outseam: number | null;
  thigh: number | null;
  hem: number | null;
  neck: number | null;
  cuff: number | null;
  shirtLength: number | null;
}

/** Pipeline 1 output — PROCESS_IOT_MEASUREMENTS */
export interface FitAnalysis {
  pattern_adjustments: string;
  fit_profile: string;
  automated_marketing_hook: string;
}

export interface Fitting {
  id: string;
  clientId: string;
  garmentType: GarmentType; // default "jacket" for fittings created before this field existed
  style: string; // e.g. "Slim-cut corporate"
  fabric: string; // e.g. "Super 130s navy wool"
  measurements: Measurements;
  postureNote: string | null; // e.g. "Right shoulder 1.8 cm low"
  analysis: FitAnalysis | null; // filled after POST /ai/fit
  createdAt: ISODate;
}

/** GET /clients/:id/fittings (newest first) */
export interface ListFittingsResponse {
  fittings: Fitting[];
}
/** POST /clients/:id/fittings — also sets the client's lastOrderAt to now */
export interface CreateFittingRequest {
  garmentType?: GarmentType; // default "jacket"
  style: string;
  fabric: string;
  measurements: Partial<Measurements>; // missing keys are stored as null
  postureNote?: string;
}
export interface FittingResponse {
  fitting: Fitting;
}

// ---------- Orders (a garment for a client, moving through the workshop) ----------
/** In workflow sequence. The app shows them as a stepper in this order. */
export const ORDER_STATUSES = ["measured", "cutting", "fitting", "ready", "delivered"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  clientId: string;
  fittingId: string | null; // the fitting this order is cut from, if any
  garment: string; // e.g. "Two-piece suit"
  fabric: string | null;
  status: OrderStatus;
  dueAt: ISODate | null; // promised delivery date (date-only semantics, stored as ISO)
  deliveredAt: ISODate | null; // set when status becomes "delivered"
  notes: string | null;
  // Price tracking, in Thai baht, for the shop's records only (payments are taken outside the app).
  price: number | null;
  deposit: number | null; // total paid so far
  balance: number | null; // computed: price - deposit when price is set (never below 0)
  createdAt: ISODate;
  updatedAt: ISODate;
  overdue: boolean; // computed: dueAt is before today and status != "delivered"
  clientName?: string; // only on the shop-wide list (GET /orders)
}

/** GET /clients/:id/orders (newest first) and GET /orders?open=true (shop-wide, overdue → due date → no date) */
export interface ListOrdersResponse {
  orders: Order[];
}
/** POST /clients/:id/orders → 201; also sets the client's lastOrderAt to now */
export interface CreateOrderRequest {
  garment: string;
  fabric?: string;
  fittingId?: string; // must belong to the same client
  dueAt?: ISODate;
  notes?: string;
  price?: number; // THB, >= 0; null clears on PATCH
  deposit?: number; // THB, >= 0; null clears on PATCH
}
/** PATCH /clients/:id/orders/:orderId — any subset; status "delivered" stamps deliveredAt */
export type UpdateOrderRequest = Partial<CreateOrderRequest> & { status?: OrderStatus };
/** GET/POST/PATCH single order */
export interface OrderResponse {
  order: Order;
}
/** DELETE /clients/:id/orders/:orderId → 204 */

// ---------- Messages (emails sent to a client from the app) ----------
/** What prompted the email. */
export type MessageKind = "winback" | "order_ready" | "followup";
/** Email only for now; kept as a field so LINE/WhatsApp can be added later. */
export type MessageChannel = "email";
/**
 * sent: delivered to the email provider · simulated: logged but not sent because email sending
 * isn't configured on the API (no RESEND_API_KEY) · failed: the provider rejected it.
 */
export type MessageStatus = "sent" | "simulated" | "failed";

export interface Message {
  id: string;
  clientId: string;
  orderId: string | null; // set for order_ready
  kind: MessageKind;
  channel: MessageChannel;
  to: string; // the email address it was sent to
  subject: string;
  body: string; // plain text; line breaks preserved
  status: MessageStatus;
  error: string | null; // provider message when status is "failed"
  createdAt: ISODate;
}

/** GET /clients/:id/messages (newest first) */
export interface ListMessagesResponse {
  messages: Message[];
}
/**
 * POST /clients/:id/messages → 201 { message }. Sends right away to the client's email address;
 * 400 bad_request when the client has none. Does not touch the client's lastOrderAt.
 */
export interface SendMessageRequest {
  kind: MessageKind;
  subject: string;
  body: string;
  orderId?: string; // must belong to the same client when given
}
export interface MessageResponse {
  message: Message;
}

/** Part of GET /shop: whether the API can really send email (RESEND_API_KEY set) and the sender it uses. */
export interface EmailStatus {
  configured: boolean;
  from: string; // e.g. "Shamu via Magick TLS <onboarding@resend.dev>"
}

// ---------- AI ----------
// All AI routes are rate limited per user (429 rate_limited) and may return 502 ai_failed.

/** POST /ai/fit → runs pipeline 1 on a saved fitting and stores the result on it */
export interface AiFitRequest {
  fittingId: string;
}
export type AiFitResponse = FittingResponse; // fitting.analysis is set

/** Pipeline 2 — GENERATE_LOCAL_SEO_MAP */
export type CompetitorTier = "Hotel-arcade chains" | "Big tailoring brands" | "Other local tailors";
export type SearchConsoleStatus =
  | "Not on Google yet"
  | "Page 3 or lower"
  | "Page 2"
  | "Page 1"
  | "Not sure";
export interface AiSeoRequest {
  district: string; // "Thonglor, Bangkok"
  competitorTier: CompetitorTier;
  searchConsoleStatus: SearchConsoleStatus;
}
export interface SeoKeyword {
  keyword: string;
  search_intent: string;
  content_angle: string;
}
/** A tailor shop found on Google Maps for the district. Show it with its Maps link. */
export interface SeoPlace {
  name: string;
  mapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
}
export interface AiSeoResponse {
  target_market: string;
  keywords: SeoKeyword[];
  places: SeoPlace[] | null; // null = written without Google Maps data (lookup unavailable)
}

/** Pipeline 3 — GENERATE_DASHBOARD_POST */
export type Audience = "Expatriates" | "Local executives" | "Grooms" | "Tourists";
export interface AiPostRequest {
  brandTone: BrandTone;
  topic: string;
  audience: Audience;
}
/** The generated text, already saved as a draft post (see `post`). */
export interface AiPostResponse {
  blog_title: string;
  blog_body: string;
  social_caption: string;
  call_to_action: string;
  post: Post; // saved automatically so nothing generated is ever lost
}

// ---------- Posts (the content library behind Content Studio) ----------
export type PostStatus = "draft" | "shared";
export type MediaKind = "image" | "video";

/** A photo or short video attached to a post, stored by the API and served at `url`. */
export interface PostMedia {
  kind: MediaKind;
  url: string; // absolute URL (API_URL + /media/…), public but unguessable
  contentType: string; // e.g. "image/jpeg", "video/mp4"
  width: number | null;
  height: number | null;
  durationSec: number | null; // videos only
  sizeBytes: number;
}

export interface Post {
  id: string;
  title: string; // blog title
  body: string; // blog post, 3 paragraphs
  caption: string; // social caption with hashtags
  callToAction: string;
  // What it was generated from (kept so the owner can see / re-run with the same brief).
  topic: string;
  tone: BrandTone;
  audience: Audience;
  status: PostStatus;
  sharedAt: ISODate | null; // last time "Share" was completed
  media: PostMedia | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** GET /posts?status=draft|shared&q=<search in title/topic> (newest first) */
export interface ListPostsResponse {
  posts: Post[];
}
/** POST /posts — manual post (the AI route creates one automatically) */
export interface CreatePostRequest {
  title: string;
  body: string;
  caption: string;
  callToAction: string;
  topic: string;
  tone: BrandTone;
  audience: Audience;
}
/** PATCH /posts/:id — any subset of the text fields */
export type UpdatePostRequest = Partial<CreatePostRequest>;
/** GET/POST/PATCH single post; POST /posts/:id/duplicate → 201; POST /posts/:id/shared marks it shared */
export interface PostResponse {
  post: Post;
}
/**
 * PUT /posts/:id/media — raw file body with headers:
 *   Content-Type: image/jpeg | image/png | image/webp | video/mp4 | video/quicktime
 *   X-Media-Width / X-Media-Height / X-Media-Duration (optional, numbers)
 * Limits: images 10 MB, videos 60 MB and 60 seconds. → { post } with media set.
 * DELETE /posts/:id/media → { post } with media null.
 * GET /media/<key> serves the file (no auth; keys are random).
 */
export const MEDIA_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 60 * 1024 * 1024,
  videoSeconds: 60,
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  videoTypes: ["video/mp4", "video/quicktime"],
} as const;

/** Pipeline 4 — TRIGGER_RETENTION_CAMPAIGN */
export type Incentive = "Complimentary shirt with a suit" | "10% off" | "Free alteration";
export interface AiWinbackRequest {
  clientId: string;
  incentive: Incentive;
}
export interface AiWinbackResponse {
  email_subject: string;
  email_body: string;
}

// ---------- Account ----------
/** DELETE /account → 204. Deletes the shop, all its data and the Clerk user. */
