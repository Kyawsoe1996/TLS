import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Shop, UpsertShopRequest } from "@shared/types";

import { Button, Card, ErrorBanner, Eyebrow, Field, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { errorMessage } from "@/lib/toast";
import { useSetShop, useShop } from "@/lib/useShop";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shop details (address, phone, opening hours, reply-to) — the footer of every email sent from the app.
 * Reached from Settings. Saves with PUT /shop alongside the shop's existing name / district / city / tone.
 */
export default function ShopDetailsScreen() {
  const router = useRouter();
  const api = useApi();
  const setShop = useSetShop();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? null;

  const [address, setAddress] = useState(shop?.address ?? "");
  const [phone, setPhone] = useState(shop?.phone ?? "");
  const [openingHours, setOpeningHours] = useState(shop?.openingHours ?? "");
  const [replyToEmail, setReplyToEmail] = useState(shop?.replyToEmail ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill once if the shop arrives after mount; later refetches must not overwrite what's being typed.
  const hydrated = useRef(!!shop);
  useEffect(() => {
    if (!shop || hydrated.current) return;
    hydrated.current = true;
    setAddress(shop.address ?? "");
    setPhone(shop.phone ?? "");
    setOpeningHours(shop.openingHours ?? "");
    setReplyToEmail(shop.replyToEmail ?? "");
  }, [shop]);

  const mutation = useMutation({
    mutationFn: (body: UpsertShopRequest) => api.upsertShop(body),
    onSuccess: (res) => {
      setShop(res);
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/settings");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const draft = {
    address: address.trim(),
    phone: phone.trim(),
    openingHours: openingHours.trim(),
    replyToEmail: replyToEmail.trim(),
  };
  const dirty =
    !!shop &&
    (draft.address !== (shop.address ?? "") ||
      draft.phone !== (shop.phone ?? "") ||
      draft.openingHours !== (shop.openingHours ?? "") ||
      draft.replyToEmail !== (shop.replyToEmail ?? ""));

  const submit = () => {
    if (!shop) return;
    if (draft.replyToEmail && !EMAIL_RE.test(draft.replyToEmail)) return setEmailError("That doesn't look like an email address.");
    setEmailError(null);
    setError(null);
    // Trimmed strings throughout: "" clears a detail on the server.
    mutation.mutate({ name: shop.name, district: shop.district, city: shop.city, tone: shop.tone, ...draft });
  };

  const busy = mutation.isPending;

  return (
    <Screen
      back
      eyebrow="Settings"
      title="Shop details"
      keyboard
      edges={["top", "bottom"]}
      footer={<Button title="Save" fullWidth onPress={submit} loading={busy} disabled={!shop || !dirty} testID="shop-details-save" />}
    >
      <ErrorBanner message={error} />

      <Card variant="soft" style={styles.infoCard}>
        <Ionicons name="mail-outline" size={18} color={colors.goldDark} />
        <Text style={styles.infoText}>
          These details appear at the bottom of every email you send from the app, so clients know where to find you and how to
          reach you. All optional.
        </Text>
      </Card>

      <Field
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder={"e.g. 12 Sukhumvit Soi 55\nThonglor, Bangkok 10110"}
        multiline
        autoCapitalize="words"
        editable={!busy}
        style={styles.addressInput}
        testID="shop-address"
      />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="e.g. 02 123 4567"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoCorrect={false}
        returnKeyType="next"
        editable={!busy}
        testID="shop-phone"
      />
      <Field
        label="Opening hours"
        value={openingHours}
        onChangeText={setOpeningHours}
        placeholder="e.g. Mon–Sat 10:00–19:00"
        hint="Used in the “your order is ready” email."
        autoCapitalize="sentences"
        returnKeyType="next"
        editable={!busy}
        testID="shop-hours"
      />
      <Field
        label="Reply-to email"
        value={replyToEmail}
        onChangeText={(t) => {
          setReplyToEmail(t);
          if (emailError) setEmailError(null);
        }}
        placeholder="e.g. hello@yourshop.com"
        hint="When a client replies to an email from the app, it goes to this address. Your Gmail is fine here."
        error={emailError}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!busy}
        testID="shop-reply-to"
      />

      <FooterPreview shop={shop} {...draft} />
    </Screen>
  );
}

/** Live preview of the footer the API appends to outgoing emails, from the current drafts. */
function FooterPreview({
  shop,
  address,
  phone,
  openingHours,
  replyToEmail,
}: {
  shop: Shop | null;
  address: string;
  phone: string;
  openingHours: string;
  replyToEmail: string;
}) {
  const contact = [phone, openingHours].filter(Boolean).join(" · ");
  const empty = !address && !contact && !replyToEmail;
  return (
    <Card style={styles.preview} testID="shop-footer-preview">
      <Eyebrow tone="muted">Preview · email footer</Eyebrow>
      <View style={styles.previewBody}>
        <Text style={styles.previewLine}>— {shop?.name ?? "Your shop"}</Text>
        {address ? <Text style={styles.previewLine}>{address}</Text> : null}
        {contact ? <Text style={styles.previewLine}>{contact}</Text> : null}
        {replyToEmail ? <Text style={styles.previewMuted}>Reply to this email to reach the shop.</Text> : null}
      </View>
      {empty ? <Text style={typography.small}>Add a detail above and it shows up here.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  infoText: { ...typography.small, flex: 1, color: colors.ink },
  addressInput: { minHeight: 72 },
  preview: { gap: 10 },
  previewBody: { gap: 2, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.line },
  previewLine: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.ink },
  previewMuted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted },
});
