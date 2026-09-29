import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, typography } from "@/constants/theme";

import { Card } from "./Card";

export interface KpiTileProps {
  label: string;
  value: string | number;
  /** Small gold note under the value, e.g. "+2 this week". */
  note?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Stat tile: small label, big serif value, optional gold note. */
export function KpiTile({ label, value, note, onPress, style }: KpiTileProps) {
  return (
    <Card onPress={onPress} padding={14} style={[styles.tile, style]}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={styles.note} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 0, gap: 4 },
  label: { ...typography.small, fontFamily: fonts.bodyMedium, color: colors.muted },
  value: typography.kpi,
  note: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.goldDark },
});
