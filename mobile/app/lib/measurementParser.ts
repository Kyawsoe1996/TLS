// Turns a dictated transcript ("chest one-oh-two, waist eighty-eight, right shoulder a little low") into measurement
// values, a posture note and the bits it couldn't read. Pure: no React and no native modules, so it also runs under
// node for the checks in lib/__tests__. Names and number words are recognised in English and Thai; the garment type
// restricts which names count (fieldsFor), so "ความยาวเสื้อ" is the shirt length on a shirt and the jacket length on
// a jacket. Speech recognisers rarely punctuate, so nothing here relies on commas: the text is cut at every
// recognised name (or posture phrase) and the number is read from what follows.
import type { GarmentType, Measurements } from "@shared/types";

import { fieldsFor, type MeasurementKey } from "@/components/clients/measurements";

export type DictationLanguage = "en" | "th";

export interface ParsedMeasurements {
  /** Only the keys that were clearly said, in cm. */
  measurements: Partial<Measurements>;
  /** Everything about posture / stance, one sentence per phrase, first letter capitalised. */
  postureNote: string | null;
  /** Chunks that carried a number but no usable measurement (unknown name, or a value outside MEASUREMENT_RANGE). */
  unrecognised: string[];
}

/** Values outside this range (cm) are not body measurements; they go to `unrecognised`. */
export const MEASUREMENT_RANGE = { min: 10, max: 250 } as const;

const SYNONYMS: Record<MeasurementKey, readonly string[]> = {
  chest: ["chest", "bust", "รอบอก"],
  waist: ["waist", "รอบเอว", "เอว"],
  // The chest measured over the arms (not the bicep): "upper arm" would be the wrong measurement.
  overArm: ["over arm", "overarm", "over-arm", "รอบอกรวมแขน"],
  shoulder: ["shoulder width", "shoulders", "shoulder", "ความกว้างไหล่", "กว้างไหล่", "ไหล่"],
  sleeve: ["sleeve length", "sleeve", "arm length", "ความยาวแขน", "ยาวแขน", "แขน"],
  jacketLength: [
    "jacket length",
    "length of the jacket",
    "length of jacket",
    "coat length",
    "ความยาวเสื้อ",
    "ยาวเสื้อ",
    "ความยาวสูท",
    "ยาวสูท",
  ],
  hip: ["hips", "hip", "รอบสะโพก", "สะโพก"],
  inseam: ["inseam", "in seam", "inside leg", "ขาใน"],
  outseam: ["outseam", "out seam", "outside leg", "ขานอก"],
  thigh: ["thigh", "รอบต้นขา", "ต้นขา"],
  hem: ["hem", "bottom", "leg opening", "ปลายขา"],
  neck: ["neck", "collar", "รอบคอ", "คอ"],
  cuff: ["cuff", "wrist", "รอบข้อมือ", "ข้อมือ"],
  shirtLength: [
    "shirt length",
    "length of the shirt",
    "length of shirt",
    "ความยาวเสื้อเชิ้ต",
    "ความยาวเชิ้ต",
    "ยาวเชิ้ต",
    "ความยาวเสื้อ",
    "ยาวเสื้อ",
  ],
};

/** Phrases that open a posture remark. "right shoulder" must win over the "shoulder" measurement. */
const POSTURE_ANCHORS: readonly string[] = [
  "right shoulder",
  "left shoulder",
  "posture",
  "stoop",
  "stoops",
  "stooped",
  "stooping",
  "slouch",
  "slouches",
  "slouched",
  "slouching",
  "hunch",
  "hunched",
  "hunches",
  "rounded back",
  "round back",
  "rounded shoulders",
  "round shoulders",
  "forward head",
  "forward neck",
  "head forward",
  "leans forward",
  "leaning forward",
  "ไหล่ตก",
  "ไหล่ซ้าย",
  "ไหล่ขวา",
  "ไหล่เอียง",
  "หลังค่อม",
  "ห่อไหล่",
  "หลังงอ",
  "ท่าทาง",
  "ตัวเอียง",
];

/** Words that make a nameless or numberless chunk read as a posture remark. */
const POSTURE_WORDS =
  /\b(?:posture|stoop\w*|slouch\w*|hunch\w*|forward|round\w*|lean\w*|drop\w*|low|lower|high|higher|uneven|slop\w*)\b|ไหล่ตก|หลังค่อม|ค่อม|เอียง|ต่ำ|สูง|ห่อไหล่|หลังงอ|ท่าทาง/;

const UNITS = /\b(?:cm|centimetres?|centimeters?)\b|เซนติเมตร|ซม|เซน/g;

/** Stands in for the recogniser's commas and full stops after normalisation: a clause boundary for posture text. */
const CLAUSE = "|";

const EN_NUMBERS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
const EN_NUMBER_WORDS =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred)\b/;

const TH_DIGITS: Record<string, number> = {
  ศูนย์: 0,
  หนึ่ง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
};
// Longest first: "ยี่สิบ" (20) before "สิบ" (10).
const TH_NUMBER_WORDS = /ยี่สิบ|ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|เอ็ด|ร้อย|จุด|ครึ่ง/g;
const TH_NUMBER_TEST = /ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย/;
/** A number word at the very start of a string (used to tell "สองร้อย" from "สามารถ"). */
const TH_NUMBER_WORD_START = /^(?:ยี่สิบ|ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|เอ็ด|ร้อย|จุด|ครึ่ง)/;

type Anchor = { type: "name"; key: MeasurementKey } | { type: "posture" };

interface AnchorIndex {
  regex: RegExp;
  lookup: Map<string, Anchor>;
}

const anchorCache = new Map<GarmentType, AnchorIndex>();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Latin terms need word boundaries ("hip" is not "ship"); Thai has no spaces, so Thai terms match anywhere. */
function termPattern(term: string): string {
  return /^[a-z]/.test(term) ? `\\b${escapeRegex(term)}\\b` : escapeRegex(term);
}

/** One regex of every name this garment uses plus the posture openers, longest term first so "sleeve length" beats "sleeve". */
function anchorsFor(garmentType: GarmentType): AnchorIndex {
  const cached = anchorCache.get(garmentType);
  if (cached) return cached;
  const lookup = new Map<string, Anchor>();
  for (const term of POSTURE_ANCHORS) lookup.set(term, { type: "posture" });
  for (const { key } of fieldsFor(garmentType)) {
    for (const term of SYNONYMS[key]) if (!lookup.has(term)) lookup.set(term, { type: "name", key });
  }
  const terms = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const index: AnchorIndex = { regex: new RegExp(terms.map(termPattern).join("|"), "g"), lookup };
  anchorCache.set(garmentType, index);
  return index;
}

/**
 * Lower-case, Thai digits → Arabic, "88,5" → "88.5", hyphens and quotes → spaces; commas, full stops (not decimal
 * points) and line breaks become CLAUSE markers.
 */
function normalise(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/-/g, " ")
    .replace(/[()"“”'’]/g, " ")
    .replace(/[,;:!?\n]|\.(?!\d)/g, ` ${CLAUSE} `)
    .replace(/\s+/g, " ")
    .replace(/\|(?:\s*\|)+/g, CLAUSE)
    .trim();
}

function stripUnits(text: string): string {
  return text.replace(UNITS, " ").replace(/\s+/g, " ").trim();
}

/** For text handed back to the user: no clause markers, single spaces. */
function clean(text: string): string {
  return text.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
}

function hasNumber(text: string): boolean {
  return /\d/.test(text) || EN_NUMBER_WORDS.test(text) || TH_NUMBER_TEST.test(text);
}

interface NumberMatch {
  value: number;
  /** Offset just after the number, so the caller can look at what was said next. */
  end: number;
}

function parseDigits(text: string): NumberMatch | null {
  const m = /\d+(?:\.\d+)?/.exec(text);
  if (!m) return null;
  let value = Number(m[0]);
  let end = m.index + m[0].length;
  // "102 and a half"
  const half = /^\s*(?:and\s+)?(?:a\s+)?half\b/.exec(text.slice(end));
  if (half && Number.isInteger(value)) {
    value += 0.5;
    end += half[0].length;
  }
  return { value, end };
}

/**
 * English number words as they're dictated: "one oh two" (digits in a row), "one hundred and two", "eighty-eight
 * point five", "forty and a half", "one twenty" (= 120). Filler before the first number word is skipped; the first
 * non-number word after it ends the number.
 */
function parseEnglishWords(text: string): NumberMatch | null {
  const re = /[a-z]+/g;
  let total = 0;
  let decimals = "";
  let inDecimals = false;
  let seen = false;
  let end = 0;
  let prev: "none" | "unit" | "teen" | "tens" | "hundred" = "none";
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = m[0];
    const tokenEnd = m.index + token.length;
    if (token === "and" || token === "a" || token === "an") continue;
    if (token === "point" || token === "dot") {
      if (!seen) continue;
      inDecimals = true;
      end = tokenEnd;
      continue;
    }
    if (token === "half") {
      if (!seen) continue;
      decimals = "5";
      inDecimals = false;
      end = tokenEnd;
      continue;
    }
    const value = EN_NUMBERS[token];
    if (value === undefined) {
      if (seen) break;
      continue;
    }
    // "oh" before any digit is a hesitation, not a zero.
    if ((token === "oh" || token === "o") && !seen) continue;
    seen = true;
    end = tokenEnd;
    if (inDecimals) {
      if (value < 10) decimals += String(value);
      continue;
    }
    if (value === 100) {
      total = (total === 0 ? 1 : total) * 100;
      prev = "hundred";
      continue;
    }
    if (value >= 10) {
      // "one twenty" → 120, "one fifteen" → 115; otherwise "eighty" just adds.
      total = prev === "unit" ? total * 100 + value : total + value;
      prev = value >= 20 ? "tens" : "teen";
      continue;
    }
    // A digit after a digit is the next digit ("one oh two"); after tens / hundred it's the units ("forty six").
    total = prev === "unit" || prev === "teen" ? total * 10 + value : total + value;
    prev = "unit";
  }
  if (!seen) return null;
  return { value: Number(`${total}.${decimals || "0"}`), end };
}

/** Thai number words, usually written without spaces: "ร้อยสอง" (102), "แปดสิบแปดจุดห้า" (88.5), "สี่สิบหกครึ่ง" (46.5). */
function parseThaiWords(text: string): NumberMatch | null {
  const re = new RegExp(TH_NUMBER_WORDS.source, "g");
  let total = 0;
  let current = 0;
  let decimals = "";
  let inDecimals = false;
  let seen = false;
  let end = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // Only whitespace may sit between the words of one number.
    if (seen && /\S/.test(text.slice(end, m.index))) break;
    const word = m[0];
    // Thai has no spaces between words, so a number word glued to other letters ("สาม" in "สามารถ", "เก้า" in
    // "เก้าอี้") is part of an ordinary word unless what follows is another number word ("สองร้อย").
    const wordEnd = m.index + word.length;
    const before = text[m.index - 1];
    const after = text.slice(wordEnd);
    const gluedBefore = before !== undefined && /[฀-๿]/.test(before) && m.index !== end;
    const gluedAfter = /^[฀-๿]/.test(after) && !TH_NUMBER_WORD_START.test(after);
    if (gluedBefore || gluedAfter) {
      if (seen) break;
      continue;
    }
    seen = true;
    end = wordEnd;
    if (word === "จุด") {
      total += current;
      current = 0;
      inDecimals = true;
      continue;
    }
    if (word === "ครึ่ง") {
      decimals = "5";
      inDecimals = false;
      continue;
    }
    if (inDecimals) {
      const d = TH_DIGITS[word];
      if (d !== undefined) decimals += String(d);
      continue;
    }
    if (word === "ยี่สิบ") {
      total += 20;
      current = 0;
      continue;
    }
    if (word === "สิบ") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (word === "ร้อย") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (word === "เอ็ด") {
      current = 1;
      continue;
    }
    const d = TH_DIGITS[word];
    if (d !== undefined) current = d;
  }
  if (!seen) return null;
  total += current;
  return { value: Number(`${total}.${decimals || "0"}`), end };
}

/** An inch unit right after a number: "40 inches", "34 in", 40", "สี่สิบนิ้ว". */
const INCHES = /^\s*(?:inch(?:es)?|in)\b|^\s*["”]|^\s*นิ้ว/;

/** Older tailors still say inches: convert to cm (one decimal) so "chest 40 inches" doesn't land as 40 cm. */
function withUnits(text: string, match: NumberMatch): NumberMatch {
  const inch = INCHES.exec(text.slice(match.end));
  if (!inch) return match;
  return { value: Math.round(match.value * 2.54 * 10) / 10, end: match.end + inch[0].length };
}

/** Digits first ("102", "88.5"), then number words in the dictation language, then the other language. */
function extractNumber(text: string, language: DictationLanguage): NumberMatch | null {
  const digits = parseDigits(text);
  if (digits) return withUnits(text, digits);
  const parsers = language === "th" ? [parseThaiWords, parseEnglishWords] : [parseEnglishWords, parseThaiWords];
  for (const parse of parsers) {
    const found = parse(text);
    if (found) return withUnits(text, found);
  }
  return null;
}

/** "right shoulder sits a little low" → "Right shoulder sits a little low." (Thai gets no full stop). */
function sentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const capitalised = t.charAt(0).toUpperCase() + t.slice(1);
  return /[a-z0-9]$/i.test(capitalised) ? `${capitalised}.` : capitalised;
}

function inRange(value: number): boolean {
  return value >= MEASUREMENT_RANGE.min && value <= MEASUREMENT_RANGE.max;
}

export function parseMeasurements(transcript: string, garmentType: GarmentType, language: DictationLanguage = "en"): ParsedMeasurements {
  const text = normalise(transcript);
  const measurements: Partial<Measurements> = {};
  const posture: string[] = [];
  const unrecognised: string[] = [];
  if (!text) return { measurements, postureNote: null, unrecognised };

  const { regex, lookup } = anchorsFor(garmentType);
  const anchors = [...text.matchAll(regex)].map((m) => {
    const start = m.index ?? 0;
    return { start, end: start + m[0].length, anchor: lookup.get(m[0]) as Anchor };
  });

  // Words that most likely belong to the posture phrase that follows ("a bit of a" before "stoop").
  let carry = "";

  /**
   * Text that isn't a value, clause by clause: posture remarks go to the note, stray numbers are handed back, and
   * the words right before the next anchor are carried into it. With `opensPosture` the first clause starts with
   * a posture phrase and goes to the note as it is.
   */
  const absorb = (chunk: string, opensPosture: boolean) => {
    const parts = chunk.split(CLAUSE).map((part) => stripUnits(part));
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      if (i === 0 && opensPosture) {
        posture.push([carry, part].filter(Boolean).join(" "));
        carry = "";
        return;
      }
      if (!part) {
        carry = "";
        return;
      }
      if (POSTURE_WORDS.test(part)) {
        posture.push(part);
        carry = "";
      } else if (hasNumber(part)) {
        unrecognised.push(part);
        carry = "";
      } else {
        carry = last ? part : "";
      }
    });
  };

  absorb(text.slice(0, anchors[0]?.start ?? text.length), false);

  anchors.forEach(({ start, end, anchor }, i) => {
    const stop = anchors[i + 1]?.start ?? text.length;
    if (anchor.type === "posture") {
      absorb(text.slice(start, stop), true);
      return;
    }
    carry = "";
    // The value may follow a pause ("chest, one oh two"), so clause markers don't cut it off.
    const found = extractNumber(text.slice(end, stop), language);
    if (!found) {
      absorb(text.slice(start, stop), false);
      return;
    }
    const numberEnd = end + found.end;
    const value = Math.round(found.value * 10) / 10;
    if (inRange(value)) measurements[anchor.key] = value;
    else unrecognised.push(clean(text.slice(start, numberEnd)));
    absorb(text.slice(numberEnd, stop), false);
  });

  const postureNote = posture.map(sentence).filter(Boolean).join(" ");
  return { measurements, postureNote: postureNote || null, unrecognised };
}

/** True when the parser found nothing to show — the cue to ask the API's parser instead. */
export function heardNothing(result: ParsedMeasurements): boolean {
  return Object.keys(result.measurements).length === 0 && !result.postureNote;
}

/**
 * Folds the API's reading (POST /ai/parse-measurements) into the local one: AI values fill only the garment's keys
 * the local parser left empty and that sit in range; the local posture note wins; the AI's leftovers replace the
 * local ones because it saw the whole transcript.
 */
export function mergeParsedMeasurements(local: ParsedMeasurements, ai: ParsedMeasurements, garmentType: GarmentType): ParsedMeasurements {
  const measurements: Partial<Measurements> = { ...local.measurements };
  for (const { key } of fieldsFor(garmentType)) {
    if (measurements[key] !== null && measurements[key] !== undefined) continue;
    const value = ai.measurements[key];
    if (typeof value === "number" && Number.isFinite(value) && inRange(value)) measurements[key] = Math.round(value * 10) / 10;
  }
  const aiNote = ai.postureNote?.trim() || null;
  return {
    measurements,
    postureNote: local.postureNote ?? aiNote,
    unrecognised: Array.isArray(ai.unrecognised) ? ai.unrecognised.filter((u) => typeof u === "string" && u.trim()) : [],
  };
}

// ---------- Guided dictation (the sheet names the field, the tailor says only the number) ----------

/**
 * Every number in one utterance, in order: "one oh two" → [102], "102, 88, 100" → [102, 88, 100] (a quick tailor
 * can give the next fields in one breath). Inches are converted; values outside MEASUREMENT_RANGE are dropped.
 */
export function parseSpokenNumbers(transcript: string, language: DictationLanguage = "en"): number[] {
  let text = normalise(transcript);
  const values: number[] = [];
  while (text) {
    const found = extractNumber(text, language);
    if (!found || found.end <= 0) break;
    const value = Math.round(found.value * 10) / 10;
    if (inRange(value)) values.push(value);
    text = text.slice(found.end).trim();
  }
  return values;
}

export type VoiceCommand = "skip" | "back" | "done";

const COMMANDS: readonly [VoiceCommand, RegExp][] = [
  ["done", /\b(?:done|finish|finished|stop|that's all|that is all|enough)\b|เสร็จ|พอแล้ว|จบ/],
  ["back", /\b(?:back|previous|undo)\b|ย้อน|กลับ|ก่อนหน้า/],
  ["skip", /\b(?:skip|next|pass|nothing|none)\b|ข้าม|ถัดไป|ไม่มี/],
];

/** A spoken command instead of a number; null when the utterance carries a number (the number always wins). */
export function parseVoiceCommand(transcript: string, language: DictationLanguage = "en"): VoiceCommand | null {
  const text = transcript.toLowerCase();
  if (!text.trim() || parseSpokenNumbers(text, language).length > 0) return null;
  for (const [command, re] of COMMANDS) if (re.test(text)) return command;
  return null;
}

/** A dictated posture remark as one tidy sentence, or null when nothing useful was said. */
export function cleanNote(transcript: string): string | null {
  const note = sentence(transcript.replace(/[|]/g, " "));
  return note || null;
}
