import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Fitting } from "@shared/types";

import { Card } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";

import { formatMeasurement, garmentLabel, presentMeasurements } from "./measurements";
import { AnalysedTag, Tag } from "./Tag";

export interface FittingRowProps {
  fitting: Fitting;
  onPress: () => void;
}

/** One fitting on the client file: style · fabric, garment · date, the garment's measurement chips, AI tag. */
export function FittingRow({ fitting, onPress }: FittingRowProps) {
  const present = presentMeasurements(fitting.measurements, fitting.garmentType);
  return (
    <Card onPress={onPress} style={styles.card} testID={`fitting-row-${fitting.id}`}>
      <View style={styles.top}>
        <View style={styles.titleBlock}>
          <Text style={typography.h3} numberOfLines={2}>
            {fitting.style} · {fitting.fabric}
          </Text>
          <Text style={typography.small}>
            {garmentLabel(fitting.garmentType)} · {formatDate(fitting.createdAt)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
      {present.length > 0 ? (
        <View style={styles.chips}>
          {present.map((m) => (
            <Tag key={m.key} label={`${m.label} ${formatMeasurement(m.value)}`} />
          ))}
        </View>
      ) : (
        <Text style={typography.small}>No measurements recorded</Text>
      )}
      {fitting.analysis ? <AnalysedTag /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titleBlock: { flex: 1, gap: 2, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
