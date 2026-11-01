// Checks for the free website helpers. Run from mobile/app with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORY_LABELS,
  DEFAULT_INCLUDES,
  DEFAULT_SECTIONS,
  THEME_OPTIONS,
  categoryFromGarment,
  cleanSlugInput,
  includesFromText,
  moveItem,
  orderSourceLine,
  parsePriceInput,
  parseRatingInput,
  priceLabel,
  shortMonth,
  themeName,
  enquiryDetailLine,
  enquiryPreferredLabel,
  enquiryStatusLabel,
  enquiryStatusTone,
  groupEnquiries,
  isValidSlug,
  missingSentence,
  pageItems,
  slugError,
  slugify,
  splitWebsiteUrl,
} from "../website";

test("slugify follows the API rule: lower case, runs of other characters to one dash, trimmed, max 40", () => {
  assert.equal(slugify("KSSOE"), "kssoe");
  assert.equal(slugify("  Siam Tailors & Co. "), "siam-tailors-co");
  assert.equal(slugify("Thonglor -- Bespoke!!"), "thonglor-bespoke");
  assert.equal(slugify("ร้านตัดเสื้อ"), "shop");
  assert.equal(slugify(""), "shop");
  const long = slugify("The Very Long Name Of A Tailoring House In Bangkok Thailand");
  assert.ok(long.length <= 40);
  assert.ok(!long.endsWith("-"));
  assert.equal(long, "the-very-long-name-of-a-tailoring-house");
});

test("a valid address part is 3-40 of a-z, 0-9 and dashes, not starting or ending with a dash, and not reserved", () => {
  assert.equal(isValidSlug("kssoe"), true);
  assert.equal(isValidSlug("siam-tailors-2"), true);
  assert.equal(isValidSlug("ab"), false);
  assert.equal(isValidSlug("-abc"), false);
  assert.equal(isValidSlug("abc-"), false);
  assert.equal(isValidSlug("Abc"), false);
  assert.equal(isValidSlug("a".repeat(41)), false);
  assert.equal(isValidSlug("a".repeat(40)), true);
  assert.equal(isValidSlug("admin"), false);
  assert.equal(isValidSlug("www"), false);
  assert.equal(slugError("ab"), "At least 3 characters.");
  assert.equal(slugError("api"), "That address is reserved. Please choose another one.");
  assert.match(slugError("abc-") ?? "", /dash/);
  assert.equal(slugError("kssoe"), null);
});

test("typing in the address field is cleaned as you go", () => {
  assert.equal(cleanSlugInput("Siam Tailors"), "siam-tailors");
  assert.equal(cleanSlugInput("-a--b"), "a-b");
  assert.equal(cleanSlugInput("abc-"), "abc-"); // a trailing dash is kept while typing; slugError flags it
});

test("the link splits into a fixed prefix and the editable part", () => {
  assert.deepEqual(splitWebsiteUrl("https://api.example.com/s/kssoe"), { prefix: "api.example.com/s/", slug: "kssoe" });
  assert.deepEqual(splitWebsiteUrl("http://localhost:8787/s/a-b"), { prefix: "localhost:8787/s/", slug: "a-b" });
});

test("enquiry labels, tones and the row's detail line", () => {
  assert.equal(enquiryStatusLabel("new"), "New");
  assert.equal(enquiryStatusLabel("added"), "Client");
  assert.equal(enquiryStatusTone("new"), "danger");
  assert.equal(enquiryStatusTone("contacted"), "warning");
  assert.equal(enquiryStatusTone("added"), "success");
  assert.equal(enquiryStatusTone("dismissed"), "neutral");
  assert.equal(enquiryPreferredLabel("next_week"), "Next week");
  assert.equal(enquiryPreferredLabel(null), "");
  assert.equal(enquiryDetailLine({ garment: "Suits", preferred: "this_week" }), "Suits · this week");
  assert.equal(enquiryDetailLine({ garment: "Suits", preferred: null }), "Suits");
  assert.equal(enquiryDetailLine({ garment: null, preferred: "any" }), "Prefers any time");
  assert.equal(enquiryDetailLine({ garment: null, preferred: null }), "Asked for a fitting");
});

test("new enquiries are grouped first, the rest keep their order", () => {
  const list = [
    { id: "1", status: "contacted" as const },
    { id: "2", status: "new" as const },
    { id: "3", status: "added" as const },
    { id: "4", status: "new" as const },
  ];
  const { fresh, earlier } = groupEnquiries(list);
  assert.deepEqual(fresh.map((e) => e.id), ["2", "4"]);
  assert.deepEqual(earlier.map((e) => e.id), ["1", "3"]);
});

test("the checklist ticks what the shop has and points missing details to the right screen", () => {
  const items = pageItems(
    { openingHours: "Mon-Sat 10-19", address: null, phone: " ", googleReviewUrl: "https://g.page/r/x/review" },
    { about: null, lineId: "kssoe" },
  );
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(byKey.hours.present, true);
  assert.equal(byKey.address.present, false);
  assert.equal(byKey.address.fixIn, "shop-details");
  assert.equal(byKey.phone.present, false);
  assert.equal(byKey.line.present, true);
  assert.equal(byKey.about.present, false);
  assert.equal(byKey.about.fixIn, "website");
  assert.equal(byKey.reviews.present, true);
  assert.equal(pageItems(null, { about: null, lineId: null }).every((i) => !i.present), true);
});

test("the missing-details sentence lists what the API reported", () => {
  assert.equal(missingSentence([]), "");
  assert.equal(missingSentence(["phone"]), "Add phone to make the page complete.");
  assert.equal(missingSentence(["opening hours", "address", "phone"]), "Add opening hours, address and phone to make the page complete.");
});

// ---------- Portfolio website ----------

test("categoryFromGarment groups free-text garments like the API", () => {
  assert.equal(categoryFromGarment("Two-piece suit"), "suits");
  assert.equal(categoryFromGarment("Suit jacket"), "suits");
  assert.equal(categoryFromGarment("Linen blazer"), "jackets");
  assert.equal(categoryFromGarment("Trousers"), "trousers");
  assert.equal(categoryFromGarment("Chinos"), "trousers");
  assert.equal(categoryFromGarment("Oxford shirt"), "shirts");
  assert.equal(categoryFromGarment("Wedding suit"), "wedding");
  assert.equal(categoryFromGarment("Cufflinks"), "other");
  assert.equal(categoryFromGarment(null), "other");
});

test("priceLabel shows whole baht with thousands separators", () => {
  assert.equal(priceLabel(18000), "from ฿18,000");
  assert.equal(priceLabel(1250.4), "from ฿1,250");
  assert.equal(priceLabel(null), "");
  assert.equal(priceLabel(undefined), "");
});

test("parsePriceInput: empty is null, junk is undefined, separators and ฿ are ignored", () => {
  assert.equal(parsePriceInput(""), null);
  assert.equal(parsePriceInput("18,000"), 18000);
  assert.equal(parsePriceInput("฿ 4500"), 4500);
  assert.equal(parsePriceInput("abc"), undefined);
});

test("parseRatingInput keeps 1-5 with one decimal", () => {
  assert.equal(parseRatingInput("4.9"), 4.9);
  assert.equal(parseRatingInput("4,85"), 4.9);
  assert.equal(parseRatingInput(""), null);
  assert.equal(parseRatingInput("6"), undefined);
  assert.equal(parseRatingInput("0.5"), undefined);
});

test("theme options, section and includes defaults", () => {
  assert.deepEqual(THEME_OPTIONS.map((t) => t.key), ["atelier", "ivory", "noir"]);
  assert.equal(themeName("noir"), "Noir");
  assert.deepEqual(DEFAULT_SECTIONS, { fabrics: true, process: true, booking: true });
  assert.equal(DEFAULT_INCLUDES.length, 3);
  assert.equal(CATEGORY_LABELS.wedding, "Wedding");
});

test("orderSourceLine joins garment, fabric, month and the photo count", () => {
  const photos = [
    { id: "a", url: "u", stage: "measured" as const },
    { id: "b", url: "u", stage: "cutting" as const },
  ];
  assert.equal(
    orderSourceLine({ garment: "Trousers", fabric: "Super 130s navy wool", madeAt: "2026-10-19T06:29:37.731Z", photos }),
    "Trousers · Super 130s navy wool · Oct 2026 · 2 workshop photos",
  );
  assert.equal(orderSourceLine({ garment: "Shirt", fabric: null, madeAt: "bad", photos: photos.slice(0, 1) }), "Shirt · 1 workshop photo");
  assert.equal(shortMonth(null), "");
});

test("includesFromText keeps non-empty lines up to the limit", () => {
  assert.deepEqual(includesFromText(" One \n\nTwo\n"), ["One", "Two"]);
  assert.equal(includesFromText("1\n2\n3\n4\n5\n6\n7\n8").length, 6);
  assert.deepEqual(includesFromText(""), []);
});

test("moveItem moves one place and ignores moves off the ends", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
});
