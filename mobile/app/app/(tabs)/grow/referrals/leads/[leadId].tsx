import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ReferralLead } from "@shared/types";

import { ErrorBlock, LoadingBlock, Tag, cacheClient, clientRoutes, isNotFoundError } from "@/components/clients";
import { RewardRow, afterReferralChanged, cacheReferralLead, referralRoutes, useClientReferral, useReferralLead } from "@/components/referrals";
import { Button, Card, EmptyState, Eyebrow, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { contactLabel, firstNameOf, leadStatusLabel, leadStatusTone, preferredLabel, rewardProgress, type ProgressStep } from "@/lib/referral";
import { showError } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

/** One friend who asked for a fitting: what they sent, Add as client / Schedule / Dismiss, and the reward's progress. */
export default function ReferralLeadScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const router = useRouter();
  const leadQuery = useReferralLead(leadId);
  const [refreshing, setRefreshing] = useState(false);
  const lead = leadQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await leadQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (leadQuery.isPending) {
    return (
      <Screen back eyebrow="Smart Referral">
        <LoadingBlock />
      </Screen>
    );
  }

  if (leadQuery.isError || !lead) {
    return (
      <Screen back eyebrow="Smart Referral">
        {isNotFoundError(leadQuery.error) ? (
          <EmptyState
            icon="person-remove-outline"
            title="Friend not found"
            body="This request may have been removed."
            action={<Button size="sm" variant="secondary" title="Back to Smart Referral" onPress={() => router.dismissTo(referralRoutes.overview)} />}
          />
        ) : (
          <ErrorBlock error={leadQuery.error} onRetry={() => void leadQuery.refetch()} retrying={leadQuery.isFetching} />
        )}
      </Screen>
    );
  }

  const referrer = lead.referrerName || "a client";
  return (
    <Screen
      back
      eyebrow={lead.status === "new" ? "Smart Referral · new friend" : "Smart Referral · friend"}
      title={lead.name}
      subtitle={`Invited by ${referrer} · asked on ${formatDate(lead.createdAt)}`}
      headerRight={<Tag label={leadStatusLabel(lead.status)} tone={leadStatusTone(lead.status)} />}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <LeadDetails lead={lead} />
    </Screen>
  );
}

/** Loaded state. */
function LeadDetails({ lead }: { lead: ReferralLead }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const shop = useShop().data ?? null;
  // The ambassador's rewards: this friend's one drives the progress steps, the whole list fills "On the ambassador's file".
  const ambassador = useClientReferral(lead.referrerClientId, { enabled: lead.status === "added" });
  const rewards = ambassador.data?.rewards ?? [];
  const reward = lead.clientId ? rewards.find((r) => r.friendClientId === lead.clientId) : undefined;
  const steps = rewardProgress(lead, reward);
  const referrerFirst = firstNameOf(lead.referrerName) || "the ambassador";

  const addMutation = useMutation({
    mutationFn: () => api.addReferralLead(lead.id),
    onSuccess: ({ lead: saved, client }) => {
      cacheReferralLead(queryClient, saved);
      cacheClient(queryClient, client);
      afterReferralChanged(queryClient, [saved.referrerClientId]);
      router.replace(clientRoutes.detail(client.id));
    },
    onError: (err) => showError(err, "Couldn't add the friend"),
  });

  const dismissMutation = useMutation({
    mutationFn: () => api.dismissReferralLead(lead.id),
    onSuccess: ({ lead: saved }) => {
      cacheReferralLead(queryClient, saved);
      afterReferralChanged(queryClient, [saved.referrerClientId]);
    },
    onError: (err) => showError(err, "Couldn't dismiss the request"),
  });

  const busy = addMutation.isPending || dismissMutation.isPending;

  return (
    <>
      <Card style={styles.card}>
        <Eyebrow tone="muted">What the friend sent</Eyebrow>
        <DetailRow icon={contactLabel(lead.contact) === "Phone" ? "call-outline" : "chatbubble-ellipses-outline"} label={contactLabel(lead.contact)} value={lead.contact} />
        <DetailRow icon="calendar-outline" label="Prefers" value={preferredLabel(lead.preferred) || "Didn't say"} />
        <DetailRow icon="gift-outline" label="Welcome gift" value={shop?.referralFriendOffer ?? "Not set up yet"} muted={!shop?.referralFriendOffer} />
      </Card>

      <View style={styles.actions}>
        {lead.status !== "added" ? (
          <Button variant="gold" icon="person-add-outline" title="Add as client" fullWidth loading={addMutation.isPending} disabled={busy} onPress={() => addMutation.mutate()} testID="lead-add" />
        ) : null}
        {lead.status === "added" && lead.clientId ? (
          <>
            <Button variant="gold" icon="calendar-outline" title="Schedule fitting" fullWidth onPress={() => router.push(clientRoutes.newAppointment(lead.clientId as string))} testID="lead-schedule" />
            <Button variant="secondary" icon="person-outline" title="Open client file" fullWidth onPress={() => router.push(clientRoutes.detail(lead.clientId as string))} />
          </>
        ) : null}
        {lead.status === "new" ? (
          <Button variant="ghost" icon="close-outline" title="Dismiss" fullWidth loading={dismissMutation.isPending} disabled={busy} onPress={() => dismissMutation.mutate()} testID="lead-dismiss" />
        ) : null}
        {lead.status === "dismissed" ? <Text style={styles.dismissedNote}>Dismissed. You can still add {firstNameOf(lead.name)} as a client later.</Text> : null}
      </View>

      <Card style={styles.card}>
        <Eyebrow tone="muted">Reward progress</Eyebrow>
        <View>
          {steps.map((step, i) => (
            <Step key={step.label} index={i + 1} step={step} last={i === steps.length - 1} />
          ))}
        </View>
      </Card>

      {lead.status === "added" ? (
        <Card variant="soft" style={styles.card}>
          <Eyebrow tone="muted">On {referrerFirst}&apos;s file</Eyebrow>
          {ambassador.isPending ? (
            <LoadingBlock />
          ) : ambassador.isError ? (
            <ErrorBlock error={ambassador.error} onRetry={() => void ambassador.refetch()} retrying={ambassador.isFetching} />
          ) : rewards.length === 0 ? (
            <Text style={typography.small}>No rewards on file yet.</Text>
          ) : (
            <View>
              {rewards.map((r, i) => (
                <Fragment key={r.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <RewardRow reward={r} clientOffer={shop?.referralClientOffer ?? null} showAmbassador={false} />
                </Fragment>
              ))}
            </View>
          )}
        </Card>
      ) : null}
    </>
  );
}

function DetailRow({ icon, label, value, muted = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={18} color={colors.goldDark} />
      </View>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, muted && styles.detailValueMuted]} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** One progress step: green check when done, gold-outlined number when next, grey number when later. */
function Step({ index, step, last }: { index: number; step: ProgressStep; last: boolean }) {
  const { state } = step;
  return (
    <View style={styles.step} accessibilityLabel={`${step.label}, ${state === "done" ? "done" : state === "next" ? "next" : "later"}`}>
      <View style={styles.stepRail}>
        <View style={[styles.stepCircle, state === "done" && styles.stepCircleDone, state === "next" && styles.stepCircleNext]}>
          {state === "done" ? (
            <Ionicons name="checkmark" size={14} color={colors.card} />
          ) : (
            <Text style={[styles.stepNumber, state === "next" && styles.stepNumberNext]}>{index}</Text>
          )}
        </View>
        {!last ? <View style={[styles.stepLine, state === "done" && styles.stepLineDone]} /> : null}
      </View>
      <View style={[styles.stepText, last && styles.stepTextLast]}>
        <Text style={[styles.stepLabel, state === "later" && styles.stepLabelLater]}>{step.label}</Text>
        {step.detail ? <Text style={typography.small}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  detailIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { ...typography.small, lineHeight: 16 },
  detailValue: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  detailValueMuted: { fontFamily: fonts.body, color: colors.muted },
  actions: { gap: 10 },
  dismissedNote: { ...typography.small, textAlign: "center" },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { width: 28, alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  stepCircleDone: { backgroundColor: colors.successFg, borderColor: colors.successFg },
  stepCircleNext: { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.sand },
  stepNumber: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  stepNumberNext: { color: colors.goldDark },
  stepLine: { flex: 1, width: 2, minHeight: 16, backgroundColor: colors.line, marginVertical: 4 },
  stepLineDone: { backgroundColor: colors.successBg },
  stepText: { flex: 1, paddingTop: 4, paddingBottom: 18, gap: 2 },
  stepTextLast: { paddingBottom: 4 },
  stepLabel: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  stepLabelLater: { fontFamily: fonts.body, color: colors.muted },
  divider: { height: 1, backgroundColor: colors.line },
});
