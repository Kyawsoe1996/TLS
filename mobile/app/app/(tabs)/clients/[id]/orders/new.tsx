import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CreateOrderRequest } from "@shared/types";

import { ErrorBlock, afterOrderChanged, cacheOrder, clientRoutes, dateInputToIso, garmentLabel, useClient, useFittings } from "@/components/clients";
import { FabricPickRow, defaultMetresFor, fabricRoutes, formatMetres, roundMetres, useFabrics } from "@/components/fabrics";
import { Button, Card, Chip, ErrorBanner, Eyebrow, Field, NumberField, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { formatDate, formatThb } from "@/lib/format";
import { showError } from "@/lib/toast";

const GARMENT_PRESETS = ["Two-piece suit", "Three-piece suit", "Jacket", "Trousers", "Shirt"] as const;
const CUSTOM_GARMENT = "Custom";
const FABRIC_SUGGESTIONS = ["Super 130s navy wool", "Irish linen", "Charcoal flannel"] as const;

/** How the order's fabric is set: a bolt from stock (Fabric stock), the client's own cloth, or a typed name. */
type FabricMode = "stock" | "own" | "typed";
const OWN_CLOTH = "Client's own cloth";
/** The "Length for this order" stepper: ±0.1 m, within the contract's 0.1–100 m. */
const METRES_STEP = 0.1;
const METRES_MAX = 100;

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
  const [fabricMode, setFabricMode] = useState<FabricMode>("stock");
  const [fabricId, setFabricId] = useState<string | null>(null);
  const [metresNeeded, setMetresNeeded] = useState<number>(() => defaultMetresFor(GARMENT_PRESETS[0]));
  // Once the length is stepped by hand it no longer follows the garment chip.
  const [metresTouched, setMetresTouched] = useState(false);
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

  // Fabric stock: the bolts on the shelf, the one picked, and the garment name the default length follows.
  const fabricsQuery = useFabrics();
  const stockFabrics = useMemo(() => fabricsQuery.data ?? [], [fabricsQuery.data]);
  const selectedFabric = fabricId ? stockFabrics.find((f) => f.id === fabricId) : undefined;
  const garmentName = (garmentChoice === CUSTOM_GARMENT ? customGarment : garmentChoice).trim() || "Order";

  // The default length follows the garment chip until the stepper is used.
  useEffect(() => {
    if (!metresTouched) setMetresNeeded(defaultMetresFor(garmentName));
  }, [garmentName, metresTouched]);

  const stepMetres = (delta: number) => {
    setMetresTouched(true);
    setMetresNeeded((current) => Math.min(METRES_MAX, Math.max(METRES_STEP, roundMetres(current + delta))));
  };

  /** A fitting's fabric: the matching bolt in stock when there is one, otherwise its name typed in (unless something was already typed). */
  const adoptFabricName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const match = stockFabrics.find((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (match) {
        setFabricId(match.id);
        setFabricMode("stock");
      } else {
        setFabric((current) => (current.trim() ? current : trimmed));
        setFabricMode("typed");
      }
    },
    [stockFabrics],
  );

  // Arriving from a fitting: adopt its fabric once the fittings and the shelf have loaded (once per fitting).
  const preselected = fittingParam ? fittings.find((f) => f.id === fittingParam) : undefined;
  const adoptedFitting = useRef<string | null>(null);
  useEffect(() => {
    if (!preselected || fabricsQuery.isPending || adoptedFitting.current === preselected.id) return;
    adoptedFitting.current = preselected.id;
    adoptFabricName(preselected.fabric);
  }, [preselected, fabricsQuery.isPending, adoptFabricName]);

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

    // Fabric: a bolt from stock (with the length it takes at Cutting), the client's own cloth, or a typed name.
    let fabricFields: Pick<CreateOrderRequest, "fabric" | "fabricId" | "metresNeeded"> = {};
    if (fabricMode === "stock" && stockFabrics.length > 0) {
      if (!selectedFabric) return setError("Pick the bolt this order is cut from, or choose another fabric option.");
      fabricFields = { fabric: selectedFabric.name, fabricId: selectedFabric.id, metresNeeded: roundMetres(metresNeeded) };
    } else if (fabricMode === "own") {
      fabricFields = { fabric: OWN_CLOTH };
    } else if (fabricMode === "typed") {
      fabricFields = { fabric: fabric.trim() || undefined };
    }

    setError(null);
    setDueError(null);
    setPriceError(null);
    mutation.mutate({
      garment,
      ...fabricFields,
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
        <Eyebrow>Fabric</Eyebrow>
        <View style={styles.chips}>
          <Chip label="From stock" icon="layers-outline" selected={fabricMode === "stock"} onPress={() => setFabricMode("stock")} disabled={busy} style={styles.chip} testID="order-fabric-stock" />
          <Chip label="Client's own cloth" selected={fabricMode === "own"} onPress={() => setFabricMode("own")} disabled={busy} style={styles.chip} testID="order-fabric-own" />
          <Chip label="Type a name" selected={fabricMode === "typed"} onPress={() => setFabricMode("typed")} disabled={busy} style={styles.chip} testID="order-fabric-typed" />
        </View>
        {fabricMode === "stock" ? (
          fabricsQuery.isPending ? (
            <Text style={typography.small}>Loading your fabrics…</Text>
          ) : fabricsQuery.isError ? (
            <ErrorBlock error={fabricsQuery.error} onRetry={() => void fabricsQuery.refetch()} retrying={fabricsQuery.isFetching} />
          ) : stockFabrics.length === 0 ? (
            <Card variant="soft" style={styles.stockHint}>
              <Text style={typography.small}>Nothing on the shelf yet. Add the bolts you keep and orders will take their length off at Cutting.</Text>
              <Button size="sm" variant="secondary" icon="layers-outline" title="Open Fabrics" onPress={() => router.push(fabricRoutes.list)} disabled={busy} />
            </Card>
          ) : (
            <>
              <View style={styles.stockList}>
                {stockFabrics.map((f) => (
                  <FabricPickRow
                    key={f.id}
                    fabric={f}
                    selected={fabricId === f.id}
                    needed={metresNeeded}
                    garmentLabel={garmentName}
                    onPress={() => {
                      setFabricId((current) => (current === f.id ? null : f.id));
                      if (error) setError(null);
                    }}
                    disabled={busy}
                  />
                ))}
              </View>
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>Length for this order</Text>
                <View style={styles.stepper} accessibilityLabel={`Length for this order: ${formatMetres(metresNeeded)}`}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Less"
                    hitSlop={6}
                    onPress={() => stepMetres(-METRES_STEP)}
                    disabled={busy || metresNeeded <= METRES_STEP}
                    style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                    testID="order-metres-minus"
                  >
                    <Ionicons name="remove" size={18} color={colors.navy} />
                  </Pressable>
                  <Text style={styles.stepperValue} testID="order-metres">
                    {formatMetres(metresNeeded)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="More"
                    hitSlop={6}
                    onPress={() => stepMetres(METRES_STEP)}
                    disabled={busy || metresNeeded >= METRES_MAX}
                    style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
                    testID="order-metres-plus"
                  >
                    <Ionicons name="add" size={18} color={colors.navy} />
                  </Pressable>
                </View>
              </View>
              <Text style={typography.small}>The length comes off the bolt when the order reaches Cutting, not before.</Text>
            </>
          )
        ) : fabricMode === "own" ? (
          <Text style={typography.small}>The order will note the cloth is the client&apos;s own; nothing comes off your shelf.</Text>
        ) : (
          <>
            <Field
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
          </>
        )}
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
                  if (!selectedFabric) adoptFabricName(f.fabric);
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
  stockHint: { gap: 10 },
  stockList: { gap: 8 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepperLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 4 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  stepperValue: { minWidth: 60, textAlign: "center", fontFamily: fonts.serifSemi, fontSize: 18, lineHeight: 22, color: colors.navy },
  pressed: { opacity: 0.7 },
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
