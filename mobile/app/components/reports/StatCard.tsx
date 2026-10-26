import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { Card } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";

/** Colour of the small line under the value: green / red for a month-on-month change, gold for a nudge, muted for a caption. */
export type StatNoteTone = "up" | "down" | "gold" | "muted";
export type StatValueTone = "ink" | "gold" | "danger";

export interface StatCardProps {
  label: string;
  /** Already formatted; "—" while loading. */
  value: string;
  note?: string;
  noteTone?: StatNoteTone;
  valueTone?: StatValueTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const noteColor: Record<StatNoteTone, string> = {
  up: colors.successFg,
  down: colors.dangerDeep,
  gold: colors.goldDark,
  muted: colors.muted,
};

const valueColor: Record<StatValueTone, string> = {
  ink: colors.ink,
  gold: colors.goldDark,
  danger: colors.danger,
};

/** One figure of the month: small label, big serif value, a line underneath. Two of these make a grid row. */
export function StatCard({ label, value, note, noteTone = "muted", valueTone = "ink", style, testID }: StatCardProps) {
  return (
    <Card padding={14} style={[styles.card, style]} testID={testID}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.value, { color: valueColor[valueTone] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={[styles.note, { color: noteColor[noteTone] }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, gap: 4 },
  label: { ...typography.small, fontFamily: fonts.bodyMedium, color: colors.muted },
  value: typography.kpi,
  note: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
});
