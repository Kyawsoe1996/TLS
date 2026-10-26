import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Fabric } from "@shared/types";

import { Tag } from "@/components/clients/Tag";
import { Card } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";

import { enoughFor, fabricMetaLine, metresNumber } from "./helpers";
import { Swatch } from "./Swatch";

export interface FabricRowProps {
  fabric: Fabric;
  onPress: () => void;
}

/** One bolt on the Fabrics list: swatch, name, "supplier · width · kind", Low / enough-for tags, and the metres left in serif. */
export function FabricRow({ fabric, onPress }: FabricRowProps) {
  const enough = enoughFor(fabric.metresLeft, fabric.kind);
  return (
    <Card onPress={onPress} style={styles.card} testID={`fabric-row-${fabric.id}`}>
      <Swatch hex={fabric.swatch} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {fabric.name}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {fabricMetaLine(fabric)}
        </Text>
        <View style={styles.tags}>
          {fabric.low ? <Tag label="Low" tone="danger" icon="alert-circle-outline" /> : null}
          <Tag label={enough.label} tone="neutral" />
        </View>
      </View>
      <View style={styles.metres} accessibilityLabel={`${metresNumber(fabric.metresLeft)} metres left`}>
        <Text style={[styles.metresValue, fabric.low && styles.metresLow]} numberOfLines={1} adjustsFontSizeToFit>
          {metresNumber(fabric.metresLeft)}
        </Text>
        <Text style={[styles.metresUnit, fabric.low && styles.metresLow]}>m left</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: fonts.serifSemi, fontSize: 19, lineHeight: 22, color: colors.navy },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  metres: { alignItems: "flex-end", minWidth: 52 },
  metresValue: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 32, color: colors.navy },
  metresUnit: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14, color: colors.muted },
  metresLow: { color: colors.danger },
});
