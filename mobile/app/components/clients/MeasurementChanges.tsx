// "Changes since last fitting" on the fitting screen: one row per measurement recorded in both fittings (previous →
// new, with the delta as a tag), then the dark "Fit note" card with the rule-based summary for the cutter.
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Fitting } from "@shared/types";

import { Card, Eyebrow } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";

import { compareMeasurements, deltaTone, fitNote, formatDelta, type DeltaTone } from "./measurementHistory";
import { formatCm, garmentLabel } from "./measurements";
import { Tag, type TagTone } from "./Tag";

const DELTA_TONES: Record<DeltaTone, TagTone> = {
  up: "warning",
  down: "success",
  same: "neutral",
};

export interface MeasurementChangesProps {
  fitting: Fitting;
  /** The client's previous fitting of the same garment (see findPreviousFitting). */
  previous: Fitting;
  style?: StyleProp<ViewStyle>;
}

/** Renders nothing when the two fittings share no recorded field. */
export function MeasurementChanges({ fitting, previous, style }: MeasurementChangesProps) {
  const changes = useMemo(() => compareMeasurements(fitting, previous), [fitting, previous]);
  if (changes.length === 0) return null;
  const since = formatDate(previous.createdAt);
  return (
    <>
      <Card style={[styles.card, style]} testID="measurement-changes">
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            Changes since last fitting
          </Text>
          <Text style={typography.small}>{since}</Text>
        </View>
        <View>
          {changes.map((change, index) => (
            <View
              key={change.key}
              style={[styles.row, index < changes.length - 1 && styles.rowBorder]}
              accessibilityLabel={`${change.label}: ${formatCm(change.previous)} to ${formatCm(change.current)}, ${formatDelta(change.delta)}`}
            >
              <Text style={styles.label} numberOfLines={1}>
                {change.label}
              </Text>
              <Text style={styles.previous}>{formatCm(change.previous)}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              <Text style={styles.current}>{formatCm(change.current)}</Text>
              <Tag label={formatDelta(change.delta)} tone={DELTA_TONES[deltaTone(change.delta)]} style={styles.tag} />
            </View>
          ))}
        </View>
        <Text style={typography.small}>Compared with the previous {garmentLabel(fitting.garmentType).toLowerCase()} fitting.</Text>
      </Card>

      <Card variant="dark" style={styles.noteCard} testID="fit-note">
        <Eyebrow tone="onDark">Fit note</Eyebrow>
        <Text style={styles.note}>{fitNote(fitting.garmentType, changes, since)}</Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  title: { ...typography.h3, flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingVertical: 6 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  label: { ...typography.label, flex: 1, minWidth: 0 },
  previous: { ...typography.small, fontVariant: ["tabular-nums"] },
  current: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 22, color: colors.ink, fontVariant: ["tabular-nums"] },
  tag: { minWidth: 52, justifyContent: "center" },
  noteCard: { gap: 8 },
  note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ivorySoft },
});
