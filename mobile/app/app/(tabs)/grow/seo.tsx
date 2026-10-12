import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { AiSeoRequest, CompetitorTier, SearchConsoleStatus, SeoKeyword } from "@shared/types";

import { ChoiceChips, KeywordCard, NearbyPlaces } from "@/components/grow";
import { FEATURES } from "@/constants/features";
import { AiResultCard, Button, Card, Eyebrow, Field, LoadingAI, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const TIERS: readonly CompetitorTier[] = ["Hotel-arcade chains", "Big tailoring brands", "Other local tailors"];
const STATUSES: readonly SearchConsoleStatus[] = ["Not on Google yet", "Page 3 or lower", "Page 2", "Page 1", "Not sure"];
const GBP_URL = "https://business.google.com/";

function shopDistrict(shop: { district: string; city: string } | null): string {
  if (!shop) return "";
  return [shop.district, shop.city].filter(Boolean).join(", ");
}

/** Local SEO — pipeline 2 (POST /ai/seo). Hidden while FEATURES.localSeo is off: a deep link lands on the Grow hub. */
export default function LocalSeoScreen() {
  if (!FEATURES.localSeo) return <Redirect href="/(tabs)/grow" />;
  return <LocalSeoForm />;
}

/** The last result lives in component state only. */
function LocalSeoForm() {
  const router = useRouter();
  const api = useApi();
  const shop = useShop().data ?? null;

  const [district, setDistrict] = useState(shopDistrict(shop));
  const districtTouched = useRef(false);
  const [tier, setTier] = useState<CompetitorTier>("Other local tailors");
  const [status, setStatus] = useState<SearchConsoleStatus>("Not sure");

  // Prefill "District, City" once the shop arrives, unless the user already edited the field.
  useEffect(() => {
    if (shop && !districtTouched.current) setDistrict(shopDistrict(shop));
  }, [shop]);

  const mutation = useMutation({
    mutationFn: (body: AiSeoRequest) => api.aiSeo(body),
    onError: (err) => showError(err, "Couldn't map your district"),
  });
  const result = mutation.data ?? null;

  const run = () => {
    const cleanDistrict = district.trim();
    if (!cleanDistrict) return;
    mutation.mutate({ district: cleanDistrict, competitorTier: tier, searchConsoleStatus: status });
  };

  const openBusinessProfile = async () => {
    try {
      await Linking.openURL(GBP_URL);
    } catch (err) {
      showError(err, "Couldn't open Google Business Profile");
    }
  };

  const writePost = (keyword: SeoKeyword) => {
    router.push({
      pathname: "/(tabs)/grow/content",
      params: { topic: keyword.keyword, angle: keyword.content_angle },
    });
  };

  return (
    <Screen
      back
      eyebrow="Grow"
      title="Local SEO"
      subtitle="AI-suggested search phrases for your neighbourhood, with a content angle for each one."
      keyboard
    >
      <Field
        label="District"
        value={district}
        onChangeText={(v) => {
          districtTouched.current = true;
          setDistrict(v);
        }}
        placeholder="Thonglor, Bangkok"
        autoCapitalize="words"
        returnKeyType="done"
        editable={!mutation.isPending}
      />
      <ChoiceChips label="Competitor tier" hint="Who you're up against for the same searches." options={TIERS} value={tier} onChange={setTier} disabled={mutation.isPending} />
      <ChoiceChips label="Where are you on Google today?" hint="Your best guess. Magick TLS doesn't check Google for you." options={STATUSES} value={status} onChange={setStatus} disabled={mutation.isPending} />

      <Card variant="soft" style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="navigate-circle-outline" size={20} color={colors.goldDark} style={styles.infoIcon} />
          <Text style={styles.infoText}>Google shows nearby shops first. Win your neighbourhood, not the whole city.</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="storefront-outline" size={20} color={colors.goldDark} style={styles.infoIcon} />
          <Text style={styles.infoText}>No website? Start with a free Google Business Profile (Google Maps listing).</Text>
        </View>
        <Button variant="secondary" size="sm" icon="open-outline" title="Open Google Business Profile" onPress={() => void openBusinessProfile()} />
      </Card>

      <Button
        title="Map my district with AI"
        icon="sparkles-outline"
        fullWidth
        onPress={run}
        loading={mutation.isPending}
        disabled={!district.trim()}
      />

      {mutation.isPending ? <LoadingAI label="Checking Google Maps for your district…" /> : null}

      {result ? (
        <View style={styles.results}>
          <AiResultCard eyebrow="Local SEO" title="Target market" body={result.target_market} copyText={result.target_market} />

          <View style={styles.keywordsHeader}>
            <Eyebrow>Suggested keywords</Eyebrow>
            <Text style={styles.keywordsCount}>
              {result.keywords.length === 1 ? "1 keyword" : `${result.keywords.length} keywords`}
            </Text>
          </View>

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
            <Text style={styles.noteText}>
              {result.places
                ? "Written by AI from the tailors Google Maps shows near you, listed below. It has no search-volume data, so check a phrase before you build on it."
                : "Written by AI from what you entered, not from live Google data. Check a phrase before you build on it."}
            </Text>
          </View>

          {result.keywords.length > 0 ? (
            result.keywords.map((keyword, i) => <KeywordCard key={`${keyword.keyword}-${i}`} keyword={keyword} onWrite={writePost} />)
          ) : (
            <Text style={typography.bodyMuted}>No keywords came back this time. Try a broader district or another competitor tier.</Text>
          )}

          {result.places ? <NearbyPlaces places={result.places} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoCard: { gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoIcon: { marginTop: 1 },
  infoText: { ...typography.body, flex: 1 },
  results: { gap: 14 },
  keywordsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  keywordsCount: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.muted },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
  noteText: { ...typography.small, flex: 1 },
});
