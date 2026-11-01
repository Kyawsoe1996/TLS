import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { ORDER_PHOTO_LIMITS, WEBSITE_LIMITS, type WebsiteResponse } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { Button, Card, Eyebrow, Field, Screen } from "@/components/ui";
import { useUpdateWebsite, useWebsite, useWebsiteAction } from "@/components/website";
import { colors, radii, typography } from "@/constants/theme";
import type { MediaFile } from "@/lib/api";
import { pickMedia } from "@/lib/media";
import { confirm, showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

/** Your free website → About the shop: the heading, the story (the existing About paragraph) and the tailor's photo. */
export default function WebsiteAboutScreen() {
  const query = useWebsite();
  return (
    <Screen back keyboard eyebrow="Your website" title="About the shop" subtitle="Who you are and how you work." edges={["top", "bottom"]}>
      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <AboutEditor data={query.data} />
      )}
    </Screen>
  );
}

function AboutEditor({ data }: { data: WebsiteResponse }) {
  const shop = useShop().data ?? null;
  const update = useUpdateWebsite();
  const [heading, setHeading] = useState(data.aboutHeading ?? "");
  const [about, setAbout] = useState(data.about ?? "");
  const [picking, setPicking] = useState(false);
  const upload = useWebsiteAction((api, file: MediaFile) => api.uploadWebsiteTailorPhoto(file), "Couldn't add the photo");
  const remove = useWebsiteAction((api) => api.deleteWebsiteTailorPhoto(), "Couldn't remove the photo");
  const changed = heading.trim() !== (data.aboutHeading ?? "") || about.trim() !== (data.about ?? "");
  const defaultHeading = `About ${shop?.name ?? "your shop"}`;

  const save = () =>
    update.mutate(
      { aboutHeading: heading.trim(), about: about.trim() },
      { onSuccess: () => showToast("Saved", "Your page shows it within a few minutes."), onError: (err) => showError(err, "Couldn't save") },
    );

  const pick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const file = await pickMedia("image", { types: ORDER_PHOTO_LIMITS.types, bytes: ORDER_PHOTO_LIMITS.bytes });
      if (file) await upload.mutateAsync(file).catch(() => undefined);
    } finally {
      setPicking(false);
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <Eyebrow tone="muted">Heading and story</Eyebrow>
        <Field label="Heading" value={heading} onChangeText={setHeading} maxLength={WEBSITE_LIMITS.aboutHeadingMax} placeholder={defaultHeading} hint={`Left empty: “${defaultHeading}”.`} testID="about-heading" />
        <Field
          label="Your story"
          value={about}
          onChangeText={setAbout}
          multiline
          maxLength={WEBSITE_LIMITS.aboutMax}
          placeholder="A family shop in Thonglor since 1998. Suits and shirts cut by hand, fitted twice."
          hint={`${about.length}/${WEBSITE_LIMITS.aboutMax} · left empty, the page uses a short default line.`}
          testID="about-story"
        />
        <Button size="sm" title="Save" onPress={save} disabled={!changed} loading={update.isPending} style={styles.start} testID="about-save" />
      </Card>

      <Card style={styles.card}>
        <Eyebrow tone="muted">Tailor photo</Eyebrow>
        {data.tailorPhotoUrl ? (
          <Image source={{ uri: data.tailorPhotoUrl }} style={styles.photo} resizeMode="cover" accessibilityLabel="Tailor photo" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.photo, styles.empty]}>
            {picking || upload.isPending ? <ActivityIndicator color={colors.goldDark} /> : <Text style={typography.small}>No photo yet</Text>}
          </View>
        )}
        <View style={styles.actions}>
          <Button size="sm" variant="gold" icon="camera-outline" title={data.tailorPhotoUrl ? "Change photo" : "Add a photo"} onPress={() => void pick()} loading={picking || upload.isPending} />
          {data.tailorPhotoUrl ? (
            <Button
              size="sm"
              variant="danger"
              icon="trash-outline"
              title="Remove"
              loading={remove.isPending}
              onPress={() =>
                void confirm({ title: "Remove the tailor photo?", confirmText: "Remove", destructive: true }).then((ok) => {
                  if (ok) remove.mutate(undefined);
                })
              }
            />
          ) : null}
        </View>
        <Text style={typography.small}>You at the cutting table, or the shop front. It is shown on the About page for anyone to see.</Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  start: { alignSelf: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radii.field, backgroundColor: colors.sand },
  empty: { alignItems: "center", justifyContent: "center" },
});
