import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReferralLead } from "@shared/types";

import { Tag } from "@/components/clients/Tag";
import { colors, fonts, typography } from "@/constants/theme";
import { leadDetailLine, leadStatusLabel, leadStatusTone } from "@/lib/referral";

import { InitialsCircle } from "./InitialsCircle";

export interface LeadRowProps {
  lead: ReferralLead;
  onPress?: () => void;
}

/** A friend who asked for a fitting: initials, "Name · via Referrer", what happened to them, and a status tag. */
export function LeadRow({ lead, onPress }: LeadRowProps) {
  const via = lead.referrerName || "a client";
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lead.name}, via ${via}, ${leadDetailLine(lead)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <InitialsCircle name={lead.name} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {lead.name}
          <Text style={styles.via}> · via {via}</Text>
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {leadDetailLine(lead)}
        </Text>
      </View>
      <Tag label={leadStatusLabel(lead.status)} tone={leadStatusTone(lead.status)} />
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  via: { fontFamily: fonts.body, color: colors.muted },
});
