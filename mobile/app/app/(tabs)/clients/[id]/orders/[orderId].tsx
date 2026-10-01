import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ORDER_STATUSES, type Client, type Order, type OrderStatus, type UpdateOrderRequest } from "@shared/types";

import {
  ErrorBlock,
  LoadingBlock,
  OrderStatusTag,
  OverdueTag,
  afterOrderChanged,
  cacheOrder,
  clientRoutes,
  dateInputToIso,
  forgetOrder,
  isNotFoundError,
  isoToDateInput,
  orderDueLine,
  orderStatusLabel,
  useClient,
  useFittings,
  useOrder,
} from "@/components/clients";
import { Button, Card, Chip, EmptyState, Eyebrow, Field, Screen, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { confirm, showError } from "@/lib/toast";

/** Order screen: status stepper, due date, notes, the fitting it's cut from, and delete. */
export default function OrderDetailScreen() {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const clientQuery = useClient(id);
  // Once deleted, stop observing so the detail query isn't re-fetched (404) while the screen animates away.
  const [deleted, setDeleted] = useState(false);
  const orderQuery = useOrder(id, deleted ? undefined : orderId);
  const [refreshing, setRefreshing] = useState(false);
  const order = orderQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([orderQuery.refetch(), clientQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (orderQuery.isPending || deleted) {
    body = <LoadingBlock />;
  } else if (orderQuery.isError || !order) {
    body = isNotFoundError(orderQuery.error) ? (
      <EmptyState
        icon="cube-outline"
        title="Order not found"
        body="This order may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to client" onPress={() => router.dismissTo(clientRoutes.detail(id))} />}
      />
    ) : (
      <ErrorBlock error={orderQuery.error} onRetry={() => void orderQuery.refetch()} retrying={orderQuery.isFetching} />
    );
  } else {
    body = <OrderDetails order={order} client={clientQuery.data} onDeleted={() => setDeleted(true)} />;
  }

  return (
    <Screen
      back
      eyebrow={order ? `Order · ${formatDate(order.createdAt)}` : "Order"}
      title={order?.garment ?? "Order"}
      subtitle={order?.fabric ?? undefined}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      keyboard
    >
      {body}
    </Screen>
  );
}

/** Loaded state. Split out so the editable drafts can start from the order's saved values. */
function OrderDetails({ order, client, onDeleted }: { order: Order; client: Client | undefined; onDeleted: () => void }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientId = order.clientId;
  const orderId = order.id;
  const fittingsQuery = useFittings(order.fittingId ? clientId : undefined);
  const linkedFitting = order.fittingId ? fittingsQuery.data?.find((f) => f.id === order.fittingId) : undefined;

  const [dueDraft, setDueDraft] = useState(isoToDateInput(order.dueAt));
  const [dueError, setDueError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(order.notes ?? "");

  const onSaved = (saved: Order) => {
    cacheOrder(queryClient, saved);
    afterOrderChanged(queryClient, saved.clientId);
  };

  // Status: optimistic, rolled back on failure.
  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => api.updateOrder(clientId, orderId, { status }),
    onMutate: async (status) => {
      const key = queryKeys.order(clientId, orderId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Order>(key);
      if (previous) {
        queryClient.setQueryData<Order>(key, { ...previous, status, overdue: status === "delivered" ? false : previous.overdue });
      }
      return { previous };
    },
    onError: (err, _status, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.order(clientId, orderId), context.previous);
      showError(err, "Couldn't update the status");
    },
    onSuccess: ({ order: saved }) => onSaved(saved),
  });

  const changeStatus = async (status: OrderStatus) => {
    if (status === order.status || statusMutation.isPending) return;
    if (status === "delivered") {
      const ok = await confirm({
        title: "Mark as delivered?",
        message: "This completes the order and updates the client's last order date.",
        confirmText: "Mark delivered",
      });
      if (!ok) return;
    }
    statusMutation.mutate(status);
  };

  const dueMutation = useMutation({
    mutationFn: (dueAt: string) => api.updateOrder(clientId, orderId, { dueAt }),
    onSuccess: ({ order: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Couldn't save the due date"),
  });

  const saveDue = () => {
    const text = dueDraft.trim();
    if (!text) return;
    const iso = dateInputToIso(text);
    if (!iso) return setDueError("Use the format YYYY-MM-DD, e.g. 2026-06-12.");
    setDueError(null);
    dueMutation.mutate(iso);
  };

  const notesMutation = useMutation({
    mutationFn: (notes: string) => api.updateOrder(clientId, orderId, { notes }),
    onSuccess: ({ order: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Couldn't save the notes"),
  });

  const unlinkMutation = useMutation({
    // The API accepts `fittingId: null` to unlink; the shared request type only spells the string form, hence the cast.
    mutationFn: () => api.updateOrder(clientId, orderId, { fittingId: null } as unknown as UpdateOrderRequest),
    onSuccess: ({ order: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Couldn't unlink the fitting"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteOrder(clientId, orderId),
    onSuccess: () => {
      onDeleted();
      forgetOrder(queryClient, clientId, orderId);
      if (router.canGoBack()) router.back();
      else router.replace(clientRoutes.detail(clientId));
    },
    onError: (err) => showError(err, "Couldn't delete the order"),
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this order?",
      message: `${order.garment} will be removed from ${client?.name ?? "the client"}'s file. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) deleteMutation.mutate();
  };

  const busy = statusMutation.isPending || dueMutation.isPending || notesMutation.isPending || unlinkMutation.isPending || deleteMutation.isPending;
  const dueDirty = dueDraft.trim() !== "" && dueDraft.trim() !== isoToDateInput(order.dueAt);
  const notesDirty = notesDraft.trim() !== (order.notes ?? "");

  return (
    <>
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Eyebrow tone="muted">Client</Eyebrow>
            <Text style={typography.body} numberOfLines={1}>
              {client?.name ?? "Client"}
            </Text>
          </View>
          <View style={styles.headerText}>
            <Eyebrow tone="muted">Created</Eyebrow>
            <Text style={typography.body}>{formatDate(order.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.tags}>
          <OrderStatusTag status={order.status} />
          {order.overdue ? <OverdueTag /> : null}
        </View>
        <Text style={[typography.small, order.overdue && styles.overdueLine]}>{orderDueLine(order)}</Text>
      </Card>

      <View style={styles.block}>
        <SectionTitle title="Status" style={styles.sectionTitle} />
        <View style={styles.chips}>
          {ORDER_STATUSES.map((status) => (
            <Chip
              key={status}
              label={orderStatusLabel(status)}
              selected={order.status === status}
              onPress={() => void changeStatus(status)}
              disabled={statusMutation.isPending || deleteMutation.isPending}
              style={styles.chip}
              testID={`order-status-${status}`}
            />
          ))}
        </View>
        <Text style={typography.small}>
          {order.status === "delivered" ? "Delivered orders stay on the client's file." : "Tap the step the garment has reached in the workshop."}
        </Text>
      </View>

      <Card style={styles.card}>
        <Field
          label="Due date"
          value={dueDraft}
          onChangeText={(t) => {
            setDueDraft(t);
            if (dueError) setDueError(null);
          }}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={saveDue}
          hint={order.dueAt ? "Leave empty to keep the current date." : "Optional. The date promised to the client."}
          error={dueError}
          editable={!dueMutation.isPending && !deleteMutation.isPending}
        />
        <Button size="sm" title="Save" variant="secondary" onPress={saveDue} loading={dueMutation.isPending} disabled={!dueDirty || deleteMutation.isPending} />
      </Card>

      <Card style={styles.card}>
        <Field
          label="Notes"
          value={notesDraft}
          onChangeText={setNotesDraft}
          placeholder="Lining, buttons, monogram, anything the workshop should know"
          multiline
          editable={!notesMutation.isPending && !deleteMutation.isPending}
        />
        <Button
          size="sm"
          title="Save"
          variant="secondary"
          onPress={() => notesMutation.mutate(notesDraft.trim())}
          loading={notesMutation.isPending}
          disabled={!notesDirty || deleteMutation.isPending}
        />
      </Card>

      {order.fittingId ? (
        <Card style={styles.card}>
          <Eyebrow>Based on fitting</Eyebrow>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open fitting"
            onPress={() => router.push(clientRoutes.fitting(clientId, order.fittingId as string))}
            style={({ pressed }) => [styles.fittingRow, pressed && styles.pressed]}
          >
            <View style={styles.fittingIcon}>
              <Ionicons name="body-outline" size={18} color={colors.goldDark} />
            </View>
            <View style={styles.fittingText}>
              <Text style={styles.fittingTitle} numberOfLines={1}>
                {linkedFitting ? `${formatDate(linkedFitting.createdAt)} · ${linkedFitting.style}` : fittingsQuery.isPending ? "Loading…" : "Fitting"}
              </Text>
              {linkedFitting ? (
                <Text style={typography.small} numberOfLines={1}>
                  {linkedFitting.fabric}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Button
            size="sm"
            variant="ghost"
            icon="unlink-outline"
            title="Unlink"
            onPress={() => unlinkMutation.mutate()}
            loading={unlinkMutation.isPending}
            disabled={deleteMutation.isPending}
          />
        </Card>
      ) : null}

      <Button
        title="Delete order"
        variant="danger"
        icon="trash-outline"
        onPress={() => void onDelete()}
        loading={deleteMutation.isPending}
        disabled={busy && !deleteMutation.isPending}
        fullWidth
        style={styles.delete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 12 },
  headerRow: { flexDirection: "row", gap: 12 },
  headerText: { flex: 1, gap: 2, minWidth: 0 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  overdueLine: { color: colors.danger },
  block: { gap: 10 },
  sectionTitle: { marginBottom: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  card: { gap: 12 },
  fittingRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  pressed: { opacity: 0.7 },
  fittingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  fittingText: { flex: 1, minWidth: 0, gap: 2 },
  fittingTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  delete: { marginTop: 8 },
});
