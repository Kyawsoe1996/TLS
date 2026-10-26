// Checks for the reminder plan's date arithmetic (local time). Run from mobile/app with:
//   node --import ./lib/__tests__/register.mjs lib/__tests__/reminderPlan.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Appointment, Order } from "@shared/types";

import { DEFAULT_REMINDER_PREFS, formatMinutes, minutesToInput, parseTimeInput, planReminders, type ReminderPrefs } from "../reminderPlan";

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
// Wednesday 21 Oct 2026, 10:00.
const NOW = local(2026, 10, 21, 10);
const ALL: ReminderPrefs = { appointmentsEvening: true, ordersWeekly: true, overdueDaily: true, readyUncollected: true, appointmentsBefore: false, eveningMinutes: 18 * 60, morningMinutes: 9 * 60, beforeMinutes: 60 };

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    clientId: "c1",
    orderId: null,
    kind: "fitting",
    startsAt: local(2026, 10, 22, 14).toISOString(),
    notes: null,
    status: "scheduled",
    reminderSentAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    clientName: "Somchai",
    ...overrides,
  };
}

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    clientId: "c1",
    fittingId: null,
    fabricId: null,
    metresNeeded: null,
    metresTakenAt: null,
    garment: "Two-piece suit",
    fabric: null,
    status: "cutting",
    dueAt: null,
    deliveredAt: null,
    notes: null,
    price: null,
    deposit: null,
    balance: null,
    reviewRequestedAt: null,
    photos: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    overdue: false,
    clientName: "Somchai",
    ...overrides,
  };
}

test("defaults: everything on except ready-and-not-collected", () => {
  assert.deepEqual(DEFAULT_REMINDER_PREFS, {
    appointmentsEvening: true,
    ordersWeekly: true,
    overdueDaily: true,
    readyUncollected: false,
    appointmentsBefore: true,
    eveningMinutes: 18 * 60,
    morningMinutes: 9 * 60,
    beforeMinutes: 60,
  });
});

test("an appointment tomorrow is announced this evening at 18:00 with the linked garment", () => {
  const plan = planReminders({
    appointments: [appointment({ orderId: "o1", kind: "collection" })],
    orders: [order({ id: "o1", fabric: "Irish linen" })],
    prefs: ALL,
    now: NOW,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "tls:appointment:a1");
  assert.equal(plan[0].at.getTime(), local(2026, 10, 21, 18).getTime());
  assert.equal(plan[0].title, "Tomorrow: Somchai, collection at 2:00 PM");
  assert.equal(plan[0].body, "Two-piece suit · Irish linen");
});

test("appointments today (evening already gone), beyond 14 days, done or cancelled are skipped", () => {
  const plan = planReminders({
    appointments: [
      appointment({ id: "today", startsAt: local(2026, 10, 21, 16).toISOString() }),
      appointment({ id: "far", startsAt: local(2026, 11, 20, 10).toISOString() }),
      appointment({ id: "done", status: "done" }),
      appointment({ id: "cancelled", status: "cancelled" }),
    ],
    orders: [],
    prefs: ALL,
    now: NOW,
  });
  assert.deepEqual(plan, []);
});

test("orders due in next Monday's week land on that Monday 09:00, listing garment and client", () => {
  const plan = planReminders({
    appointments: [],
    orders: [
      order({ id: "o1", dueAt: local(2026, 10, 28).toISOString() }),
      order({ id: "o2", garment: "Linen shirt", clientName: "Anna", dueAt: local(2026, 10, 27).toISOString() }),
      order({ id: "thisWeek", dueAt: local(2026, 10, 23).toISOString() }), // before next Monday: not in that week's list
      order({ id: "far", dueAt: local(2026, 11, 15).toISOString() }),
      order({ id: "delivered", status: "delivered", dueAt: local(2026, 10, 27).toISOString() }),
    ],
    prefs: ALL,
    now: NOW,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "tls:due:2026-10-26");
  assert.equal(plan[0].at.getTime(), local(2026, 10, 26, 9).getTime());
  assert.equal(plan[0].title, "2 orders due this week");
  assert.equal(plan[0].body, "Linen shirt · Anna\nTwo-piece suit · Somchai");
});

test("on a Monday before 09:00 the weekly list goes out today; after 09:00 it waits a week", () => {
  const thisWeek = [order({ dueAt: local(2026, 10, 22).toISOString() })];
  const early = planReminders({ appointments: [], orders: thisWeek, prefs: ALL, now: local(2026, 10, 19, 8) });
  assert.equal(early[0].at.getTime(), local(2026, 10, 19, 9).getTime());
  // After 09:00 the next list is next Monday's, which covers 26 Oct – 1 Nov: this week's order is no longer listed.
  const late = planReminders({ appointments: [], orders: thisWeek, prefs: ALL, now: local(2026, 10, 19, 10) });
  assert.equal(late.length, 0);
  const nextWeek = [order({ dueAt: local(2026, 10, 28).toISOString() })];
  const lateNext = planReminders({ appointments: [], orders: nextWeek, prefs: ALL, now: local(2026, 10, 19, 10) });
  assert.equal(lateNext[0].at.getTime(), local(2026, 10, 26, 9).getTime());
});

test("overdue orders: one reminder tomorrow 09:00, re-planned on every sync", () => {
  const plan = planReminders({
    appointments: [],
    orders: [order({ overdue: true, dueAt: local(2026, 10, 10).toISOString() })],
    prefs: ALL,
    now: NOW,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "tls:overdue:2026-10-22");
  assert.equal(plan[0].at.getTime(), local(2026, 10, 22, 9).getTime());
  assert.equal(plan[0].title, "1 overdue order");
  assert.equal(plan[0].body, "Two-piece suit · Somchai");
});

test("ready and not collected: 3 days after it became Ready, or the next morning once that has passed", () => {
  const plan = planReminders({
    appointments: [],
    orders: [
      order({ id: "fresh", status: "ready", updatedAt: local(2026, 10, 20, 12).toISOString() }),
      order({ id: "stale", status: "ready", garment: "Blazer", updatedAt: local(2026, 10, 10, 12).toISOString() }),
    ],
    prefs: ALL,
    now: NOW,
  });
  const byId = Object.fromEntries(plan.map((p) => [p.id, p]));
  assert.equal(byId["tls:ready:fresh"].at.getTime(), local(2026, 10, 23, 9).getTime());
  assert.equal(byId["tls:ready:stale"].at.getTime(), local(2026, 10, 22, 9).getTime());
  assert.equal(byId["tls:ready:stale"].title, "Ready and not collected: Blazer");
});

test("every switch off means nothing is planned", () => {
  const plan = planReminders({
    appointments: [appointment({})],
    orders: [order({ overdue: true }), order({ id: "r", status: "ready" })],
    prefs: { appointmentsEvening: false, ordersWeekly: false, overdueDaily: false, readyUncollected: false, appointmentsBefore: false, eveningMinutes: 18 * 60, morningMinutes: 9 * 60, beforeMinutes: 60 },
    now: NOW,
  });
  assert.deepEqual(plan, []);
});

test("the owner's hours are used: evening 8 PM for appointments, morning 7 AM for overdue orders", () => {
  const custom: ReminderPrefs = { ...ALL, eveningMinutes: 20 * 60 + 15, morningMinutes: 7 * 60 + 30 };
  const plan = planReminders({
    appointments: [appointment({ startsAt: local(2026, 10, 23, 15).toISOString() })],
    orders: [order({ overdue: true, dueAt: local(2026, 10, 10).toISOString() })],
    prefs: custom,
    now: NOW,
  });
  const evening = plan.find((r) => r.id.startsWith("tls:appointment:"));
  const morning = plan.find((r) => r.id.startsWith("tls:overdue:"));
  assert.equal(evening?.at.getTime(), local(2026, 10, 22, 20, 15).getTime());
  assert.equal(morning?.at.getTime(), local(2026, 10, 22, 7, 30).getTime());
});

test("typed times: HH:MM, HHMM, 12-hour with am/pm; nonsense rejected", () => {
  assert.equal(parseTimeInput("18:30"), 1110);
  assert.equal(parseTimeInput("1830"), 1110);
  assert.equal(parseTimeInput("6:30 pm"), 1110);
  assert.equal(parseTimeInput("12 am"), 0);
  assert.equal(parseTimeInput("9"), 540);
  assert.equal(parseTimeInput("24:00"), null);
  assert.equal(parseTimeInput("18:60"), null);
  assert.equal(parseTimeInput("evening"), null);
  assert.equal(minutesToInput(1110), "18:30");
  assert.equal(formatMinutes(540), "9:00 AM");
});

test("on the day: a reminder `beforeMinutes` before each appointment, including same-day bookings", () => {
  const prefs: ReminderPrefs = { ...ALL, appointmentsEvening: false, appointmentsBefore: true, beforeMinutes: 15 };
  const plan = planReminders({
    appointments: [
      appointment({ id: "soon", startsAt: local(2026, 10, 21, 10, 20).toISOString() }), // 20 min from NOW → reminder in 5 min
      appointment({ id: "tomorrow", startsAt: local(2026, 10, 22, 14).toISOString() }),
      appointment({ id: "tooLate", startsAt: local(2026, 10, 21, 10, 5).toISOString() }), // 5 min away: 15-min mark already passed
    ],
    orders: [],
    prefs,
    now: NOW,
  });
  const byId = Object.fromEntries(plan.map((p) => [p.id, p]));
  assert.equal(byId["tls:before:soon"].at.getTime(), local(2026, 10, 21, 10, 5).getTime());
  assert.equal(byId["tls:before:soon"].title, "In 15 minutes: Somchai, fitting at 10:20 AM");
  assert.equal(byId["tls:before:tomorrow"].at.getTime(), local(2026, 10, 22, 13, 45).getTime());
  assert.equal(byId["tls:before:tooLate"], undefined);
  assert.equal(plan.length, 2);
});
