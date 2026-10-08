import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Tag } from "@/components/clients";
import { Button, Card, Eyebrow, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { API_URL, useApi } from "@/lib/api";
import { confirm, showError } from "@/lib/toast";
import { useEmailStatus, useShop } from "@/lib/useShop";

export default function SettingsScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { user } = useUser();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? null;
  const emailStatus = useEmailStatus().data ?? null;
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "";
  // "address · phone · hours · reply-to" (address flattened to one line), or nothing when none are set.
  const detailsSummary = shop
    ? [shop.address?.replace(/\s*\n+\s*/g, ", "), shop.phone, shop.openingHours, shop.replyToEmail]
        .map((v) => v?.trim())
        .filter(Boolean)
        .join(" · ")
    : "";

  const openLink = async (path: "/privacy" | "/support") => {
    try {
      await WebBrowser.openBrowserAsync(`${API_URL}${path}`);
    } catch (err) {
      showError(err, "Couldn't open the page");
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      queryClient.clear();
    } catch (err) {
      showError(err, "Couldn't sign out");
    } finally {
      setSigningOut(false);
    }
  };

  const onDeleteAccount = async () => {
    const ok = await confirm({
      title: "Delete account?",
      message: "This permanently deletes your shop, clients, fittings, orders, sent emails, posts and sign-in. It can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteAccount();
      try {
        await signOut();
      } catch {
        // The Clerk user is already gone; the session will be invalid either way.
      }
      queryClient.clear();
    } catch (err) {
      showError(err, "Couldn't delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen eyebrow="Settings" title="Settings">
      <Card style={styles.shopCard}>
        <View style={styles.shopHeader}>
          <View style={styles.shopText}>
            <Eyebrow>Your shop</Eyebrow>
            <Text style={typography.h2} numberOfLines={2}>
              {shop?.name ?? (shopQuery.isPending ? "Loading…" : "Not set up yet")}
            </Text>
            {shop ? (
              <Text style={typography.bodyMuted}>
                {shop.district}, {shop.city}
              </Text>
            ) : null}
          </View>
          <Button
            size="sm"
            variant="secondary"
            icon="pencil-outline"
            title="Edit"
            onPress={() => router.push({ pathname: "/onboarding", params: { edit: "1" } })}
            disabled={!shop}
          />
        </View>
        {shop ? (
          <View style={styles.tonePill}>
            <Ionicons name="color-palette-outline" size={14} color={colors.goldDark} />
            <Text style={styles.toneText}>{shop.tone} tone</Text>
          </View>
        ) : null}
      </Card>

      <Card onPress={() => router.push("/shop-details")} disabled={!shop} style={styles.detailsCard} testID="shop-details-card">
        <View style={styles.detailsRow}>
          <View style={styles.detailsText}>
            <Eyebrow>Shop details</Eyebrow>
            <Text style={detailsSummary ? typography.body : typography.bodyMuted} numberOfLines={2}>
              {detailsSummary || (shopQuery.isPending ? "Loading…" : "Not added yet")}
            </Text>
            <Text style={typography.small}>Address, phone, hours and reply-to — shown at the bottom of every email you send.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Card>

      <Card style={styles.emailCard} testID="email-sending-card">
        <View style={styles.emailHeader}>
          <Eyebrow>Email sending</Eyebrow>
          {emailStatus ? (
            emailStatus.configured ? (
              <Tag label="Connected" tone="success" icon="checkmark" />
            ) : (
              <Tag label="Not set up" tone="warning" icon="alert-circle-outline" />
            )
          ) : null}
        </View>
        <Text style={typography.body}>
          {emailStatus
            ? emailStatus.configured
              ? `Emails are sent from ${emailStatus.from}`
              : "Email sending isn't set up yet. Emails you send are saved as Simulated and are not delivered."
            : shopQuery.isPending
              ? "Checking…"
              : "—"}
        </Text>
      </Card>

      <Card padding={0}>
        <SettingsRow icon="shield-checkmark-outline" label="Privacy policy" onPress={() => void openLink("/privacy")} />
        <View style={styles.divider} />
        <SettingsRow icon="help-circle-outline" label="Support" onPress={() => void openLink("/support")} />
      </Card>

      <Card variant="soft" style={styles.accountCard}>
        <Eyebrow tone="muted">Signed in as</Eyebrow>
        <Text style={typography.body} numberOfLines={1}>
          {email || "—"}
        </Text>
        <Button title="Sign out" variant="secondary" onPress={() => void onSignOut()} loading={signingOut} fullWidth style={styles.signOut} />
      </Card>

      <Button
        title="Delete account"
        variant="danger"
        icon="trash-outline"
        onPress={() => void onDeleteAccount()}
        loading={deleting}
        fullWidth
      />

      <Text style={styles.version}>Magick TLS v{version}</Text>
    </Screen>
  );
}

function SettingsRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={20} color={colors.goldDark} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="open-outline" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shopCard: { gap: 12 },
  shopHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  shopText: { flex: 1, gap: 4 },
  tonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.sand,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toneText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.goldDark },
  detailsCard: { gap: 0 },
  detailsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailsText: { flex: 1, minWidth: 0, gap: 4 },
  emailCard: { gap: 8 },
  emailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 52 },
  rowPressed: { backgroundColor: colors.cardSoft },
  rowLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  accountCard: { gap: 6 },
  signOut: { marginTop: 10 },
  version: { ...typography.small, textAlign: "center", marginTop: 8 },
});
