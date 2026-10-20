// The phone's own speech recognition (expo-speech-recognition → SFSpeechRecognizer on iOS, SpeechRecognizer on
// Android). Audio never leaves the device through the app; the recogniser hands back text. The native module isn't
// in Expo Go and importing the package there throws, so it's loaded lazily behind a try/catch: `isSpeechAvailable()`
// is then false and the dictation UI stays hidden instead of crashing.
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as SecureStore from "expo-secure-store";

export type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;

/** The recogniser locales the dictation sheet offers. */
export type DictationLocale = "en-US" | "th-TH";

export const DICTATION_LOCALES: readonly { locale: DictationLocale; label: string }[] = [
  { locale: "en-US", label: "EN" },
  { locale: "th-TH", label: "TH" },
];

const LOCALE_KEY = "tls.dictation.locale";
const MODE_KEY = "tls.dictation.mode";

/** guided = the sheet names each field and the tailor says only the number; free = one long dictation parsed afterwards. */
export type DictationMode = "guided" | "free";

let cached: SpeechModule | null | undefined;

/** The native module, or null in Expo Go, on a device without a recogniser, or when the module failed to load. */
export function getSpeechModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import throws in Expo Go (no native module)
      const mod = require("expo-speech-recognition") as typeof import("expo-speech-recognition");
      if (mod.ExpoSpeechRecognitionModule.isRecognitionAvailable()) cached = mod.ExpoSpeechRecognitionModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function isSpeechAvailable(): boolean {
  return getSpeechModule() !== null;
}

/** The locale picked last time (EN unless the owner chose TH). */
export async function loadDictationLocale(): Promise<DictationLocale> {
  try {
    const value = await SecureStore.getItemAsync(LOCALE_KEY);
    return value === "th-TH" ? "th-TH" : "en-US";
  } catch {
    return "en-US";
  }
}

export async function saveDictationLocale(locale: DictationLocale): Promise<void> {
  try {
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
  } catch {
    // Remembering the choice is a convenience; dictation still works.
  }
}

/** The dictation mode picked last time (guided unless the owner switched). */
export async function loadDictationMode(): Promise<DictationMode> {
  try {
    const value = await SecureStore.getItemAsync(MODE_KEY);
    return value === "free" ? "free" : "guided";
  } catch {
    return "guided";
  }
}

export async function saveDictationMode(mode: DictationMode): Promise<void> {
  try {
    await SecureStore.setItemAsync(MODE_KEY, mode);
  } catch {
    // A convenience only.
  }
}

/** "en-US" → "en", the API's language hint. */
export function dictationLanguage(locale: DictationLocale): "en" | "th" {
  return locale === "th-TH" ? "th" : "en";
}
