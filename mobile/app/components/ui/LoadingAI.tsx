import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/constants/theme";

export interface LoadingAIProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** Spinner + "Thinking…" while an AI route runs. */
export function LoadingAI({ label = "Thinking…", style }: LoadingAIProps) {
  return (
    <View style={[styles.row, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.goldDark} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.muted },
});
