import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, typography } from "@/constants/theme";

import { Card } from "./Card";
import type { IoniconName } from "./Button";

export interface KpiListItem {
  key: string;
  icon: IoniconName;
  label: string;
  value: string | number;
  /** Small note under the label, e.g. "Check the workshop" (gold, or red with the "danger" accent). */
  note?: string;
  /** `true` tints the icon disc sand when the row needs attention; "danger" turns it red (e.g. overdue orders). */
  accent?: boolean | "danger";
  onPress?: () => void;
  /** Highlights the row and swaps the chevron for a close icon: the row is acting as an active filter. */
  selected?: boolean;
}

export interface KpiListProps {
  items: KpiListItem[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Stats as scannable rows in one card: icon, label (+ note), big serif value, chevron.
 * Replaces the tile grid so long labels never wrap or truncate.
 */
export function KpiList({ items, style }: KpiListProps) {
  return (
    <Card padding={0} style={[styles.card, style]}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const danger = item.accent === "danger";
        const body = (
          <>
            <View style={[styles.disc, item.accent === true && styles.discAccent, danger && styles.discDanger]}>
              <Ionicons name={item.icon} size={20} color={danger ? colors.dangerDeep : colors.goldDark} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, item.selected && styles.labelSelected]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.note ? (
                <Text style={[styles.note, danger && styles.noteDanger]} numberOfLines={1}>
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
              {item.value}
            </Text>
            {item.onPress ? (
              <Ionicons name={item.selected ? "close" : "chevron-forward"} size={18} color={colors.muted} />
            ) : (
              <View style={styles.chevronGap} />
            )}
          </>
        );
        const rowStyle = [styles.row, !last && styles.rowBorder, item.selected && styles.rowSelected];
        return item.onPress ? (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: !!item.selected }}
            accessibilityLabel={`${item.label}: ${item.value}${item.selected ? ", filter on" : ""}`}
            style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={item.key} style={rowStyle} accessibilityLabel={`${item.label}: ${item.value}`}>
            {body}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#EFE8DA" },
  // Bleeds to the card edge (the card has 14px side padding) so the highlight reads as a full row.
  rowSelected: { backgroundColor: colors.sand, marginHorizontal: -14, paddingHorizontal: 14, borderRadius: 10 },
  labelSelected: { fontFamily: fonts.bodyBold },
  pressed: { opacity: 0.7 },
  disc: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  discAccent: { backgroundColor: colors.sand },
  discDanger: { backgroundColor: colors.dangerSoft },
  text: { flex: 1, gap: 2, minWidth: 0 },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  note: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, color: colors.goldDark },
  noteDanger: { color: colors.dangerDeep },
  value: { ...typography.kpi, fontSize: 26, lineHeight: 30, textAlign: "right" },
  chevronGap: { width: 18 },
});
