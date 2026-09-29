import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { IoniconName } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";

export type TagTone = "inactive" | "ai" | "neutral";

export interface TagProps {
  label: string;
  tone?: TagTone;
  icon?: IoniconName;
  style?: StyleProp<ViewStyle>;
}

const palette: Record<TagTone, { bg: string; fg: string }> = {
  inactive: { bg: colors.sand, fg: colors.goldDark },
  ai: { bg: colors.successBg, fg: colors.successFg },
  neutral: { bg: colors.cardSoft, fg: colors.muted },
};

/** Small, non-interactive pill: "Inactive", "AI analysed", or a measurement like "Chest 102.4". */
export function Tag({ label, tone = "neutral", icon, style }: TagProps) {
  const p = palette[tone];
  return (
    <View style={[styles.tag, { backgroundColor: p.bg }, tone === "neutral" && styles.neutralBorder, style]}>
      {icon ? <Ionicons name={icon} size={12} color={p.fg} /> : null}
      <Text style={[styles.label, { color: p.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Convenience: the "Inactive" tag used on client rows and the client file. */
export function InactiveTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Tag label="Inactive" tone="inactive" icon="time-outline" style={style} />;
}

/** Convenience: the "AI analysed" tag used on fitting rows. */
export function AnalysedTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Tag label="AI analysed" tone="ai" icon="sparkles" style={style} />;
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  neutralBorder: { borderWidth: 1, borderColor: colors.line },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
});
