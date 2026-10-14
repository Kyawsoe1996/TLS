// Pure helpers for appointments: labels, the date + time text inputs, "when" lines and the reminder email draft.
import type { Appointment, AppointmentKind, Client, Order, Shop } from "@shared/types";

import { formatDate } from "@/lib/format";

import type { EmailDraft } from "./SendEmailFlow";

export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  fitting: "Fitting",
  collection: "Collection",
  consultation: "Consultation",
};

/** "collection" → "Collection". */
export function appointmentKindLabel(kind: AppointmentKind): string {
  return APPOINTMENT_KIND_LABELS[kind];
}

/** How the kind reads inside a sentence to the client: "your fitting", "your collection appointment". */
export function appointmentKindNoun(kind: AppointmentKind): string {
  return kind === "collection" ? "collection appointment" : kind;
}

/** Quick time-of-day choices for the schedule form; anything else goes in the HH:MM field. */
export const TIME_PRESETS = ["10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"] as const;

const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** Local "2026-06-12" + "14:30" → UTC ISO string; null when either part is invalid. */
export function dateTimeInputToIso(date: string, time: string): string | null {
  const dm = DATE_RE.exec(date.trim());
  const tm = TIME_RE.exec(time.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  if (hh > 23 || mm > 59) return null;
  const value = new Date(y, mo - 1, d, hh, mm, 0, 0);
  if (value.getFullYear() !== y || value.getMonth() !== mo - 1 || value.getDate() !== d) return null;
  return value.toISOString();
}

/** ISO → "HH:MM" in local time ("" when empty/invalid). */
export function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today" / "Tomorrow" / "Thu 16 Oct" / "12 Oct 2026" (the year once it isn't this one), in local time. */
export function appointmentDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (sameLocalDay(d, now)) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameLocalDay(d, tomorrow)) return "Tomorrow";
  if (d.getFullYear() === now.getFullYear()) return `${WEEKDAYS[d.getDay()]} ${formatDate(d).replace(/ \d{4}$/, "")}`;
  return formatDate(d);
}

/** "Today, 14:00" · "Tomorrow, 10:00" · "Thu 16 Oct, 15:00" · "Done · 12 Oct, 10:00" · "Cancelled · …". */
export function appointmentWhenLine(appointment: Appointment, now: Date = new Date()): string {
  const when = `${appointmentDayLabel(appointment.startsAt, now)}, ${isoToTimeInput(appointment.startsAt)}`;
  if (appointment.status === "done") return `Done · ${when}`;
  if (appointment.status === "cancelled") return `Cancelled · ${when}`;
  return when;
}

/** Scheduled and not yet started (with a 12 h grace so today's earlier slots still count as upcoming, like the API's window). */
export function isUpcoming(appointment: Appointment, now: Date = new Date()): boolean {
  if (appointment.status !== "scheduled") return false;
  return new Date(appointment.startsAt).getTime() >= now.getTime() - 12 * 3_600_000;
}

/** Upcoming (soonest first) and everything else (latest first), from a client's list. */
export function splitUpcomingPast(appointments: Appointment[], now: Date = new Date()): { upcoming: Appointment[]; past: Appointment[] } {
  const upcoming: Appointment[] = [];
  const past: Appointment[] = [];
  for (const a of appointments) (isUpcoming(a, now) ? upcoming : past).push(a);
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

/** Default reminder email, editable before sending. Mentions the garment when a collection is linked to an order. */
export function reminderDraft(appointment: Appointment, client: Client | undefined, shop: Shop | null | undefined, order?: Order): EmailDraft {
  const noun = appointmentKindNoun(appointment.kind);
  const firstName = client ? client.name.trim().split(/\s+/)[0] || client.name : "";
  const where = shop ? `${shop.name}, ${shop.district}` : "the shop";
  const day = formatDate(appointment.startsAt);
  const time = isoToTimeInput(appointment.startsAt);
  const garment = appointment.kind === "collection" && order ? ` Your ${order.garment.toLowerCase()} will be ready for you.` : "";
  return {
    subject: `Reminder: your ${noun} on ${day}`,
    body: `${firstName || "Hello"}, a reminder of your ${noun} at ${where} on ${day} at ${time}.${garment} Reply to this email if you need to change the time.`,
  };
}
