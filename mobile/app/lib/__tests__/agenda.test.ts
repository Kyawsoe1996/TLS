// Checks for the day view's date helpers (local time). Run from mobile/app with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Appointment } from "@shared/types";

import { addDays, appointmentsOn, busyDays, dayKey, daySummary, monthGrid, startOfWeek, timelineFor, weekLabel } from "../../components/clients/agenda";

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const NOW = local(2026, 10, 20, 11); // Tuesday

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a",
    clientId: "c",
    orderId: null,
    kind: "fitting",
    startsAt: local(2026, 10, 20, 14).toISOString(),
    notes: null,
    status: "scheduled",
    reminderSentAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    clientName: "James",
    ...overrides,
  };
}

test("weeks start on Monday and are labelled across month and year boundaries", () => {
  assert.equal(dayKey(startOfWeek(local(2026, 10, 20))), "2026-10-19");
  assert.equal(dayKey(startOfWeek(local(2026, 10, 25))), "2026-10-19"); // a Sunday belongs to the week before
  assert.equal(weekLabel(local(2026, 10, 19)), "19 – 25 Oct 2026");
  assert.equal(weekLabel(local(2026, 10, 26)), "26 Oct – 1 Nov 2026");
  assert.equal(weekLabel(local(2026, 12, 28)), "28 Dec 2026 – 3 Jan 2027");
});

test("a day's appointments are sorted and busy days ignore cancelled ones", () => {
  const list = [
    appointment({ id: "late", startsAt: local(2026, 10, 20, 16, 5).toISOString() }),
    appointment({ id: "early", startsAt: local(2026, 10, 20, 10).toISOString(), status: "done" }),
    appointment({ id: "other", startsAt: local(2026, 10, 21, 10).toISOString() }),
    appointment({ id: "gone", startsAt: local(2026, 10, 23, 10).toISOString(), status: "cancelled" }),
  ];
  assert.deepEqual(appointmentsOn(list, local(2026, 10, 20)).map((a) => a.id), ["early", "late"]);
  assert.deepEqual([...busyDays(list)].sort(), ["2026-10-20", "2026-10-21"]);
  assert.equal(daySummary(appointmentsOn(list, local(2026, 10, 20)), NOW), "2 appointments · next at 4:05 PM");
  assert.equal(daySummary([], NOW), "Nothing scheduled");
});

test("the timeline shows free gaps of an hour or more, and free time after the last booking", () => {
  const day = local(2026, 10, 20);
  const list = [
    appointment({ id: "a", startsAt: local(2026, 10, 20, 10).toISOString(), status: "done" }),
    appointment({ id: "b", startsAt: local(2026, 10, 20, 14).toISOString() }),
    appointment({ id: "c", startsAt: local(2026, 10, 20, 14, 30).toISOString() }),
  ];
  const entries = timelineFor(list, day, NOW).map((e) => (e.kind === "gap" ? e.text : e.appointment.id));
  assert.deepEqual(entries, ["a", "Free until 2:00 PM", "b", "c", "Free after 3:00 PM"]);
  // Past days get no gap notes.
  assert.deepEqual(timelineFor(list, day, local(2026, 10, 25)).map((e) => e.kind), ["appointment", "appointment", "appointment"]);
});

test("the month grid starts on Monday with leading blanks", () => {
  const grid = monthGrid(local(2026, 10, 1)); // 1 Oct 2026 is a Thursday
  assert.equal(grid.slice(0, 3).every((c) => c === null), true);
  assert.equal(grid[3]?.getDate(), 1);
  assert.equal(grid.length, 3 + 31);
  assert.equal(dayKey(addDays(local(2026, 10, 31), 1)), "2026-11-01");
});
