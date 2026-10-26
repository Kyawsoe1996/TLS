// Checks for the Fabric stock helpers (enough-for labels, metres, grouping). Run from mobile/app with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fabric } from "@shared/types";

import {
  defaultMetresFor,
  enoughFor,
  filterFabrics,
  formatMetres,
  formatSignedMetres,
  groupFabrics,
  isPaleHex,
  listSubtitle,
  lowBanner,
  movementLine,
  remainingAfter,
  stockLine,
} from "../../components/fabrics/helpers";

function fabric(overrides: Partial<Fabric>): Fabric {
  const metresLeft = overrides.metresLeft ?? 10;
  const lowAtMetres = overrides.lowAtMetres ?? 3;
  return {
    id: "f",
    name: "Super 130s navy wool",
    supplier: "Holland & Sherry",
    colour: "Navy",
    kind: "suiting",
    widthCm: 150,
    metresLeft,
    lowAtMetres,
    costPerMetre: 2400,
    swatch: "#1E2D4D",
    notes: null,
    low: metresLeft < lowAtMetres,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  };
}

test("metres are shown to one decimal with the unit, and signed for history rows", () => {
  assert.equal(formatMetres(2.7), "2.7 m");
  assert.equal(formatMetres(3), "3 m");
  assert.equal(formatMetres(12.25), "12.3 m");
  assert.equal(formatMetres(0), "0 m");
  assert.equal(formatSignedMetres(12), "+12 m");
  assert.equal(formatSignedMetres(-3.3), "−3.3 m");
});

test("enoughFor reads a bolt in suits, with the jacket / trousers fallbacks", () => {
  assert.deepEqual(enoughFor(10), { label: "3 suits", suit: true, jacket: true, trousers: true, shirt: true, suits: 3 });
  assert.equal(enoughFor(3.3).label, "1 suit");
  const jacketOnly = enoughFor(2.7);
  assert.equal(jacketOnly.label, "Jacket or trousers only");
  assert.equal(jacketOnly.suit, false);
  assert.equal(jacketOnly.jacket, true);
  assert.equal(jacketOnly.trousers, true);
  assert.equal(enoughFor(1.3).label, "Trousers only");
  assert.equal(enoughFor(1).label, "Not enough for trousers");
  assert.equal(enoughFor(0).label, "Empty");
});

test("shirting, trousering and jacketing count in their own garment", () => {
  assert.equal(enoughFor(28, "shirting").label, "14 shirts");
  assert.equal(enoughFor(2, "shirting").label, "1 shirt");
  assert.equal(enoughFor(1.9, "shirting").label, "Not enough for a shirt");
  assert.equal(enoughFor(2.6, "trousering").label, "2 pairs of trousers");
  assert.equal(enoughFor(1.3, "trousering").label, "1 pair of trousers");
  assert.equal(enoughFor(4, "jacketing").label, "2 jackets");
  assert.equal(enoughFor(10, "lining").label, "3 suits");
});

test("a new order starts with the usual length for its garment", () => {
  assert.equal(defaultMetresFor("Two-piece suit"), 3.3);
  assert.equal(defaultMetresFor("Three-piece suit"), 3.3);
  assert.equal(defaultMetresFor("Jacket"), 2);
  assert.equal(defaultMetresFor("Dinner jacket"), 2);
  assert.equal(defaultMetresFor("Trousers"), 1.3);
  assert.equal(defaultMetresFor("Shirt"), 2);
  assert.equal(defaultMetresFor("Custom"), 2);
  assert.equal(defaultMetresFor(""), 2);
});

test("remainingAfter rounds away float noise and stockLine says whether the order fits", () => {
  assert.equal(remainingAfter(7.8, 3.3), 4.5);
  assert.equal(remainingAfter(2.7, 3.3), -0.6);
  assert.equal(remainingAfter(3.3, 3.3), 0);
  assert.deepEqual(stockLine(7.8, 3.3, "Two-piece suit"), { text: "Enough · 4.5 m will remain", ok: true });
  assert.deepEqual(stockLine(2.7, 3.3, "Two-piece suit"), { text: "Only 2.7 m left · not enough for a suit", ok: false });
  assert.equal(stockLine(1, 1.3, "Trousers").text, "Only 1 m left · not enough for trousers");
  assert.equal(stockLine(1, 2, "Waistcoat").text, "Only 1 m left · not enough for this order");
});

test("groupFabrics splits low from in stock and keeps the API's order", () => {
  const list = [
    fabric({ id: "a", name: "Charcoal flannel", metresLeft: 1.2 }),
    fabric({ id: "b", name: "Irish linen", metresLeft: 2.9, lowAtMetres: 3 }),
    fabric({ id: "c", name: "Navy wool", metresLeft: 12 }),
  ];
  const groups = groupFabrics(list);
  assert.deepEqual(groups.low.map((f) => f.id), ["a", "b"]);
  assert.deepEqual(groups.inStock.map((f) => f.id), ["c"]);
});

test("filterFabrics searches name, colour and supplier and applies the chip", () => {
  const list = [
    fabric({ id: "a", name: "Charcoal flannel", colour: "Charcoal", supplier: "Fox Brothers", metresLeft: 1.2 }),
    fabric({ id: "b", name: "Sea Island cotton", kind: "shirting", colour: "White", supplier: "Thomas Mason", metresLeft: 20 }),
    fabric({ id: "c", name: "Navy wool", metresLeft: 12 }),
  ];
  assert.deepEqual(filterFabrics(list, "", "all").map((f) => f.id), ["a", "b", "c"]);
  assert.deepEqual(filterFabrics(list, "", "low").map((f) => f.id), ["a"]);
  assert.deepEqual(filterFabrics(list, "", "shirting").map((f) => f.id), ["b"]);
  assert.deepEqual(filterFabrics(list, "fox", "all").map((f) => f.id), ["a"]);
  assert.deepEqual(filterFabrics(list, "WHITE", "all").map((f) => f.id), ["b"]);
  assert.deepEqual(filterFabrics(list, "navy", "shirting").map((f) => f.id), []);
});

test("list copy counts the shelf and the low ones", () => {
  assert.equal(listSubtitle(12, 2), "12 fabrics on the shelf · 2 running low");
  assert.equal(listSubtitle(1, 0), "1 fabric on the shelf");
  assert.equal(listSubtitle(0, 0), "Nothing on the shelf yet");
  assert.equal(lowBanner(2), "2 fabrics are below their minimum. Order more before promising a suit from them.");
  assert.equal(lowBanner(1), "1 fabric is below their minimum. Order more before promising a suit from it.");
});

test("history rows read the API's note", () => {
  assert.deepEqual(movementLine({ reason: "order", note: "Two-piece suit for Marcus Lindqvist" }), { title: "Marcus Lindqvist · two-piece suit", detail: "Cutting started" });
  assert.deepEqual(movementLine({ reason: "order", note: null }), { title: "Order", detail: "Cutting started" });
  assert.deepEqual(movementLine({ reason: "received", note: "Opening stock" }), { title: "Opening stock", detail: null });
  assert.deepEqual(movementLine({ reason: "received", note: null }), { title: "Received", detail: null });
  assert.deepEqual(movementLine({ reason: "correction", note: "Stock-take" }), { title: "Count corrected", detail: "Stock-take" });
});

test("pale swatches get a dark tick", () => {
  assert.equal(isPaleHex("#F2F0EA"), true);
  assert.equal(isPaleHex("#C9B48A"), true);
  assert.equal(isPaleHex("#1E2D4D"), false);
  assert.equal(isPaleHex("not a colour"), false);
});
