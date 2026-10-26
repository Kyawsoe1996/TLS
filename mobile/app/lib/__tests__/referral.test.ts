// Checks for the Smart Referral helpers. Run from mobile/app with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ambassadorLine,
  contactKind,
  contactLabel,
  firstNameOf,
  initialsOf,
  inviteExplanation,
  leadDetailLine,
  leadStatusLabel,
  leadStatusTone,
  possessive,
  preferredLabel,
  referralMessage,
  rewardDetailLine,
  rewardProgress,
  rewardStatusLabel,
  rewardStatusTone,
  rewardTitle,
} from "../referral";

const NOON = "2026-10-20T12:00:00.000Z";

test("a contact is a phone number when it is mostly digits, otherwise a LINE ID", () => {
  assert.equal(contactKind("081 234 5678"), "phone");
  assert.equal(contactKind("+66 81 234 5678"), "phone");
  assert.equal(contactKind("081-234-5678"), "phone");
  assert.equal(contactKind("anucha_s"), "line");
  assert.equal(contactKind("mike2024"), "line"); // half digits is not "mostly"
  assert.equal(contactKind(""), "line");
  assert.equal(contactLabel("0812345678"), "Phone");
  assert.equal(contactLabel("@anucha"), "LINE");
});

test("the share message carries the shop, the lower-cased offer and the link", () => {
  const url = "https://api.example.com/r/DANIEL-7F2K";
  assert.equal(
    referralMessage({ shopName: "Siam Bespoke", district: "Thonglor", friendOffer: "A complimentary shirt with your first suit", url }),
    `Hi! I'm a client of Siam Bespoke in Thonglor. Book your first fitting with my link and you get a complimentary shirt with your first suit: ${url}`,
  );
  assert.equal(
    referralMessage({ shopName: "Siam Bespoke", district: "Thonglor", friendOffer: null, url }),
    `Hi! I'm a client of Siam Bespoke in Thonglor. Book your first fitting with my link and you get a welcome gift: ${url}`,
  );
  assert.equal(referralMessage({ shopName: "S", district: "D", friendOffer: "   ", url }).includes("a welcome gift"), true);
});

test("the invite explanation adapts to which offers are set", () => {
  assert.equal(
    inviteExplanation({ firstName: "Daniel", friendOffer: "A complimentary shirt", clientOffer: "A free monogram" }),
    "Friends who book with Daniel's link get a complimentary shirt, and Daniel gets a free monogram once their friend's first order is delivered.",
  );
  assert.equal(inviteExplanation({ firstName: "Daniel", friendOffer: "A complimentary shirt", clientOffer: null }), "Friends who book with Daniel's link get a complimentary shirt.");
  assert.equal(inviteExplanation({ firstName: "Daniel", friendOffer: null, clientOffer: null }), "Send Daniel their personal link. A friend who opens it can ask for a fitting in a few taps.");
});

test("names: first name, initials and possessive", () => {
  assert.equal(firstNameOf("Anucha Srisuk"), "Anucha");
  assert.equal(firstNameOf("  Daniel  "), "Daniel");
  assert.equal(firstNameOf(""), "");
  assert.equal(initialsOf("Anucha Srisuk"), "AS");
  assert.equal(initialsOf(""), "?");
  assert.equal(possessive("James"), "James's");
  assert.equal(possessive(""), "their");
});

test("status labels, tones and the preferred time", () => {
  assert.equal(leadStatusLabel("new"), "New");
  assert.equal(leadStatusTone("new"), "danger");
  assert.equal(leadStatusTone("added"), "success");
  assert.equal(leadStatusTone("dismissed"), "neutral");
  assert.equal(rewardStatusLabel("ready"), "Ready");
  assert.equal(rewardStatusTone("ready"), "success");
  assert.equal(rewardStatusTone("pending"), "warning");
  assert.equal(rewardStatusTone("given"), "neutral");
  assert.equal(preferredLabel("this_week"), "This week");
  assert.equal(preferredLabel("any"), "Any time");
  assert.equal(preferredLabel(null), "");
});

test("row lines for leads, ambassadors and rewards", () => {
  assert.equal(leadDetailLine({ status: "new", preferred: "this_week" }), "Asked for a fitting · prefers this week");
  assert.equal(leadDetailLine({ status: "new", preferred: null }), "Asked for a fitting");
  assert.equal(leadDetailLine({ status: "added", preferred: "any" }), "Added as a client");
  assert.equal(leadDetailLine({ status: "dismissed", preferred: null }), "Dismissed");
  assert.equal(ambassadorLine(3, 2), "3 friends booked · 2 became clients");
  assert.equal(ambassadorLine(1, 1), "1 friend booked · 1 became a client");
  assert.equal(rewardTitle("A free monogram on your next order", "Daniel"), "A free monogram on your next order for Daniel");
  assert.equal(rewardTitle(null, "Daniel"), "Reward for Daniel");
  assert.equal(rewardDetailLine({ status: "pending", friendName: "Mike", readyAt: null, givenAt: null }), "Waiting for Mike's first order");
  assert.equal(rewardDetailLine({ status: "ready", friendName: "Mike", readyAt: NOON, givenAt: null }), "Earned from Mike's first order · 20 Oct 2026");
  assert.equal(rewardDetailLine({ status: "given", friendName: "Mike", readyAt: NOON, givenAt: NOON }), "Earned from Mike's first order · given 20 Oct 2026");
});

test("reward progress: asked is done, delivery is next once the friend is a client, both flip when the reward is ready", () => {
  const lead = { status: "new" as const, createdAt: NOON, referrerName: "Daniel Chen" };
  assert.deepEqual(
    rewardProgress(lead, null).map((s) => s.state),
    ["done", "next", "later"],
  );
  assert.equal(rewardProgress(lead, null)[0]?.detail, "20 Oct 2026");
  assert.equal(rewardProgress(lead, null)[2]?.label, "Daniel's reward released");
  assert.deepEqual(rewardProgress({ ...lead, status: "dismissed" }, null).map((s) => s.state), ["done", "later", "later"]);
  assert.deepEqual(rewardProgress({ ...lead, status: "added" }, { status: "pending", readyAt: null, givenAt: null }).map((s) => s.state), ["done", "next", "later"]);
  const ready = rewardProgress({ ...lead, status: "added" }, { status: "ready", readyAt: NOON, givenAt: null });
  assert.deepEqual(ready.map((s) => s.state), ["done", "done", "done"]);
  assert.equal(ready[1]?.detail, "20 Oct 2026");
  assert.equal(ready[2]?.detail, "Ready to give");
  const given = rewardProgress({ ...lead, status: "added" }, { status: "given", readyAt: NOON, givenAt: NOON });
  assert.equal(given[2]?.detail, "Given · 20 Oct 2026");
});
