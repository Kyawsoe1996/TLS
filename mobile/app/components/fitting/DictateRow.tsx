import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui";
import { colors, typography } from "@/constants/theme";

export interface DictateRowProps {
  onPress: () => void;
  disabled?: boolean;
}

/** Navy row at the top of the fitting form that opens the dictation sheet. Only rendered when speech is available. */
export function DictateRow({ onPress, disabled }: DictateRowProps) {
  return (
    <Card variant="dark" onPress={onPress} disabled={disabled} style={styles.card} testID="dictate-row">
      <View style={styles.mic}>
        <Ionicons name="mic" size={22} color={colors.navy} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Dictate the measurements</Text>
        <Text style={styles.subtitle}>It names each field, you say the number · English or Thai</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ivorySoft} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.h3, color: colors.ivory },
  subtitle: { ...typography.small, color: colors.ivorySoft },
});
