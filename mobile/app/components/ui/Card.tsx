import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radii, spacing } from "@/constants/theme";

export type CardVariant = "default" | "soft" | "dark";

export interface CardProps {
  children?: ReactNode;
  /** "default" white, "soft" warm off-white, "dark" navy with ivory text. */
  variant?: CardVariant;
  padding?: number;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Surface with 1px line border and 16px radius. Becomes a Pressable when `onPress` is set. */
export function Card({ children, variant = "default", padding = spacing.card, onPress, disabled, style, testID }: CardProps) {
  const base = [styles.card, variantStyles[variant], { padding }, style];
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [...base, pressed && styles.pressed, disabled && styles.disabled]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={base}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});

const variantStyles = StyleSheet.create({
  default: { backgroundColor: colors.card, borderColor: colors.line },
  soft: { backgroundColor: colors.cardSoft, borderColor: colors.line },
  dark: { backgroundColor: colors.navy, borderColor: colors.navy },
});
