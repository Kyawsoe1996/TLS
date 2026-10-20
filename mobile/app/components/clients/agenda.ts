// Pure date helpers for the appointments day view (week strip + day timeline). Local time throughout: the phone's
// time zone is the shop's. No React, no API — exercised by lib/__tests__/agenda.test.ts.
import type { Appointment } from "@shared/types";

const DAY = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Mon-first short names, matching the strip's columns. */
export const STRIP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The Monday that starts the week containing `d` (00:00 local). */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7; // Monday = 0
  return addDays(day, -offset);
}

/** The seven days of the week starting at `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "YYYY-MM-DD" in local time — the key days are grouped by, and the value the New-appointment form accepts. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "19 – 25 Oct 2026" · "26 Oct – 1 Nov 2026" · "29 Dec 2025 – 4 Jan 2026" */
export function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const m = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
  if (monday.getFullYear() !== sunday.getFullYear()) return `${monday.getDate()} ${m(monday)} ${monday.getFullYear()} – ${sunday.getDate()} ${m(sunday)} ${sunday.getFullYear()}`;
  if (monday.getMonth() !== sunday.getMonth()) return `${monday.getDate()} ${m(monday)} – ${sunday.getDate()} ${m(sunday)} ${sunday.getFullYear()}`;
  return `${monday.getDate()} – ${sunday.getDate()} ${m(monday)} ${monday.getFullYear()}`;
}

/** "Tuesday 20 October" (the year only when it isn't the current one). */
export function dayTitle(d: Date, now: Date = new Date()): string {
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "October 2026" */
export function monthTitle(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2:05 PM" */
export function clockLabel(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The appointments of one local day, earliest first (done and cancelled included). */
export function appointmentsOn(appointments: readonly Appointment[], day: Date): Appointment[] {
  return appointments
    .filter((a) => sameDay(new Date(a.startsAt), day))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Day keys that have at least one appointment that isn't cancelled — the dots on the strip and the month grid. */
export function busyDays(appointments: readonly Appointment[]): Set<string> {
  const keys = new Set<string>();
  for (const a of appointments) if (a.status !== "cancelled") keys.add(dayKey(new Date(a.startsAt)));
  return keys;
}

/** "3 appointments · next at 2:00 PM" / "1 appointment · all done" / "Nothing scheduled" */
export function daySummary(dayAppointments: readonly Appointment[], now: Date = new Date()): string {
  const live = dayAppointments.filter((a) => a.status !== "cancelled");
  if (live.length === 0) return "Nothing scheduled";
  const count = `${live.length} ${live.length === 1 ? "appointment" : "appointments"}`;
  const next = live.find((a) => a.status === "scheduled" && new Date(a.startsAt).getTime() >= now.getTime());
  if (next) return `${count} · next at ${clockLabel(next.startsAt)}`;
  if (live.every((a) => a.status === "done")) return `${count} · all done`;
  return count;
}

/** Timeline entries for a day: each appointment, with "Free until …" / "Free after …" notes where there's room. */
export type TimelineEntry = { kind: "appointment"; appointment: Appointment } | { kind: "gap"; text: string };

const GAP_MIN_MS = 60 * 60_000;
const SLOT_MS = 30 * 60_000;

export function timelineFor(dayAppointments: readonly Appointment[], day: Date, now: Date = new Date()): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const isPast = startOfDay(day).getTime() < startOfDay(now).getTime();
  const live = dayAppointments.filter((a) => a.status !== "cancelled");
  dayAppointments.forEach((a, i) => {
    entries.push({ kind: "appointment", appointment: a });
    if (isPast || a.status === "cancelled") return;
    const start = new Date(a.startsAt).getTime();
    const following = live.find((b) => new Date(b.startsAt).getTime() > start);
    const isLastLive = !following;
    const nextInList = dayAppointments[i + 1];
    if (isLastLive && (!nextInList || nextInList.status === "cancelled")) {
      entries.push({ kind: "gap", text: `Free after ${clockLabel(new Date(start + SLOT_MS))}` });
    } else if (following && new Date(following.startsAt).getTime() - start >= GAP_MIN_MS + SLOT_MS && nextInList?.id === following.id) {
      entries.push({ kind: "gap", text: `Free until ${clockLabel(following.startsAt)}` });
    }
  });
  return entries;
}

/** The month grid: leading blanks (Mon-first) then one Date per day of the month. */
export function monthGrid(monthStart: Date): (Date | null)[] {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  return cells;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export { DAY };
