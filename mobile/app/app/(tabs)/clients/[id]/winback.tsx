import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { Incentive } from "@shared/types";

import { ErrorBlock, InactiveTag, LoadingBlock, Monogram, clientRoutes, isNotFoundError, showAiError, useClient } from "@/components/clients";
import { AiResultCard, Button, Card, Chip, EmptyState, Eyebrow, LoadingAI, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatMonthsSince, monthsSince } from "@/lib/format";
import { showError } from "@/lib/toast";

const INCENTIVES: Incentive[] = ["Complimentary shirt with a suit", "10% off", "Free alteration"];

/** Win-back: pick an incentive, draft the email with AI (POST /ai/winback), then copy / share / open in Mail. */
export default function WinbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const clientQuery = useClient(id);
  const client = clientQuery.data;
  const [incentive, setIncentive] = useState<Incentive>(INCENTIVES[0]);

  const draft = useMutation({
    mutationFn: (chosen: Incentive) => api.aiWinback({ clientId: id, incentive: chosen }),
    onError: (err) => showAiError(err, "Couldn't draft the email"),
  });
  const result = draft.data;

  const openMail = async () => {
    if (!client?.email || !result) return;
    const url = `mailto:${client.email}?subject=${encodeURIComponent(result.email_subject)}&body=${encodeURIComponent(result.email_body)}`;
    try {
      await Linking.openURL(url);
    } catch (err) {
      showError(err, "Couldn't open Mail");
    }
  };

  let body;
  if (clientQuery.isPending) {
    body = <LoadingBlock />;
  } else if (clientQuery.isError || !client) {
    body = isNotFoundError(clientQuery.error) ? (
      <EmptyState
        icon="person-remove-outline"
        title="Client not found"
        body="This client may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to clients" onPress={() => router.dismissTo(clientRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={clientQuery.error} onRetry={() => void clientQuery.refetch()} retrying={clientQuery.isFetching} />
    );
  } else {
    const quiet = monthsSince(client.lastOrderAt ?? client.createdAt);
    const quietText = quiet === 0 ? "Visited this month" : `Quiet for ${quiet} ${quiet === 1 ? "month" : "months"}`;
    const emailText = result ? `Subject: ${result.email_subject}\n\n${result.email_body}` : "";

    body = (
      <>
        <Card style={styles.summary}>
          <Monogram name={client.name} size={52} />
          <View style={styles.summaryText}>
            <Text style={typography.h3} numberOfLines={1}>
              {client.name}
            </Text>
            <Text style={styles.quiet}>{quietText}</Text>
            <Text style={typography.small}>Last order: {formatMonthsSince(client.lastOrderAt)}</Text>
          </View>
          {client.inactive ? <InactiveTag /> : null}
        </Card>

        <View style={styles.block}>
          <Eyebrow>Incentive</Eyebrow>
          <Text style={typography.small}>What you&apos;re offering to bring them back.</Text>
          <View style={styles.chips}>
            {INCENTIVES.map((i) => (
              <Chip key={i} label={i} selected={incentive === i} onPress={() => setIncentive(i)} disabled={draft.isPending} />
            ))}
          </View>
        </View>

        {draft.isPending ? (
          <LoadingAI label="Writing the email…" />
        ) : (
          <Button
            title={result ? "Draft again" : "Draft email with AI"}
            icon="sparkles"
            variant={result ? "secondary" : "primary"}
            fullWidth
            onPress={() => draft.mutate(incentive)}
          />
        )}

        {result ? (
          <View style={styles.resultBlock}>
            <AiResultCard eyebrow="Win-back email" title={result.email_subject} body={result.email_body} copyText={emailText} shareText={emailText} />
            <Button
              title="Open in Mail"
              icon="mail-outline"
              variant="secondary"
              fullWidth
              onPress={() => void openMail()}
              disabled={!client.email}
            />
            {!client.email ? (
              <Text style={styles.hint}>Add an email address to {client.name}&apos;s file to open this in Mail. Copy or Share works meanwhile.</Text>
            ) : null}
          </View>
        ) : null}

        <Card variant="soft" style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.goldDark} />
          <Text style={styles.noteText}>Sending happens from your own email or LINE. Your fit profile line is already in the text.</Text>
        </Card>
      </>
    );
  }

  return (
    <Screen back eyebrow="Win-back" title="Win-back email">
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryText: { flex: 1, gap: 2, minWidth: 0 },
  quiet: { ...typography.body, color: colors.goldDark },
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  resultBlock: { gap: 10 },
  hint: { ...typography.small, textAlign: "center" },
  noteCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  noteText: { ...typography.small, flex: 1, color: colors.ink },
});
