import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { UpsertShopRequest } from "@shared/types";

import { referralRoutes } from "@/components/referrals";
import { Button, Card, ErrorBanner, Field, Screen } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { errorMessage } from "@/lib/toast";
import { useSetShop, useShop } from "@/lib/useShop";

const OFFER_MAX = 200;

/**
 * The two reward texts: what a friend gets on their first order and what the client who sent them gets. Saved with
 * PUT /shop alongside the shop's existing name / district / city / tone (the route needs them), then back.
 */
export default function ReferralOfferScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const setShop = useSetShop();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? null;

  const [friendOffer, setFriendOffer] = useState(shop?.referralFriendOffer ?? "");
  const [clientOffer, setClientOffer] = useState(shop?.referralClientOffer ?? "");
  const [error, setError] = useState<string | null>(null);

  // Prefill once if the shop arrives after mount; later refetches must not overwrite what's being typed.
  const hydrated = useRef(!!shop);
  useEffect(() => {
    if (!shop || hydrated.current) return;
    hydrated.current = true;
    setFriendOffer(shop.referralFriendOffer ?? "");
    setClientOffer(shop.referralClientOffer ?? "");
  }, [shop]);

  const mutation = useMutation({
    mutationFn: (body: UpsertShopRequest) => api.upsertShop(body),
    onSuccess: (res) => {
      setShop(res);
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals });
      if (router.canGoBack()) router.back();
      else router.replace(referralRoutes.overview);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const draft = { referralFriendOffer: friendOffer.trim(), referralClientOffer: clientOffer.trim() };
  const dirty = !!shop && (draft.referralFriendOffer !== (shop.referralFriendOffer ?? "") || draft.referralClientOffer !== (shop.referralClientOffer ?? ""));

  const submit = () => {
    if (!shop) return;
    setError(null);
    // Trimmed strings throughout: "" clears an offer on the server.
    mutation.mutate({ name: shop.name, district: shop.district, city: shop.city, tone: shop.tone, ...draft });
  };

  const busy = mutation.isPending;

  return (
    <Screen
      back
      eyebrow="Smart Referral"
      title="The offer"
      subtitle="Written in your words; the friend sees it on their invitation page."
      keyboard
      edges={["top", "bottom"]}
      footer={<Button title="Save" fullWidth onPress={submit} loading={busy} disabled={!shop || !dirty} testID="referral-offer-save" />}
    >
      <ErrorBanner message={error} />

      <Card variant="soft" style={styles.infoCard}>
        <Ionicons name="gift-outline" size={18} color={colors.goldDark} />
        <Text style={styles.infoText}>
          Keep both short and concrete, something the shop can hand over. Released when the friend&apos;s first order is delivered.
        </Text>
      </Card>

      <Field
        label="Friend gets"
        value={friendOffer}
        onChangeText={setFriendOffer}
        placeholder="e.g. A complimentary shirt with your first suit"
        hint="Shown on the friend's page and in the message your client sends."
        maxLength={OFFER_MAX}
        autoCapitalize="sentences"
        returnKeyType="next"
        editable={!busy}
        testID="referral-offer-friend"
      />
      <Field
        label="Client gets"
        value={clientOffer}
        onChangeText={setClientOffer}
        placeholder="e.g. A free monogram on your next order"
        hint="Released when the friend's first order is delivered."
        maxLength={OFFER_MAX}
        autoCapitalize="sentences"
        returnKeyType="done"
        editable={!busy}
        testID="referral-offer-client"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
});
