import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GARMENT_METRES, type AddFabricMovementRequest, type Fabric, type FabricDetailResponse, type Order } from "@shared/types";

import { ErrorBlock, LoadingBlock, OrderStatusTag, Tag, clientRoutes, isNotFoundError } from "@/components/clients";
import {
  MovementRow,
  Swatch,
  afterFabricChanged,
  afterFabricOrdersChanged,
  cacheFabric,
  enoughFor,
  fabricKindLabel,
  fabricRoutes,
  forgetFabric,
  formatMetres,
  formatSignedMetres,
  metresNumber,
  roundMetres,
  useCachedFabric,
  useFabric,
} from "@/components/fabrics";
import { Button, Card, EmptyState, Eyebrow, NumberField, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate, formatThb } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { confirm, showError } from "@/lib/toast";

/** "Holland & Sherry · 150 cm wide", skipping what's missing. */
function subtitleFor(fabric: Fabric): string | undefined {
  const parts = [fabric.supplier, fabric.widthCm ? `${fabric.widthCm} cm wide` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The three "enough for" checks on the stock card, in the order a tailor thinks of them. */
const GARMENT_CHECKS: { key: "jacket" | "trousers" | "suit"; label: string }[] = [
  { key: "jacket", label: "Jacket" },
  { key: "trousers", label: "Trousers" },
  { key: "suit", label: "Suit" },
];

/** One bolt: metres left and what it's good for, stock adjustments, history, the orders cut from it, details, remove. */
export default function FabricDetailScreen() {
  const { fabricId } = useLocalSearchParams<{ fabricId: string }>();
  const router = useRouter();
  // Once removed, stop observing so the detail query isn't re-fetched (404) while the screen animates away.
  const [deleted, setDeleted] = useState(false);
  const query = useFabric(deleted ? undefined : fabricId);
  const cached = useCachedFabric(fabricId);
  const fabric = query.data?.fabric ?? cached;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (query.isPending || deleted) {
    body = <LoadingBlock />;
  } else if (query.isError || !query.data) {
    body = isNotFoundError(query.error) ? (
      <EmptyState
        icon="layers-outline"
        title="Fabric not found"
        body="This fabric may have been removed."
        action={<Button size="sm" variant="secondary" title="Back to fabrics" onPress={() => router.dismissTo(fabricRoutes.list)} />}
      />
    ) : (
      <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
    );
  } else {
    body = <FabricDetails detail={query.data} onDeleted={() => setDeleted(true)} />;
  }

  return (
    <Screen
      back
      eyebrow={fabric ? `Fabric · ${fabricKindLabel(fabric.kind)}` : "Fabric"}
      title={fabric?.name ?? "Fabric"}
      subtitle={fabric ? subtitleFor(fabric) : undefined}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      keyboard
    >
      {body}
    </Screen>
  );
}

type AdjustMode = "idle" | "received" | "correction";

/** Loaded state. Split out so the drafts can start from the fabric's saved values. */
function FabricDetails({ detail, onDeleted }: { detail: FabricDetailResponse; onDeleted: () => void }) {
  const { fabric, movements, orders } = detail;
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const enough = enoughFor(fabric.metresLeft, fabric.kind);

  // "Warn me below"
  const [editingLow, setEditingLow] = useState(false);
  const [lowDraft, setLowDraft] = useState<number | null>(fabric.lowAtMetres);
  const [lowError, setLowError] = useState<string | null>(null);
  const lowMutation = useMutation({
    mutationFn: (lowAtMetres: number) => api.updateFabric(fabric.id, { lowAtMetres }),
    onSuccess: ({ fabric: saved }) => {
      cacheFabric(queryClient, saved);
      afterFabricChanged(queryClient);
      setEditingLow(false);
    },
    onError: (err) => showError(err, "Couldn't save the minimum"),
  });
  const startLow = () => {
    setLowDraft(fabric.lowAtMetres);
    setLowError(null);
    setEditingLow(true);
  };
  const saveLow = () => {
    if (lowDraft === null) return setLowError("Enter the metres to warn you below.");
    if (lowDraft > 100) return setLowError("Keep it at 100 m or less.");
    setLowError(null);
    lowMutation.mutate(roundMetres(lowDraft));
  };

  // Adjust stock: a delivery (+) or a corrected count (the difference, either sign).
  const [mode, setMode] = useState<AdjustMode>("idle");
  const [draft, setDraft] = useState<number | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const movementMutation = useMutation({
    mutationFn: (body: AddFabricMovementRequest) => api.addFabricMovement(fabric.id, body),
    onSuccess: ({ fabric: saved, movement }) => {
      queryClient.setQueryData<FabricDetailResponse>(queryKeys.fabric(saved.id), (old) =>
        old ? { ...old, fabric: saved, movements: [movement, ...old.movements.filter((m) => m.id !== movement.id)] } : old,
      );
      cacheFabric(queryClient, saved);
      afterFabricChanged(queryClient);
      setMode("idle");
      setDraft(null);
      setDraftError(null);
    },
    onError: (err) => showError(err, "Couldn't update the stock"),
  });
  const startAdjust = (next: AdjustMode) => {
    setDraft(next === "correction" ? fabric.metresLeft : null);
    setDraftError(null);
    setMode(next);
  };
  const cancelAdjust = () => {
    setMode("idle");
    setDraftError(null);
  };
  const saveReceived = () => {
    if (draft === null || draft <= 0) return setDraftError("Enter the metres received.");
    movementMutation.mutate({ metres: roundMetres(draft), reason: "received" });
  };
  const correctionDiff = draft === null ? null : roundMetres(draft - fabric.metresLeft);
  const saveCorrection = () => {
    if (draft === null || correctionDiff === null) return setDraftError("Enter the metres on the shelf now.");
    if (draft < 0) return setDraftError("The count can't be below 0.");
    if (correctionDiff === 0) return setDraftError("That's already the count on file.");
    movementMutation.mutate({ metres: correctionDiff, reason: "correction" });
  };
  const correctionHint =
    correctionDiff === null
      ? `${formatMetres(fabric.metresLeft)} on file now.`
      : correctionDiff === 0
        ? "Same as the count on file."
        : `${formatSignedMetres(correctionDiff)} against the ${formatMetres(fabric.metresLeft)} on file.`;

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFabric(fabric.id),
    onSuccess: () => {
      onDeleted();
      forgetFabric(queryClient, fabric.id);
      // The orders cut from it keep the name but lose the link, so their screens need a refresh.
      afterFabricOrdersChanged(
        queryClient,
        orders.map((o) => o.clientId),
      );
      if (router.canGoBack()) router.back();
      else router.replace(fabricRoutes.list);
    },
    onError: (err) => showError(err, "Couldn't remove the fabric"),
  });
  const onDelete = async () => {
    const ok = await confirm({
      title: "Remove this fabric?",
      message: `${fabric.name} and its history will be removed. ${orders.length > 0 ? `${orders.length === 1 ? "The order" : `The ${orders.length} orders`} cut from it keep the name but lose the link.` : "This can't be undone."}`,
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) deleteMutation.mutate();
  };

  const saving = lowMutation.isPending || movementMutation.isPending;
  const locked = saving || deleteMutation.isPending;

  const details: { label: string; value: string }[] = [
    fabric.supplier ? { label: "Supplier", value: fabric.supplier } : null,
    fabric.colour ? { label: "Colour", value: fabric.colour } : null,
    fabric.widthCm ? { label: "Width", value: `${fabric.widthCm} cm` } : null,
    fabric.costPerMetre !== null ? { label: "Cost per metre", value: formatThb(fabric.costPerMetre) } : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  return (
    <>
      <Card style={styles.card} testID="fabric-stock-card">
        <View style={styles.stockRow}>
          <Swatch hex={fabric.swatch} size={56} />
          <View style={styles.stockText}>
            <Eyebrow tone="muted">Metres left</Eyebrow>
            <View style={styles.stockValueRow} accessibilityLabel={`${metresNumber(fabric.metresLeft)} metres left${fabric.low ? ", running low" : ""}`}>
              <Text style={[styles.stockValue, fabric.low && styles.danger]} numberOfLines={1} adjustsFontSizeToFit>
                {metresNumber(fabric.metresLeft)}
              </Text>
              <Text style={[styles.stockUnit, fabric.low && styles.danger]}>m</Text>
              {fabric.low ? <Tag label="Low" tone="danger" icon="alert-circle-outline" style={styles.lowTag} /> : null}
            </View>
          </View>
        </View>
        <View style={styles.tags}>
          {GARMENT_CHECKS.map(({ key, label }) => {
            const ok = enough[key];
            const metres = GARMENT_METRES[key];
            return <Tag key={key} label={ok ? `${label} · ${formatMetres(metres)}` : `${label} · needs ${formatMetres(metres)}`} tone={ok ? "success" : "danger"} icon={ok ? "checkmark" : "close"} />;
          })}
        </View>
        {editingLow ? (
          <>
            <NumberField
              label="Warn me below"
              unit="m"
              decimals={1}
              value={lowDraft}
              onChangeValue={(v) => {
                setLowDraft(v);
                if (lowError) setLowError(null);
              }}
              hint="The Low badge and Home's count switch on under this length."
              error={lowError}
              editable={!locked}
              autoFocus
              testID="fabric-low-at"
            />
            <View style={styles.actions}>
              <Button size="sm" title="Save" onPress={saveLow} loading={lowMutation.isPending} disabled={locked && !lowMutation.isPending} testID="fabric-low-save" />
              <Button size="sm" variant="ghost" title="Cancel" onPress={() => setEditingLow(false)} disabled={lowMutation.isPending} />
            </View>
          </>
        ) : (
          <View style={styles.warnRow}>
            <Text style={typography.bodyMuted}>Warn me below</Text>
            <Text style={styles.warnValue}>{formatMetres(fabric.lowAtMetres)}</Text>
            <Button size="sm" variant="ghost" icon="pencil-outline" title="Edit" onPress={startLow} disabled={locked} testID="fabric-low-edit" />
          </View>
        )}
      </Card>

      <Card style={styles.card} testID="fabric-adjust-card">
        <Eyebrow>Adjust stock</Eyebrow>
        {mode === "idle" ? (
          <View style={styles.actions}>
            <Button size="sm" variant="secondary" icon="download-outline" title="Received a bolt" onPress={() => startAdjust("received")} disabled={locked} testID="fabric-received" />
            <Button size="sm" variant="secondary" icon="create-outline" title="Correct the count" onPress={() => startAdjust("correction")} disabled={locked} testID="fabric-correct" />
          </View>
        ) : mode === "received" ? (
          <>
            <NumberField
              label="Metres received"
              unit="m"
              decimals={1}
              value={draft}
              onChangeValue={(v) => {
                setDraft(v);
                if (draftError) setDraftError(null);
              }}
              hint={draft && draft > 0 ? `${formatMetres(fabric.metresLeft)} now → ${formatMetres(fabric.metresLeft + draft)} after.` : "Added to the bolt as a delivery."}
              error={draftError}
              editable={!locked}
              autoFocus
              testID="fabric-movement-metres"
            />
            <View style={styles.actions}>
              <Button size="sm" title="Save" onPress={saveReceived} loading={movementMutation.isPending} disabled={locked && !movementMutation.isPending} testID="fabric-movement-save" />
              <Button size="sm" variant="ghost" title="Cancel" onPress={cancelAdjust} disabled={movementMutation.isPending} />
            </View>
          </>
        ) : (
          <>
            <NumberField
              label="Metres on the shelf now"
              unit="m"
              decimals={1}
              value={draft}
              onChangeValue={(v) => {
                setDraft(v);
                if (draftError) setDraftError(null);
              }}
              hint={correctionHint}
              error={draftError}
              editable={!locked}
              autoFocus
              testID="fabric-movement-metres"
            />
            <View style={styles.actions}>
              <Button size="sm" title="Save" onPress={saveCorrection} loading={movementMutation.isPending} disabled={locked && !movementMutation.isPending} testID="fabric-movement-save" />
              <Button size="sm" variant="ghost" title="Cancel" onPress={cancelAdjust} disabled={movementMutation.isPending} />
            </View>
          </>
        )}
        <Text style={typography.small}>Orders take their length off by themselves when they reach Cutting.</Text>
      </Card>

      <Card style={styles.card} testID="fabric-history-card">
        <Eyebrow>History</Eyebrow>
        {movements.length === 0 ? (
          <Text style={typography.small}>Nothing yet. Deliveries, corrections and orders at Cutting will show here.</Text>
        ) : (
          <View>
            {movements.map((movement, i) => (
              <MovementRow key={movement.id} movement={movement} style={i < movements.length - 1 ? styles.rowBorder : undefined} />
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.card} testID="fabric-orders-card">
        <Eyebrow>Used in orders</Eyebrow>
        {orders.length === 0 ? (
          <Text style={typography.small}>No orders cut from this bolt yet. Pick it under Fabric › From stock on a new order.</Text>
        ) : (
          <View>
            {orders.map((order, i) => (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                accessibilityLabel={`Open order: ${order.garment} for ${order.clientName || "client"}`}
                onPress={() => router.push(clientRoutes.order(order.clientId, order.id))}
                style={({ pressed }) => [styles.orderRow, i < orders.length - 1 && styles.rowBorder, pressed && styles.pressed]}
                testID={`fabric-order-${order.id}`}
              >
                <View style={styles.orderText}>
                  <Text style={styles.orderTitle} numberOfLines={1}>
                    {order.clientName || "Client"} · {order.garment}
                  </Text>
                  <Text style={typography.small} numberOfLines={1}>
                    {orderStockLine(order)}
                  </Text>
                </View>
                <OrderStatusTag status={order.status} />
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.card} testID="fabric-details-card">
        <Eyebrow>Details</Eyebrow>
        {details.length === 0 && !fabric.notes ? <Text style={typography.small}>No supplier, colour, width or cost on file yet.</Text> : null}
        {details.map((d) => (
          <View key={d.label} style={styles.detailLine} accessibilityLabel={`${d.label}: ${d.value}`}>
            <Text style={typography.bodyMuted}>{d.label}</Text>
            <Text style={styles.detailValue} numberOfLines={2}>
              {d.value}
            </Text>
          </View>
        ))}
        {fabric.notes ? (
          <View style={styles.notes}>
            <Text style={typography.small}>Notes</Text>
            <Text style={typography.body}>{fabric.notes}</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button size="sm" variant="secondary" icon="pencil-outline" title="Edit details" onPress={() => router.push(fabricRoutes.edit(fabric.id))} disabled={locked} testID="fabric-edit" />
          <Button
            size="sm"
            variant="danger"
            icon="trash-outline"
            title="Remove fabric"
            onPress={() => void onDelete()}
            loading={deleteMutation.isPending}
            disabled={saving}
            testID="fabric-delete"
          />
        </View>
      </Card>
    </>
  );
}

/** "3.3 m taken 12 Oct 2026" / "3.3 m at Cutting" / "No length set". */
function orderStockLine(order: Order): string {
  if (order.metresNeeded === null) return "No length set";
  if (order.metresTakenAt) return `${formatMetres(order.metresNeeded)} taken ${formatDate(order.metresTakenAt)}`;
  return `${formatMetres(order.metresNeeded)} comes off at Cutting`;
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stockText: { flex: 1, minWidth: 0, gap: 2 },
  stockValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  stockValue: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 44, color: colors.navy },
  stockUnit: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 26, color: colors.navy },
  lowTag: { alignSelf: "center", marginLeft: 4 },
  danger: { color: colors.danger },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  warnValue: { flex: 1, fontFamily: fonts.serifSemi, fontSize: 20, lineHeight: 24, color: colors.navy },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8 },
  orderText: { flex: 1, minWidth: 0, gap: 2 },
  orderTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  pressed: { opacity: 0.7 },
  detailLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  detailValue: { flex: 1, textAlign: "right", fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.ink },
  notes: { gap: 4 },
});
