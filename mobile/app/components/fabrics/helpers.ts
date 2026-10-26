// Pure helpers for the Fabric stock screens: "enough for" labels, metres formatting, the default length an
// order takes, grouping and filtering. No Expo / React Native imports — lib/__tests__/fabrics.test.ts runs these in node.
import { GARMENT_METRES, type Fabric, type FabricKind, type FabricMovement } from "@shared/types";

export const FABRIC_KIND_LABELS: Record<FabricKind, string> = {
  suiting: "Suiting",
  jacketing: "Jacketing",
  trousering: "Trousering",
  shirting: "Shirting",
  lining: "Lining",
  other: "Other",
};

/** "suiting" → "Suiting". */
export function fabricKindLabel(kind: FabricKind): string {
  return FABRIC_KIND_LABELS[kind];
}

/** Preset swatch colours for the New / Edit fabric form. */
export const SWATCH_PALETTE = [
  { key: "navy", label: "Navy", hex: "#1E2D4D" },
  { key: "charcoal", label: "Charcoal", hex: "#4A4A4A" },
  { key: "sand", label: "Sand", hex: "#C9B48A" },
  { key: "white", label: "White", hex: "#F2F0EA" },
  { key: "midnight", label: "Midnight", hex: "#243556" },
  { key: "grey", label: "Grey", hex: "#8C8C8C" },
  { key: "brown", label: "Brown", hex: "#6B4E2E" },
  { key: "olive", label: "Olive", hex: "#5F6B3F" },
] as const;

/** The swatch square when a fabric has no colour: the theme's sand (constants/theme.ts isn't importable here). */
export const DEFAULT_SWATCH = "#EAE1CF";

/** True for light colours (a dark tick is readable on them); false for dark ones or anything that isn't "#RRGGBB". */
export function isPaleHex(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/** Lengths are shown to one decimal; this also removes float noise from stepper arithmetic (3.3 − 0.1). */
export function roundMetres(metres: number): number {
  return Math.round(metres * 10) / 10;
}

/** 2.7 → "2.7 m", 3 → "3 m", 12.25 → "12.3 m". */
export function formatMetres(metres: number): string {
  const r = roundMetres(metres);
  return `${Number.isInteger(r) ? r : r.toFixed(1)} m`;
}

/** 2.7 → "2.7", 3 → "3" (the big number on a row, with the unit set separately). */
export function metresNumber(metres: number): string {
  const r = roundMetres(metres);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** +12 → "+12 m", −3.3 → "−3.3 m" (a real minus sign). */
export function formatSignedMetres(metres: number): string {
  const r = roundMetres(metres);
  return `${r < 0 ? "−" : "+"}${formatMetres(Math.abs(r))}`;
}

export interface EnoughFor {
  /** "3 suits", "Jacket or trousers only", "14 shirts", "Not enough for trousers". */
  label: string;
  suit: boolean;
  jacket: boolean;
  trousers: boolean;
  shirt: boolean;
  /** Whole suits the bolt still holds. */
  suits: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a bolt is still good for, from GARMENT_METRES. Suiting (and anything not listed) counts in suits; shirting in
 * shirts, trousering in pairs of trousers, jacketing in jackets.
 */
export function enoughFor(metresLeft: number, kind: FabricKind = "suiting"): EnoughFor {
  const m = roundMetres(Math.max(0, metresLeft));
  const suit = m >= GARMENT_METRES.suit;
  const jacket = m >= GARMENT_METRES.jacket;
  const trousers = m >= GARMENT_METRES.trousers;
  const shirt = m >= GARMENT_METRES.shirt;
  const suits = Math.floor(m / GARMENT_METRES.suit);

  let label: string;
  if (kind === "shirting") {
    const shirts = Math.floor(m / GARMENT_METRES.shirt);
    label = shirts > 0 ? plural(shirts, "shirt", "shirts") : "Not enough for a shirt";
  } else if (kind === "trousering") {
    const pairs = Math.floor(m / GARMENT_METRES.trousers);
    label = pairs > 0 ? plural(pairs, "pair of trousers", "pairs of trousers") : "Not enough for trousers";
  } else if (kind === "jacketing") {
    const jackets = Math.floor(m / GARMENT_METRES.jacket);
    label = jackets > 0 ? plural(jackets, "jacket", "jackets") : "Not enough for a jacket";
  } else if (suits > 0) {
    label = plural(suits, "suit", "suits");
  } else if (jacket) {
    label = "Jacket or trousers only";
  } else if (trousers) {
    label = "Trousers only";
  } else {
    label = m <= 0 ? "Empty" : "Not enough for trousers";
  }
  return { label, suit, jacket, trousers, shirt, suits };
}

/** Which GARMENT_METRES entry a garment name maps to; `null` for anything else (a custom garment). */
export function garmentKey(garmentLabel: string): keyof typeof GARMENT_METRES | null {
  const g = garmentLabel.toLowerCase();
  if (g.includes("suit") || g.includes("tuxedo")) return "suit";
  if (g.includes("jacket") || g.includes("blazer")) return "jacket";
  if (g.includes("trouser") || g.includes("pants") || g.includes("slacks")) return "trousers";
  if (g.includes("shirt")) return "shirt";
  return null;
}

/** The length a new order starts with: suits 3.3 m, jackets 2 m, trousers 1.3 m, shirts 2 m, anything else 2 m. */
export function defaultMetresFor(garmentLabel: string): number {
  const key = garmentKey(garmentLabel);
  return key ? GARMENT_METRES[key] : 2;
}

/** "a suit" / "a jacket" / "trousers" / "a shirt" / "this order", for the "not enough for …" line. */
export function garmentNoun(garmentLabel: string): string {
  switch (garmentKey(garmentLabel)) {
    case "suit":
      return "a suit";
    case "jacket":
      return "a jacket";
    case "trousers":
      return "trousers";
    case "shirt":
      return "a shirt";
    default:
      return "this order";
  }
}

/** What stays on the bolt after an order takes `needed` (negative when it doesn't fit). */
export function remainingAfter(metresLeft: number, needed: number): number {
  return roundMetres(metresLeft - needed);
}

/** "Enough · 4.5 m will remain" (ok) or "Only 2.7 m left · not enough for a suit" (short, still selectable). */
export function stockLine(metresLeft: number, needed: number, garmentLabel: string): { text: string; ok: boolean } {
  const remaining = remainingAfter(metresLeft, needed);
  if (remaining >= 0) return { text: `Enough · ${formatMetres(remaining)} will remain`, ok: true };
  return { text: `Only ${formatMetres(metresLeft)} left · not enough for ${garmentNoun(garmentLabel)}`, ok: false };
}

/** Low ones and the rest, each in the API's order (low first, then by name). */
export function groupFabrics(fabrics: readonly Fabric[]): { low: Fabric[]; inStock: Fabric[] } {
  const low: Fabric[] = [];
  const inStock: Fabric[] = [];
  for (const fabric of fabrics) (fabric.low ? low : inStock).push(fabric);
  return { low, inStock };
}

export type FabricFilter = "all" | "low" | FabricKind;

/** The list's search box (name / colour / supplier, case-insensitive) and chip filter together. */
export function filterFabrics(fabrics: readonly Fabric[], search: string, filter: FabricFilter): Fabric[] {
  const q = search.trim().toLowerCase();
  return fabrics.filter((f) => {
    if (filter === "low" && !f.low) return false;
    if (filter !== "all" && filter !== "low" && f.kind !== filter) return false;
    if (!q) return true;
    return [f.name, f.colour, f.supplier].some((v) => v?.toLowerCase().includes(q));
  });
}

/** "12 fabrics on the shelf · 2 running low" / "1 fabric on the shelf" / "Nothing on the shelf yet". */
export function listSubtitle(count: number, lowCount: number): string {
  if (count === 0) return "Nothing on the shelf yet";
  const base = `${plural(count, "fabric", "fabrics")} on the shelf`;
  return lowCount > 0 ? `${base} · ${lowCount} running low` : base;
}

/** "2 fabrics are below their minimum. Order more before promising a suit from them." */
export function lowBanner(lowCount: number): string {
  const subject = lowCount === 1 ? "1 fabric is" : `${lowCount} fabrics are`;
  const them = lowCount === 1 ? "it" : "them";
  return `${subject} below their minimum. Order more before promising a suit from ${them}.`;
}

/** "supplier · 150 cm · Suiting", skipping what's missing. */
export function fabricMetaLine(fabric: Pick<Fabric, "supplier" | "widthCm" | "kind">): string {
  return [fabric.supplier, fabric.widthCm ? `${fabric.widthCm} cm` : null, fabricKindLabel(fabric.kind)].filter(Boolean).join(" · ");
}

/**
 * One history row's text. Order movements carry the API's note "Two-piece suit for Marcus Lindqvist" and read as
 * "Marcus Lindqvist · two-piece suit" over "Cutting started"; deliveries and corrections name themselves.
 */
export function movementLine(movement: Pick<FabricMovement, "reason" | "note">): { title: string; detail: string | null } {
  const note = movement.note?.trim() || null;
  if (movement.reason === "order") {
    if (note) {
      const at = note.lastIndexOf(" for ");
      if (at > 0) {
        const garment = note.slice(0, at).trim();
        const client = note.slice(at + 5).trim();
        return { title: `${client} · ${garment.charAt(0).toLowerCase()}${garment.slice(1)}`, detail: "Cutting started" };
      }
      return { title: note, detail: "Cutting started" };
    }
    return { title: "Order", detail: "Cutting started" };
  }
  if (movement.reason === "received") return { title: note === "Opening stock" ? "Opening stock" : "Received", detail: note === "Opening stock" ? null : note };
  return { title: "Count corrected", detail: note };
}
