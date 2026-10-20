import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { GarmentType } from "@shared/types";

import { fieldsFor, formatCm } from "@/components/clients/measurements";
import { Button, Card, Eyebrow, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDuration } from "@/lib/format";
import { heardNothing, type ParsedMeasurements } from "@/lib/measurementParser";

export interface VoiceReviewCardProps {
  garmentType: GarmentType;
  result: ParsedMeasurements;
  durationMs: number;
  onFill: () => void;
  onRetry: () => void;
}

/** "We heard": one row per field of the garment, the posture note, and Fill the form / Record again. */
export function VoiceReviewCard({ garmentType, result, durationMs, onFill, onRetry }: VoiceReviewCardProps) {
  const nothing = heardNothing(result);
  const duration = formatDuration(durationMs / 1000);

  return (
    <Card style={styles.card} testID="voice-review">
      <SectionTitle title="We heard" right={duration ? <Text style={typography.small}>{duration}</Text> : null} style={styles.title} />

      <View style={styles.rows}>
        {fieldsFor(garmentType).map(({ key, label }) => {
          const value = result.measurements[key];
          const heard = typeof value === "number" ? formatCm(value) : null;
          return (
            <View key={key} style={styles.row} accessibilityLabel={`${label}: ${heard ?? "not mentioned"}`}>
              <View style={[styles.tile, heard ? styles.tileHeard : styles.tileMissing]}>
                <Ionicons name={heard ? "checkmark" : "time-outline"} size={16} color={heard ? colors.successFg : colors.muted} />
              </View>
              <Text style={styles.label}>{label}</Text>
              {heard ? <Text style={styles.value}>{heard}</Text> : <Text style={styles.missing}>not mentioned</Text>}
            </View>
          );
        })}
      </View>

      {result.postureNote ? (
        <View style={styles.note}>
          <Eyebrow tone="muted">Posture note</Eyebrow>
          <Text style={typography.body}>{result.postureNote}</Text>
        </View>
      ) : null}

      {result.unrecognised.length > 0 ? (
        <Text style={typography.small}>Couldn’t read: {result.unrecognised.map((chunk) => `“${chunk}”`).join(", ")}</Text>
      ) : null}
      {nothing ? <Text style={typography.small}>No measurement names were recognised. Try again, one measurement at a time.</Text> : null}

      <View style={styles.actions}>
        <Button title="Fill the form" variant="gold" icon="create-outline" onPress={onFill} disabled={nothing} testID="voice-fill" />
        <Button title="Record again" variant="secondary" icon="mic-outline" onPress={onRetry} testID="voice-retry" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { marginBottom: 0 },
  rows: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  tile: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tileHeard: { backgroundColor: colors.successBg },
  tileMissing: { backgroundColor: colors.cardSoft, borderWidth: 1, borderColor: colors.line },
  label: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  value: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 26, color: colors.ink },
  missing: typography.small,
  note: { backgroundColor: colors.cardSoft, borderRadius: 12, padding: 12, gap: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
