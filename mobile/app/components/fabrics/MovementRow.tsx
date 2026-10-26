import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { FabricMovement } from "@shared/types";

import { colors, fonts, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";

import { formatSignedMetres, movementLine } from "./helpers";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface MovementRowProps {
  movement: FabricMovement;
  style?: StyleProp<ViewStyle>;
}

/**
 * One line of a bolt's history: a day block (month over the day number, like the agenda rows), what happened
 * ("Marcus Lindqvist · two-piece suit / Cutting started", "Received", "Count corrected") and the signed metres.
 */
export function MovementRow({ movement, style }: MovementRowProps) {
  const at = new Date(movement.createdAt);
  const { title, detail } = movementLine(movement);
  const positive = movement.metres > 0;
  return (
    <View style={[styles.row, style]} accessibilityLabel={`${formatDate(movement.createdAt)}: ${title}, ${formatSignedMetres(movement.metres)}`}>
      <View style={styles.date}>
        <Text style={styles.month}>{MONTHS[at.getMonth()] ?? ""}</Text>
        <Text style={styles.day}>{at.getDate()}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text style={typography.small} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.metres, positive ? styles.plus : styles.minus]} numberOfLines={1}>
        {formatSignedMetres(movement.metres)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  date: { width: 40, alignItems: "center" },
  month: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  day: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 24, color: colors.navy },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  metres: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 24, textAlign: "right" },
  plus: { color: colors.successFg },
  minus: { color: colors.danger },
});
