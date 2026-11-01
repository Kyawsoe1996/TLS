import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { WebsiteEnquiry } from "@shared/types";

import { ErrorBlock, LoadingBlock, Tag, cacheClient, clientRoutes, isNotFoundError } from "@/components/clients";
import { Button, Card, EmptyState, Eyebrow, Screen } from "@/components/ui";
import { afterWebsiteChanged, cacheWebsiteEnquiry, useSetEnquiryStatus, useWebsiteEnquiry, websiteRoutes } from "@/components/website";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { contactKind, contactLabel, firstNameOf } from "@/lib/referral";
import { showError } from "@/lib/toast";
import { enquiryPreferredLabel, enquiryStatusLabel, enquiryStatusTone } from "@/lib/website";

/** One website enquiry: what the visitor sent, and Add as client / Schedule fitting / Mark contacted / Dismiss. */
export default function WebsiteEnquiryScreen() {
  const { enquiryId } = useLocalSearchParams<{ enquiryId: string }>();
  const router = useRouter();
  const query = useWebsiteEnquiry(enquiryId);
  const [refreshing, setRefreshing] = useState(false);
  const enquiry = query.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (query.isPending) {
    return (
      <Screen back eyebrow="Website enquiry" edges={["top", "bottom"]}>
        <LoadingBlock />
      </Screen>
    );
  }

  if (query.isError || !enquiry) {
    return (
      <Screen back eyebrow="Website enquiry" edges={["top", "bottom"]}>
        {isNotFoundError(query.error) ? (
          <EmptyState
            icon="mail-unread-outline"
            title="Enquiry not found"
            body="It may have been removed."
            action={<Button size="sm" variant="secondary" title="Back to enquiries" onPress={() => router.dismissTo(websiteRoutes.enquiries)} />}
          />
        ) : (
          <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      back
      eyebrow={enquiry.status === "new" ? "Website enquiry · new" : "Website enquiry"}
      title={enquiry.name}
      subtitle={`Asked on ${formatDateTime(enquiry.createdAt)}`}
      headerRight={<Tag label={enquiryStatusLabel(enquiry.status)} tone={enquiryStatusTone(enquiry.status)} />}
      edges={["top", "bottom"]}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <EnquiryDetails enquiry={enquiry} />
    </Screen>
  );
}

/** Loaded state. */
function EnquiryDetails({ enquiry }: { enquiry: WebsiteEnquiry }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const setStatus = useSetEnquiryStatus(enquiry.id);
  const isPhone = contactKind(enquiry.contact) === "phone";

  const addMutation = useMutation({
    mutationFn: () => api.addWebsiteEnquiry(enquiry.id),
    onSuccess: ({ enquiry: saved, client }) => {
      cacheWebsiteEnquiry(queryClient, saved);
      cacheClient(queryClient, client);
      afterWebsiteChanged(queryClient);
      router.replace(clientRoutes.detail(client.id));
    },
    onError: (err) => showError(err, "Couldn't add the client"),
  });

  const reach = async () => {
    const compact = enquiry.contact.replace(/\s+/g, "");
    const url = isPhone ? `tel:${compact}` : `https://line.me/ti/p/~${encodeURIComponent(enquiry.contact.trim().replace(/^@/, ""))}`;
    try {
      await Linking.openURL(url);
    } catch (err) {
      showError(err, isPhone ? "Couldn't start the call" : "Couldn't open LINE");
    }
  };

  const busy = addMutation.isPending || setStatus.isPending;
  const pendingStatus = setStatus.isPending ? setStatus.variables : undefined;

  return (
    <>
      <Card style={styles.card}>
        <Eyebrow tone="muted">What they sent</Eyebrow>
        <DetailRow icon={isPhone ? "call-outline" : "chatbubble-ellipses-outline"} label={contactLabel(enquiry.contact)} value={enquiry.contact} />
        <DetailRow icon="shirt-outline" label="Would like" value={enquiry.garment || "Didn't say"} muted={!enquiry.garment} />
        <DetailRow icon="calendar-outline" label="When" value={enquiryPreferredLabel(enquiry.preferred) || "Didn't say"} muted={!enquiry.preferred} />
        {enquiry.message ? <DetailRow icon="chatbox-outline" label="Message" value={enquiry.message} /> : null}
        <Button
          size="sm"
          variant="secondary"
          icon={isPhone ? "call-outline" : "chatbubble-ellipses-outline"}
          title={isPhone ? `Call ${firstNameOf(enquiry.name)}` : "Open in LINE"}
          onPress={() => void reach()}
          style={styles.reach}
        />
      </Card>

      <View style={styles.actions}>
        {enquiry.status !== "added" ? (
          <Button variant="gold" icon="person-add-outline" title="Add as client" fullWidth loading={addMutation.isPending} disabled={busy} onPress={() => addMutation.mutate()} testID="enquiry-add" />
        ) : null}
        {enquiry.status === "added" && enquiry.clientId ? (
          <>
            <Button variant="gold" icon="calendar-outline" title="Schedule fitting" fullWidth onPress={() => router.push(clientRoutes.newAppointment(enquiry.clientId as string))} testID="enquiry-schedule" />
            <Button variant="secondary" icon="person-outline" title="Open client file" fullWidth onPress={() => router.push(clientRoutes.detail(enquiry.clientId as string))} />
          </>
        ) : null}
        {enquiry.status === "new" ? (
          <Button
            variant="secondary"
            icon="checkmark-done-outline"
            title="Mark contacted"
            fullWidth
            loading={pendingStatus === "contacted"}
            disabled={busy}
            onPress={() => setStatus.mutate("contacted")}
            testID="enquiry-contacted"
          />
        ) : null}
        {enquiry.status === "new" || enquiry.status === "contacted" ? (
          <Button variant="ghost" icon="close-outline" title="Dismiss" fullWidth loading={pendingStatus === "dismissed"} disabled={busy} onPress={() => setStatus.mutate("dismissed")} testID="enquiry-dismiss" />
        ) : null}
        {enquiry.status === "dismissed" ? (
          <>
            <Text style={styles.note}>Dismissed. You can still add {firstNameOf(enquiry.name)} as a client.</Text>
            <Button variant="ghost" icon="arrow-undo-outline" title="Move back to New" fullWidth loading={pendingStatus === "new"} disabled={busy} onPress={() => setStatus.mutate("new")} />
          </>
        ) : null}
        {enquiry.status === "contacted" ? <Text style={styles.note}>Contacted. Add them as a client once the fitting is booked.</Text> : null}
      </View>
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

const styles = StyleSheet.create({
  card: { gap: 10 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  detailIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { ...typography.small, lineHeight: 16 },
  detailValue: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  detailValueMuted: { fontFamily: fonts.body, color: colors.muted },
  reach: { alignSelf: "flex-start", marginTop: 4 },
  actions: { gap: 10 },
  note: { ...typography.small, textAlign: "center" },
});
