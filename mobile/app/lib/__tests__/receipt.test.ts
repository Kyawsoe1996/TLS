import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client, Order, Shop } from "@shared/types";

import { buildReceipt, receiptFileName, receiptHtml, receiptRef } from "../receipt";

const order: Order = {
  id: "e96e918f-99ee-4d9b-93c1-edd3f55167a5",
  clientId: "c1",
  fittingId: null,
  garment: "Two-piece suit",
  fabric: "Super 130s navy wool",
  status: "cutting",
  dueAt: null,
  deliveredAt: null,
  notes: null,
  price: 18000,
  deposit: 9000,
  balance: 9000,
  reviewRequestedAt: null,
  fabricId: null,
  metresNeeded: null,
  metresTakenAt: null,
  photos: [],
  createdAt: "2026-10-12T03:00:00.000Z",
  updatedAt: "2026-10-20T03:00:00.000Z",
  overdue: false,
};

const client: Client = {
  id: "c1",
  name: "Marcus <Lindqvist>",
  phone: null,
  email: null,
  lineId: null,
  notes: null,
  lastOrderAt: null,
  referredByClientId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  inactive: false,
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

const now = new Date("2026-10-20T06:30:00.000Z");

describe("buildReceipt", () => {
  it("is null without a price: nothing to owe against", () => {
    assert.equal(buildReceipt({ ...order, price: null, deposit: null, balance: null }, client, shop, null, now), null);
  });

  it("carries the shop, the client, the order and the money", () => {
    const data = buildReceipt(order, client, shop, { amount: 4000, at: now.toISOString() }, now);
    assert.ok(data);
    assert.equal(data.ref, "MT-5167A5");
    assert.equal(data.shop.name, "Sathorn Bespoke");
    assert.equal(data.shop.place, "Sathorn, Bangkok");
    assert.equal(data.clientName, "Marcus <Lindqvist>");
    assert.equal(data.price, 18000);
    assert.equal(data.totalPaid, 9000);
    assert.equal(data.balance, 9000);
    assert.equal(data.payment?.amount, 4000);
  });

  it("never shows a negative balance and copes with a missing shop or client", () => {
    const data = buildReceipt({ ...order, deposit: 20000 }, undefined, null, null, now);
    assert.ok(data);
    assert.equal(data.balance, 0);
    assert.equal(data.clientName, "Client");
    assert.equal(data.shop.name, "Your tailor");
    assert.equal(data.shop.place, "");
  });
});

describe("receiptHtml", () => {
  it("prints the amounts and escapes names", () => {
    const data = buildReceipt(order, client, shop, { amount: 4000, at: now.toISOString() }, now)!;
    const html = receiptHtml(data);
    assert.ok(html.includes("Payment receipt"));
    assert.ok(html.includes("฿4,000"));
    assert.ok(html.includes("฿18,000"));
    assert.ok(html.includes("Balance due"));
    assert.ok(html.includes("Marcus &lt;Lindqvist&gt;"));
    assert.ok(!html.includes("<Lindqvist>"));
    assert.ok(html.includes("02 000 0000 · hello@example.com"));
  });

  it("becomes a statement, paid in full, when nothing is owed", () => {
    const html = receiptHtml(buildReceipt({ ...order, deposit: 18000, balance: 0 }, client, shop, null, now)!);
    assert.ok(html.includes("Statement of payments"));
    assert.ok(html.includes("Paid in full"));
    assert.ok(!html.includes("Payment received"));
  });
});

describe("receiptRef and receiptFileName", () => {
  it("make a short reference and a file name the client can recognise", () => {
    assert.equal(receiptRef("abc"), "MT-ABC");
    assert.equal(receiptRef(""), "MT-000000");
    const data = buildReceipt(order, client, shop, null, now)!;
    assert.equal(receiptFileName(data), "Receipt-Sathorn-Bespoke-20261020.pdf");
    assert.equal(receiptFileName({ ...data, shop: { ...data.shop, name: "ร้านตัดเสื้อ" } }), "Receipt-shop-20261020.pdf");
  });
});
