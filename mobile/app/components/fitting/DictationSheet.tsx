// Bottom sheet that listens while the tailor reads the tape. Two modes:
//  - guided (default): the sheet names one field at a time and the tailor says only the number. Each utterance is
//    its own recognition session (non-continuous), so every final result is one answer: it ticks the field, moves
//    to the next, and ends with "Posture notes?". "skip" / "back" / "done" work by voice; chips jump to a field.
//  - free: one long dictation ("chest 102, waist 88…"), handed back as a transcript for the parser.
// Recognition runs on the phone (lib/speech.ts); this component renders, keeps the session alive and hands the
// outcome back — the New-fitting screen turns it into the review card.
import { Ionicons } from "@expo/vector-icons";
import type { ExpoSpeechRecognitionErrorEvent } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GarmentType, Measurements } from "@shared/types";

import { fieldsFor, type MeasurementField } from "@/components/clients/measurements";
import { Button } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { cleanNote, parseSpokenNumbers, parseVoiceCommand } from "@/lib/measurementParser";
import { DICTATION_LOCALES, dictationLanguage, getSpeechModule, type DictationLocale, type DictationMode } from "@/lib/speech";

/** What the sheet hands back on Done. */
export type DictationOutcome =
  | { mode: "free"; transcript: string }
  | { mode: "guided"; measurements: Partial<Measurements>; postureNote: string | null; transcript: string };

export interface DictationSheetProps {
  visible: boolean;
  garmentType: GarmentType;
  locale: DictationLocale;
  onLocaleChange: (locale: DictationLocale) => void;
  mode: DictationMode;
  onModeChange: (mode: DictationMode) => void;
  /** Called once after Done (or when the guided flow completes) with everything heard and how long it ran. */
  onDone: (outcome: DictationOutcome, durationMs: number) => void;
  onCancel: () => void;
}

type Phase = "starting" | "listening" | "stopping" | "error";

const TITLES: Record<Phase, string> = { starting: "Getting ready…", listening: "Listening", stopping: "Finishing…", error: "Paused" };
const PLACEHOLDERS: Record<DictationLocale, string> = {
  "en-US": "“Chest one-oh-two, waist eighty-eight…”",
  "th-TH": "“รอบอก ร้อยสอง รอบเอว แปดสิบแปด…”",
};
const SAY_NUMBER: Record<DictationLocale, string> = { "en-US": "Say the number", "th-TH": "พูดตัวเลข" };
const SAY_NOTE: Record<DictationLocale, string> = { "en-US": "Say a sentence, or “skip”", "th-TH": "พูดหนึ่งประโยค หรือ “ข้าม”" };

const BAR_COUNT = 28;
const BAR_MIN = 4;
const BAR_RANGE = 48;
// A gentle arc so the bars read as a waveform rather than a bar chart.
const PROFILE = Array.from({ length: BAR_COUNT }, (_, i) => 0.35 + 0.65 * Math.sin((i / (BAR_COUNT - 1)) * Math.PI));
/** How long to wait for the recogniser's final result after stop() before using what we have. */
const END_TIMEOUT_MS = 1500;
/** With no volume events for this long, the bars pulse on their own (some Android recognisers don't meter). */
const IDLE_AFTER_MS = 700;
/** Non-continuous recognisers stop after each pause; we restart them, but not forever. Guided mode ends a session per answer. */
const MAX_RESTARTS: Record<DictationMode, number> = { free: 20, guided: 150 };

function describeError(event: ExpoSpeechRecognitionErrorEvent): string {
  switch (event.error) {
    case "not-allowed":
      return "Allow the microphone and speech recognition for Magick Tailor in Settings, then try again.";
    case "network":
      return "Speech recognition on this phone needs a connection right now.";
    case "language-not-supported":
      return "This language isn't available on this phone.";
    case "audio-capture":
      return "The microphone couldn't be used. Close other apps that record audio and try again.";
    default:
      return event.message || "Speech recognition stopped.";
  }
}

export function DictationSheet({ visible, garmentType, locale, onLocaleChange, mode, onModeChange, onDone, onCancel }: DictationSheetProps) {
  const speech = getSpeechModule();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  // Guided mode: which field is being asked (fields.length = the posture step), the answers so far, a one-line reaction.
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Partial<Measurements>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(BAR_MIN))).current;
  const scrollRef = useRef<ScrollView>(null);

  // Event listeners and timers read these instead of state so they never see a stale closure.
  const phaseRef = useRef<Phase>("starting");
  const finals = useRef<string[]>([]);
  const interimRef = useRef("");
  const startedAt = useRef(0);
  const doneRef = useRef(false);
  const finishedRef = useRef(false);
  const switchingRef = useRef(false);
  const restarts = useRef(0);
  const lastVolumeAt = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localeRef = useRef(locale);
  const modeRef = useRef(mode);
  const fieldsRef = useRef<readonly MeasurementField[]>(fieldsFor(garmentType));
  const stepRef = useRef(0);
  const valuesRef = useRef<Partial<Measurements>>({});
  const noteRef = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    localeRef.current = locale;
    modeRef.current = mode;
    fieldsRef.current = fieldsFor(garmentType);
    onDoneRef.current = onDone;
    onCancelRef.current = onCancel;
  });

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const animateBars = useCallback(
    (level: number) => {
      Animated.parallel(
        bars.map((bar, i) =>
          Animated.timing(bar, {
            toValue: BAR_MIN + level * BAR_RANGE * PROFILE[i] * (0.7 + Math.random() * 0.3),
            duration: 90,
            useNativeDriver: false,
          }),
        ),
      ).start();
    },
    [bars],
  );

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
    }
    const transcript = [...finals.current, interimRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const elapsed = Date.now() - startedAt.current;
    if (modeRef.current === "guided") {
      onDoneRef.current({ mode: "guided", measurements: { ...valuesRef.current }, postureNote: noteRef.current, transcript }, elapsed);
    } else {
      onDoneRef.current({ mode: "free", transcript }, elapsed);
    }
  }, []);

  const begin = useCallback(
    async (lang: DictationLocale, restart = false) => {
      if (!speech) return;
      setError(null);
      if (!restart) go("starting");
      try {
        const permission = await speech.requestPermissionsAsync();
        if (doneRef.current) return;
        if (!permission.granted) {
          go("error");
          setError("Allow the microphone and speech recognition for Magick Tailor in Settings, then try again.");
          return;
        }
        speech.start({
          lang,
          interimResults: true,
          // Guided mode wants one final result per answer, so each utterance is its own session.
          continuous: modeRef.current === "free",
          iosTaskHint: "dictation",
          contextualStrings: fieldsRef.current.map((f) => f.label),
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        });
      } catch (err) {
        go("error");
        setError(err instanceof Error && err.message ? err.message : "Speech recognition couldn't start.");
      }
    },
    [speech, go],
  );
  const beginRef = useRef(begin);
  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const resetGuided = useCallback(() => {
    stepRef.current = 0;
    valuesRef.current = {};
    noteRef.current = null;
    setStep(0);
    setValues({});
    setFeedback(null);
  }, []);

  const setStepTo = useCallback((next: number) => {
    stepRef.current = next;
    setStep(next);
  }, []);

  /** Stops the recogniser and hands the outcome back (Done button, "done" by voice, or the posture step answered). */
  const done = useCallback(() => {
    if (!speech || doneRef.current) return;
    doneRef.current = true;
    if (phaseRef.current === "error" || phaseRef.current === "starting") {
      finish();
      return;
    }
    go("stopping");
    try {
      speech.stop();
    } catch {
      finish();
      return;
    }
    endTimer.current = setTimeout(finish, END_TIMEOUT_MS);
  }, [speech, go, finish]);

  /** One answer in guided mode: a command, a number (or several), or a posture sentence on the last step. */
  const handleGuided = useCallback(
    (text: string) => {
      const fields = fieldsRef.current;
      const idx = stepRef.current;
      const language = dictationLanguage(localeRef.current);
      const command = parseVoiceCommand(text, language);

      if (idx >= fields.length) {
        if (command !== "skip" && command !== "done") noteRef.current = cleanNote(text);
        done();
        return;
      }
      const field = fields[idx];
      if (command === "done") {
        done();
        return;
      }
      if (command === "skip") {
        setFeedback(`${field.label} skipped`);
        setStepTo(idx + 1);
        return;
      }
      if (command === "back") {
        const prev = Math.max(0, idx - 1);
        setFeedback(`Back to ${fields[prev].label}`);
        setStepTo(prev);
        return;
      }
      const numbers = parseSpokenNumbers(text, language);
      if (numbers.length === 0) {
        setFeedback(`Heard “${text}” — say the number again, or “skip”`);
        return;
      }
      const next = { ...valuesRef.current };
      let i = idx;
      for (const value of numbers) {
        if (i >= fields.length) break;
        next[fields[i].key] = value;
        i += 1;
      }
      valuesRef.current = next;
      setValues(next);
      setFeedback(numbers.length === 1 ? `${field.label}: ${numbers[0]} cm` : `${fields.slice(idx, i).map((f) => f.label).join(", ")} filled`);
      setStepTo(i);
    },
    [done, setStepTo],
  );

  // Open: reset, slide up, start listening. Close (or unmount): stop listening, slide down, then unmount the Modal.
  useEffect(() => {
    if (!visible) return;
    finals.current = [];
    interimRef.current = "";
    startedAt.current = Date.now();
    doneRef.current = false;
    finishedRef.current = false;
    switchingRef.current = false;
    restarts.current = 0;
    lastVolumeAt.current = 0;
    setFinalText("");
    setInterim("");
    setError(null);
    resetGuided();
    setMounted(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    void beginRef.current(localeRef.current);
    return () => {
      doneRef.current = true;
      try {
        speech?.abort();
      } catch {
        // not running
      }
      Animated.timing(progress, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    };
  }, [visible, progress, speech, resetGuided]);

  useEffect(() => {
    if (!speech || !mounted) return;
    const subscriptions = [
      speech.addListener("start", () => go("listening")),
      speech.addListener("result", (event) => {
        const text = event.results[0]?.transcript?.trim() ?? "";
        if (event.isFinal) {
          // iOS: one cumulative final at the end of a session. Android continuous: one final per segment. Either way
          // a guided session is one answer, so the text goes straight to the step logic.
          if (text) finals.current.push(text);
          interimRef.current = "";
          setFinalText(finals.current.join(" "));
          setInterim("");
          if (text && modeRef.current === "guided" && !doneRef.current) handleGuided(text);
        } else {
          interimRef.current = text;
          setInterim(text);
        }
      }),
      speech.addListener("volumechange", (event) => {
        lastVolumeAt.current = Date.now();
        animateBars(Math.max(0, Math.min(1, event.value / 10)));
      }),
      speech.addListener("error", (event) => {
        // "aborted" is our own abort(); silence just ends the session and "end" picks it up again.
        if (event.error === "aborted" || event.error === "no-speech" || event.error === "speech-timeout") return;
        go("error");
        setError(describeError(event));
      }),
      speech.addListener("end", () => {
        if (doneRef.current) {
          finish();
          return;
        }
        if (switchingRef.current || phaseRef.current === "error") return;
        if (restarts.current >= MAX_RESTARTS[modeRef.current]) {
          go("error");
          setError("The recogniser keeps stopping. Tap Done to use what was heard.");
          return;
        }
        restarts.current += 1;
        setTimeout(() => {
          if (!doneRef.current && !switchingRef.current) void beginRef.current(localeRef.current, true);
        }, 300);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [speech, mounted, go, animateBars, finish, handleGuided]);

  // Gentle pulse while listening if the recogniser isn't metering the volume.
  useEffect(() => {
    if (!mounted || phase !== "listening") return;
    const timer = setInterval(() => {
      if (Date.now() - lastVolumeAt.current > IDLE_AFTER_MS) animateBars(0.1 + Math.random() * 0.12);
    }, 320);
    return () => clearInterval(timer);
  }, [mounted, phase, animateBars]);

  useEffect(() => {
    if (!mounted) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mounted, pulse]);

  const cancel = () => {
    finishedRef.current = true;
    doneRef.current = true;
    onCancelRef.current();
  };

  /** Restart the recogniser (new language or mode); what was already final is kept. */
  const restartSession = (lang: DictationLocale) => {
    if (!speech) return;
    switchingRef.current = true;
    interimRef.current = "";
    setInterim("");
    try {
      speech.abort();
    } catch {
      // not running
    }
    setTimeout(() => {
      switchingRef.current = false;
      if (!doneRef.current) void beginRef.current(lang);
    }, 350);
  };

  const switchLocale = (next: DictationLocale) => {
    if (next === locale || doneRef.current) return;
    onLocaleChange(next);
    localeRef.current = next;
    restartSession(next);
  };

  const switchMode = (next: DictationMode) => {
    if (next === mode || doneRef.current) return;
    onModeChange(next);
    modeRef.current = next;
    resetGuided();
    restartSession(localeRef.current);
  };

  const jump = (index: number) => {
    if (doneRef.current) return;
    setFeedback(null);
    setStepTo(index);
  };

  if (!speech) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });
  const hasTranscript = !!(finalText || interim);
  const fields = fieldsFor(garmentType);
  const guided = mode === "guided";
  const postureStep = step >= fields.length;
  const current = postureStep ? null : fields[step];
  const currentValue = current ? values[current.key] : undefined;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={cancel}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.flex} onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel dictation" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]} testID="dictation-sheet">
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.status}>
              <Animated.View style={[styles.dot, { opacity: phase === "listening" ? pulse : 0.45 }]} />
              <Text style={styles.title}>{TITLES[phase]}</Text>
            </View>
            <View style={styles.langs} accessibilityRole="radiogroup">
              {DICTATION_LOCALES.map(({ locale: option, label }) => {
                const selected = option === locale;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={option === "th-TH" ? "Thai" : "English"}
                    onPress={() => switchLocale(option)}
                    style={[styles.lang, selected && styles.langSelected]}
                  >
                    <Text style={[styles.langText, selected && styles.langTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {bars.map((height, i) => (
              <Animated.View key={i} style={[styles.bar, { height }]} />
            ))}
          </View>

          {guided ? (
            <View style={styles.guided}>
              <ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
                {fields.map((field, i) => {
                  const value = values[field.key];
                  const isCurrent = i === step;
                  return (
                    <Pressable
                      key={field.key}
                      onPress={() => jump(i)}
                      accessibilityRole="button"
                      accessibilityLabel={value != null ? `${field.label}, ${value} centimetres` : field.label}
                      accessibilityState={{ selected: isCurrent }}
                      style={[styles.stepChip, value != null && styles.stepChipDone, isCurrent && styles.stepChipCurrent]}
                    >
                      <Text style={[styles.stepChipText, isCurrent && styles.stepChipTextCurrent]} numberOfLines={1}>
                        {value != null ? `${field.label} ${value}` : field.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => jump(fields.length)}
                  accessibilityRole="button"
                  accessibilityLabel="Posture notes"
                  accessibilityState={{ selected: postureStep }}
                  style={[styles.stepChip, postureStep && styles.stepChipCurrent]}
                >
                  <Text style={[styles.stepChipText, postureStep && styles.stepChipTextCurrent]}>Posture</Text>
                </Pressable>
              </ScrollView>
              <View style={styles.prompt} accessibilityLiveRegion="polite">
                <Text style={styles.promptEyebrow}>{postureStep ? "Last step" : `${step + 1} of ${fields.length}`}</Text>
                <Text style={styles.promptLabel}>{postureStep ? "Posture notes?" : current?.label}</Text>
                <Text style={[styles.promptValue, !interim && currentValue == null && styles.promptPlaceholder]} numberOfLines={2}>
                  {interim ? interim : currentValue != null ? `${currentValue} cm` : postureStep ? SAY_NOTE[locale] : SAY_NUMBER[locale]}
                </Text>
                {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
              </View>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.transcriptBox}
              contentContainerStyle={styles.transcriptContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {hasTranscript ? (
                <Text style={styles.transcript} accessibilityLiveRegion="polite">
                  {finalText}
                  {finalText && interim ? " " : ""}
                  <Text style={styles.interim}>{interim}</Text>
                </Text>
              ) : (
                <Text style={styles.placeholder}>{PLACEHOLDERS[locale]}</Text>
              )}
            </ScrollView>
          )}

          <View style={styles.hintRow}>
            <Text style={styles.hint}>
              {guided ? "One field at a time: say the number in centimetres. “Skip”, “back” and “done” work too." : "Say the measurement name and the number in centimetres. Posture notes are kept as text."}
            </Text>
            <Pressable onPress={() => switchMode(guided ? "free" : "guided")} hitSlop={6} accessibilityRole="button" disabled={phase === "stopping"}>
              <Text style={styles.modeLink}>{guided ? "Say everything at once" : "One field at a time"}</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={colors.dangerDeep} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button title="Done" variant="gold" icon="checkmark" onPress={done} loading={phase === "stopping"} style={styles.done} testID="dictation-done" />
            <Button title="Cancel" variant="onDark" onPress={cancel} disabled={phase === "stopping"} testID="dictation-cancel" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  flex: { flex: 1 },
  backdrop: { backgroundColor: "rgba(20, 33, 58, 0.55)" },
  sheet: {
    backgroundColor: colors.navy,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ivoryLine, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  title: { ...typography.h3, color: colors.ivory },
  langs: { flexDirection: "row", gap: 6 },
  lang: { minHeight: 32, paddingHorizontal: 14, justifyContent: "center", borderRadius: radii.chip, borderWidth: 1, borderColor: colors.ivoryLine },
  langSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  langText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ivory },
  langTextSelected: { color: colors.navy },
  wave: { height: BAR_MIN + BAR_RANGE + 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.gold },
  guided: { gap: 12 },
  steps: { gap: 6, paddingVertical: 2 },
  stepChip: { minHeight: 32, paddingHorizontal: 12, justifyContent: "center", borderRadius: radii.chip, borderWidth: 1, borderColor: colors.ivoryLine },
  stepChipDone: { backgroundColor: "rgba(244, 239, 230, 0.12)" },
  stepChipCurrent: { backgroundColor: colors.gold, borderColor: colors.gold },
  stepChipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ivory },
  stepChipTextCurrent: { color: colors.navy },
  prompt: {
    minHeight: 132,
    borderRadius: radii.field,
    backgroundColor: "rgba(244, 239, 230, 0.06)",
    borderWidth: 1,
    borderColor: colors.ivoryLine,
    padding: 14,
    gap: 4,
  },
  promptEyebrow: { ...typography.eyebrow, color: colors.gold },
  promptLabel: { fontFamily: fonts.serifSemi, fontSize: 32, lineHeight: 36, color: colors.ivory },
  promptValue: { fontFamily: fonts.serifSemi, fontSize: 26, lineHeight: 32, color: colors.gold },
  promptPlaceholder: { color: colors.ivoryLine },
  feedback: { ...typography.small, color: colors.ivorySoft, marginTop: 2 },
  transcriptBox: {
    maxHeight: 160,
    minHeight: 72,
    borderRadius: radii.field,
    backgroundColor: "rgba(244, 239, 230, 0.06)",
    borderWidth: 1,
    borderColor: colors.ivoryLine,
  },
  transcriptContent: { padding: 14 },
  transcript: { fontFamily: fonts.serifSemi, fontSize: 22, lineHeight: 30, color: colors.ivory },
  interim: { color: colors.ivorySoft },
  placeholder: { fontFamily: fonts.serifSemi, fontSize: 22, lineHeight: 30, color: colors.ivoryLine },
  hintRow: { gap: 6 },
  hint: { ...typography.small, color: colors.ivorySoft },
  modeLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.gold },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.dangerDeep },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  done: { flex: 1 },
});
