// Bottom sheet opened from a client's file: their personal invitation link, the ready-made message, and Share / Copy.
// The link and message come from GET /clients/:id/referral (fetched only while the sheet is open, since the API
// makes the code on first call); a completed share is counted with POST /clients/:id/referral/shared.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBlock, LoadingBlock } from "@/components/clients/QueryState";
import { Button, Eyebrow } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { firstNameOf, inviteExplanation } from "@/lib/referral";
import { showError, showToast } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

import { referralRoutes, useClientReferral } from "./queries";

export interface InviteSheetProps {
  visible: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
}

/** "Invite a friend": the client's link in a bordered box with a copy icon, the message to send, Share and Copy link. */
export function InviteSheet({ visible, clientId, clientName, onClose }: InviteSheetProps) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const shop = useShop().data ?? null;
  const referral = useClientReferral(clientId, { enabled: visible });
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const sharedMutation = useMutation({
    mutationFn: () => api.markReferralShared(clientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.clientReferral(clientId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals });
    },
    // The share itself went through; a missed count isn't worth an alert.
    onError: () => undefined,
  });

  const firstName = firstNameOf(clientName) || clientName;
  const data = referral.data;

  const copyLink = async () => {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(data.url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
      showToast("Link copied", `Paste it into a chat with ${firstName}.`);
    } catch (err) {
      showError(err, "Couldn't copy the link");
    }
  };

  const onShare = async () => {
    if (!data) return;
    setSharing(true);
    try {
      const outcome = await Share.share(
        { message: data.message },
        { subject: shop ? `An invitation to ${shop.name}` : "An invitation", dialogTitle: "Invite a friend" },
      );
      if (outcome.action === Share.sharedAction) sharedMutation.mutate();
    } catch (err) {
      showError(err, "Couldn't open the share sheet");
    } finally {
      setSharing(false);
    }
  };

  const goToOffer = () => {
    onClose();
    router.push(referralRoutes.offer);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="invite-sheet">
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name="gift-outline" size={20} color={colors.goldDark} />
              </View>
              <View style={styles.headerText}>
                <Text style={typography.h2}>Invite a friend</Text>
                <Text style={typography.small}>{firstName}&apos;s personal link</Text>
              </View>
            </View>

            <Text style={typography.bodyMuted}>
              {inviteExplanation({ firstName, friendOffer: shop?.referralFriendOffer ?? null, clientOffer: shop?.referralClientOffer ?? null })}
            </Text>

            {shop && !shop.referralFriendOffer ? (
              <Pressable onPress={goToOffer} accessibilityRole="link" style={({ pressed }) => [styles.offerHint, pressed && styles.pressed]}>
                <Ionicons name="sparkles-outline" size={16} color={colors.goldDark} />
                <Text style={styles.offerHintText}>Set up your offer in Grow → Smart Referral</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.goldDark} />
              </Pressable>
            ) : null}

            {referral.isPending ? (
              <LoadingBlock label="Preparing the link…" />
            ) : referral.isError || !data ? (
              <ErrorBlock error={referral.error} onRetry={() => void referral.refetch()} retrying={referral.isFetching} />
            ) : (
              <>
                <View style={styles.block}>
                  <Eyebrow tone="muted">The link</Eyebrow>
                  <View style={styles.linkBox}>
                    <Text style={styles.link} numberOfLines={1} selectable>
                      {data.url}
                    </Text>
                    <Pressable
                      onPress={() => void copyLink()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Copy link"
                      style={({ pressed }) => [styles.copyIcon, pressed && styles.pressed]}
                    >
                      <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={copied ? colors.successFg : colors.goldDark} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.block}>
                  <Eyebrow tone="muted">Message to send</Eyebrow>
                  <View style={styles.messageBox}>
                    <Text style={styles.message} selectable>
                      {data.message}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Button variant="gold" icon="share-outline" title="Share via LINE, WhatsApp or Mail" fullWidth loading={sharing} onPress={() => void onShare()} testID="invite-share" />
                  <Button variant="secondary" icon="link-outline" title="Copy link" fullWidth onPress={() => void copyLink()} testID="invite-copy" />
                </View>

                {data.sharedCount > 0 || data.friendsBooked > 0 ? (
                  <Text style={styles.stats}>
                    Shared {data.sharedCount} {data.sharedCount === 1 ? "time" : "times"} · {data.friendsBooked} {data.friendsBooked === 1 ? "friend" : "friends"} booked
                  </Text>
                ) : null}
              </>
            )}

            <Text style={styles.note}>The link opens a small web page for the friend. No app needed on their side.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20, 33, 58, 0.45)" },
  sheet: { maxHeight: "88%", backgroundColor: colors.ivory, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  content: { gap: 14, paddingBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 2 },
  offerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.sand,
    borderRadius: radii.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offerHintText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.goldDark },
  pressed: { opacity: 0.7 },
  block: { gap: 6 },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.field,
    backgroundColor: colors.card,
    paddingLeft: 14,
    paddingRight: 6,
  },
  link: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  copyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  messageBox: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.field, backgroundColor: colors.card, padding: 14 },
  message: { ...typography.body, lineHeight: 23 },
  actions: { gap: 10 },
  stats: { ...typography.small, textAlign: "center" },
  note: { ...typography.small, textAlign: "center", paddingHorizontal: 8 },
});
