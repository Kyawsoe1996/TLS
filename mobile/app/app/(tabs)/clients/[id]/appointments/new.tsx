import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { APPOINTMENT_KINDS, type AppointmentKind, type CreateAppointmentRequest } from "@shared/types";

import {
  TIME_PRESETS,
  afterAppointmentChanged,
  appointmentKindLabel,
  cacheAppointment,
  clientRoutes,
  dateTimeInputToIso,
  isoToDateInput,
  orderStatusLabel,
  useClient,
  useOrders,
} from "@/components/clients";
import { Button, Chip, ErrorBanner, Eyebrow, Field, Screen } from "@/components/ui";
import { typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";

const KIND_HINTS: Record<AppointmentKind, string> = {
  fitting: "Measuring or trying on a garment in progress.",
  collection: "The client picks up a finished garment.",
  consultation: "Talking through fabric, style and price.",
};

/** New appointment for a client. `?orderId=` (from an order screen) preselects a collection for that order. */
export default function NewAppointmentScreen() {
  const { id, orderId: orderParam, date: dateParam } = useLocalSearchParams<{ id: string; orderId?: string; date?: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);
  const ordersQuery = useOrders(id);

  const [kind, setKind] = useState<AppointmentKind>(orderParam ? "collection" : "fitting");
  // The day view hands over the day it was on (YYYY-MM-DD) so the tailor only picks the time.
  const [date, setDate] = useState(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : "");
  const [time, setTime] = useState("");
  const [whenError, setWhenError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(orderParam || null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only garments still in the workshop can be collected or fitted.
  const openOrders = (ordersQuery.data ?? []).filter((o) => o.status !== "delivered");

  const mutation = useMutation({
    mutationFn: (body: CreateAppointmentRequest) => api.createAppointment(id, body),
    onSuccess: ({ appointment }) => {
      cacheAppointment(queryClient, appointment);
      afterAppointmentChanged(queryClient, id);
      router.replace(clientRoutes.appointment(id, appointment.id));
    },
    onError: (err) => showError(err, "Couldn't save the appointment"),
  });

  const submit = () => {
    if (!date.trim()) return setWhenError("Add the date, e.g. 2026-06-12.");
    if (!time.trim()) return setWhenError("Pick a time or type one, e.g. 14:30.");
    const startsAt = dateTimeInputToIso(date, time);
    if (!startsAt) return setWhenError("Use YYYY-MM-DD for the date and HH:MM for the time.");
    if (new Date(startsAt).getTime() < Date.now() - 60_000) return setWhenError("The appointment can't be in the past.");

    setError(null);
    setWhenError(null);
    mutation.mutate({
      kind,
      startsAt,
      orderId: orderId ?? undefined,
      notes: notes.trim() || undefined,
    });
  };

  const busy = mutation.isPending;
  const todayText = isoToDateInput(new Date().toISOString());

  return (
    <Screen
      back
      eyebrow={clientQuery.data?.name ?? "Client"}
      title="Schedule"
      keyboard
      footer={<Button title="Save appointment" fullWidth onPress={submit} loading={busy} />}
    >
      <ErrorBanner message={error} />

      <View style={styles.block}>
        <Eyebrow>What for</Eyebrow>
        <View style={styles.chips}>
          {APPOINTMENT_KINDS.map((k) => (
            <Chip key={k} label={appointmentKindLabel(k)} selected={kind === k} onPress={() => setKind(k)} disabled={busy} style={styles.chip} />
          ))}
        </View>
        <Text style={typography.small}>{KIND_HINTS[kind]}</Text>
      </View>

      <View style={styles.block}>
        <Field
          label="Date"
          value={date}
          onChangeText={(t) => {
            setDate(t);
            if (whenError) setWhenError(null);
          }}
          placeholder={todayText}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          hint="YYYY-MM-DD"
          editable={!busy}
          testID="appointment-date"
        />
        <View style={styles.chips}>
          <Chip label="Today" selected={date.trim() === todayText} onPress={() => setDate(todayText)} disabled={busy} style={styles.chip} />
          <Chip
            label="Tomorrow"
            selected={date.trim() === isoToDateInput(new Date(Date.now() + 86_400_000).toISOString())}
            onPress={() => setDate(isoToDateInput(new Date(Date.now() + 86_400_000).toISOString()))}
            disabled={busy}
            style={styles.chip}
          />
        </View>
      </View>

      <View style={styles.block}>
        <Field
          label="Time"
          value={time}
          onChangeText={(t) => {
            setTime(t);
            if (whenError) setWhenError(null);
          }}
          placeholder="14:30"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          hint="24-hour clock, in the shop's local time."
          error={whenError}
          editable={!busy}
          testID="appointment-time"
        />
        <View style={styles.chips}>
          {TIME_PRESETS.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={time.trim() === t}
              onPress={() => {
                setTime(t);
                if (whenError) setWhenError(null);
              }}
              disabled={busy}
              style={styles.chip}
            />
          ))}
        </View>
      </View>

      {kind !== "consultation" ? (
        <View style={styles.block}>
          <Eyebrow>{kind === "collection" ? "Garment to collect" : "For order"}</Eyebrow>
          {openOrders.length > 0 ? (
            <View style={styles.chips}>
              <Chip label="None" selected={orderId === null} onPress={() => setOrderId(null)} disabled={busy} style={styles.chip} />
              {openOrders.map((o) => (
                <Chip
                  key={o.id}
                  label={`${o.garment} · ${orderStatusLabel(o.status)}`}
                  selected={orderId === o.id}
                  onPress={() => setOrderId(o.id)}
                  disabled={busy}
                  style={styles.chip}
                />
              ))}
            </View>
          ) : (
            <Text style={typography.small}>
              {ordersQuery.isPending ? "Loading orders…" : "No open orders on file. You can link one later from the appointment."}
            </Text>
          )}
        </View>
      ) : null}

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Bring the shoes, second fitting for the trousers, anything to remember"
        multiline
        hint="Optional. Only you see this; it isn't sent to the client."
        editable={!busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
});
