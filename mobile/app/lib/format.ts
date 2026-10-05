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

/** "2026-10-02T07:05:00.000Z" → "2 Oct 2026, 14:05" in local time ("" when empty/invalid). */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
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

/** 12000 → "฿12,000". Whole baht; rounds any decimals. "—" when empty. (No Intl: Hermes support varies by platform.) */
export function formatThb(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const whole = Math.round(Math.abs(value));
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}฿${grouped}`;
}

/** 42 → "0:42", 61.4 → "1:01". Whole seconds; "" when empty/invalid. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 1536 → "1.5 KB", 4_200_000 → "4.2 MB". "" when empty/invalid. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
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
