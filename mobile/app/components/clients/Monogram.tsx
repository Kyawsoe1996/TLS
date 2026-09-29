import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { initials } from "@/lib/format";

export interface MonogramProps {
  name: string | null | undefined;
  /** Circle diameter (default 44). */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Navy circle with a gold ring and serif initials — the client's "monogram". */
export function Monogram({ name, size = 44, style }: MonogramProps) {
  const letters = initials(name) || "?";
  return (
    <View
      accessibilityLabel={name ? `${name} monogram` : "Monogram"}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.42) }]} numberOfLines={1}>
        {letters}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontFamily: fonts.serif, color: colors.ivory, letterSpacing: 0.5 },
});
