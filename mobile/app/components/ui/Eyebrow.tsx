import { StyleSheet, Text, type TextProps } from "react-native";

import { colors, typography } from "@/constants/theme";

export type EyebrowTone = "default" | "muted" | "onDark";

export interface EyebrowProps extends TextProps {
  tone?: EyebrowTone;
}

const toneColor: Record<EyebrowTone, string> = {
  default: colors.goldDark,
  muted: colors.muted,
  onDark: colors.gold,
};

/** 11px / 700 / 1.5 tracking / uppercase label, goldDark by default. */
export function Eyebrow({ tone = "default", style, children, ...rest }: EyebrowProps) {
  return (
    <Text {...rest} style={[typography.eyebrow, styles.base, { color: toneColor[tone] }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { lineHeight: 16 },
});
