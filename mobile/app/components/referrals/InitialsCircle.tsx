import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { initialsOf } from "@/lib/referral";

export interface InitialsCircleProps {
  name: string | null | undefined;
  /** Circle diameter (default 40). */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Sand circle with serif initials: the lighter avatar used on referral rows (the client file keeps the navy Monogram). */
export function InitialsCircle({ name, size = 40, style }: InitialsCircleProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.text, { fontSize: Math.round(size * 0.4) }]} numberOfLines={1}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fonts.serif, color: colors.goldDark, letterSpacing: 0.5 },
});
