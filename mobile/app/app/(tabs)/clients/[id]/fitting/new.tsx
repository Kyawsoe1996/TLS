import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GARMENT_TYPES, type CreateFittingRequest, type Fitting, type GarmentType, type Measurements } from "@shared/types";

import {
  EMPTY_MEASUREMENTS,
  GARMENT_LABELS,
  afterFittingCreated,
  analyseKeysLabel,
  analyseRequirement,
  cacheFitting,
  canAnalyse,
  clientRoutes,
  fieldsFor,
  measurementsTitle,
  pickMeasurements,
  showAiError,
  useClient,
  type MeasurementKey,
} from "@/components/clients";
import { DictateRow, DictationSheet, VoiceReviewCard, type DictationOutcome } from "@/components/fitting";
import { Button, Card, Chip, ErrorBanner, Eyebrow, Field, LoadingAI, NumberField, Screen, SectionTitle } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { heardNothing, mergeParsedMeasurements, parseMeasurements, type ParsedMeasurements } from "@/lib/measurementParser";
import {
  dictationLanguage,
  isSpeechAvailable,
  loadDictationLocale,
  loadDictationMode,
  saveDictationLocale,
  saveDictationMode,
  type DictationLocale,
  type DictationMode,
} from "@/lib/speech";
import { showError, showToast } from "@/lib/toast";
import { useAiConsent } from "@/lib/useAiConsent";

const STYLE_PRESETS = ["Slim-cut corporate", "Classic business", "Casual linen", "Wedding"] as const;
const CUSTOM_STYLE = "Custom";
const FABRIC_SUGGESTIONS = ["Super 130s navy wool", "Irish linen", "Charcoal flannel"] as const;

type Phase = "idle" | "saving" | "analysing";

interface VoiceResult {
  result: ParsedMeasurements;
  durationMs: number;
}

// False in Expo Go and on phones without a recogniser: the dictation row is simply not shown.
const speechAvailable = isSpeechAvailable();

/** Manual fitting entry. The garment picks the measurement set; "Save & analyse" runs POST /ai/fit right after saving. */
export default function NewFittingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);

  const [garmentType, setGarmentType] = useState<GarmentType>("jacket");
  const [styleChoice, setStyleChoice] = useState<string>(STYLE_PRESETS[0]);
  const [customStyle, setCustomStyle] = useState("");
  const [fabric, setFabric] = useState("");
  // Every key is kept while the user switches garments; only the chosen garment's keys are sent.
  const [measurements, setMeasurements] = useState<Measurements>(EMPTY_MEASUREMENTS);
  const [postureNote, setPostureNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  // Voice dictation: the sheet hands back a transcript, the parser turns it into a review card, "Fill the form"
  // writes the values into the fields below (marked as from voice until they're edited). Nothing is saved until Save.
  const [dictating, setDictating] = useState(false);
  const [locale, setLocale] = useState<DictationLocale>("en-US");
  const [dictationMode, setDictationMode] = useState<DictationMode>("guided");
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const [voiceKeys, setVoiceKeys] = useState<readonly MeasurementKey[]>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!speechAvailable) return;
    let alive = true;
    void loadDictationLocale().then((saved) => {
      if (alive) setLocale(saved);
    });
    void loadDictationMode().then((saved) => {
      if (alive) setDictationMode(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const fields = fieldsFor(garmentType);
  const analysable = canAnalyse(garmentType, measurements);
  const requirement = analyseRequirement(garmentType);

  const setMeasurement = (key: MeasurementKey, value: number | null) => {
    setMeasurements((m) => ({ ...m, [key]: value }));
    // Once the tailor types in a field it's theirs, not the recording's.
    setVoiceKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : keys));
  };

  const changeGarment = (next: GarmentType) => {
    setGarmentType(next);
    // The review was parsed against the previous garment's fields.
    setVoice(null);
    setVoiceKeys([]);
  };

  const changeLocale = (next: DictationLocale) => {
    setLocale(next);
    void saveDictationLocale(next);
  };

  const mutation = useMutation({
    mutationFn: async ({ body, analyse }: { body: CreateFittingRequest; analyse: boolean }): Promise<Fitting> => {
      setPhase("saving");
      const { fitting } = await api.createFitting(id, body);
      afterFittingCreated(queryClient, fitting);
      if (!analyse) return fitting;

      setPhase("analysing");
      try {
        const res = await api.aiFit({ fittingId: fitting.id });
        cacheFitting(queryClient, res.fitting);
        return res.fitting;
      } catch (err) {
        // The fitting is saved either way; the detail screen offers "Analyse with AI" again.
        showAiError(err, "Saved, but the analysis failed");
        return fitting;
      }
    },
    onSuccess: (fitting) => router.replace(clientRoutes.fitting(id, fitting.id)),
    onError: (err) => showError(err, "Couldn't save fitting"),
    onSettled: () => setPhase("idle"),
  });

  const ensureAiConsent = useAiConsent();
  const submit = async (analyse: boolean) => {
    const style = (styleChoice === CUSTOM_STYLE ? customStyle : styleChoice).trim();
    const fabricText = fabric.trim();
    if (!style) return setError("Name the style — pick one above or describe your own.");
    if (!fabricText) return setError("Add the fabric so the cutter knows what they're working with.");
    if (analyse && !analysable) return setError(requirement);
    setError(null);
    if (analyse && !(await ensureAiConsent())) return;
    mutation.mutate({
      body: {
        garmentType,
        style,
        fabric: fabricText,
        measurements: pickMeasurements(garmentType, measurements),
        postureNote: postureNote.trim() || undefined,
      },
      analyse,
    });
  };

  /**
   * After Done on the sheet: parse on the phone; if that read nothing or left chunks unread, ask the API's parser
   * (with the AI consent prompt if it hasn't been given) and let it fill only what's still empty.
   */
  const onDictated = async (outcome: DictationOutcome, durationMs: number) => {
    setDictating(false);
    if (outcome.mode === "guided") {
      // Already numbers, field by field: nothing to parse and no AI involved.
      if (Object.keys(outcome.measurements).length === 0 && !outcome.postureNote) {
        showToast("Nothing heard", "Say each number after the field name, one at a time.");
        return;
      }
      setVoice({ result: { measurements: outcome.measurements, postureNote: outcome.postureNote, unrecognised: [] }, durationMs });
      return;
    }
    const text = outcome.transcript.trim();
    if (!text) {
      showToast("Nothing heard", "Try again a little closer to the phone, one measurement at a time.");
      return;
    }
    const language = dictationLanguage(locale);
    let result = parseMeasurements(text, garmentType, language);
    if ((heardNothing(result) || result.unrecognised.length > 0) && (await ensureAiConsent())) {
      setReading(true);
      try {
        const ai = await api.parseMeasurements({ transcript: text, garmentType, language });
        result = mergeParsedMeasurements(result, ai, garmentType);
      } catch (err) {
        showAiError(err, "Couldn't read part of the recording");
      } finally {
        setReading(false);
      }
    }
    setVoice({ result, durationMs });
  };

  const fillFromVoice = () => {
    if (!voice) return;
    const heard = voice.result.measurements;
    const keys = fields.map((f) => f.key).filter((key) => typeof heard[key] === "number");
    setMeasurements((m) => {
      const next = { ...m };
      for (const key of keys) next[key] = heard[key] as number;
      return next;
    });
    setVoiceKeys(keys);
    const note = voice.result.postureNote;
    if (note) setPostureNote((current) => (current.trim() ? `${current.trim()}\n${note}` : note));
    setVoice(null);
  };

  const busy = mutation.isPending;
  const analyseIntent = busy && !!mutation.variables?.analyse;

  return (
    <Screen
      back
      eyebrow={clientQuery.data?.name ?? "Client"}
      title="New fitting"
      keyboard
      // Pinned below the form so both actions stay reachable without scrolling past the measurement grid.
      footer={
        <View style={styles.actions}>
          <Button
            title="Save & analyse with AI"
            icon="sparkles"
            fullWidth
            onPress={() => void submit(true)}
            loading={analyseIntent}
            disabled={busy || !analysable}
          />
          {!analysable ? <Text style={styles.hint}>{requirement}</Text> : null}
          <Button title="Save fitting" variant="secondary" fullWidth onPress={() => void submit(false)} loading={busy && !analyseIntent} disabled={busy} />
        </View>
      }
    >
      <ErrorBanner message={error} />

      {speechAvailable ? <DictateRow onPress={() => setDictating(true)} disabled={busy || reading} /> : null}
      {reading ? <LoadingAI label="Reading the recording…" /> : null}
      {voice ? (
        <VoiceReviewCard
          garmentType={garmentType}
          result={voice.result}
          durationMs={voice.durationMs}
          onFill={fillFromVoice}
          onRetry={() => {
            setVoice(null);
            setDictating(true);
          }}
        />
      ) : null}

      <View style={styles.block}>
        <Eyebrow>Garment</Eyebrow>
        <View style={styles.chips}>
          {GARMENT_TYPES.map((g) => (
            <Chip key={g} label={GARMENT_LABELS[g]} selected={garmentType === g} onPress={() => changeGarment(g)} disabled={busy} testID={`garment-${g}`} />
          ))}
        </View>
        <Text style={typography.small}>The measurement fields change with the garment. Full suit shows jacket and trouser fields together.</Text>
      </View>

      <View style={styles.block}>
        <Eyebrow>Style</Eyebrow>
        <View style={styles.chips}>
          {[...STYLE_PRESETS, CUSTOM_STYLE].map((s) => (
            <Chip key={s} label={s} selected={styleChoice === s} onPress={() => setStyleChoice(s)} disabled={busy} />
          ))}
        </View>
        {styleChoice === CUSTOM_STYLE ? (
          <Field
            value={customStyle}
            onChangeText={setCustomStyle}
            placeholder="e.g. Double-breasted evening"
            autoCapitalize="sentences"
            returnKeyType="next"
            editable={!busy}
            autoFocus
          />
        ) : null}
      </View>

      <View style={styles.block}>
        <Field
          label="Fabric"
          value={fabric}
          onChangeText={setFabric}
          placeholder="e.g. Super 130s navy wool"
          autoCapitalize="sentences"
          returnKeyType="next"
          editable={!busy}
        />
        <View style={styles.chips}>
          {FABRIC_SUGGESTIONS.map((f) => (
            <Chip key={f} label={f} selected={fabric.trim() === f} onPress={() => setFabric(f)} disabled={busy} />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <SectionTitle title={measurementsTitle(garmentType)} right={<Text style={typography.small}>centimetres</Text>} style={styles.sectionTitle} />
        <View style={styles.grid}>
          {fields.map((field) => (
            <NumberField
              key={field.key}
              label={field.label}
              unit="cm"
              value={measurements[field.key]}
              onChangeValue={(v) => setMeasurement(field.key, v)}
              highlight={voiceKeys.includes(field.key)}
              containerStyle={styles.cell}
              editable={!busy}
            />
          ))}
        </View>
        {voiceKeys.length > 0 ? (
          <Text style={typography.small}>Filled from the recording · check before saving</Text>
        ) : (
          <Text style={typography.small}>All optional — {analyseKeysLabel(garmentType)} unlock the AI analysis.</Text>
        )}
      </View>

      <Field
        label="Posture note"
        value={postureNote}
        onChangeText={setPostureNote}
        placeholder="e.g. Right shoulder 1.8 cm low, slight forward head"
        multiline
        editable={!busy}
      />

      <Card variant="soft" style={styles.infoCard}>
        <Ionicons name="bluetooth-outline" size={18} color={colors.goldDark} />
        <Text style={styles.infoText}>Smart tape support is coming. For now, type the numbers from your tape.</Text>
      </Card>

      {phase === "analysing" ? <LoadingAI label="Analysing the fit — about 10 seconds…" /> : null}

      {speechAvailable ? (
        <DictationSheet
          visible={dictating}
          garmentType={garmentType}
          locale={locale}
          onLocaleChange={changeLocale}
          mode={dictationMode}
          onModeChange={(next) => {
            setDictationMode(next);
            void saveDictationMode(next);
          }}
          onDone={(outcome, durationMs) => void onDictated(outcome, durationMs)}
          onCancel={() => setDictating(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionTitle: { marginBottom: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { flexBasis: "47%", flexGrow: 1 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  infoText: { ...typography.small, flex: 1, color: colors.ink },
  actions: { gap: 10 },
  hint: { ...typography.small, textAlign: "center" },
});
