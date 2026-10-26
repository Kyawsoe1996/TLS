import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReportResponse, Shop } from "@shared/types";

import { monthKey, monthLabel, monthName, parseMonthKey, previousMonth, recentMonths, shiftMonth, shortMonthLabel } from "../months";
import { compareNote, reportFileName, reportHtml } from "../reportHtml";

const report: ReportResponse = {
  month: "2026-10",
  newClients: 4,
  fittings: 7,
  ordersCreated: 5,
  ordersDelivered: 3,
  moneyCollected: 54000,
  revenueDelivered: 61000,
  stillOwed: 18500,
  openOrders: 6,
  quietClients: 2,
  previous: { month: "2026-09", newClients: 3, fittings: 7, ordersDelivered: 5, moneyCollected: 40000 },
  months: [
    { month: "2026-05", ordersDelivered: 1, moneyCollected: 12000 },
    { month: "2026-06", ordersDelivered: 0, moneyCollected: 0 },
    { month: "2026-07", ordersDelivered: 4, moneyCollected: 30000 },
    { month: "2026-08", ordersDelivered: 2, moneyCollected: 25000 },
    { month: "2026-09", ordersDelivered: 5, moneyCollected: 40000 },
    { month: "2026-10", ordersDelivered: 3, moneyCollected: 54000 },
  ],
  garments: [
    { garment: "Two-piece suit", delivered: 2 },
    { garment: "Shirt <linen>", delivered: 1 },
  ],
  clientsToCall: [
    { clientId: "c1", name: "Marcus <Lindqvist>", reason: "quiet", detail: "Last order 4 months ago · two-piece suit" },
    { clientId: "c2", name: "Anucha", reason: "balance", detail: "Balance ฿3,000 outstanding · ready since 12 Oct" },
  ],
};

const shop: Shop = {
  id: "s1",
  name: "Sathorn Bespoke",
  district: "Sathorn",
  city: "Bangkok",
  tone: "Sophisticated",
  address: "12 Sathorn Soi 8",
  phone: "02 000 0000",
  openingHours: null,
  replyToEmail: "hello@example.com",
  googleReviewUrl: null,
  aiConsentAt: null,
  referralFriendOffer: null,
  referralClientOffer: null,
  createdAt: "2026-09-30T00:00:00.000Z",
};

// Noon UTC so "Issued" lands on the same calendar day in any time zone the check runs in.
const now = new Date("2026-10-26T12:00:00.000Z");

describe("month helpers", () => {
  it("make keys in local time and label them", () => {
    assert.equal(monthKey(new Date(2026, 9, 26)), "2026-10");
    assert.equal(monthKey(new Date(2026, 0, 1)), "2026-01");
    assert.deepEqual(parseMonthKey("2026-10"), { year: 2026, month: 10 });
    assert.equal(parseMonthKey("2026-13"), null);
    assert.equal(parseMonthKey("October"), null);
    assert.equal(monthLabel("2026-10"), "October 2026");
    assert.equal(monthName("2026-09"), "September");
    assert.equal(shortMonthLabel("2026-10"), "Oct");
    assert.equal(shortMonthLabel("2026-05"), "May");
    assert.equal(monthLabel("nope"), "nope");
  });

  it("step back a month, across a year boundary too", () => {
    assert.equal(previousMonth("2026-10"), "2026-09");
    assert.equal(previousMonth("2026-01"), "2025-12");
    assert.equal(shiftMonth("2026-10", -5), "2026-05");
    assert.equal(shiftMonth("2025-11", 3), "2026-02");
    assert.equal(shiftMonth("nope", -1), "nope");
  });

  it("list recent months newest first", () => {
    assert.deepEqual(recentMonths(4, new Date(2026, 9, 26)), ["2026-10", "2026-09", "2026-08", "2026-07"]);
    assert.deepEqual(recentMonths(3, new Date(2026, 0, 31)), ["2026-01", "2025-12", "2025-11"]);
    assert.deepEqual(recentMonths(0), []);
  });
});

describe("compareNote", () => {
  it("says up, down or same against the month before", () => {
    assert.deepEqual(compareNote(4, 3, "2026-09"), { text: "+1 vs September", tone: "up" });
    assert.deepEqual(compareNote(3, 5, "2026-09"), { text: "−2 vs September", tone: "down" });
    assert.deepEqual(compareNote(7, 7, "2026-09"), { text: "Same as September", tone: "same" });
  });
});

describe("reportHtml", () => {
  it("prints the shop, the month, the figures and the people to call", () => {
    const html = reportHtml(report, shop, now);
    assert.ok(html.includes("Sathorn Bespoke"));
    assert.ok(html.includes("Sathorn, Bangkok · 02 000 0000 · hello@example.com"));
    assert.ok(html.includes("Monthly report"));
    assert.ok(html.includes("October 2026"));
    assert.ok(html.includes("Issued 26 Oct 2026"));
    assert.ok(html.includes("฿54,000"));
    assert.ok(html.includes("฿18,500"));
    assert.ok(html.includes("+1 vs September"));
    assert.ok(html.includes("Same as September"));
    assert.ok(html.includes("−2 vs September"));
    assert.ok(html.includes("2 delivered"));
    assert.ok(html.includes("Win-back"));
    assert.ok(html.includes("Collect"));
    assert.ok(html.includes("Balance ฿3,000 outstanding · ready since 12 Oct"));
    assert.ok(html.includes("Sathorn Bespoke · Issued with Magick Tailor"));
  });

  it("escapes names and garments", () => {
    const html = reportHtml(report, shop, now);
    assert.ok(html.includes("Marcus &lt;Lindqvist&gt;"));
    assert.ok(html.includes("Shirt &lt;linen&gt;"));
    assert.ok(!html.includes("<Lindqvist>"));
    assert.ok(!html.includes("<linen>"));
  });

  it("draws one bar per month with the selected month marked", () => {
    const html = reportHtml(report, shop, now);
    assert.equal((html.match(/class="bar selected"/g) ?? []).length, 1);
    assert.equal((html.match(/class="bar"/g) ?? []).length, 5);
    for (const label of ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]) assert.ok(html.includes(`>${label}<`));
  });

  it("copes with an empty month and no shop", () => {
    const html = reportHtml({ ...report, garments: [], clientsToCall: [], quietClients: 0 }, null, now);
    assert.ok(html.includes("Your tailor"));
    assert.ok(!html.includes('class="shop-line"'));
    assert.ok(html.includes("Nothing delivered yet this month."));
    assert.ok(html.includes("No one to call right now."));
    assert.ok(!html.includes('class="num red"'));
  });
});

describe("reportFileName", () => {
  it("names the file after the shop and the month", () => {
    assert.equal(reportFileName(report, "Sathorn Bespoke"), "Report-Sathorn-Bespoke-2026-10.pdf");
    assert.equal(reportFileName(report, "ร้านตัดเสื้อ"), "Report-shop-2026-10.pdf");
    assert.equal(reportFileName(report, ""), "Report-shop-2026-10.pdf");
  });
});
