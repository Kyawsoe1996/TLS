import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { DEFAULT_SWATCH } from "./helpers";

export interface SwatchProps {
  /** "#RRGGBB"; sand when the fabric has none. */
  hex: string | null | undefined;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** The fabric's colour as a rounded square. A faint border keeps pale swatches visible on white cards. */
export function Swatch({ hex, size = 44, style }: SwatchProps) {
  return (
    <View
      style={[styles.swatch, { width: size, height: size, borderRadius: Math.round(size * 0.27), backgroundColor: hex || DEFAULT_SWATCH }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  swatch: { borderWidth: 1, borderColor: "rgba(20, 33, 58, 0.14)" },
});
