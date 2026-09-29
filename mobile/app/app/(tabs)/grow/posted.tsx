import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PlaceholderTile, PlatformRow, platformByKey, type Platform } from "@/components/grow";
import { Button, Card, Eyebrow, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { initials } from "@/lib/format";
import { useShop } from "@/lib/useShop";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Confirmation after "Post now" in Content Studio (UI only).
 * Params: `platforms` — comma-separated platform keys; `caption` — the text that went to the share sheet.
 */
export default function PostedScreen() {
  const params = useLocalSearchParams<{ platforms?: string; caption?: string }>();
  const router = useRouter();
  const shop = useShop().data ?? null;
  const shopName = shop?.name ?? "Your shop";

  const platforms = firstParam(params.platforms)
    .split(",")
    .map((key) => platformByKey(key.trim()))
    .filter((p): p is Platform => !!p);
  const caption = firstParam(params.caption);
  const count = platforms.length;

  const createAnother = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/grow/content");
  };

  const backToHome = () => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate("/(tabs)");
  };

  return (
    <Screen back eyebrow="Content Studio" title="Shared">
      <Card variant="dark" style={styles.hero}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={26} color={colors.navy} />
        </View>
        <Text style={styles.heroTitle}>{count === 1 ? "Shared to 1 app" : `Shared to ${count} apps`}</Text>
        <Text style={styles.heroSub}>Adapted for each app</Text>
      </Card>

      <Card style={styles.list}>
        <Eyebrow>Your apps</Eyebrow>
        {count > 0 ? (
          <View>
            {platforms.map((platform, i) => (
              <PlatformRow
                key={platform.key}
                platform={platform}
                account="Caption ready to paste"
                last={i === platforms.length - 1}
                right={
                  <View style={styles.tag}>
                    <Ionicons name="time-outline" size={13} color={colors.goldDark} />
                    <Text style={styles.tagText}>Ready to post</Text>
                  </View>
                }
              />
            ))}
          </View>
        ) : (
          <Text style={typography.bodyMuted}>No apps were selected — your caption went straight to the share sheet.</Text>
        )}
        <Text style={typography.small}>
          Direct posting arrives in a future update; your caption was shared via your phone.
        </Text>
      </Card>

      <Card style={styles.preview}>
        <Eyebrow>Preview · Instagram</Eyebrow>
        <View style={styles.previewHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(shopName) || "T"}</Text>
          </View>
          <View style={styles.previewName}>
            <Text style={styles.handle} numberOfLines={1}>
              {shopName}
            </Text>
            <Text style={typography.small}>{[shop?.district, shop?.city].filter(Boolean).join(", ") || "Bespoke tailoring"}</Text>
          </View>
        </View>
        <PlaceholderTile icon="image-outline" label="Photo" hint="Add one in a later update" aspectRatio={1} style={styles.photo} />
        {caption ? (
          <Text style={styles.caption} selectable>
            <Text style={styles.captionHandle}>{shopName} </Text>
            {caption}
          </Text>
        ) : (
          <Text style={typography.bodyMuted}>No caption was shared.</Text>
        )}
      </Card>

      <View style={styles.actions}>
        <Button variant="secondary" icon="create-outline" title="Create another" style={styles.action} onPress={createAnother} />
        <Button icon="home-outline" title="Back to Home" style={styles.action} onPress={backToHome} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 6, paddingVertical: 28 },
  check: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroTitle: { ...typography.h2, color: colors.ivory, textAlign: "center" },
  heroSub: { ...typography.bodyMuted, color: colors.ivorySoft, textAlign: "center" },
  list: { gap: 10 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.sand,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, color: colors.goldDark },
  preview: { gap: 12 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 17, color: colors.ivory },
  previewName: { flex: 1, gap: 1 },
  handle: { ...typography.label, fontSize: 15, lineHeight: 20 },
  photo: { flex: 0, width: "100%" },
  caption: typography.body,
  captionHandle: { fontFamily: fonts.bodySemi },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  action: { flex: 1 },
});
