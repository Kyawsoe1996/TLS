// Measurement metadata shared by the fitting form, fitting rows and fitting detail.
// Which fields a fitting shows depends on its garment type: jacket, trousers, shirt, or suit (jacket + trousers).
import type { GarmentType, Measurements } from "@shared/types";

export type MeasurementKey = keyof Measurements;

export interface MeasurementField {
  key: MeasurementKey;
  label: string;
}

const LABELS: Record<MeasurementKey, string> = {
  chest: "Chest",
  waist: "Waist",
  overArm: "Over-arm",
  shoulder: "Shoulder",
  sleeve: "Sleeve",
  jacketLength: "Jacket length",
  hip: "Hip",
  inseam: "Inseam",
  outseam: "Outseam",
  thigh: "Thigh",
  hem: "Hem",
  neck: "Neck",
  cuff: "Cuff",
  shirtLength: "Shirt length",
};

/** Every key in the contract's order; the fallback order for values recorded outside a garment's set. */
const ALL_KEYS: readonly MeasurementKey[] = [
  "chest",
  "waist",
  "overArm",
  "shoulder",
  "sleeve",
  "jacketLength",
  "hip",
  "inseam",
  "outseam",
  "thigh",
  "hem",
  "neck",
  "cuff",
  "shirtLength",
];

const JACKET_KEYS: readonly MeasurementKey[] = ["chest", "waist", "overArm", "shoulder", "sleeve", "jacketLength"];
const TROUSER_KEYS: readonly MeasurementKey[] = ["waist", "hip", "inseam", "outseam", "thigh", "hem"];
const SHIRT_KEYS: readonly MeasurementKey[] = ["neck", "chest", "waist", "shoulder", "sleeve", "cuff", "shirtLength"];
// Jacket fields, then the trouser fields the jacket doesn't already cover (waist appears once).
const SUIT_KEYS: readonly MeasurementKey[] = [...JACKET_KEYS, ...TROUSER_KEYS.filter((k) => !JACKET_KEYS.includes(k))];

const FIELD_KEYS: Record<GarmentType, readonly MeasurementKey[]> = {
  jacket: JACKET_KEYS,
  trousers: TROUSER_KEYS,
  shirt: SHIRT_KEYS,
  suit: SUIT_KEYS,
};

export const GARMENT_LABELS: Record<GarmentType, string> = {
  jacket: "Jacket",
  trousers: "Trousers",
  shirt: "Shirt",
  suit: "Full suit",
};

const MEASUREMENT_TITLES: Record<GarmentType, string> = {
  jacket: "Jacket measurements",
  trousers: "Trouser measurements",
  shirt: "Shirt measurements",
  suit: "Suit measurements",
};

/** Fittings cached before the field existed count as jackets (the API default). */
function garmentOf(garmentType: GarmentType | undefined): GarmentType {
  return garmentType ?? "jacket";
}

/** "Jacket" / "Trousers" / "Shirt" / "Full suit". */
export function garmentLabel(garmentType: GarmentType | undefined): string {
  return GARMENT_LABELS[garmentOf(garmentType)];
}

/** Section heading for the garment's measurement set, e.g. "Trouser measurements". */
export function measurementsTitle(garmentType: GarmentType | undefined): string {
  return MEASUREMENT_TITLES[garmentOf(garmentType)];
}

export function measurementLabel(key: MeasurementKey): string {
  return LABELS[key];
}

/** The fields a garment uses, in form / grid order. */
export function fieldsFor(garmentType: GarmentType | undefined): readonly MeasurementField[] {
  return FIELD_KEYS[garmentOf(garmentType)].map((key) => ({ key, label: LABELS[key] }));
}

export const EMPTY_MEASUREMENTS: Measurements = {
  chest: null,
  waist: null,
  overArm: null,
  shoulder: null,
  sleeve: null,
  jacketLength: null,
  hip: null,
  inseam: null,
  outseam: null,
  thigh: null,
  hem: null,
  neck: null,
  cuff: null,
  shirtLength: null,
};

/** Only the garment's keys, for POST /fittings — keys left out are stored as null by the API. */
export function pickMeasurements(garmentType: GarmentType, m: Measurements): Partial<Measurements> {
  const out: Partial<Measurements> = {};
  for (const key of FIELD_KEYS[garmentType]) out[key] = m[key];
  return out;
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

/** 102 → "102", 102.4 → "102.4", null → "—". */
export function formatMeasurement(value: number | null | undefined): string {
  if (!hasValue(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Same as `formatMeasurement` with the unit, e.g. "102.4 cm". Still "—" when missing. */
export function formatCm(value: number | null | undefined): string {
  const text = formatMeasurement(value);
  return text === "—" ? text : `${text} cm`;
}

/**
 * Measurements that have a value (for chip rows): the garment's fields first, in their order, then any other
 * recorded key in canonical order — so nothing on file is hidden if the garment type doesn't match the data.
 */
export function presentMeasurements(
  m: Partial<Measurements>,
  garmentType: GarmentType | undefined = "jacket",
): { key: MeasurementKey; label: string; value: number }[] {
  const own = FIELD_KEYS[garmentOf(garmentType)];
  const ordered = [...own, ...ALL_KEYS.filter((k) => !own.includes(k))];
  const out: { key: MeasurementKey; label: string; value: number }[] = [];
  for (const key of ordered) {
    const value = m[key];
    if (hasValue(value)) out.push({ key, label: LABELS[key], value });
  }
  return out;
}

/** What the AI fit pipeline needs before it can run, per garment. */
const ANALYSE_KEYS: Record<GarmentType, readonly MeasurementKey[]> = {
  jacket: ["chest", "waist"],
  suit: ["chest", "waist"],
  shirt: ["chest", "waist"],
  trousers: ["waist", "hip"],
};

export function canAnalyse(garmentType: GarmentType | undefined, m: Partial<Measurements>): boolean {
  return ANALYSE_KEYS[garmentOf(garmentType)].every((key) => hasValue(m[key]));
}

/** "chest and waist" / "waist and hip" — for hints that mention what unlocks the analysis. */
export function analyseKeysLabel(garmentType: GarmentType | undefined): string {
  return ANALYSE_KEYS[garmentOf(garmentType)].map((key) => LABELS[key].toLowerCase()).join(" and ");
}

/** "Add chest and waist to analyse with AI." */
export function analyseRequirement(garmentType: GarmentType | undefined): string {
  return `Add ${analyseKeysLabel(garmentType)} to analyse with AI.`;
}
