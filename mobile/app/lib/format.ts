// Small formatting helpers shared across screens.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-06-12T09:00:00.000Z" → "12 Jun 2026" ("" when empty/invalid). */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Whole days between `value` and `now` (0 when today, negative when in the future). */
export function daysSince(value: string | number | Date | null | undefined, now: Date = new Date()): number {
  const d = toDate(value);
  if (!d) return 0;
  const ms = now.getTime() - d.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Whole calendar months between `value` and `now` (0 within the same month, never negative). */
export function monthsSince(value: string | number | Date | null | undefined, now: Date = new Date()): number {
  const d = toDate(value);
  if (!d) return 0;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

/** "This month" | "1 month ago" | "N months ago" — "Never" when empty. */
export function formatMonthsSince(value: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (!toDate(value)) return "Never";
  const m = monthsSince(value, now);
  if (m === 0) return "This month";
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

/** "Siam Bespoke" → "SB", "Anucha" → "A". Up to two letters, uppercase. */
export function initials(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("");
}

/** Time-of-day greeting, e.g. "Good morning". */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
