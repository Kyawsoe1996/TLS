// Measurement metadata shared by the fitting form, fitting rows and fitting detail.
import type { Measurements } from "@shared/types";

export type MeasurementKey = keyof Measurements;

export interface MeasurementField {
  key: MeasurementKey;
  label: string;
}

/** Canonical order for forms and grids. */
export const MEASUREMENT_FIELDS: readonly MeasurementField[] = [
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "overArm", label: "Over-arm" },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve", label: "Sleeve" },
  { key: "jacketLength", label: "Jacket length" },
];

export const EMPTY_MEASUREMENTS: Measurements = {
  chest: null,
  waist: null,
  overArm: null,
  shoulder: null,
  sleeve: null,
  jacketLength: null,
};

/** 102 → "102", 102.4 → "102.4", null → "—". */
export function formatMeasurement(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Same as `formatMeasurement` with the unit, e.g. "102.4 cm". Still "—" when missing. */
export function formatCm(value: number | null | undefined): string {
  const text = formatMeasurement(value);
  return text === "—" ? text : `${text} cm`;
}

/** Measurements that have a value, in canonical order (for chip rows). */
export function presentMeasurements(m: Measurements): { key: MeasurementKey; label: string; value: number }[] {
  const out: { key: MeasurementKey; label: string; value: number }[] = [];
  for (const field of MEASUREMENT_FIELDS) {
    const value = m[field.key];
    if (value !== null && value !== undefined && !Number.isNaN(value)) out.push({ ...field, value });
  }
  return out;
}

/** The AI fit pipeline needs at least chest and waist. */
export function canAnalyse(m: Measurements): boolean {
  return m.chest !== null && m.chest !== undefined && m.waist !== null && m.waist !== undefined;
}

export const ANALYSE_REQUIREMENT = "Add chest and waist to analyse with AI.";
