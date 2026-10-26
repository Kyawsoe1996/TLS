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
  // The shop's Google "write a review" link (Google Business Profile → Get more reviews). When set, a delivered
  // order offers a review_request email that includes it; null hides that card.
  googleReviewUrl: string | null;
  // When the owner agreed to send client details to Google Gemini (POST /shop/ai-consent); null until then.
  // Every /ai/* route answers 403 consent_required while this is null, so the app asks first.
  aiConsentAt: ISODate | null;
  // Smart Referral: what a friend gets and what the client who sent them gets (both plain text the shop
  // writes, e.g. "A complimentary shirt with your first suit"). Null until the shop sets the offer up.
  referralFriendOffer: string | null;
  referralClientOffer: string | null;
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
  googleReviewUrl?: string; // validated as an http(s) URL when non-empty
  // Smart Referral offer (see Shop); same omit / "" semantics.
  referralFriendOffer?: string;
  referralClientOffer?: string;
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
  appointmentsThisWeek: number; // scheduled appointments from 12 h ago to 7 days ahead
  upcomingAppointments: Appointment[]; // the first 5 of those, soonest first, with clientName
  fabricsLow: number; // fabrics whose metresLeft is below their lowAtMetres (Fabric stock)
  referralLeadsNew: number; // friends who asked for a fitting through a referral link and aren't handled yet
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
  // Smart Referral: who sent this client (another client of the shop), if anyone. Set when they are added
  // from a referral lead or picked under "Who sent you?"; the sender earns the reward on this client's
  // first delivered order.
  referredByClientId: string | null;
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
  referredByClientId?: string; // another client of this shop (400 if not, or if it is the client itself)
}
/** PATCH /clients/:id — any subset of CreateClientRequest */
export type UpdateClientRequest = Partial<CreateClientRequest>;
/** GET /clients/:id, POST /clients, PATCH /clients/:id */
export interface ClientResponse {
  client: Client;
}
/** DELETE /clients/:id → 204 (also deletes its fittings, orders, messages and appointments) */

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
  // When a review_request email was sent for this order (null until then); the app offers it once per order.
  reviewRequestedAt: ISODate | null;
  // Fabric stock: the bolt this order is cut from (a Fabric id), the length it needs in metres, and when that
  // length was taken off the bolt (stamped once, the first time the status reaches "cutting"). All null when the
  // fabric was typed in or is the client's own cloth.
  fabricId: string | null;
  metresNeeded: number | null;
  metresTakenAt: ISODate | null;
  photos: OrderPhoto[]; // progress photos, oldest first (max ORDER_PHOTO_LIMITS.perOrder); [] on the shop-wide list
  createdAt: ISODate;
  updatedAt: ISODate;
  overdue: boolean; // computed: dueAt is before today and status != "delivered"
  clientName?: string; // only on the shop-wide list (GET /orders)
}

/** A progress photo on an order, stored by the API (same storage as post media) and served at `url`. */
export interface OrderPhoto {
  id: string;
  stage: OrderStatus; // the order's status when the photo was taken (default: its status at upload)
  url: string; // absolute, public but unguessable (API_URL + /media/…)
  contentType: string; // image/jpeg | image/png | image/webp
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: ISODate;
}
/**
 * PUT /clients/:id/orders/:orderId/photos → 201 { order } with the new photo appended. Raw image body with
 * headers: Content-Type (image/jpeg | image/png | image/webp), optional X-Media-Width / X-Media-Height and
 * X-Photo-Stage (an OrderStatus; default = the order's current status). 413 over the size limit,
 * 400 when the order already has ORDER_PHOTO_LIMITS.perOrder photos.
 * DELETE /clients/:id/orders/:orderId/photos/:photoId → { order } (deletes the file too).
 */
export const ORDER_PHOTO_LIMITS = {
  perOrder: 6,
  bytes: 10 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp"],
} as const;

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
  fabricId?: string; // a Fabric of this shop; when set and `fabric` is omitted, the fabric's name is stored as `fabric`
  metresNeeded?: number; // metres this order takes off the bolt at Cutting (0.1–100); needs fabricId
}
/**
 * PATCH /clients/:id/orders/:orderId — any subset; status "delivered" stamps deliveredAt. A deposit change is also
 * recorded as a payment (the difference) for the monthly report. The first move to "cutting" takes `metresNeeded`
 * off the fabric's stock (once; later status changes don't repeat it). The first delivery for a client who was
 * referred marks the referrer's reward as ready.
 */
export type UpdateOrderRequest = Partial<CreateOrderRequest> & { status?: OrderStatus };
/** GET/POST/PATCH single order */
export interface OrderResponse {
  order: Order;
}
/** DELETE /clients/:id/orders/:orderId → 204 */

// ---------- Appointments (a dated visit by a client: fitting, collection or consultation) ----------
export const APPOINTMENT_KINDS = ["fitting", "collection", "consultation"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
/** scheduled → done (the client came) or cancelled. Either can go back to scheduled. */
export const APPOINTMENT_STATUSES = ["scheduled", "done", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: string;
  clientId: string;
  orderId: string | null; // the order being collected / fitted, if linked
  kind: AppointmentKind;
  startsAt: ISODate; // UTC instant; the app shows it in the device's (= shop's) time zone
  notes: string | null;
  status: AppointmentStatus;
  reminderSentAt: ISODate | null; // set when an appointment_reminder email was sent for it
  createdAt: ISODate;
  updatedAt: ISODate;
  clientName?: string; // only on GET /appointments and HomeResponse.upcomingAppointments
}

/**
 * GET /clients/:id/appointments (latest start first) and
 * GET /appointments?from=&to=&status= (shop-wide, soonest first, with clientName; defaults: status=scheduled, from=12 h ago)
 */
export interface ListAppointmentsResponse {
  appointments: Appointment[];
}
/** POST /clients/:id/appointments → 201 (status "scheduled"). Does not touch the client's lastOrderAt. */
export interface CreateAppointmentRequest {
  kind: AppointmentKind;
  startsAt: ISODate;
  orderId?: string; // must belong to the same client
  notes?: string;
}
/** PATCH /clients/:id/appointments/:appointmentId — any subset; `status` moves it to done / cancelled / back to scheduled */
export type UpdateAppointmentRequest = Partial<CreateAppointmentRequest> & { status?: AppointmentStatus };
/** GET/POST/PATCH single appointment */
export interface AppointmentResponse {
  appointment: Appointment;
}
/** DELETE /clients/:id/appointments/:appointmentId → 204 */

// ---------- Messages (emails sent to a client from the app) ----------
/** What prompted the email. review_request = thank-you with the shop's Google review link after delivery (orderId set; stamps the order's reviewRequestedAt). */
export type MessageKind = "winback" | "order_ready" | "followup" | "appointment_reminder" | "review_request";
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
  orderId: string | null; // set for order_ready and review_request
  appointmentId: string | null; // set for appointment_reminder
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
  orderId?: string; // must belong to the same client when given; required for order_ready and review_request (review_request stamps the order's reviewRequestedAt)
  appointmentId?: string; // must belong to the same client when given; stamps the appointment's reminderSentAt
}
export interface MessageResponse {
  message: Message;
}

/** Part of GET /shop: whether the API can really send email (RESEND_API_KEY set) and the sender it uses. */
export interface EmailStatus {
  configured: boolean;
  from: string; // e.g. "Shamu via Magick Tailor <onboarding@resend.dev>"
}

// ---------- Fabric stock (cloth on the shelf, in metres) ----------
export const FABRIC_KINDS = ["suiting", "jacketing", "trousering", "shirting", "lining", "other"] as const;
export type FabricKind = (typeof FABRIC_KINDS)[number];

/** Metres a garment usually takes at 150 cm width: the "enough for" labels and the default length on a new order. */
export const GARMENT_METRES = { suit: 3.3, jacket: 2, trousers: 1.3, shirt: 2 } as const;

export const FABRIC_LIMITS = { perShop: 500, maxMetres: 1000 } as const;

export interface Fabric {
  id: string;
  name: string; // "Super 130s navy wool"
  supplier: string | null; // mill or merchant
  colour: string | null;
  kind: FabricKind;
  widthCm: number | null;
  metresLeft: number;
  lowAtMetres: number; // `low` when metresLeft < this
  costPerMetre: number | null; // THB
  swatch: string | null; // hex colour for the swatch square, e.g. "#1E2D4D"
  notes: string | null;
  low: boolean; // computed: metresLeft < lowAtMetres
  createdAt: ISODate;
  updatedAt: ISODate;
}

export const FABRIC_MOVEMENT_REASONS = ["received", "correction", "order"] as const;
export type FabricMovementReason = (typeof FABRIC_MOVEMENT_REASONS)[number];

/** One change of a bolt's length. `order` movements carry the order id and are written by the API at Cutting. */
export interface FabricMovement {
  id: string;
  fabricId: string;
  orderId: string | null;
  metres: number; // signed: + received / correction up, − used / correction down
  reason: FabricMovementReason;
  note: string | null;
  createdAt: ISODate;
}

/** GET /fabrics?low=true → low ones first, then by name */
export interface ListFabricsResponse {
  fabrics: Fabric[];
}
/** GET /fabrics/:id → the fabric, its movements (newest first) and the orders cut from it (with clientName) */
export interface FabricDetailResponse {
  fabric: Fabric;
  movements: FabricMovement[];
  orders: Order[];
}
/** POST /fabrics → 201 { fabric }; PATCH /fabrics/:id → { fabric } */
export interface FabricResponse {
  fabric: Fabric;
}
export interface CreateFabricRequest {
  name: string;
  supplier?: string;
  colour?: string;
  kind?: FabricKind; // default "suiting"
  widthCm?: number; // 50–400
  metresLeft?: number; // starting length, default 0; later changes go through movements
  lowAtMetres?: number; // default 3
  costPerMetre?: number; // THB
  swatch?: string; // "#RRGGBB"
  notes?: string;
}
/** PATCH /fabrics/:id — any subset except metresLeft (use a movement); `null` clears an optional field */
export type UpdateFabricRequest = Partial<Omit<CreateFabricRequest, "metresLeft">>;
/** POST /fabrics/:id/movements → { fabric, movement } — a delivery (+) or a stock-take correction (+/−) */
export interface AddFabricMovementRequest {
  metres: number; // non-zero; "received" must be positive
  reason: "received" | "correction";
  note?: string;
}
export interface FabricMovementResponse {
  fabric: Fabric;
  movement: FabricMovement;
}
/** DELETE /fabrics/:id → 204 (orders keep their fabric name; their fabricId is cleared) */

// ---------- Payments and reports ----------
/** A payment recorded against an order (written when the deposit changes; negative = corrected down). */
export interface OrderPayment {
  id: string;
  orderId: string;
  clientId: string;
  amount: number; // THB
  paidAt: ISODate;
}

/** GET /reports?month=YYYY-MM (default: the current month, in UTC) */
export interface ReportResponse {
  month: string; // "2026-10"
  newClients: number;
  fittings: number;
  ordersCreated: number;
  ordersDelivered: number;
  moneyCollected: number; // THB: payments recorded in the month
  revenueDelivered: number; // THB: price of the orders delivered in the month
  stillOwed: number; // THB: balance across open orders, today
  openOrders: number; // today
  quietClients: number; // inactive 90+ days, today
  previous: { month: string; newClients: number; fittings: number; ordersDelivered: number; moneyCollected: number };
  months: { month: string; ordersDelivered: number; moneyCollected: number }[]; // the last 6 months, oldest first, this month last
  garments: { garment: string; delivered: number }[]; // most made this month, up to 5
  clientsToCall: { clientId: string; name: string; reason: "quiet" | "balance"; detail: string }[]; // up to 6
}

// ---------- Smart Referral ----------
export const REFERRAL_PREFERRED = ["this_week", "next_week", "any"] as const;
export type ReferralPreferred = (typeof REFERRAL_PREFERRED)[number];
export const REFERRAL_LEAD_STATUSES = ["new", "added", "dismissed"] as const;
export type ReferralLeadStatus = (typeof REFERRAL_LEAD_STATUSES)[number];
export const REFERRAL_REWARD_STATUSES = ["pending", "ready", "given"] as const;
export type ReferralRewardStatus = (typeof REFERRAL_REWARD_STATUSES)[number];

/** A friend who asked for a fitting through a client's link (the public page at /r/:code). */
export interface ReferralLead {
  id: string;
  referrerClientId: string;
  referrerName: string;
  name: string;
  contact: string; // phone or LINE id, as typed
  preferred: ReferralPreferred | null;
  status: ReferralLeadStatus;
  clientId: string | null; // once added as a client
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** The reward an ambassador earns for one friend: pending until the friend's first delivered order, then ready. */
export interface ReferralReward {
  id: string;
  ambassadorClientId: string;
  ambassadorName: string;
  friendClientId: string;
  friendName: string;
  status: ReferralRewardStatus;
  readyAt: ISODate | null;
  givenAt: ISODate | null;
  createdAt: ISODate;
}

/** GET /referrals → the Smart Referral screen */
export interface ReferralOverviewResponse {
  friendOffer: string | null;
  clientOffer: string | null;
  linksShared: number; // sum of every client's Share taps
  friendsBooked: number; // leads received
  becameClients: number; // referred clients with at least one delivered order
  rewardsReady: number;
  leads: ReferralLead[]; // new first, then added / dismissed, newest first; up to 50
  ambassadors: { clientId: string; name: string; friendsBooked: number; becameClients: number; rewardsReady: number }[]; // top 10
  rewards: ReferralReward[]; // ready first, then pending, then given; up to 50
}
/** GET /clients/:id/referral → the client's link and what it brought in (makes the code on first call) */
export interface ClientReferralResponse {
  code: string; // e.g. "DANIEL-7F2K"
  url: string; // absolute public link, e.g. https://api…/r/DANIEL-7F2K
  message: string; // ready-to-send text with the offer and the link
  sharedCount: number;
  friendsBooked: number;
  becameClients: number;
  rewards: ReferralReward[]; // this client's rewards as the ambassador
}
/** POST /clients/:id/referral/shared → { sharedCount } (the app calls it when the share sheet closes) */
export interface ReferralSharedResponse {
  sharedCount: number;
}
/** GET /referrals/leads/:id → { lead } */
export interface ReferralLeadResponse {
  lead: ReferralLead;
}
/** POST /referrals/leads/:id/add → 201 { lead, client } — makes a client from the lead (referredByClientId set) */
export interface AddReferralLeadResponse {
  lead: ReferralLead;
  client: Client;
}
/** POST /referrals/leads/:id/dismiss → { lead }; POST /referrals/rewards/:id/given → { reward } */
export interface ReferralRewardResponse {
  reward: ReferralReward;
}
/**
 * Public, no auth: GET /r/:code → the friend's HTML page (404 page when the code is unknown);
 * POST /r/:code (form fields name, contact, preferred, and a `website` honeypot that must stay empty) → a thank-you
 * page; rate limited per address.
 */

// ---------- AI ----------
// All AI routes are rate limited per user (429 rate_limited) and may return 502 ai_failed.

/** POST /ai/fit → runs pipeline 1 on a saved fitting and stores the result on it */
export interface AiFitRequest {
  fittingId: string;
}
export type AiFitResponse = FittingResponse; // fitting.analysis is set

/**
 * POST /ai/parse-measurements — turns a dictated transcript ("chest one-oh-two, waist eighty-eight, right
 * shoulder a little low") into measurement values. Text only: the phone's own speech recognition produces the
 * transcript, and the app calls this only when its local parser can't make sense of part of it.
 */
export interface AiParseMeasurementsRequest {
  transcript: string; // 1–2000 chars
  garmentType: GarmentType; // only this garment's measurement keys come back
  language?: "en" | "th"; // hint for number words; default "en"
}
export interface AiParseMeasurementsResponse {
  measurements: Partial<Measurements>; // cm, only keys that were clearly said
  postureNote: string | null; // anything about posture / stance, cleaned up into one sentence
  unrecognised: string[]; // phrases that looked like a measurement but couldn't be read
}

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
