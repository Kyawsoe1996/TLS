// Pure helpers for the free shop website: the address part ("slug") rules, enquiry labels and the
// "What the page shows" checklist. No React / react-native imports, so lib/__tests__/website.test.ts runs them in node.
import {
  WEBSITE_LIMITS,
  type PortfolioOrderCandidate,
  type ReferralPreferred,
  type Shop,
  type WebsiteEnquiry,
  type WebsiteEnquiryStatus,
  type WebsitePieceCategory,
  type WebsiteSections,
  type WebsiteTheme,
} from "@shared/types";

import { PREFERRED_LABELS } from "./referral";

// ---------- The address part, kept in step with the API (routes/website.ts) ----------

/** 3-40 of a-z, 0-9 and "-", starting and ending with a letter or digit. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Same list as the API: refused as an address part. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "app", "s", "r", "www", "media", "privacy", "support", "health", "help", "login", "signin", "signup",
  "account", "settings", "static", "assets", "magick", "magicktailor", "shop-admin",
]);

/**
 * The text lower-cased, every run of characters outside a-z / 0-9 turned into one "-", dashes trimmed from both ends,
 * at most 40 characters; "shop" when nothing is left (e.g. a name in Thai script). Identical to the API's slugify.
 */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WEBSITE_LIMITS.slugMax)
    .replace(/-+$/g, "");
  return slug || "shop";
}

/** True when the API would accept `slug` (pattern and not reserved). */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** What the owner is typing, cleaned as they go: lower case, spaces and odd characters to "-", no double dashes. */
export function cleanSlugInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/g, "")
    .slice(0, WEBSITE_LIMITS.slugMax);
}

/** The error line under the address field, or null when it's fine. */
export function slugError(slug: string): string | null {
  if (slug.length < 3) return "At least 3 characters.";
  if (!SLUG_RE.test(slug)) return "Letters, numbers and dashes only, not starting or ending with a dash.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Please choose another one.";
  return null;
}

/** "https://api.example.com/s/kssoe" → { prefix: "api.example.com/s/", slug: "kssoe" } for the address editor. */
export function splitWebsiteUrl(url: string): { prefix: string; slug: string } {
  const bare = url.replace(/^https?:\/\//, "");
  const cut = bare.lastIndexOf("/") + 1;
  return { prefix: bare.slice(0, cut), slug: bare.slice(cut) };
}

// ---------- Enquiries ----------

export const ENQUIRY_STATUS_LABELS: Record<WebsiteEnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  added: "Client",
  dismissed: "Dismissed",
};
export type EnquiryStatusTone = "danger" | "warning" | "success" | "neutral";
const ENQUIRY_STATUS_TONES: Record<WebsiteEnquiryStatus, EnquiryStatusTone> = {
  new: "danger",
  contacted: "warning",
  added: "success",
  dismissed: "neutral",
};

/** "contacted" → "Contacted"; "added" → "Client". */
export function enquiryStatusLabel(status: WebsiteEnquiryStatus): string {
  return ENQUIRY_STATUS_LABELS[status];
}

/** Tag tone: New in red (reply today), Contacted in gold, Client in green, Dismissed neutral. */
export function enquiryStatusTone(status: WebsiteEnquiryStatus): EnquiryStatusTone {
  return ENQUIRY_STATUS_TONES[status];
}

/** "this_week" → "This week"; "" when the visitor didn't say. */
export function enquiryPreferredLabel(preferred: ReferralPreferred | null | undefined): string {
  return preferred ? PREFERRED_LABELS[preferred] : "";
}

/** Second line of an enquiry row: "Suits · this week", "Suits", "Prefers next week" or "Asked for a fitting". */
export function enquiryDetailLine(enquiry: Pick<WebsiteEnquiry, "garment" | "preferred">): string {
  const when = enquiryPreferredLabel(enquiry.preferred);
  if (enquiry.garment && when) return `${enquiry.garment} · ${when.toLowerCase()}`;
  if (enquiry.garment) return enquiry.garment;
  if (when) return `Prefers ${when.toLowerCase()}`;
  return "Asked for a fitting";
}

/** Split the list into the ones waiting for a reply and the rest, keeping the API's newest-first order. */
export function groupEnquiries<T extends Pick<WebsiteEnquiry, "status">>(enquiries: readonly T[]): { fresh: T[]; earlier: T[] } {
  return { fresh: enquiries.filter((e) => e.status === "new"), earlier: enquiries.filter((e) => e.status !== "new") };
}

// ---------- "What the page shows" ----------

export interface PageItem {
  key: "about" | "hours" | "address" | "phone" | "line" | "reviews";
  label: string;
  present: boolean;
  /** Shown instead of the label when missing: "Add your opening hours". */
  hint: string;
  /** Where to fix it: shop details (hours, address, phone, review link) or this screen (about, LINE). */
  fixIn: "shop-details" | "website";
}

/** The checklist under the link: every detail the page can show, ticked when the shop has it. */
export function pageItems(
  shop: Pick<Shop, "openingHours" | "address" | "phone" | "googleReviewUrl"> | null,
  site: { about: string | null; lineId: string | null },
): PageItem[] {
  const has = (v: string | null | undefined) => !!v?.trim();
  return [
    { key: "about", label: "About the shop", present: has(site.about), hint: "Write a few lines about the shop (a default one is used)", fixIn: "website" },
    { key: "hours", label: "Opening hours", present: has(shop?.openingHours), hint: "Add your opening hours", fixIn: "shop-details" },
    { key: "address", label: "Address with a map link", present: has(shop?.address), hint: "Add your address", fixIn: "shop-details" },
    { key: "phone", label: "Call button", present: has(shop?.phone), hint: "Add your phone number", fixIn: "shop-details" },
    { key: "line", label: "LINE button", present: has(site.lineId), hint: "Add your LINE ID", fixIn: "website" },
    { key: "reviews", label: "Read our reviews (Google)", present: has(shop?.googleReviewUrl), hint: "Add your Google review link", fixIn: "shop-details" },
  ];
}

/** "Add opening hours, address and phone to make the page complete." from WebsiteResponse.missing; "" when complete. */
export function missingSentence(missing: readonly string[]): string {
  if (missing.length === 0) return "";
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list} to make the page complete.`;
}

// ---------- Portfolio website ----------

export interface ThemeOption {
  key: WebsiteTheme;
  name: string;
  description: string;
  /** Hero background, text and accent: the three dots on the picker. */
  swatch: { bg: string; fg: string; accent: string };
}

/** The "Look" picker. Colours match the public pages (api routes/websitePublic.ts THEMES). */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { key: "atelier", name: "Atelier", description: "Navy and gold", swatch: { bg: "#14213A", fg: "#F4EFE6", accent: "#D1AC66" } },
  { key: "ivory", name: "Ivory", description: "Light ivory, navy text", swatch: { bg: "#F4EFE6", fg: "#14213A", accent: "#B88E45" } },
  { key: "noir", name: "Noir", description: "Near-black, warm white", swatch: { bg: "#0A0A0A", fg: "#F3EEE6", accent: "#CDAA6E" } },
];

export function themeName(theme: WebsiteTheme): string {
  return THEME_OPTIONS.find((t) => t.key === theme)?.name ?? "Atelier";
}

/** All sections on, as the API assumes when nothing is saved. */
export const DEFAULT_SECTIONS: WebsiteSections = { fabrics: true, process: true, booking: true };

/** "Every garment includes" until the owner writes their own; same lines as the API. */
export const DEFAULT_INCLUDES: readonly string[] = [
  "Measurements taken by hand and kept on file",
  "Fittings until the fit is right",
  "Made in our own workshop",
];

export const CATEGORY_LABELS: Record<WebsitePieceCategory, string> = {
  suits: "Suits",
  jackets: "Jackets",
  trousers: "Trousers",
  shirts: "Shirts",
  wedding: "Wedding",
  other: "Other",
};

/**
 * The garment group of a free-text garment ("Two-piece suit" → suits). Wedding words win, then suits before jackets
 * (a "suit jacket" is part of a suit). Mirrors the API (src/websiteData.ts).
 */
export function categoryFromGarment(text: string | null | undefined): WebsitePieceCategory {
  const t = (text ?? "").toLowerCase();
  if (/wedding|bridal|bride|groom|sherwani/.test(t)) return "wedding";
  if (/suit|tuxedo|tux\b|dinner|morning coat|three-piece|two-piece/.test(t)) return "suits";
  if (/jacket|blazer|coat|waistcoat|vest|gilet|safari/.test(t)) return "jackets";
  if (/trouser|pant|chino|slack|short/.test(t)) return "trousers";
  if (/shirt|blouse|polo/.test(t)) return "shirts";
  return "other";
}

/** "from ฿18,000"; "" without a price. */
export function priceLabel(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "";
  return `from ฿${Math.round(price).toLocaleString("en-US")}`;
}

/** What the owner typed in a price field → whole baht, null when empty; NaN-safe ("18,000" → 18000, "abc" → undefined = invalid). */
export function parsePriceInput(text: string): number | null | undefined {
  const clean = text.replace(/[฿,\s]/g, "");
  if (clean === "") return null;
  if (!/^\d+(\.\d+)?$/.test(clean)) return undefined;
  return Math.round(Number(clean));
}

/** "4.9" → 4.9, "" → null, out of 1-5 or not a number → undefined (invalid). */
export function parseRatingInput(text: string): number | null | undefined {
  const clean = text.trim().replace(",", ".");
  if (clean === "") return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 1 || n > 5) return undefined;
  return Math.round(n * 10) / 10;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2026" from an ISO date (UTC); "" when missing or broken. */
export function shortMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The read-only line under a piece made from an order: "Trousers · Super 130s navy wool · Oct 2026 · 2 workshop photos". */
export function orderSourceLine(order: Pick<PortfolioOrderCandidate, "garment" | "fabric" | "madeAt" | "photos">): string {
  const n = order.photos.length;
  return [order.garment, order.fabric, shortMonth(order.madeAt), n > 0 ? `${n} workshop ${n === 1 ? "photo" : "photos"}` : ""]
    .filter((part) => !!part && part.trim() !== "")
    .join(" · ");
}

/** The includes the owner typed, one per line → the list to save ([] = back to the defaults). */
export function includesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, WEBSITE_LIMITS.includesMax)
    .map((l) => l.slice(0, WEBSITE_LIMITS.includeMax));
}

/** Moves the item at `index` one place up (-1) or down (+1); the same array when it can't move. */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}
