import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { WebsiteEnquiry } from "@shared/types";

import { Tag } from "@/components/clients/Tag";
import { InitialsCircle } from "@/components/referrals/InitialsCircle";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import { enquiryDetailLine, enquiryStatusLabel, enquiryStatusTone } from "@/lib/website";

export interface EnquiryRowProps {
  enquiry: WebsiteEnquiry;
  onPress?: () => void;
}

/** A visitor who asked for a fitting on the website: initials, name, "Garment · when · date", and a status tag. */
export function EnquiryRow({ enquiry, onPress }: EnquiryRowProps) {
  const detail = `${enquiryDetailLine(enquiry)} · ${formatDate(enquiry.createdAt)}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${enquiry.name}, ${detail}, ${enquiryStatusLabel(enquiry.status)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <InitialsCircle name={enquiry.name} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {enquiry.name}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Tag label={enquiryStatusLabel(enquiry.status)} tone={enquiryStatusTone(enquiry.status)} />
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
});
