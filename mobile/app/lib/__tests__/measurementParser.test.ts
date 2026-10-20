// Checks for the dictation parser. Run from mobile/app with:
//   node --import ./lib/__tests__/register.mjs lib/__tests__/measurementParser.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanNote, mergeParsedMeasurements, parseMeasurements, parseSpokenNumbers, parseVoiceCommand } from "../measurementParser";

test("English number words with a posture sentence", () => {
  const result = parseMeasurements(
    "chest one-oh-two, waist eighty-eight, hip one hundred, shoulder forty-six, right shoulder sits a little low",
    "suit",
    "en",
  );
  assert.deepEqual(result.measurements, { chest: 102, waist: 88, hip: 100, shoulder: 46 });
  assert.equal(result.postureNote, "Right shoulder sits a little low.");
  assert.deepEqual(result.unrecognised, []);
});

test("the same dictation without any punctuation (how a recogniser hands it over)", () => {
  const result = parseMeasurements(
    "chest one oh two waist eighty eight hip one hundred shoulder forty six right shoulder sits a little low",
    "suit",
  );
  assert.deepEqual(result.measurements, { chest: 102, waist: 88, hip: 100, shoulder: 46 });
  assert.equal(result.postureNote, "Right shoulder sits a little low.");
});

test("Thai names, Thai number words, digits and a posture phrase", () => {
  const result = parseMeasurements("รอบอก ร้อยสอง รอบเอว แปดสิบแปดจุดห้า สะโพก 100 ไหล่ตกนิดหน่อย", "suit", "th");
  assert.deepEqual(result.measurements, { chest: 102, waist: 88.5, hip: 100 });
  assert.equal(result.postureNote, "ไหล่ตกนิดหน่อย");
  assert.deepEqual(result.unrecognised, []);
});

test("decimals in every spelling", () => {
  const result = parseMeasurements("chest 102.5, waist 88,5, sleeve sixty two point five, hem forty and a half, thigh 58 and a half", "suit");
  assert.deepEqual(result.measurements, { chest: 102.5, waist: 88.5, sleeve: 62.5, hem: 40.5, thigh: 58.5 });
  assert.equal(result.postureNote, null);
});

test("Thai digits and tens", () => {
  const result = parseMeasurements("เอว ๘๘ ไหล่ สี่สิบหกครึ่ง ขาใน เจ็ดสิบเอ็ด", "trousers", "th");
  assert.deepEqual(result.measurements, { waist: 88, inseam: 71 });
  // "ไหล่" isn't a trouser field, so that chunk is handed back with its number.
  assert.deepEqual(result.unrecognised, ["ไหล่ สี่สิบหกครึ่ง"]);
});

test("names outside the garment and values outside the range are handed back", () => {
  const result = parseMeasurements("neck 40, chest 100, waist 5, hip three hundred", "jacket");
  assert.deepEqual(result.measurements, { chest: 100 });
  assert.deepEqual(result.unrecognised, ["neck 40", "waist 5", "hip three hundred"]);
});

test("units and filler are ignored; later values win", () => {
  const result = parseMeasurements("okay so the chest is about one hundred and two centimetres, waist 90 cm, waist 88", "shirt");
  assert.deepEqual(result.measurements, { chest: 102, waist: 88 });
  assert.deepEqual(result.unrecognised, []);
});

test("posture words after a value and a stoop", () => {
  const result = parseMeasurements("shoulder 46 a bit of a stoop, he slouches slightly", "jacket");
  assert.deepEqual(result.measurements, { shoulder: 46 });
  assert.equal(result.postureNote, "A bit of a stoop. He slouches slightly.");
});

test("nothing usable", () => {
  const result = parseMeasurements("um hello there", "jacket");
  assert.deepEqual(result, { measurements: {}, postureNote: null, unrecognised: [] });
});

test("merging the API's reading only fills what the local parser left empty", () => {
  const local = parseMeasurements("chest 102 blah blah 88", "jacket");
  assert.deepEqual(local.measurements, { chest: 102 });
  assert.deepEqual(local.unrecognised, ["blah blah 88"]);
  const merged = mergeParsedMeasurements(
    local,
    { measurements: { chest: 99, waist: 88, hip: 400, neck: 40 }, postureNote: "Slight stoop.", unrecognised: [] },
    "jacket",
  );
  // chest stays local; hip is out of range; neck isn't a jacket field.
  assert.deepEqual(merged.measurements, { chest: 102, waist: 88 });
  assert.equal(merged.postureNote, "Slight stoop.");
  assert.deepEqual(merged.unrecognised, []);
});

test("inches are converted to cm", () => {
  const r = parseMeasurements("chest 40 inches, waist thirty four in", "jacket", "en");
  assert.equal(r.measurements.chest, 101.6);
  assert.equal(r.measurements.waist, 86.4);
});

test("upper arm is not the over-arm chest", () => {
  const r = parseMeasurements("upper arm 34, over arm 110", "jacket", "en");
  assert.equal(r.measurements.overArm, 110);
  assert.ok(r.unrecognised.some((u) => u.includes("34")));
});

test("Thai number words glued inside ordinary words are not numbers", () => {
  const r = parseMeasurements("รอบอก สามารถวัดได้ ร้อยสอง", "jacket", "th");
  assert.equal(r.measurements.chest, 102);
  const chair = parseMeasurements("เก้าอี้ รอบเอว แปดสิบแปด", "jacket", "th");
  assert.equal(chair.measurements.waist, 88);
  assert.equal(chair.measurements.chest, undefined);
});

test("guided mode: numbers in one utterance, in order, inches converted", () => {
  assert.deepEqual(parseSpokenNumbers("one oh two", "en"), [102]);
  assert.deepEqual(parseSpokenNumbers("102, 88 and 100", "en"), [102, 88, 100]);
  assert.deepEqual(parseSpokenNumbers("forty inches", "en"), [101.6]);
  assert.deepEqual(parseSpokenNumbers("ร้อยสอง", "th"), [102]);
  assert.deepEqual(parseSpokenNumbers("five", "en"), []); // out of range
  assert.deepEqual(parseSpokenNumbers("", "en"), []);
});

test("guided mode: commands, and a number always wins over a command word", () => {
  assert.equal(parseVoiceCommand("skip"), "skip");
  assert.equal(parseVoiceCommand("ข้าม", "th"), "skip");
  assert.equal(parseVoiceCommand("go back", "en"), "back");
  assert.equal(parseVoiceCommand("that's all"), "done");
  assert.equal(parseVoiceCommand("done one oh two"), null);
  assert.equal(parseVoiceCommand("hello there"), null);
  assert.equal(cleanNote("right shoulder a little low"), "Right shoulder a little low.");
  assert.equal(cleanNote("   "), null);
});
