// What to remind the owner about, computed from the appointments and orders already in the app. Pure (records in,
// notification plan out) so lib/reminders.ts can schedule it and the checks in lib/__tests__ can pin the date
// arithmetic. Every time is local: the device's time zone is the shop's. Nothing here reaches a client.
import type { Appointment, Order } from "@shared/types";

import { appointmentKindLabel } from "@/components/clients/appointments";
import { formatDate } from "@/lib/format";

export interface ReminderPrefs {
  /** The evening before each appointment, at `eveningHour`. */
  appointmentsEvening: boolean;
  /** Monday at `morningHour` with the orders due this week. */
  ordersWeekly: boolean;
  /** Every morning at `morningHour` while any order is late. */
  overdueDaily: boolean;
  /** 3 days after an order was marked Ready and still isn't delivered. */
  readyUncollected: boolean;
  /** On the day, `beforeMinutes` before each appointment (covers same-day bookings). */
  appointmentsBefore: boolean;
  /** Time of day of the evening-before reminder, in minutes after midnight (18:30 = 1110). */
  eveningMinutes: number;
  /** Time of day of the morning reminders, in minutes after midnight (9:00 = 540). */
  morningMinutes: number;
  /** Lead time of the on-the-day reminder, in minutes before the appointment (60 = one hour). */
  beforeMinutes: number;
}

/** Quick picks on the Reminders screen, in minutes after midnight; any time can be picked on the wheels as well. */
export const EVENING_PRESETS = [17 * 60, 18 * 60, 19 * 60, 20 * 60] as const;
export const MORNING_PRESETS = [7 * 60, 8 * 60, 9 * 60, 10 * 60] as const;
/** Lead-time quick picks, in minutes. */
export const BEFORE_PRESETS = [15, 30, 60, 120] as const;

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  appointmentsEvening: true,
  ordersWeekly: true,
  overdueDaily: true,
  readyUncollected: false,
  appointmentsBefore: true,
  eveningMinutes: 18 * 60,
  morningMinutes: 9 * 60,
  beforeMinutes: 60,
};

/** 15 → "15 minutes", 60 → "1 hour", 90 → "1 hour 30 minutes". */
export function formatLead(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

export const MINUTES_PER_DAY = 24 * 60;

/** 1110 → "6:30 PM", 540 → "9:00 AM". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** 1110 → "18:30" (what the time field shows). */
export function minutesToInput(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "18:30", "18.30", "1830", "6:30 pm" → 1110; null when it isn't a time of day. */
export function parseTimeInput(text: string): number | null {
  const t = text.trim().toLowerCase();
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const suffix = m[3];
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (suffix === "pm" ? 12 : 0);
  }
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** Every reminder this app schedules carries this prefix, so a sync can cancel its own and nothing else. */
export const REMINDER_ID_PREFIX = "tls:";
/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
export const MAX_PLANNED = 60;

export interface PlannedReminder {
  /** "tls:<kind>:<id>" */
  id: string;
  title: string;
  body: string;
  /** Local instant; always in the future at planning time. */
  at: Date;
}

export interface PlanInput {
  appointments: Appointment[];
  orders: Order[];
  prefs: ReminderPrefs;
  now?: Date;
}

const DAY = 86_400_000;
const APPOINTMENT_HORIZON_DAYS = 14;
const DUE_HORIZON_DAYS = 7;
const READY_GRACE_DAYS = 3;

function at(day: Date, hour: number, minute = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Local "2026-10-26", for identifiers. */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 14:05 → "2:05 PM" (no Intl: Hermes support varies by platform). */
export function formatClock(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** `day` at a time of day given in minutes after midnight. */
function atMinutes(day: Date, minutes: number): Date {
  return at(day, Math.floor(minutes / 60), minutes % 60);
}

/** Today at `minutes` if that's still ahead, otherwise tomorrow at `minutes`. */
function nextMorning(now: Date, minutes: number): Date {
  const today = atMinutes(now, minutes);
  return today > now ? today : atMinutes(addDays(now, 1), minutes);
}

/** Next Monday at `minutes` — today if it's Monday and that time hasn't passed yet. */
function nextMonday(now: Date, minutes: number): Date {
  const today = atMinutes(now, minutes);
  if (now.getDay() === 1 && today > now) return today;
  const days = (8 - now.getDay()) % 7 || 7;
  return atMinutes(addDays(now, days), minutes);
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function plural(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

/** Up to 3 "garment · client" lines, then "+N more". */
function orderLines(orders: Order[]): string {
  const lines = orders.slice(0, 3).map((o) => `${o.garment} · ${o.clientName ?? "Client"}`);
  if (orders.length > 3) lines.push(`+${orders.length - 3} more`);
  return lines.join("\n");
}

export function planReminders({ appointments, orders, prefs, now = new Date() }: PlanInput): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  const open = orders.filter((o) => o.status !== "delivered");
  const openById = new Map(open.map((o) => [o.id, o] as const));

  if (prefs.appointmentsEvening || prefs.appointmentsBefore) {
    const horizon = now.getTime() + APPOINTMENT_HORIZON_DAYS * DAY;
    for (const a of appointments) {
      if (a.status !== "scheduled") continue;
      const start = parseIso(a.startsAt);
      if (!start || start.getTime() <= now.getTime() || start.getTime() > horizon) continue;
      const client = a.clientName ?? "Client";
      const kind = appointmentKindLabel(a.kind);
      const order = a.orderId ? openById.get(a.orderId) : undefined;
      const body = order ? `${order.garment}${order.fabric ? ` · ${order.fabric}` : ""}` : a.notes?.trim() || `${kind} with ${client}.`;

      if (prefs.appointmentsEvening) {
        const when = atMinutes(addDays(start, -1), prefs.eveningMinutes);
        if (when > now) {
          planned.push({
            id: `${REMINDER_ID_PREFIX}appointment:${a.id}`,
            at: when,
            title: `Tomorrow: ${client}, ${kind.toLowerCase()} at ${formatClock(start)}`,
            body,
          });
        }
      }

      if (prefs.appointmentsBefore) {
        // On the day: covers appointments booked the same morning, which the evening-before one can't.
        const when = new Date(start.getTime() - prefs.beforeMinutes * 60_000);
        if (when > now) {
          planned.push({
            id: `${REMINDER_ID_PREFIX}before:${a.id}`,
            at: when,
            title: `In ${formatLead(prefs.beforeMinutes)}: ${client}, ${kind.toLowerCase()} at ${formatClock(start)}`,
            body,
          });
        }
      }
    }
  }

  if (prefs.ordersWeekly) {
    // The list goes out on Monday morning, so it covers that Monday's week (Mon–Sun), not the 7 days from now:
    // planned on a Tuesday, a "this week" list for next Monday would otherwise be days stale by the time it fires.
    const when = nextMonday(now, prefs.morningMinutes);
    const from = at(when, 0).getTime();
    const to = from + DUE_HORIZON_DAYS * DAY;
    const due = open
      .filter((o) => {
        if (o.overdue) return false;
        const dueAt = parseIso(o.dueAt);
        return !!dueAt && dueAt.getTime() >= from && dueAt.getTime() <= to;
      })
      .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    if (due.length > 0) {
      planned.push({
        id: `${REMINDER_ID_PREFIX}due:${isoDay(when)}`,
        at: when,
        title: `${plural(due.length, "order")} due this week`,
        body: orderLines(due),
      });
    }
  }

  if (prefs.overdueDaily) {
    const overdue = open.filter((o) => o.overdue);
    if (overdue.length > 0) {
      // One-shot for tomorrow; every sync (each foreground) re-plans it, which is what makes it daily.
      const when = atMinutes(addDays(now, 1), prefs.morningMinutes);
      planned.push({
        id: `${REMINDER_ID_PREFIX}overdue:${isoDay(when)}`,
        at: when,
        title: `${plural(overdue.length, "overdue order")}`,
        body: orderLines(overdue),
      });
    }
  }

  if (prefs.readyUncollected) {
    for (const o of open) {
      if (o.status !== "ready") continue;
      // The contract has no "ready since" stamp, so updatedAt stands in: any later edit to the order (a photo,
      // a payment) restarts the 3-day clock. Acceptable for a nudge; a readyAt column would make it exact.
      const since = parseIso(o.updatedAt);
      if (!since) continue;
      // 3 days after it became Ready; once that has passed, the next morning (re-planned on every sync).
      let when = atMinutes(addDays(since, READY_GRACE_DAYS), prefs.morningMinutes);
      if (when <= now) when = nextMorning(now, prefs.morningMinutes);
      planned.push({
        id: `${REMINDER_ID_PREFIX}ready:${o.id}`,
        at: when,
        title: `Ready and not collected: ${o.garment}`,
        body: `${o.clientName ?? "Client"} · ready since ${formatDate(since)}`,
      });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_PLANNED);
}
