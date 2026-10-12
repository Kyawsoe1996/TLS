import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ErrorBlock,
  LoadingBlock,
  analyseRequirement,
  cacheFitting,
  canAnalyse,
  clientRoutes,
  fieldsFor,
  formatCm,
  garmentLabel,
  measurementsTitle,
  messageStatusLabel,
  showAiError,
  useClient,
  useFittings,
  useSendEmail,
} from "@/components/clients";
import { AiResultCard, Button, Card, EmptyState, Eyebrow, LoadingAI, Screen, SectionTitle } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { useAiConsent } from "@/lib/useAiConsent";
import { formatDate, formatDateTime } from "@/lib/format";
import { useShop } from "@/lib/useShop";

/** Fitting detail: the garment's measurements, posture note, and the three AI outputs (or a button to generate them). */
export default function FittingDetailScreen() {
  const { id, fittingId } = useLocalSearchParams<{ id: string; fittingId: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);
  const fittingsQuery = useFittings(id);
  const [refreshing, setRefreshing] = useState(false);
  const client = clientQuery.data;
  const shop = useShop().data ?? null;
  const { send, sending, sent } = useSendEmail(client);

  const fitting = fittingsQuery.data?.find((f) => f.id === fittingId);

  const ensureAiConsent = useAiConsent();
  const analyse = useMutation({
    mutationFn: () => api.aiFit({ fittingId }),
    onSuccess: (res) => cacheFitting(queryClient, res.fitting),
    onError: (err) => showAiError(err, "Analysis failed"),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fittingsQuery.refetch(), clientQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (fittingsQuery.isPending) {
    body = <LoadingBlock />;
  } else if (fittingsQuery.isError) {
    body = <ErrorBlock error={fittingsQuery.error} onRetry={() => void fittingsQuery.refetch()} retrying={fittingsQuery.isFetching} />;
  } else if (!fitting) {
    body = (
      <EmptyState
        icon="body-outline"
        title="Fitting not found"
        body="This fitting may have been removed."
        action={<Button size="sm" variant="secondary" title="Back to client" onPress={() => router.dismissTo(clientRoutes.detail(id))} />}
      />
    );
  } else {
    const analysis = fitting.analysis;
    const analysable = canAnalyse(fitting.garmentType, fitting.measurements);
    const requirement = analyseRequirement(fitting.garmentType);
    body = (
      <>
        <Card style={styles.measureCard}>
          <Eyebrow>{measurementsTitle(fitting.garmentType)} · cm</Eyebrow>
          <View style={styles.grid}>
            {fieldsFor(fitting.garmentType).map((field) => (
              <View key={field.key} style={styles.cell}>
                <Text style={typography.small}>{field.label}</Text>
                <Text style={styles.value}>{formatCm(fitting.measurements[field.key])}</Text>
              </View>
            ))}
          </View>
          <View style={styles.divider} />
          <Eyebrow tone="muted">Posture</Eyebrow>
          <Text style={fitting.postureNote ? typography.body : typography.small}>{fitting.postureNote || "No posture note"}</Text>
        </Card>

        <Button
          title="Create order from this fitting"
          variant="ghost"
          icon="cube-outline"
          onPress={() => router.push(clientRoutes.newOrder(id, fittingId))}
          style={styles.createOrder}
        />

        {analyse.isPending ? <LoadingAI label="Analysing the fit — about 10 seconds…" /> : null}

        {!analysis ? (
          !analyse.isPending ? (
            <View style={styles.analyseBlock}>
              <Button title="Analyse with AI" icon="sparkles" fullWidth onPress={() => void ensureAiConsent().then((ok) => ok && analyse.mutate())} disabled={!analysable} />
              <Text style={styles.hint}>
                {analysable ? "Pattern adjustments for the cutter, a fit profile for the file and a follow-up message." : requirement}
              </Text>
            </View>
          ) : null
        ) : (
          <View style={styles.results}>
            <SectionTitle title="AI analysis" style={styles.sectionTitle} />
            <AiResultCard eyebrow="For the cutter" title="Pattern adjustments" body={analysis.pattern_adjustments} />
            <AiResultCard eyebrow="Saved to client file" title="Fit profile" body={analysis.fit_profile} />
            <View style={styles.followup}>
              <AiResultCard
                eyebrow="Ready to send"
                title="Follow-up message"
                body={analysis.automated_marketing_hook}
                copyText={analysis.automated_marketing_hook}
                shareText={analysis.automated_marketing_hook}
                actions={
                  <Button
                    size="sm"
                    variant="onDark"
                    icon="send-outline"
                    title="Send by email"
                    onPress={() =>
                      void send({
                        kind: "followup",
                        subject: `A note from ${shop?.name ?? "your tailor"}`,
                        body: analysis.automated_marketing_hook,
                      })
                    }
                    loading={sending}
                    disabled={!client?.email}
                    testID="fitting-send-followup"
                  />
                }
              />
              {sent ? (
                <Text style={[styles.sentLine, sent.status === "failed" && styles.sentFailed]}>
                  {sent.status === "sent" ? "Sent by email" : messageStatusLabel(sent.status)} · {formatDateTime(sent.createdAt)}
                  {sent.status === "failed" && sent.error ? ` · ${sent.error}` : ""}
                </Text>
              ) : client && !client.email ? (
                <Text style={styles.sentLine}>Add an email address to {client.name}&apos;s file to send this by email.</Text>
              ) : null}
            </View>
            <Button
              title="Re-run analysis"
              variant="ghost"
              icon="refresh-outline"
              onPress={() => void ensureAiConsent().then((ok) => ok && analyse.mutate())}
              disabled={analyse.isPending || !analysable}
              style={styles.rerun}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <Screen
      back
      eyebrow={fitting ? `${garmentLabel(fitting.garmentType)} fitting · ${formatDate(fitting.createdAt)}` : "Fitting"}
      title={clientQuery.data?.name}
      subtitle={fitting ? `${fitting.style} · ${fitting.fabric}` : undefined}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  measureCard: { gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  cell: { width: "50%", gap: 2 },
  value: typography.h3,
  divider: { height: 1, backgroundColor: colors.line },
  analyseBlock: { gap: 8 },
  hint: { ...typography.small, textAlign: "center" },
  results: { gap: 12 },
  followup: { gap: 6 },
  sentLine: { ...typography.small, textAlign: "center" },
  sentFailed: { color: colors.danger },
  sectionTitle: { marginBottom: 0 },
  rerun: { alignSelf: "center" },
  createOrder: { alignSelf: "center", marginTop: -4 },
});
