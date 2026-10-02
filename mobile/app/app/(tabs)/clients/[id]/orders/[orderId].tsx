import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { ORDER_STATUSES, type Client, type Order, type OrderStatus, type UpdateOrderRequest } from "@shared/types";

import {
  EmailDraftFields,
  ErrorBlock,
  LoadingBlock,
  NoEmailHint,
  OrderStatusTag,
  OverdueTag,
  SentCard,
  afterOrderChanged,
  cacheOrder,
  clientRoutes,
  dateInputToIso,
  forgetOrder,
  garmentLabel,
  isNotFoundError,
  isoToDateInput,
  orderBalance,
  orderDueLine,
  orderStatusLabel,
  useClient,
  useFittings,
  useMessages,
  useOrder,
  useSendEmail,
  type EmailDraft,
} from "@/components/clients";
import { Button, Card, Chip, EmptyState, Eyebrow, Field, NumberField, Screen, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate, formatThb } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { confirm, showError } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

/** Order screen: status stepper, payment, due date, notes, the fitting it's cut from, and delete. */
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

      <PaymentCard order={order} disabled={deleteMutation.isPending} onSaved={onSaved} />

      {order.status === "ready" ? <NotifyClientCard order={order} client={client} /> : null}

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
                {linkedFitting
                  ? `${formatDate(linkedFitting.createdAt)} · ${garmentLabel(linkedFitting.garmentType)} · ${linkedFitting.style}`
                  : fittingsQuery.isPending
                    ? "Loading…"
                    : "Fitting"}
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

type PaymentMode = "view" | "record" | "edit";

/** The contract allows `null` to clear price / deposit on PATCH; the request type only spells the number form. */
function paymentBody(body: { price?: number | null; deposit?: number | null }): UpdateOrderRequest {
  return body as unknown as UpdateOrderRequest;
}

/**
 * Price / deposit / balance for the shop's records. "Record payment" adds an amount to the deposit (capped at the
 * price); "Edit price" rewrites both. Without a price it only offers to add one.
 */
function PaymentCard({ order, disabled, onSaved }: { order: Order; disabled: boolean; onSaved: (saved: Order) => void }) {
  const api = useApi();
  const [mode, setMode] = useState<PaymentMode>("view");
  const [amount, setAmount] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState<number | null>(order.price);
  const [depositDraft, setDepositDraft] = useState<number | null>(order.deposit);
  const [error, setError] = useState<string | null>(null);

  const price = order.price;
  const deposit = order.deposit ?? 0;
  const balance = orderBalance(order);

  const mutation = useMutation({
    mutationFn: (body: UpdateOrderRequest) => api.updateOrder(order.clientId, order.id, body),
    onSuccess: ({ order: saved }) => {
      onSaved(saved);
      setMode("view");
      setAmount(null);
      setError(null);
    },
    onError: (err) => showError(err, "Couldn't save the payment"),
  });

  const startRecord = () => {
    setAmount(null);
    setError(null);
    setMode("record");
  };
  const startEdit = () => {
    setPriceDraft(order.price);
    setDepositDraft(order.deposit);
    setError(null);
    setMode("edit");
  };
  const cancel = () => {
    setError(null);
    setMode("view");
  };

  const saveRecord = () => {
    if (price === null) return;
    if (amount === null || amount <= 0) return setError("Enter the amount received.");
    mutation.mutate(paymentBody({ deposit: Math.min(price, deposit + amount) }));
  };

  const saveEdit = () => {
    if (priceDraft === null) {
      // No price means nothing to owe against: clear the deposit with it.
      mutation.mutate(paymentBody({ price: null, deposit: null }));
      return;
    }
    if (depositDraft !== null && depositDraft > priceDraft) return setError("The deposit can't be more than the price.");
    mutation.mutate(paymentBody({ price: priceDraft, deposit: depositDraft }));
  };

  const saving = mutation.isPending;
  const locked = disabled || saving;

  let content;
  if (mode === "record" && price !== null) {
    content = (
      <>
        <NumberField
          label="Amount received"
          unit="฿"
          decimals={0}
          value={amount}
          onChangeValue={(v) => {
            setAmount(v);
            if (error) setError(null);
          }}
          hint={balance !== null ? `Balance due ${formatThb(balance)} · deposit so far ${formatThb(deposit)}` : undefined}
          error={error}
          editable={!locked}
          autoFocus
          testID="payment-amount"
        />
        <View style={styles.paymentActions}>
          <Button size="sm" title="Save" onPress={saveRecord} loading={saving} disabled={disabled} testID="payment-save" />
          <Button size="sm" variant="ghost" title="Cancel" onPress={cancel} disabled={saving} />
        </View>
      </>
    );
  } else if (mode === "edit") {
    content = (
      <>
        <View style={styles.paymentFields}>
          <NumberField
            label="Price"
            unit="฿"
            decimals={0}
            value={priceDraft}
            onChangeValue={(v) => {
              setPriceDraft(v);
              if (error) setError(null);
            }}
            containerStyle={styles.paymentCell}
            editable={!locked}
            autoFocus={price === null}
            testID="payment-price"
          />
          <NumberField
            label="Deposit paid"
            unit="฿"
            decimals={0}
            value={depositDraft}
            onChangeValue={(v) => {
              setDepositDraft(v);
              if (error) setError(null);
            }}
            containerStyle={styles.paymentCell}
            editable={!locked}
            testID="payment-deposit"
          />
        </View>
        {error ? <Text style={styles.paymentError}>{error}</Text> : null}
        <Text style={typography.small}>
          {priceDraft === null ? "Leave the price empty to clear it from the order." : `Balance due ${formatThb(Math.max(0, priceDraft - (depositDraft ?? 0)))}`}
        </Text>
        <View style={styles.paymentActions}>
          <Button size="sm" title="Save" onPress={saveEdit} loading={saving} disabled={disabled} testID="payment-save" />
          <Button size="sm" variant="ghost" title="Cancel" onPress={cancel} disabled={saving} />
        </View>
      </>
    );
  } else if (price === null) {
    content = (
      <>
        <Text style={typography.small}>No price recorded</Text>
        <Button size="sm" variant="secondary" icon="add" title="Add price" onPress={startEdit} disabled={locked} testID="payment-add-price" />
      </>
    );
  } else {
    const settled = balance !== null && balance <= 0;
    content = (
      <>
        <View style={styles.paymentRows}>
          <PaymentLine label="Price" value={formatThb(price)} />
          <PaymentLine label="Deposit paid" value={formatThb(deposit)} />
          <PaymentLine
            label="Balance due"
            value={settled ? "Paid in full" : formatThb(balance)}
            valueStyle={settled ? styles.paymentSettled : styles.paymentDue}
            strong
          />
        </View>
        <View style={styles.paymentActions}>
          {!settled ? (
            <Button size="sm" variant="secondary" icon="cash-outline" title="Record payment" onPress={startRecord} disabled={locked} testID="payment-record" />
          ) : null}
          <Button size="sm" variant="ghost" icon="pencil-outline" title="Edit price" onPress={startEdit} disabled={locked} testID="payment-edit" />
        </View>
      </>
    );
  }

  return (
    <Card style={styles.card} testID="order-payment-card">
      <Eyebrow>Payment</Eyebrow>
      {content}
    </Card>
  );
}

function PaymentLine({ label, value, valueStyle, strong = false }: { label: string; value: string; valueStyle?: StyleProp<TextStyle>; strong?: boolean }) {
  return (
    <View style={styles.paymentLine} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.bodyMuted, strong && styles.paymentStrongLabel]}>{label}</Text>
      <Text style={[styles.paymentValue, valueStyle]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Shown while the order is "ready": a prefilled "your garment is ready" email (editable) sent to the client's address.
 * The latest order_ready message for this order, if any, shows as the sent state until the user taps "Send again".
 */
function NotifyClientCard({ order, client }: { order: Order; client: Client | undefined }) {
  const shop = useShop().data ?? null;
  const messagesQuery = useMessages(order.clientId);
  const { send, sending, sent, reset } = useSendEmail(client);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<EmailDraft | null>(null);

  const garment = order.garment.toLowerCase();
  const firstName = client ? client.name.trim().split(/\s+/)[0] || client.name : "";
  const replyTo = shop?.replyToEmail?.trim() || null;
  // Until the user edits, the draft follows the client / shop as they load. Opening hours (from Shop details) slot in when set.
  const defaults = useMemo<EmailDraft>(() => {
    const where = shop ? `${shop.name}, ${shop.district}` : "the shop";
    const hours = shop?.openingHours?.trim();
    return {
      subject: `Your ${garment} is ready`,
      body: `${firstName || "Hello"}, your ${garment} is ready for collection at ${where}.${hours ? ` We're open ${hours}.` : ""} Reply if you'd like us to hold it for a particular day.`,
    };
  }, [garment, firstName, shop]);
  const draft = edited ?? defaults;

  // The list is newest first, so the first match is the latest notification for this order.
  const existing = messagesQuery.data?.find((m) => m.kind === "order_ready" && m.orderId === order.id);
  const shown = sent ?? existing;

  const onSend = async () => {
    const message = await send({ kind: "order_ready", orderId: order.id, ...draft });
    if (message) setComposing(false);
  };

  return (
    <Card style={styles.notifyCard} testID="notify-client-card">
      <View style={styles.notifyHeader}>
        <Ionicons name="mail-outline" size={16} color={colors.goldDark} />
        <Eyebrow>Notify client</Eyebrow>
      </View>

      {shown && !composing ? (
        <SentCard message={shown} label={shown.status === "sent" ? "Notified by email" : undefined}>
          <Button
            size="sm"
            variant="ghost"
            icon="refresh-outline"
            title="Send again"
            onPress={() => {
              reset();
              setComposing(true);
            }}
          />
        </SentCard>
      ) : (
        <>
          <Text style={typography.body}>
            {firstName || "The client"}&apos;s {garment} is ready. Let them know by email; the message is saved to their file.
          </Text>

          <Card style={styles.notifyInner}>
            {editing ? (
              <EmailDraftFields
                subject={draft.subject}
                body={draft.body}
                onSubjectChange={(subject) => setEdited({ ...draft, subject })}
                onBodyChange={(body) => setEdited({ ...draft, body })}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <Text style={typography.small}>Subject</Text>
                <Text style={styles.draftSubject}>{draft.subject}</Text>
                <Text style={[typography.small, styles.draftLabel]}>Body</Text>
                <Text style={typography.body}>{draft.body}</Text>
              </>
            )}
          </Card>

          {client && !client.email ? (
            <NoEmailHint client={client} />
          ) : !editing ? (
            <View style={styles.notifyFooter}>
              <View style={styles.notifyActions}>
                <Button size="sm" variant="ghost" icon="pencil-outline" title="Edit" onPress={() => setEditing(true)} disabled={sending} />
                <Button
                  size="sm"
                  icon="send-outline"
                  title="Send email"
                  onPress={() => void onSend()}
                  loading={sending}
                  disabled={!client}
                  style={styles.grow}
                  testID="order-notify-send"
                />
              </View>
              <Text style={styles.caption}>
                To {client?.email ?? "…"}
                {replyTo ? ` · replies go to ${replyTo}` : ""}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 12 },
  headerRow: { flexDirection: "row", gap: 12 },
  notifyCard: { backgroundColor: colors.sand, borderColor: colors.sand, gap: 12 },
  notifyHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  notifyInner: { gap: 4 },
  draftSubject: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  draftLabel: { marginTop: 8 },
  notifyFooter: { gap: 6 },
  notifyActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  caption: { ...typography.small, textAlign: "center" },
  headerText: { flex: 1, gap: 2, minWidth: 0 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  overdueLine: { color: colors.danger },
  block: { gap: 10 },
  sectionTitle: { marginBottom: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  card: { gap: 12 },
  paymentRows: { gap: 6 },
  paymentLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  paymentStrongLabel: { fontFamily: fonts.bodySemi, color: colors.ink },
  paymentValue: { ...typography.h3, textAlign: "right" },
  paymentDue: { color: colors.goldDark },
  paymentSettled: { color: colors.successFg },
  paymentActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  paymentFields: { flexDirection: "row", gap: 10 },
  paymentCell: { flex: 1, minWidth: 0 },
  paymentError: { ...typography.small, color: colors.danger },
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
