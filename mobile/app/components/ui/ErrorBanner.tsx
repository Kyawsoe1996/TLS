import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/constants/theme";

export interface ErrorBannerProps {
  /** Renders nothing when empty. */
  message?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Inline error text for forms (sign-in, onboarding). */
export function ErrorBanner({ message, style }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <View style={[styles.banner, style]} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.danger },
});
