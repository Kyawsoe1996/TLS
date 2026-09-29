import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Client } from "@shared/types";

import { Card } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { formatMonthsSince } from "@/lib/format";

import { Monogram } from "./Monogram";
import { InactiveTag } from "./Tag";

export interface ClientRowProps {
  client: Client;
  onPress: () => void;
}

/** One client in the list: monogram, name, last order, Inactive tag. */
export function ClientRow({ client, onPress }: ClientRowProps) {
  return (
    <Card onPress={onPress} padding={14} style={styles.card} testID={`client-row-${client.id}`}>
      <Monogram name={client.name} />
      <View style={styles.text}>
        <Text style={typography.h3} numberOfLines={1}>
          {client.name}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          Last order: {formatMonthsSince(client.lastOrderAt)}
        </Text>
      </View>
      {client.inactive ? <InactiveTag /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1, gap: 2, minWidth: 0 },
});
