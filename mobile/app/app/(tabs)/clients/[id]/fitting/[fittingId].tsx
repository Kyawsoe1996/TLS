import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ANALYSE_REQUIREMENT,
  ErrorBlock,
  LoadingBlock,
  MEASUREMENT_FIELDS,
  cacheFitting,
  canAnalyse,
  clientRoutes,
  formatCm,
  showAiError,
  useClient,
  useFittings,
} from "@/components/clients";
import { AiResultCard, Button, Card, EmptyState, Eyebrow, LoadingAI, Screen, SectionTitle } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";

/** Fitting detail: measurements, posture note, and the three AI outputs (or a button to generate them). */
export default function FittingDetailScreen() {
  const { id, fittingId } = useLocalSearchParams<{ id: string; fittingId: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);
  const fittingsQuery = useFittings(id);
  const [refreshing, setRefreshing] = useState(false);

  const fitting = fittingsQuery.data?.find((f) => f.id === fittingId);

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
    const analysable = canAnalyse(fitting.measurements);
    body = (
      <>
        <Card style={styles.measureCard}>
          <Eyebrow>Measurements · cm</Eyebrow>
          <View style={styles.grid}>
            {MEASUREMENT_FIELDS.map((field) => (
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

        {analyse.isPending ? <LoadingAI label="Analysing the fit — about 10 seconds…" /> : null}

        {!analysis ? (
          !analyse.isPending ? (
            <View style={styles.analyseBlock}>
              <Button title="Analyse with AI" icon="sparkles" fullWidth onPress={() => analyse.mutate()} disabled={!analysable} />
              <Text style={styles.hint}>
                {analysable
                  ? "Pattern adjustments for the cutter, a fit profile for the file and a follow-up message."
                  : ANALYSE_REQUIREMENT}
              </Text>
            </View>
          ) : null
        ) : (
          <View style={styles.results}>
            <SectionTitle title="AI analysis" style={styles.sectionTitle} />
            <AiResultCard eyebrow="For the cutter" title="Pattern adjustments" body={analysis.pattern_adjustments} />
            <AiResultCard eyebrow="Saved to client file" title="Fit profile" body={analysis.fit_profile} />
            <AiResultCard
              eyebrow="Ready to send"
              title="Follow-up message"
              body={analysis.automated_marketing_hook}
              copyText={analysis.automated_marketing_hook}
              shareText={analysis.automated_marketing_hook}
            />
            <Button
              title="Re-run analysis"
              variant="ghost"
              icon="refresh-outline"
              onPress={() => analyse.mutate()}
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
      eyebrow={fitting ? `Fitting · ${formatDate(fitting.createdAt)}` : "Fitting"}
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
  sectionTitle: { marginBottom: 0 },
  rerun: { alignSelf: "center" },
});
