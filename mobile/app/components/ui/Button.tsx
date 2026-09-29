import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { colors, radii, sizes, typography } from "@/constants/theme";

export type ButtonVariant = "primary" | "secondary" | "gold" | "ghost" | "danger" | "onDark";
export type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  iconPosition?: "left" | "right";
  size?: "md" | "sm";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.navy, fg: colors.ivory, border: colors.navy },
  secondary: { bg: colors.card, fg: colors.navy, border: colors.line },
  gold: { bg: colors.gold, fg: colors.navy, border: colors.gold },
  ghost: { bg: "transparent", fg: colors.navy, border: "transparent" },
  danger: { bg: "transparent", fg: colors.danger, border: colors.dangerBg },
  onDark: { bg: "transparent", fg: colors.ivory, border: colors.ivoryLine },
};

/** Pill button (radius 24, min-height 48). Shows a spinner while `loading`. */
export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  iconPosition = "left",
  size = "md",
  fullWidth = false,
  style,
  textStyle,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  const iconSize = size === "sm" ? 16 : 18;
  const iconNode = icon ? <Ionicons name={icon} size={iconSize} color={p.fg} /> : null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: p.bg, borderColor: p.border },
        fullWidth && styles.fullWidth,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {iconPosition === "left" ? iconNode : null}
          <Text style={[typography.button, size === "sm" && styles.smText, { color: p.fg }, textStyle]} numberOfLines={1}>
            {title}
          </Text>
          {iconPosition === "right" ? iconNode : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radii.button,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  md: { minHeight: sizes.control, paddingHorizontal: 22, paddingVertical: 10 },
  sm: { minHeight: sizes.controlSmall, paddingHorizontal: 16, paddingVertical: 6 },
  smText: { fontSize: 14, lineHeight: 18 },
  fullWidth: { alignSelf: "stretch" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
