import type { ReactNode } from "react";
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, typography } from "@/constants/theme";

export type PlatformKey = "facebook" | "instagram" | "tiktok" | "line";

export interface Platform {
  key: PlatformKey;
  name: string;
  /** Two-letter monogram shown in the badge. */
  monogram: string;
}

/** Social apps the Content Studio can hand a post to (in display order). */
export const PLATFORMS: readonly Platform[] = [
  { key: "facebook", name: "Facebook", monogram: "FB" },
  { key: "instagram", name: "Instagram", monogram: "IG" },
  { key: "tiktok", name: "TikTok", monogram: "TT" },
  { key: "line", name: "LINE Official", monogram: "LN" },
];

export const DEFAULT_PLATFORM_SELECTION: Record<PlatformKey, boolean> = {
  facebook: true,
  instagram: true,
  tiktok: true,
  line: false,
};

export function platformByKey(key: string): Platform | undefined {
  return PLATFORMS.find((p) => p.key === key);
}

/** Navy square badge with the platform's monogram. */
export function PlatformBadge({ monogram, size = 40 }: { monogram: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}>
      <Text style={[styles.badgeText, { fontSize: Math.round(size * 0.32) }]}>{monogram}</Text>
    </View>
  );
}

export interface PlatformRowProps {
  platform: Platform;
  /** Second line under the name. */
  account?: string;
  /** When set, the row renders a Switch bound to `value`. */
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  /** Node on the right when there is no Switch (e.g. a status tag). */
  right?: ReactNode;
  /** Hide the bottom divider (last row in a list). */
  last?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Monogram badge + name + account line, with a Switch or custom node on the right. */
export function PlatformRow({
  platform,
  account = "Connect in a later update",
  value = false,
  onValueChange,
  right,
  last = false,
  style,
}: PlatformRowProps) {
  return (
    <View style={[styles.row, !last && styles.divider, style]}>
      <PlatformBadge monogram={platform.monogram} />
      <View style={styles.text}>
        <Text style={styles.name}>{platform.name}</Text>
        <Text style={styles.account} numberOfLines={1}>
          {account}
        </Text>
      </View>
      {onValueChange ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={`Share to ${platform.name}`}
          trackColor={{ false: colors.line, true: colors.navy }}
          thumbColor={value ? colors.gold : colors.card}
          ios_backgroundColor={colors.line}
        />
      ) : (
        right ?? null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  badge: {
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gold,
  },
  badgeText: { fontFamily: fonts.bodyBold, color: colors.ivory, letterSpacing: 0.5 },
  text: { flex: 1, gap: 2 },
  name: { ...typography.label, fontSize: 15, lineHeight: 20 },
  account: typography.small,
});
