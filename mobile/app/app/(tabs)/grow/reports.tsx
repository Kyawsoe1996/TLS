import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ErrorBlock, LoadingBlock, clientRoutes } from "@/components/clients";
import { BarChart, CallRow, StatCard, useReport } from "@/components/reports";
import { Button, Card, Chip, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { formatThb } from "@/lib/format";
import { monthKey, monthLabel, monthName, previousMonth, recentMonths } from "@/lib/months";
import { A5, pdfAvailable, sharePdf } from "@/lib/pdf";
import { compareNote, reportFileName, reportHtml } from "@/lib/reportHtml";
import { showError } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

/** The current month and the three before it. */
const MONTHS_TO_PICK = 4;

/**
 * Reports — how the shop did in a month (GET /reports), with a PDF the owner can share. Reached from Grow.
 * The six figures always render (as "—" until the month has loaded) so the page keeps its shape between months.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const months = useMemo(() => recentMonths(MONTHS_TO_PICK), []);
  const [month, setMonth] = useState(months[0] ?? monthKey());
  const query = useReport(month);
  const shop = useShop().data ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const report = query.data;
  const prevKey = previousMonth(month);
  const canShare = pdfAvailable();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const share = async () => {
    if (!report) return;
    setSharing(true);
    try {
      await sharePdf(reportHtml(report, shop), reportFileName(report, shop?.name ?? ""), A5, "Share report");
    } catch (err) {
      showError(err, "Couldn't share the report");
    } finally {
      setSharing(false);
    }
  };

  const count = (value: number | undefined) => (value === undefined ? "—" : String(value));
  const money = (value: number | undefined) => (value === undefined ? "—" : formatThb(value));
  const compare = (current: number | undefined, previous: number | undefined) =>
    current === undefined || previous === undefined ? undefined : compareNote(current, previous, prevKey);

  const newClients = compare(report?.newClients, report?.previous.newClients);
  const fittings = compare(report?.fittings, report?.previous.fittings);
  const delivered = compare(report?.ordersDelivered, report?.previous.ordersDelivered);

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (report) {
    body = (
      <>
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Orders delivered · last six months</Text>
          <BarChart months={report.months} selected={report.month} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Most made this month</Text>
          {report.garments.length === 0 ? (
            <Text style={typography.small}>Nothing delivered yet this month.</Text>
          ) : (
            report.garments.map((g, index) => (
              <View key={g.garment} style={[styles.garmentRow, index > 0 && styles.garmentRowBorder]}>
                <Text style={styles.garmentName} numberOfLines={1}>
                  {g.garment}
                </Text>
                <Text style={typography.small}>{g.delivered} delivered</Text>
              </View>
            ))
          )}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Clients to call</Text>
          {report.clientsToCall.length === 0 ? (
            <Text style={typography.small}>No one to call right now.</Text>
          ) : (
            report.clientsToCall.map((entry, index) => (
              <CallRow
                key={`${entry.reason}-${entry.clientId}`}
                entry={entry}
                first={index === 0}
                onPress={() => router.push(clientRoutes.detail(entry.clientId))}
              />
            ))
          )}
        </Card>

        {canShare ? (
          <Button
            variant="gold"
            fullWidth
            icon="share-outline"
            title={`Share ${monthName(month)} as a PDF`}
            onPress={() => void share()}
            loading={sharing}
            testID="report-share"
          />
        ) : null}
        <Text style={styles.note}>Made on the phone, like the receipt. Nothing leaves the phone until you share it.</Text>
      </>
    );
  }

  return (
    <Screen back eyebrow="Grow" title="Reports" subtitle="How the shop did, month by month." refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <View style={styles.chips}>
        {months.map((key, index) => (
          <Chip key={key} label={index === 0 ? monthLabel(key) : monthName(key)} selected={key === month} onPress={() => setMonth(key)} style={styles.chip} />
        ))}
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatCard label="New clients" value={count(report?.newClients)} note={newClients?.text} noteTone={newClients?.tone === "same" ? "muted" : newClients?.tone} />
          <StatCard label="Fittings" value={count(report?.fittings)} note={fittings?.text} noteTone={fittings?.tone === "same" ? "muted" : fittings?.tone} />
        </View>
        <View style={styles.gridRow}>
          <StatCard label="Orders delivered" value={count(report?.ordersDelivered)} note={delivered?.text} noteTone={delivered?.tone === "same" ? "muted" : delivered?.tone} />
          <StatCard label="Money collected" value={money(report?.moneyCollected)} note="Deposits and balances" />
        </View>
        <View style={styles.gridRow}>
          <StatCard
            label="Still owed"
            value={money(report?.stillOwed)}
            valueTone="gold"
            note={report ? `On ${report.openOrders} open ${report.openOrders === 1 ? "order" : "orders"}` : undefined}
          />
          <StatCard
            label="Quiet clients"
            value={count(report?.quietClients)}
            valueTone={report && report.quietClients > 0 ? "danger" : "ink"}
            note="No order in 90+ days"
          />
        </View>
      </View>

      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  grid: { gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  section: { gap: 12 },
  sectionTitle: { ...typography.h3 },
  garmentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40, paddingVertical: 6 },
  garmentRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  garmentName: { ...typography.body, flex: 1, minWidth: 0 },
  note: { ...typography.small, textAlign: "center", paddingHorizontal: 12 },
});
