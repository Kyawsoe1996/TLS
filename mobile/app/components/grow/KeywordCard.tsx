import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { SeoKeyword } from "@shared/types";

import { Button, Card, Eyebrow } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";

export interface KeywordCardProps {
  keyword: SeoKeyword;
  /** Called with the keyword when "Write a post" is pressed. */
  onWrite?: (keyword: SeoKeyword) => void;
  style?: StyleProp<ViewStyle>;
}

/** One low-competition keyword from the Local SEO map: intent, this week's angle, and a shortcut to Content Studio. */
export function KeywordCard({ keyword, onWrite, style }: KeywordCardProps) {
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.titleRow}>
        <Ionicons name="location" size={18} color={colors.goldDark} style={styles.pin} />
        <Text style={styles.keyword} selectable>
          {keyword.keyword}
        </Text>
      </View>

      <Text style={styles.intent} selectable>
        <Text style={styles.intentLabel}>Why they search</Text>
        {"  ·  "}
        {keyword.search_intent}
      </Text>

      <View style={styles.angleBox}>
        <Eyebrow>Publish this week</Eyebrow>
        <Text style={styles.angle} selectable>
          {keyword.content_angle}
        </Text>
      </View>

      {onWrite ? <Button size="sm" icon="create-outline" title="Write a post" onPress={() => onWrite(keyword)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pin: { marginTop: 3 },
  keyword: { ...typography.h3, flex: 1, fontFamily: fonts.serif },
  intent: typography.bodyMuted,
  intentLabel: { fontFamily: fonts.bodySemi, color: colors.ink },
  angleBox: {
    backgroundColor: colors.sand,
    borderRadius: radii.field,
    padding: 12,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  angle: { ...typography.body, lineHeight: 22 },
});
