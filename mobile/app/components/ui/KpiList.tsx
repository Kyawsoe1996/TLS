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
  /** Small gold note under the label, e.g. "Check the workshop". */
  note?: string;
  /** Tints the icon disc sand instead of soft when the row needs attention. */
  accent?: boolean;
  onPress?: () => void;
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
        const body = (
          <>
            <View style={[styles.disc, item.accent && styles.discAccent]}>
              <Ionicons name={item.icon} size={20} color={colors.goldDark} />
            </View>
            <View style={styles.text}>
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
              {item.note ? (
                <Text style={styles.note} numberOfLines={1}>
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
              {item.value}
            </Text>
            {item.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : <View style={styles.chevronGap} />}
          </>
        );
        const rowStyle = [styles.row, !last && styles.rowBorder];
        return item.onPress ? (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.value}`}
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
  text: { flex: 1, gap: 2, minWidth: 0 },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  note: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, color: colors.goldDark },
  value: { ...typography.kpi, fontSize: 26, lineHeight: 30, textAlign: "right" },
  chevronGap: { width: 18 },
});
