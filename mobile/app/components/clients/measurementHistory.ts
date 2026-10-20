// Measurement history: what moved between a fitting and the client's previous fitting of the same garment, and the
// rule-based "fit note" the cutter reads before cutting. Pure functions (no React, no API) so they can be tested.
import type { Fitting, GarmentType } from "@shared/types";

import { fieldsFor, formatMeasurement, type MeasurementKey } from "./measurements";

export interface MeasurementChange {
  key: MeasurementKey;
  label: string;
  previous: number;
  current: number;
  /** current − previous in cm, rounded to one decimal (so float noise never reads as a change). */
  delta: number;
}

export type DeltaTone = "up" | "down" | "same";

/** A field that moved by at least this much (cm) is named in the fit note. */
export const FIT_NOTE_THRESHOLD_CM = 1;

/** Fittings cached before the field existed count as jackets (the API default). */
function garmentOf(garmentType: GarmentType | undefined): GarmentType {
  return garmentType ?? "jacket";
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded; // never -0
}

/**
 * The most recent fitting of the same garment taken before `fitting`, or undefined when it's the client's first.
 * `fittings` can be in any order (the API lists newest first, but the cache may hold an upserted row).
 */
export function findPreviousFitting(fittings: readonly Fitting[] | undefined, fitting: Fitting): Fitting | undefined {
  if (!fittings) return undefined;
  const garment = garmentOf(fitting.garmentType);
  let best: Fitting | undefined;
  for (const other of fittings) {
    if (other.id === fitting.id || garmentOf(other.garmentType) !== garment) continue;
    if (!(other.createdAt < fitting.createdAt)) continue; // ISO dates compare as strings
    if (!best || other.createdAt > best.createdAt) best = other;
  }
  return best;
}

/** The garment's fields recorded in both fittings, in grid order, each with its delta. Empty when nothing overlaps. */
export function compareMeasurements(current: Fitting, previous: Fitting): MeasurementChange[] {
  const out: MeasurementChange[] = [];
  for (const field of fieldsFor(current.garmentType)) {
    const before = previous.measurements[field.key];
    const after = current.measurements[field.key];
    if (!isNumber(before) || !isNumber(after)) continue;
    out.push({ key: field.key, label: field.label, previous: before, current: after, delta: round1(after - before) });
  }
  return out;
}

export function deltaTone(delta: number): DeltaTone {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "same";
}

/** 2 → "+2.0", -1.5 → "−1.5", 0 → "=". */
export function formatDelta(delta: number): string {
  if (delta === 0) return "=";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`;
}

/** "chest" / "chest and waist" / "chest, waist and hip". */
function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "chest and waist are up 2 cm and 1.5 cm" — empty when nothing moved that way. */
function movementClause(items: readonly MeasurementChange[], direction: "up" | "down"): string {
  if (items.length === 0) return "";
  const names = joinList(items.map((c) => c.label.toLowerCase()));
  const amounts = joinList(items.map((c) => `${formatMeasurement(Math.abs(c.delta))} cm`));
  return `${names} ${items.length === 1 ? "is" : "are"} ${direction} ${amounts}`;
}

function grew(moved: readonly MeasurementChange[], keys: readonly MeasurementKey[]): boolean {
  return moved.some((c) => c.delta > 0 && keys.includes(c.key));
}

/** What the cutter should re-check for this garment when the fields that drive its cut got bigger. */
function cutterAdvice(garmentType: GarmentType, moved: readonly MeasurementChange[]): string[] {
  const lines: string[] = [];
  if ((garmentType === "jacket" || garmentType === "suit") && grew(moved, ["chest", "waist"])) {
    lines.push("Re-check the jacket before cutting and leave 1 cm in the side seams.");
  }
  // A suit's trousers follow the same rule as a trousers fitting.
  if ((garmentType === "trousers" || garmentType === "suit") && grew(moved, ["waist", "hip"])) {
    lines.push("Re-check the waistband and seat.");
  }
  if (garmentType === "shirt" && grew(moved, ["neck", "chest"])) {
    lines.push("Re-check the collar and chest.");
  }
  return lines;
}

/**
 * One or two plain sentences, no AI: every field that moved by FIT_NOTE_THRESHOLD_CM or more, e.g.
 * "Chest and waist are up 2 cm and 1.5 cm since 14 Jan 2026.", then the garment's re-check advice when the fields
 * that matter for its cut grew — or "Measurements are within 1 cm of the last fitting." when nothing moved that much.
 * `since` is the previous fitting's date, already formatted.
 */
export function fitNote(garmentType: GarmentType | undefined, changes: readonly MeasurementChange[], since: string): string {
  const moved = changes.filter((c) => Math.abs(c.delta) >= FIT_NOTE_THRESHOLD_CM);
  if (moved.length === 0) return `Measurements are within ${FIT_NOTE_THRESHOLD_CM} cm of the last fitting.`;
  const clauses = [movementClause(moved.filter((c) => c.delta > 0), "up"), movementClause(moved.filter((c) => c.delta < 0), "down")].filter(Boolean);
  const summary = `${clauses.join(", and ")} since ${since}.`;
  const sentences = [summary.charAt(0).toUpperCase() + summary.slice(1), ...cutterAdvice(garmentOf(garmentType), moved)];
  return sentences.join(" ");
}
