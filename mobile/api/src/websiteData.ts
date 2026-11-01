import type { Row } from "@libsql/client/web";
import {
  WEBSITE_PHOTO_SOURCES,
  WEBSITE_PIECE_CATEGORIES,
  WEBSITE_THEMES,
  type WebsitePhotoSource,
  type WebsitePiece,
  type WebsitePieceCategory,
  type WebsitePiecePhoto,
  type WebsiteReview,
  type WebsiteSections,
  type WebsiteService,
  type WebsiteTheme,
} from "../../shared/types";
import type { Db } from "./db";
import { mediaUrl } from "./media";

// Portfolio website data shared by the signed-in routes (routes/website.ts, routes/websiteContent.ts) and the public
// pages (routes/websitePublic.ts): defaults, JSON columns, row mappers and the piece loader. The pure helpers here are
// mirrored in app/lib/website.ts (categoryFromGarment, defaults).

export const DEFAULT_SECTIONS: WebsiteSections = { fabrics: true, process: true, booking: true };

/** "Every garment includes" until the owner writes their own. Plain promises every made-to-measure shop keeps. */
export const DEFAULT_INCLUDES: readonly string[] = [
  "Measurements taken by hand and kept on file",
  "Fittings until the fit is right",
  "Made in our own workshop",
];

/** Added by "Add the usual services" (POST /website/services/defaults). No prices: the owner adds their own. */
export const DEFAULT_SERVICES: readonly { name: string; line: string }[] = [
  { name: "Two-piece suit", line: "Jacket and trousers cut to your measurements, in the cloth you choose." },
  { name: "Shirt", line: "Made to measure, with your choice of collar and cuffs." },
  { name: "Alterations", line: "Taking in, letting out and shortening, for clothes from anywhere." },
];

export const isTheme = (v: unknown): v is WebsiteTheme => typeof v === "string" && (WEBSITE_THEMES as readonly string[]).includes(v);
const isCategory = (v: unknown): v is WebsitePieceCategory =>
  typeof v === "string" && (WEBSITE_PIECE_CATEGORIES as readonly string[]).includes(v);
const isSource = (v: unknown): v is WebsitePhotoSource => typeof v === "string" && (WEBSITE_PHOTO_SOURCES as readonly string[]).includes(v);

const str = (row: Row, key: string): string => (row[key] == null ? "" : String(row[key]));
const strOrNull = (row: Row, key: string): string | null => {
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const numOrNull = (row: Row, key: string): number | null => {
  const v = row[key];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The garment group of a free-text garment ("Two-piece suit" -> suits). Wedding words win over the garment, then
 * suits before jackets (a "suit jacket" is part of a suit). Mirrors app/lib/website.ts.
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

/** The sections JSON column, every missing or broken key falling back to on. */
export function readSections(raw: unknown): WebsiteSections {
  const out: WebsiteSections = { ...DEFAULT_SECTIONS };
  if (typeof raw !== "string" || !raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(out) as (keyof WebsiteSections)[]) {
      if (typeof parsed?.[key] === "boolean") out[key] = parsed[key] as boolean;
    }
  } catch {
    // broken JSON: defaults
  }
  return out;
}

/** The includes JSON column: the owner's lines, or null (= the defaults) when unset, empty or broken. */
export function readIncludes(raw: unknown): string[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const lines = parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

export function rowToWebsiteService(row: Row): WebsiteService {
  return { id: str(row, "id"), name: str(row, "name"), fromPrice: numOrNull(row, "from_price"), line: strOrNull(row, "line") };
}

export function rowToWebsiteReview(row: Row): WebsiteReview {
  return { id: str(row, "id"), quote: str(row, "quote"), author: str(row, "author"), source: strOrNull(row, "source") ?? "Google" };
}

function rowToPiecePhoto(row: Row, origin: string): WebsitePiecePhoto {
  const source = row["source"];
  return {
    id: str(row, "id"),
    url: mediaUrl(origin, str(row, "media_key")),
    source: isSource(source) ? source : "upload",
    sourceId: strOrNull(row, "source_id"),
    width: numOrNull(row, "width"),
    height: numOrNull(row, "height"),
  };
}

function rowToPiece(row: Row, photos: WebsitePiecePhoto[]): WebsitePiece {
  const category = row["category"];
  return {
    id: str(row, "id"),
    title: str(row, "title"),
    category: isCategory(category) ? category : "other",
    cloth: strOrNull(row, "cloth"),
    style: strOrNull(row, "style"),
    line: strOrNull(row, "line"),
    madeAt: strOrNull(row, "made_at"),
    orderId: strOrNull(row, "order_id"),
    photos,
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

/** The shop's pieces in their order (or just `pieceId`), each with its photos in order. */
export async function loadPieces(db: Db, shopId: string, origin: string, pieceId?: string): Promise<WebsitePiece[]> {
  const only = pieceId ? " AND id = ?" : "";
  const onlyPhotos = pieceId ? " AND piece_id = ?" : "";
  const args = pieceId ? [shopId, pieceId] : [shopId];
  const [pieces, photos] = await db.batch(
    [
      { sql: `SELECT * FROM website_pieces WHERE shop_id = ?${only} ORDER BY sort ASC, created_at ASC`, args },
      { sql: `SELECT * FROM website_piece_photos WHERE shop_id = ?${onlyPhotos} ORDER BY sort ASC, created_at ASC`, args },
    ],
    "read",
  );
  const byPiece = new Map<string, WebsitePiecePhoto[]>();
  for (const row of photos?.rows ?? []) {
    const id = str(row, "piece_id");
    const list = byPiece.get(id) ?? [];
    list.push(rowToPiecePhoto(row, origin));
    byPiece.set(id, list);
  }
  return (pieces?.rows ?? []).map((row) => rowToPiece(row, byPiece.get(str(row, "id")) ?? []));
}
