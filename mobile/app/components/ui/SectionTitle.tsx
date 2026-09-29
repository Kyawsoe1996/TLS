import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, typography } from "@/constants/theme";

export interface SectionTitleProps {
  title: string;
  /** Optional node on the right (e.g. a "See all" link). */
  right?: ReactNode;
  tone?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}

/** Serif section heading with optional right-side action. */
export function SectionTitle({ title, right, tone = "light", style }: SectionTitleProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={[typography.h2, tone === "dark" && { color: colors.ivory }]} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
});
