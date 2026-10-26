import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReportResponse } from "@shared/types";

import { colors, fonts, typography } from "@/constants/theme";

export type ClientToCall = ReportResponse["clientsToCall"][number];

export interface CallRowProps {
  entry: ClientToCall;
  onPress: () => void;
  /** Hides the top rule on the first row of a card. */
  first?: boolean;
}

/** Why the owner should pick up the phone, as the right-hand label. */
export function callReasonLabel(reason: ClientToCall["reason"]): string {
  return reason === "quiet" ? "Win-back" : "Collect";
}

/** One client to call: name, why, and a label (Win-back / Collect). Opens the client's file. */
export function CallRow({ entry, onPress, first = false }: CallRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, ${callReasonLabel(entry.reason)}. ${entry.detail}`}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={typography.small} numberOfLines={2}>
          {entry.detail}
        </Text>
      </View>
      <Text style={[styles.tag, entry.reason === "balance" && styles.tagCollect]}>{callReasonLabel(entry.reason)}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  tag: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.goldDark },
  tagCollect: { color: colors.successFg },
});
