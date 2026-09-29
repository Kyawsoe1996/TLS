import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, radii } from "@/constants/theme";

import type { IoniconName } from "./Button";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IoniconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Selectable pill. Selected = navy fill with ivory text. */
export function Chip({ label, selected = false, onPress, icon, disabled, style, testID }: ChipProps) {
  const fg = selected ? colors.ivory : colors.navy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.chip,
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.card, borderColor: colors.line },
  selected: { backgroundColor: colors.navy, borderColor: colors.navy },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
