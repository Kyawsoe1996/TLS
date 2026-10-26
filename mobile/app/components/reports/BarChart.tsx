import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { shortMonthLabel } from "@/lib/months";

export interface BarChartProps {
  /** Oldest first, as the API sends them. */
  months: { month: string; ordersDelivered: number }[];
  /** The month being looked at: its bar is gold, the others sand. */
  selected: string;
}

/** Tallest bar, in px. */
const BAR_AREA = 88;
/** So a month with nothing delivered still shows as a sliver. */
const MIN_BAR = 4;

/** Six bars made of plain Views: the value above each bar, the month under it. No chart library. */
export function BarChart({ months, selected }: BarChartProps) {
  const max = Math.max(1, ...months.map((m) => m.ordersDelivered));
  return (
    <View style={styles.chart}>
      {months.map((m) => {
        const height = m.ordersDelivered > 0 ? Math.max(MIN_BAR, Math.round((m.ordersDelivered / max) * BAR_AREA)) : MIN_BAR;
        const isSelected = m.month === selected;
        const label = shortMonthLabel(m.month);
        return (
          <View key={m.month} style={styles.col} accessibilityLabel={`${label}: ${m.ordersDelivered} delivered`}>
            <View style={styles.barArea}>
              <Text style={[styles.value, isSelected && styles.valueSelected]}>{m.ordersDelivered}</Text>
              <View style={[styles.bar, { height }, isSelected ? styles.barSelected : styles.barIdle]} />
            </View>
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  col: { flex: 1, minWidth: 0, alignItems: "center", gap: 6 },
  barArea: { height: BAR_AREA + 20, justifyContent: "flex-end", alignItems: "center", alignSelf: "stretch", gap: 4 },
  bar: { alignSelf: "stretch", maxWidth: 40, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barIdle: { backgroundColor: colors.sand },
  barSelected: { backgroundColor: colors.gold },
  value: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.muted },
  valueSelected: { fontFamily: fonts.bodyBold, color: colors.ink },
  label: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  labelSelected: { fontFamily: fonts.bodySemi, color: colors.ink },
});
