import type { AiParseMeasurementsRequest, AiParseMeasurementsResponse, Measurements } from "../../../shared/types";
import { GARMENT_MEASUREMENTS } from "../db";
import type { Bindings } from "../env";
import { runPipeline } from "./gemini";
import { parsedMeasurementsSchema } from "./schemas";

// POST /ai/parse-measurements: a dictated transcript ("chest one-oh-two, waist eighty-eight, right shoulder a
// little low") -> measurement values for one garment. Text only - the phone's own speech recognition makes the
// transcript, and the app only asks when its local parser can't read part of it. Nothing is stored here.

/** Values outside this range (cm) aren't body measurements: the prompt says to skip them and we drop them again. */
export const MIN_CM = 10;
export const MAX_CM = 250;

const PARSER_PROMPT = `You turn a tailor's dictated measurement notes into structured data for a bespoke tailor shop's app. The tailor spoke into the phone; its speech recognition produced the transcript you receive, so expect run-together words, missing punctuation and numbers written as words.

### INPUT (JSON)
{ "ACTION": "PARSE_DICTATED_MEASUREMENTS", "transcript": [String], "garment_type": [String], "language": "en" | "th" (hint for the number words), "allowed_keys": [String[]] (the only measurement keys this garment uses) }

### MEASUREMENT KEYS and how the tailor may say them (English / Thai)
- chest: chest, bust / รอบอก, อก
- waist: waist / รอบเอว, เอว
- overArm: over-arm, over arm, chest over the arms / รอบอกรวมแขน, โอเวอร์อาร์ม
- shoulder: shoulder, shoulder width, across shoulders / ไหล่, กว้างไหล่, ความกว้างไหล่
- sleeve: sleeve, sleeve length, arm length / ยาวแขน, แขน, ความยาวแขน
- jacketLength: jacket length, coat length, back length / ยาวเสื้อสูท, ยาวเสื้อ, ยาวตัว
- hip: hip, hips, seat / รอบสะโพก, สะโพก
- inseam: inseam, inside leg, crotch to hem / ยาวขาใน, เป้าถึงปลายขา
- outseam: outseam, outside leg, trouser length / ยาวขานอก, ยาวกางเกง
- thigh: thigh / รอบต้นขา, ต้นขา
- hem: hem, leg opening, bottom, trouser cuff / รอบปลายขา, ปลายขา
- neck: neck, collar / รอบคอ, คอ
- cuff: cuff, wrist, shirt cuff / รอบข้อมือ, ข้อมือ
- shirtLength: shirt length, body length / ยาวเสื้อเชิ้ต, ยาวเสื้อ
"length" on its own means jacketLength or shirtLength, whichever is in allowed_keys.

### NUMBERS
Digits, English number words and Thai numerals or number words all count: "one-oh-two", "one oh two", "a hundred and two" = 102; "eighty-eight point five", "eighty eight and a half" = 88.5; "ninety and a half" = 90.5; "ร้อยสอง" = 102; "แปดสิบแปดจุดห้า", "แปดสิบแปดครึ่ง" = 88.5; "๑๐๒" = 102; "เก้าสิบ" = 90. Every value is centimetres; a value said in inches ("forty inches", "40 in", "สี่สิบนิ้ว") is converted (x 2.54, one decimal).

### RULES
1. Return a key only when it is in allowed_keys AND the transcript clearly states that measurement with a number. Never guess, never fill in typical values, never move a value from one key to another.
2. Values below ${MIN_CM} or above ${MAX_CM} cm are not body measurements: leave the key out and put the phrase in unrecognised.
3. If the same measurement is said more than once, keep the last one (the tailor corrected it).
4. postureNote: everything said about posture, stance or asymmetry ("right shoulder a little low", "slight forward lean", "ไหล่ขวาต่ำ") as one tidy sentence in the transcript's language, or null when nothing was said. Do not put measurements in it.
5. unrecognised: phrases that look like a measurement (a body part, a number) but could not be read with confidence, or that name a measurement not in allowed_keys (so the tailor can see it was not saved). Each entry is the original words from the transcript. [] when none.
6. Ignore filler, greetings and anything that is neither a measurement nor a posture remark.

### OUTPUT
Valid JSON only - no markdown fences, no commentary - exactly this shape:
{ "measurements": { "<key from allowed_keys>": [Number], ... }, "postureNote": [String] | null, "unrecognised": [String, ...] }
`;

/**
 * Ask Gemini to read the transcript, then keep only the garment's keys with plausible values (whatever the
 * model said). Throws 502 ai_failed like the other pipelines; 500 when GEMINI_API_KEY is missing.
 */
export async function parseDictatedMeasurements(env: Bindings, input: AiParseMeasurementsRequest): Promise<AiParseMeasurementsResponse> {
  const allowed = GARMENT_MEASUREMENTS[input.garmentType];
  const payload = {
    ACTION: "PARSE_DICTATED_MEASUREMENTS",
    transcript: input.transcript,
    garment_type: input.garmentType,
    language: input.language ?? "en",
    allowed_keys: allowed,
  };
  const result = await runPipeline(env, payload, parsedMeasurementsSchema, { system: PARSER_PROMPT, temperature: 0 });

  const measurements: Partial<Measurements> = {};
  for (const key of allowed) {
    const value = result.measurements[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= MIN_CM && value <= MAX_CM) {
      measurements[key] = Math.round(value * 10) / 10;
    }
  }
  return { measurements, postureNote: result.postureNote, unrecognised: result.unrecognised };
}
