import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card, Screen, type IoniconName } from "@/components/ui";
import { colors, typography } from "@/constants/theme";

const TILES: { key: string; title: string; body: string; icon: IoniconName; href: Href }[] = [
  {
    key: "content",
    title: "Content Studio",
    body: "A blog post, social caption and call-to-action in your brand tone — pick a topic and audience.",
    icon: "create-outline",
    href: "/(tabs)/grow/content",
  },
  {
    key: "seo",
    title: "Local SEO",
    body: "AI-suggested search phrases for your district, with a content angle for each one.",
    icon: "location-outline",
    href: "/(tabs)/grow/seo",
  },
];

export default function GrowScreen() {
  const router = useRouter();
  return (
    <Screen eyebrow="Grow" title="Bring in new clients">
      {TILES.map((tile) => (
        <Card key={tile.key} onPress={() => router.push(tile.href)} style={styles.tile}>
          <View style={styles.icon}>
            <Ionicons name={tile.icon} size={22} color={colors.goldDark} />
          </View>
          <View style={styles.text}>
            <Text style={typography.h2}>{tile.title}</Text>
            <Text style={typography.bodyMuted}>{tile.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} style={styles.chevron} />
        </Card>
      ))}

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
        <Text style={styles.noteText}>Posting to social apps: UI preview. Post now uses your phone&apos;s share sheet for now.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 20 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
  noteText: { ...typography.small, flex: 1 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 4 },
  chevron: { marginLeft: 2 },
});
