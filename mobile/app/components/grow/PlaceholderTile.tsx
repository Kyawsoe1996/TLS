import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { IoniconName } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";

export interface PlaceholderTileProps {
  label: string;
  icon?: IoniconName;
  /** Small muted line under the label. */
  hint?: string;
  /** Taller aspect for a photo frame (default is a square-ish tile). */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
}

/** Dashed, empty media tile — a stand-in until uploads ship. */
export function PlaceholderTile({ label, icon = "image-outline", hint, aspectRatio = 1.15, style }: PlaceholderTileProps) {
  return (
    <View style={[styles.tile, { aspectRatio }, style]} accessibilityLabel={`${label} placeholder`}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={colors.goldDark} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18, color: colors.ink },
  hint: { ...typography.small, textAlign: "center" },
});
