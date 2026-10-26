import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Fabric } from "@shared/types";

import { colors, fonts, typography } from "@/constants/theme";

import { formatMetres, stockLine } from "./helpers";
import { Swatch } from "./Swatch";

export interface FabricPickRowProps {
  fabric: Fabric;
  selected: boolean;
  /** The length the order will take, for the "Enough · 4.5 m will remain" line. */
  needed: number;
  /** The garment being ordered, for "not enough for a suit". */
  garmentLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

/** A bolt to pick on the New order form: swatch, name, metres left, and whether the order's length fits (short bolts stay selectable). */
export function FabricPickRow({ fabric, selected, needed, garmentLabel, onPress, disabled = false }: FabricPickRowProps) {
  const line = stockLine(fabric.metresLeft, needed, garmentLabel);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${fabric.name}, ${formatMetres(fabric.metresLeft)} left. ${line.text}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
      testID={`fabric-pick-${fabric.id}`}
    >
      <Swatch hex={fabric.swatch} size={40} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {fabric.name}
        </Text>
        <Text style={[typography.small, line.ok ? styles.ok : styles.short]} numberOfLines={1}>
          {line.text}
        </Text>
      </View>
      <Text style={[styles.metres, fabric.low && styles.short]} numberOfLines={1}>
        {formatMetres(fabric.metresLeft)}
      </Text>
      <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.goldDark : colors.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  rowSelected: { borderColor: colors.navy, backgroundColor: colors.cardSoft },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  ok: { color: colors.successFg },
  short: { color: colors.danger },
  metres: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 24, color: colors.navy },
});
