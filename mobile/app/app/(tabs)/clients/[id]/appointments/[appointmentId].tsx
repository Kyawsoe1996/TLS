import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Appointment, AppointmentStatus, Client, Order, UpdateAppointmentRequest } from "@shared/types";

import {
  AppointmentStatusTag,
  EmailDraftFields,
  ErrorBlock,
  LoadingBlock,
  NoEmailHint,
  OrderStatusTag,
  SentCard,
  afterAppointmentChanged,
  appointmentKindLabel,
  appointmentWhenLine,
  cacheAppointment,
  clientRoutes,
  dateTimeInputToIso,
  forgetAppointment,
  isNotFoundError,
  isoToDateInput,
  isoToTimeInput,
  reminderDraft,
  useAppointment,
  useClient,
  useMessages,
  useOrders,
  useSendEmail,
  type EmailDraft,
} from "@/components/clients";
import { Button, Card, EmptyState, Eyebrow, Field, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { confirm, showError } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

/** Appointment screen: when, status (done / cancelled / reopen), reschedule, notes, linked order, reminder email, delete. */
export default function AppointmentDetailScreen() {
  const { id, appointmentId } = useLocalSearchParams<{ id: string; appointmentId: string }>();
  const router = useRouter();
  const clientQuery = useClient(id);
  // Once deleted, stop observing so the detail query isn't re-fetched (404) while the screen animates away.
  const [deleted, setDeleted] = useState(false);
  const appointmentQuery = useAppointment(id, deleted ? undefined : appointmentId);
  const [refreshing, setRefreshing] = useState(false);
  const appointment = appointmentQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([appointmentQuery.refetch(), clientQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (appointmentQuery.isPending || deleted) {
    body = <LoadingBlock />;
  } else if (appointmentQuery.isError || !appointment) {
    body = isNotFoundError(appointmentQuery.error) ? (
      <EmptyState
        icon="calendar-outline"
        title="Appointment not found"
        body="This appointment may have been deleted."
        action={<Button size="sm" variant="secondary" title="Back to client" onPress={() => router.dismissTo(clientRoutes.detail(id))} />}
      />
    ) : (
      <ErrorBlock error={appointmentQuery.error} onRetry={() => void appointmentQuery.refetch()} retrying={appointmentQuery.isFetching} />
    );
  } else {
    body = <AppointmentDetails appointment={appointment} client={clientQuery.data} onDeleted={() => setDeleted(true)} />;
  }

  return (
    <Screen
      back
      eyebrow={clientQuery.data?.name ?? "Appointment"}
      title={appointment ? appointmentKindLabel(appointment.kind) : "Appointment"}
      subtitle={appointment ? appointmentWhenLine(appointment) : undefined}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      keyboard
    >
      {body}
    </Screen>
  );
}

/** Loaded state. Split out so the editable drafts can start from the appointment's saved values. */
function AppointmentDetails({ appointment, client, onDeleted }: { appointment: Appointment; client: Client | undefined; onDeleted: () => void }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientId = appointment.clientId;
  const appointmentId = appointment.id;
  const ordersQuery = useOrders(appointment.orderId ? clientId : undefined);
  const linkedOrder = appointment.orderId ? ordersQuery.data?.find((o) => o.id === appointment.orderId) : undefined;

  const [dateDraft, setDateDraft] = useState(isoToDateInput(appointment.startsAt));
  const [timeDraft, setTimeDraft] = useState(isoToTimeInput(appointment.startsAt));
  const [whenError, setWhenError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(appointment.notes ?? "");

  const onSaved = (saved: Appointment) => {
    cacheAppointment(queryClient, saved);
    afterAppointmentChanged(queryClient, saved.clientId);
  };

  // Status: optimistic, rolled back on failure.
  const statusMutation = useMutation({
    mutationFn: (status: AppointmentStatus) => api.updateAppointment(clientId, appointmentId, { status }),
    onMutate: async (status) => {
      const key = queryKeys.appointment(clientId, appointmentId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Appointment>(key);
      if (previous) queryClient.setQueryData<Appointment>(key, { ...previous, status });
      return { previous };
    },
    onError: (err, _status, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.appointment(clientId, appointmentId), context.previous);
      showError(err, "Couldn't update the appointment");
    },
    onSuccess: ({ appointment: saved }) => onSaved(saved),
  });

  const cancelAppointment = async () => {
    const ok = await confirm({
      title: "Cancel this appointment?",
      message: `${client?.name ?? "The client"} won't be reminded about it. You can reopen it later.`,
      confirmText: "Cancel appointment",
      destructive: true,
    });
    if (ok) statusMutation.mutate("cancelled");
  };

  const whenMutation = useMutation({
    mutationFn: (startsAt: string) => api.updateAppointment(clientId, appointmentId, { startsAt }),
    onSuccess: ({ appointment: saved }) => {
      onSaved(saved);
      setWhenError(null);
    },
    onError: (err) => showError(err, "Couldn't move the appointment"),
  });

  const saveWhen = () => {
    const startsAt = dateTimeInputToIso(dateDraft, timeDraft);
    if (!startsAt) return setWhenError("Use YYYY-MM-DD for the date and HH:MM for the time.");
    whenMutation.mutate(startsAt);
  };

  const notesMutation = useMutation({
    mutationFn: (notes: string) => api.updateAppointment(clientId, appointmentId, { notes }),
    onSuccess: ({ appointment: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Couldn't save the notes"),
  });

  const unlinkMutation = useMutation({
    // The API accepts `orderId: null` to unlink; the shared request type only spells the string form, hence the cast.
    mutationFn: () => api.updateAppointment(clientId, appointmentId, { orderId: null } as unknown as UpdateAppointmentRequest),
    onSuccess: ({ appointment: saved }) => onSaved(saved),
    onError: (err) => showError(err, "Couldn't unlink the order"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAppointment(clientId, appointmentId),
    onSuccess: () => {
      onDeleted();
      forgetAppointment(queryClient, clientId, appointmentId);
      if (router.canGoBack()) router.back();
      else router.replace(clientRoutes.detail(clientId));
    },
    onError: (err) => showError(err, "Couldn't delete the appointment"),
  });

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this appointment?",
      message: `It will be removed from ${client?.name ?? "the client"}'s file. Reminder emails already sent stay on the file. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) deleteMutation.mutate();
  };

  const busy = statusMutation.isPending || whenMutation.isPending || notesMutation.isPending || unlinkMutation.isPending || deleteMutation.isPending;
  const whenDirty = dateDraft.trim() !== isoToDateInput(appointment.startsAt) || timeDraft.trim() !== isoToTimeInput(appointment.startsAt);
  const notesDirty = notesDraft.trim() !== (appointment.notes ?? "");
  const scheduled = appointment.status === "scheduled";

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
            <Eyebrow tone="muted">When</Eyebrow>
            <Text style={typography.body}>{formatDateTime(appointment.startsAt)}</Text>
          </View>
        </View>
        <View style={styles.tags}>
          <AppointmentStatusTag status={appointment.status} />
          {appointment.reminderSentAt ? <Text style={typography.small}>Reminder sent {formatDateTime(appointment.reminderSentAt)}</Text> : null}
        </View>
        <View style={styles.statusActions}>
          {scheduled ? (
            <>
              <Button
                size="sm"
                icon="checkmark"
                title="Mark done"
                onPress={() => statusMutation.mutate("done")}
                loading={statusMutation.isPending}
                disabled={deleteMutation.isPending}
                style={styles.grow}
                testID="appointment-done"
              />
              <Button
                size="sm"
                variant="ghost"
                icon="close-outline"
                title="Cancel appointment"
                onPress={() => void cancelAppointment()}
                disabled={busy}
                testID="appointment-cancel"
              />
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon="refresh-outline"
              title="Reopen"
              onPress={() => statusMutation.mutate("scheduled")}
              loading={statusMutation.isPending}
              disabled={deleteMutation.isPending}
              testID="appointment-reopen"
            />
          )}
        </View>
      </Card>

      {scheduled ? <RemindClientCard appointment={appointment} client={client} order={linkedOrder} /> : null}

      <Card style={styles.card}>
        <Eyebrow>{scheduled ? "Reschedule" : "Date and time"}</Eyebrow>
        <View style={styles.whenRow}>
          <Field
            label="Date"
            value={dateDraft}
            onChangeText={(t) => {
              setDateDraft(t);
              if (whenError) setWhenError(null);
            }}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            containerStyle={styles.whenCell}
            editable={!whenMutation.isPending && !deleteMutation.isPending}
          />
          <Field
            label="Time"
            value={timeDraft}
            onChangeText={(t) => {
              setTimeDraft(t);
              if (whenError) setWhenError(null);
            }}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={saveWhen}
            containerStyle={styles.whenCellSmall}
            editable={!whenMutation.isPending && !deleteMutation.isPending}
          />
        </View>
        {whenError ? <Text style={styles.fieldError}>{whenError}</Text> : null}
        <Button size="sm" title="Save" variant="secondary" onPress={saveWhen} loading={whenMutation.isPending} disabled={!whenDirty || deleteMutation.isPending} />
      </Card>

      <Card style={styles.card}>
        <Field
          label="Notes"
          value={notesDraft}
          onChangeText={setNotesDraft}
          placeholder="Bring the shoes, second fitting for the trousers, anything to remember"
          multiline
          hint="Only you see this; it isn't sent to the client."
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

      {appointment.orderId ? (
        <Card style={styles.card}>
          <Eyebrow>{appointment.kind === "collection" ? "Garment to collect" : "For order"}</Eyebrow>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open order"
            onPress={() => router.push(clientRoutes.order(clientId, appointment.orderId as string))}
            style={({ pressed }) => [styles.orderRow, pressed && styles.pressed]}
          >
            <View style={styles.orderIcon}>
              <Ionicons name="cube-outline" size={18} color={colors.goldDark} />
            </View>
            <View style={styles.orderText}>
              <Text style={styles.orderTitle} numberOfLines={1}>
                {linkedOrder ? linkedOrder.garment : ordersQuery.isPending ? "Loading…" : "Order"}
              </Text>
              {linkedOrder ? (
                <View style={styles.tags}>
                  <OrderStatusTag status={linkedOrder.status} />
                </View>
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
        title="Delete appointment"
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

/**
 * Shown while the appointment is scheduled: a prefilled reminder email (editable) sent to the client's address.
 * The latest reminder for this appointment, if any, shows as the sent state until the user taps "Send again".
 */
function RemindClientCard({ appointment, client, order }: { appointment: Appointment; client: Client | undefined; order: Order | undefined }) {
  const shop = useShop().data ?? null;
  const messagesQuery = useMessages(appointment.clientId);
  const { send, sending, sent, reset } = useSendEmail(client);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<EmailDraft | null>(null);

  const firstName = client ? client.name.trim().split(/\s+/)[0] || client.name : "";
  const replyTo = shop?.replyToEmail?.trim() || null;
  // Until the user edits, the draft follows the client / shop / order as they load.
  const defaults = useMemo<EmailDraft>(() => reminderDraft(appointment, client, shop, order), [appointment, client, shop, order]);
  const draft = edited ?? defaults;

  // The list is newest first, so the first match is the latest reminder for this appointment.
  const existing = messagesQuery.data?.find((m) => m.kind === "appointment_reminder" && m.appointmentId === appointment.id);
  const shown = sent ?? existing;

  const onSend = async () => {
    const message = await send({ kind: "appointment_reminder", appointmentId: appointment.id, ...draft });
    if (message) setComposing(false);
  };

  return (
    <Card style={styles.remindCard} testID="remind-client-card">
      <View style={styles.remindHeader}>
        <Ionicons name="mail-outline" size={16} color={colors.goldDark} />
        <Eyebrow>Remind client</Eyebrow>
      </View>

      {shown && !composing ? (
        <SentCard message={shown} label={shown.status === "sent" ? "Reminder sent" : undefined}>
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
          <Text style={typography.body}>Email {firstName || "the client"} the date and time. The message is saved to their file.</Text>

          <Card style={styles.remindInner}>
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
            <View style={styles.remindFooter}>
              <View style={styles.remindActions}>
                <Button size="sm" variant="ghost" icon="pencil-outline" title="Edit" onPress={() => setEditing(true)} disabled={sending} />
                <Button
                  size="sm"
                  icon="send-outline"
                  title="Send reminder"
                  onPress={() => void onSend()}
                  loading={sending}
                  disabled={!client}
                  style={styles.grow}
                  testID="appointment-remind-send"
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
  headerText: { flex: 1, gap: 2, minWidth: 0 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  statusActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  card: { gap: 12 },
  whenRow: { flexDirection: "row", gap: 10 },
  whenCell: { flex: 3, minWidth: 0 },
  whenCellSmall: { flex: 2, minWidth: 0 },
  fieldError: { ...typography.small, color: colors.danger },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  pressed: { opacity: 0.7 },
  orderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { flex: 1, minWidth: 0, gap: 4 },
  orderTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  remindCard: { backgroundColor: colors.sand, borderColor: colors.sand, gap: 12 },
  remindHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  remindInner: { gap: 4 },
  draftSubject: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  draftLabel: { marginTop: 8 },
  remindFooter: { gap: 6 },
  remindActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  caption: { ...typography.small, textAlign: "center" },
  delete: { marginTop: 8 },
});
