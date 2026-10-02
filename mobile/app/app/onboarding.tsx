import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { BrandTone, UpsertShopRequest } from "@shared/types";

import { Button, Chip, ErrorBanner, Eyebrow, Field, Screen } from "@/components/ui";
import { typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { errorMessage } from "@/lib/toast";
import { useSetShop, useShop } from "@/lib/useShop";

const TONES: BrandTone[] = ["Sophisticated", "Welcoming", "Premium"];

/**
 * Shop setup. First run: creates the shop (PUT /shop) then enters the tabs.
 * With `?edit=1` (from Settings) it prefills the saved shop and returns on save.
 */
export default function OnboardingScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === "1" || edit === "true";
  const router = useRouter();
  const api = useApi();
  const setShop = useSetShop();
  const { signOut } = useAuth();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? null;

  const [name, setName] = useState(isEdit ? (shop?.name ?? "") : "");
  const [district, setDistrict] = useState(isEdit ? (shop?.district ?? "") : "");
  const [city, setCity] = useState(isEdit ? (shop?.city ?? "Bangkok") : "Bangkok");
  const [tone, setTone] = useState<BrandTone>(isEdit ? (shop?.tone ?? "Sophisticated") : "Sophisticated");
  const [error, setError] = useState<string | null>(null);

  // Prefill if the shop arrives after mount (edit mode only).
  useEffect(() => {
    if (!isEdit || !shop) return;
    setName(shop.name);
    setDistrict(shop.district);
    setCity(shop.city);
    setTone(shop.tone);
  }, [isEdit, shop]);

  const mutation = useMutation({
    mutationFn: (body: UpsertShopRequest) => api.upsertShop(body),
    onSuccess: (res) => {
      setShop(res);
      if (isEdit) {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/settings");
      } else {
        router.replace("/(tabs)");
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = () => {
    const body: UpsertShopRequest = {
      name: name.trim(),
      district: district.trim(),
      city: city.trim() || "Bangkok",
      tone,
    };
    if (!body.name) return setError("Give your shop a name.");
    if (!body.district) return setError("Add your district so local SEO can target it.");
    setError(null);
    mutation.mutate(body);
  };

  return (
    <Screen
      eyebrow={isEdit ? "Settings" : "Welcome to TLS"}
      title={isEdit ? "Edit shop" : "Set up your shop"}
      subtitle={isEdit ? undefined : "A few details so the AI can speak in your voice and target your neighbourhood."}
      back={isEdit}
      keyboard
      edges={["top", "bottom"]}
    >
      <ErrorBanner message={error} />

      <Field label="Shop name" value={name} onChangeText={setName} placeholder="e.g. Siam Bespoke" autoCapitalize="words" returnKeyType="next" />
      <Field label="District" value={district} onChangeText={setDistrict} placeholder="e.g. Thonglor" autoCapitalize="words" returnKeyType="next" />
      <Field label="City" value={city} onChangeText={setCity} placeholder="Bangkok" autoCapitalize="words" returnKeyType="done" />

      <View style={styles.toneBlock}>
        <Eyebrow>Brand tone</Eyebrow>
        <Text style={typography.small}>How your posts and emails should sound.</Text>
        <View style={styles.chips}>
          {TONES.map((t) => (
            <Chip key={t} label={t} selected={tone === t} onPress={() => setTone(t)} />
          ))}
        </View>
      </View>

      <Button
        title={isEdit ? "Save changes" : "Continue"}
        onPress={submit}
        loading={mutation.isPending}
        disabled={!name.trim() || !district.trim()}
        fullWidth
        style={styles.submit}
      />

      {!isEdit ? (
        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => void signOut()}
          disabled={mutation.isPending}
          style={styles.signOut}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toneBlock: { gap: 6, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  submit: { marginTop: 8 },
  signOut: { alignSelf: "center" },
});
