import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { WEBSITE_LIMITS, type WebsitePortfolioResponse, type WebsiteResponse } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsite, useWebsitePortfolio, websiteRoutes } from "@/components/website";
import { colors, fonts, typography } from "@/constants/theme";
import { showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const COLUMNS = 3;

/** Your free website → Cover and headline: the big line on Home and which portfolio piece is the cover photo. */
export default function WebsiteCoverScreen() {
  const website = useWebsite();
  const portfolio = useWebsitePortfolio();
  return (
    <Screen back keyboard eyebrow="Your website" title="Cover and headline" subtitle="The first thing visitors see." edges={["top", "bottom"]}>
      {website.isPending || portfolio.isPending ? (
        <LoadingBlock />
      ) : website.isError ? (
        <ErrorBlock error={website.error} onRetry={() => void website.refetch()} retrying={website.isFetching} />
      ) : portfolio.isError ? (
        <ErrorBlock error={portfolio.error} onRetry={() => void portfolio.refetch()} retrying={portfolio.isFetching} />
      ) : (
        <CoverEditor data={website.data} portfolio={portfolio.data} />
      )}
    </Screen>
  );
}

function CoverEditor({ data, portfolio }: { data: WebsiteResponse; portfolio: WebsitePortfolioResponse }) {
  const router = useRouter();
  const shop = useShop().data ?? null;
  const update = useUpdateWebsite();
  const [headline, setHeadline] = useState(data.headline ?? "");
  const fallback = `Made to measure in ${shop?.district || shop?.city || "your district"}`;
  const withPhotos = portfolio.pieces.filter((p) => p.photos.length > 0);
  const rows: (typeof withPhotos)[] = [];
  for (let i = 0; i < withPhotos.length; i += COLUMNS) rows.push(withPhotos.slice(i, i + COLUMNS));

  const saveHeadline = () =>
    update.mutate({ headline: headline.trim() }, { onSuccess: () => showToast("Headline saved"), onError: (err) => showError(err, "Couldn't save") });
  const setCover = (pieceId: string) =>
    update.mutate({ coverPieceId: pieceId }, { onSuccess: () => showToast("Cover photo set"), onError: (err) => showError(err, "Couldn't set the cover") });

  return (
    <>
      <Card style={styles.card}>
        <Eyebrow tone="muted">Headline</Eyebrow>
        <Field
          value={headline}
          onChangeText={setHeadline}
          maxLength={WEBSITE_LIMITS.headlineMax}
          placeholder={fallback}
          hint={`Left empty, it reads “${fallback}”.`}
          accessibilityLabel="Headline"
          testID="cover-headline"
        />
        <Button size="sm" title="Save headline" onPress={saveHeadline} disabled={headline.trim() === (data.headline ?? "")} loading={update.isPending && update.variables?.headline !== undefined} style={styles.start} />
      </Card>

      <Card style={styles.card}>
        <Eyebrow tone="muted">Cover photo</Eyebrow>
        {withPhotos.length === 0 ? (
          <>
            <Text style={typography.body}>Add a piece to your portfolio first. Until then the page shows a navy woven pattern.</Text>
            <Button size="sm" variant="gold" title="Open portfolio" onPress={() => router.push(websiteRoutes.portfolio)} style={styles.start} />
          </>
        ) : (
          <View style={styles.grid}>
            {rows.map((row, i) => (
              <View key={i} style={styles.row}>
                {row.map((piece) => {
                  const on = piece.id === data.coverPieceId;
                  return (
                    <Pressable
                      key={piece.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={piece.title}
                      onPress={() => setCover(piece.id)}
                      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                    >
                      <View style={[styles.thumb, on && styles.thumbOn]}>
                        <Image source={{ uri: piece.photos[0]?.url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
                        {on ? (
                          <View style={styles.badge}>
                            <Ionicons name="checkmark" size={12} color={colors.gold} />
                            <Text style={styles.badgeText}>COVER</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.label} numberOfLines={1}>
                        {piece.title}
                      </Text>
                    </Pressable>
                  );
                })}
                {Array.from({ length: COLUMNS - row.length }, (_, k) => (
                  <View key={`pad-${k}`} style={styles.cell} />
                ))}
              </View>
            ))}
          </View>
        )}
        <Text style={typography.small}>The cover shows the first photo of the piece, full width, under the headline.</Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  start: { alignSelf: "flex-start" },
  grid: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, minWidth: 0, gap: 4 },
  pressed: { opacity: 0.8 },
  thumb: { aspectRatio: 4 / 5, borderRadius: 12, overflow: "hidden", backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.line },
  thumbOn: { borderWidth: 2, borderColor: colors.gold },
  image: { width: "100%", height: "100%" },
  badge: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: colors.gold },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
});
