// TLS mobile API contract — shared by mobile/app and mobile/api.
// Every route except /privacy and /support requires `Authorization: Bearer <Clerk session token>`.
// Errors always come back as ApiError with a non-2xx status.

export type ISODate = string; // ISO 8601, e.g. "2026-09-29T10:00:00.000Z"

export interface ApiError {
  error: {
    code: "unauthorized" | "not_found" | "bad_request" | "rate_limited" | "ai_failed" | "server_error";
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
  createdAt: ISODate;
}

/** GET /shop → 200 { shop } or 404 (not onboarded yet) */
export interface GetShopResponse {
  shop: Shop;
}
/** PUT /shop — creates the shop on first call (onboarding), updates afterwards */
export interface UpsertShopRequest {
  name: string;
  district: string;
  city: string;
  tone?: BrandTone; // default "Sophisticated"
}
export type UpsertShopResponse = GetShopResponse;

// ---------- Home ----------
/** GET /home */
export interface HomeResponse {
  shopName: string;
  clientsCount: number;
  fittingsThisMonth: number;
  inactiveCount: number; // clients whose lastOrderAt (or createdAt) is 90+ days ago
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
export interface Measurements {
  chest: number | null;
  waist: number | null;
  overArm: number | null;
  shoulder: number | null;
  sleeve: number | null;
  jacketLength: number | null;
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
  style: string;
  fabric: string;
  measurements: Measurements;
  postureNote?: string;
}
export interface FittingResponse {
  fitting: Fitting;
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
export interface AiSeoResponse {
  target_market: string;
  keywords: SeoKeyword[];
}

/** Pipeline 3 — GENERATE_DASHBOARD_POST */
export type Audience = "Expatriates" | "Local executives" | "Grooms" | "Tourists";
export interface AiPostRequest {
  brandTone: BrandTone;
  topic: string;
  audience: Audience;
}
export interface AiPostResponse {
  blog_title: string;
  blog_body: string;
  social_caption: string;
  call_to_action: string;
}

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
