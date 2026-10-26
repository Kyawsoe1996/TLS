// Month keys ("2026-10") and their labels for the Reports screen. Keys follow the phone's local calendar (the shop's
// own), the API counts in UTC; the two agree except in the first hours of a month, which is fine for a monthly view.
// Pure: no Expo imports, so lib/__tests__/reportHtml.test.ts can run these under node.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "2026-10" for a date, in local time. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** { year: 2026, month: 10 } from "2026-10"; null when the key isn't a YYYY-MM month. */
export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/** "October" from "2026-10" (the key itself when it isn't a month). */
export function monthName(key: string): string {
  const parsed = parseMonthKey(key);
  return parsed ? (MONTH_NAMES[parsed.month - 1] ?? key) : key;
}

/** "October 2026" from "2026-10" (the key itself when it isn't a month). */
export function monthLabel(key: string): string {
  const parsed = parseMonthKey(key);
  return parsed ? `${monthName(key)} ${parsed.year}` : key;
}

/** "Oct" from "2026-10". */
export function shortMonthLabel(key: string): string {
  return monthName(key).slice(0, 3);
}

/** The month `offset` months away from `key` (negative = earlier): shiftMonth("2026-01", -1) → "2025-12". */
export function shiftMonth(key: string, offset: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return monthKey(new Date(parsed.year, parsed.month - 1 + offset, 1));
}

/** "2026-09" from "2026-10"; "2025-12" from "2026-01". */
export function previousMonth(key: string): string {
  return shiftMonth(key, -1);
}

/** The last `n` months including the current one, newest first: recentMonths(3) in Oct 2026 → ["2026-10", "2026-09", "2026-08"]. */
export function recentMonths(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return keys;
}
