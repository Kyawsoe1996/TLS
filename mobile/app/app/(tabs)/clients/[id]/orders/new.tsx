import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CreateOrderRequest } from "@shared/types";

import { afterOrderChanged, cacheOrder, clientRoutes, dateInputToIso, garmentLabel, useClient, useFittings } from "@/components/clients";
import { Button, Card, Chip, ErrorBanner, Eyebrow, Field, NumberField, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate, formatThb } from "@/lib/format";
import { showError } from "@/lib/toast";

const GARMENT_PRESETS = ["Two-piece suit", "Three-piece suit", "Jacket", "Trousers", "Shirt"] as const;
const CUSTOM_GARMENT = "Custom";
const FABRIC_SUGGESTIONS = ["Super 130s navy wool", "Irish linen", "Charcoal flannel"] as const;

/** Quick deposit choices, as a share of the price. */
const DEPOSIT_PRESETS: { label: string; of: (price: number) => number }[] = [
  { label: "30%", of: (price) => Math.round(price * 0.3) },
  { label: "50%", of: (price) => Math.round(price * 0.5) },
  { label: "Paid in full", of: (price) => price },
];

/** True when `iso` (a local-noon date from dateInputToIso) falls on a day before today. */
function isBeforeToday(iso: string): boolean {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return new Date(iso).getTime() < today.getTime();
}

/** New order for a client. `?fittingId=` (from a fitting screen) preselects the fitting it's cut from. */
export default function NewOrderScreen() {
  const { id, fittingId: fittingParam } = useLocalSearchParams<{ id: string; fittingId?: string }>();
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const clientQuery = useClient(id);
  const fittingsQuery = useFittings(id);

  const [garmentChoice, setGarmentChoice] = useState<string>(GARMENT_PRESETS[0]);
  const [customGarment, setCustomGarment] = useState("");
  const [fabric, setFabric] = useState("");
  const [fittingId, setFittingId] = useState<string | null>(fittingParam || null);
  const [dueAt, setDueAt] = useState("");
  const [dueError, setDueError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fittings = fittingsQuery.data ?? [];
  const balance = price === null ? null : Math.max(0, price - (deposit ?? 0));

  // Arriving from a fitting: suggest its fabric once the fittings load, unless something was already typed.
  const preselected = fittingParam ? fittings.find((f) => f.id === fittingParam) : undefined;
  useEffect(() => {
    if (preselected) setFabric((current) => (current.trim() ? current : preselected.fabric));
  }, [preselected]);

  const mutation = useMutation({
    mutationFn: (body: CreateOrderRequest) => api.createOrder(id, body),
    onSuccess: ({ order }) => {
      cacheOrder(queryClient, order);
      afterOrderChanged(queryClient, id);
      router.replace(clientRoutes.order(id, order.id));
    },
    onError: (err) => showError(err, "Couldn't save order"),
  });

  const submit = () => {
    const garment = (garmentChoice === CUSTOM_GARMENT ? customGarment : garmentChoice).trim();
    if (!garment) return setError("Name the garment. Pick one above or describe your own.");

    const dateText = dueAt.trim();
    let dueIso: string | undefined;
    if (dateText) {
      const iso = dateInputToIso(dateText);
      if (!iso) return setDueError("Use the format YYYY-MM-DD, e.g. 2026-06-12.");
      if (isBeforeToday(iso)) return setDueError("The due date can't be in the past.");
      dueIso = iso;
    }

    if (deposit !== null && price === null) return setPriceError("Add the price to record a deposit against it.");
    if (price !== null && deposit !== null && deposit > price) return setPriceError("The deposit can't be more than the price.");

    setError(null);
    setDueError(null);
    setPriceError(null);
    mutation.mutate({
      garment,
      fabric: fabric.trim() || undefined,
      fittingId: fittingId ?? undefined,
      dueAt: dueIso,
      notes: notes.trim() || undefined,
      price: price ?? undefined,
      deposit: deposit ?? undefined,
    });
  };

  const busy = mutation.isPending;

  return (
    <Screen
      back
      eyebrow={clientQuery.data?.name ?? "Client"}
      title="New order"
      keyboard
      // Pinned below the form so it's always reachable on a long form.
      footer={<Button title="Save order" fullWidth onPress={submit} loading={busy} />}
    >
      <ErrorBanner message={error} />

      <View style={styles.block}>
        <Eyebrow>Garment</Eyebrow>
        <View style={styles.chips}>
          {[...GARMENT_PRESETS, CUSTOM_GARMENT].map((g) => (
            <Chip key={g} label={g} selected={garmentChoice === g} onPress={() => setGarmentChoice(g)} disabled={busy} style={styles.chip} />
          ))}
        </View>
        {garmentChoice === CUSTOM_GARMENT ? (
          <Field
            value={customGarment}
            onChangeText={(t) => {
              setCustomGarment(t);
              if (error) setError(null);
            }}
            placeholder="e.g. Dinner jacket"
            autoCapitalize="sentences"
            returnKeyType="next"
            editable={!busy}
            autoFocus
          />
        ) : null}
      </View>

      <View style={styles.block}>
        <Field
          label="Fabric"
          value={fabric}
          onChangeText={setFabric}
          placeholder="e.g. Super 130s navy wool"
          autoCapitalize="sentences"
          returnKeyType="next"
          hint="Optional."
          editable={!busy}
        />
        <View style={styles.chips}>
          {FABRIC_SUGGESTIONS.map((f) => (
            <Chip key={f} label={f} selected={fabric.trim() === f} onPress={() => setFabric(f)} disabled={busy} style={styles.chip} />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Eyebrow>Based on fitting</Eyebrow>
        {fittings.length > 0 ? (
          <View style={styles.chips}>
            <Chip label="None" selected={fittingId === null} onPress={() => setFittingId(null)} disabled={busy} style={styles.chip} />
            {fittings.map((f) => (
              <Chip
                key={f.id}
                label={`${formatDate(f.createdAt)} · ${garmentLabel(f.garmentType)} · ${f.style}`}
                selected={fittingId === f.id}
                onPress={() => {
                  setFittingId(f.id);
                  setFabric((current) => (current.trim() ? current : f.fabric));
                }}
                disabled={busy}
                style={styles.chip}
              />
            ))}
          </View>
        ) : (
          <Text style={typography.small}>
            {fittingsQuery.isPending ? "Loading fittings…" : "No fittings on file yet. You can link one later from the order."}
          </Text>
        )}
      </View>

      <Field
        label="Due date"
        value={dueAt}
        onChangeText={(t) => {
          setDueAt(t);
          if (dueError) setDueError(null);
        }}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        hint="Optional. The date promised to the client."
        error={dueError}
        editable={!busy}
      />

      <Card style={styles.priceCard} testID="order-price-card">
        <Eyebrow>Price</Eyebrow>
        <View style={styles.priceRow}>
          <NumberField
            label="Price"
            unit="฿"
            decimals={0}
            value={price}
            onChangeValue={(v) => {
              setPrice(v);
              if (priceError) setPriceError(null);
            }}
            containerStyle={styles.cell}
            editable={!busy}
            testID="order-price"
          />
          <NumberField
            label="Deposit paid"
            unit="฿"
            decimals={0}
            value={deposit}
            onChangeValue={(v) => {
              setDeposit(v);
              if (priceError) setPriceError(null);
            }}
            containerStyle={styles.cell}
            editable={!busy}
            testID="order-deposit"
          />
        </View>
        <View style={styles.chips}>
          {DEPOSIT_PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              selected={price !== null && deposit !== null && deposit === preset.of(price)}
              onPress={() => {
                if (price === null) return;
                setDeposit(preset.of(price));
                if (priceError) setPriceError(null);
              }}
              disabled={busy || price === null}
            />
          ))}
        </View>
        {priceError ? <Text style={styles.priceError}>{priceError}</Text> : null}
        {balance !== null ? (
          <View style={styles.balanceRow} accessibilityLabel={`Balance due ${formatThb(balance)}`}>
            <Text style={styles.balanceLabel}>Balance due</Text>
            <Text style={styles.balanceValue}>{formatThb(balance)}</Text>
          </View>
        ) : null}
        <Text style={typography.small}>For your records only. Payments are taken in the shop as usual.</Text>
      </Card>

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Lining, buttons, monogram, anything the workshop should know"
        multiline
        editable={!busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  priceCard: { gap: 12 },
  priceRow: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, minWidth: 0 },
  priceError: { ...typography.small, color: colors.danger },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.sand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceLabel: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.goldDark },
  balanceValue: { ...typography.h3, color: colors.goldDark },
});
