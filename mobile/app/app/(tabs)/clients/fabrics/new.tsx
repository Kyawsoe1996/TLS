import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FABRIC_KINDS, FABRIC_LIMITS, type CreateFabricRequest, type Fabric, type FabricKind, type UpdateFabricRequest } from "@shared/types";

import { ErrorBlock, LoadingBlock, isNotFoundError } from "@/components/clients";
import { SWATCH_PALETTE, afterFabricChanged, afterFabricOrdersChanged, cacheFabric, fabricKindLabel, fabricRoutes, isPaleHex, roundMetres, useFabric } from "@/components/fabrics";
import { Button, Card, Chip, EmptyState, ErrorBanner, Eyebrow, Field, NumberField, Screen } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { showError } from "@/lib/toast";

const DEFAULT_LOW_AT = 3;

/** The contract allows `null` to clear an optional field on PATCH; the request type only spells the string / number form. */
function updateBody(body: {
  name: string;
  supplier: string | null;
  colour: string | null;
  kind: FabricKind;
  widthCm: number | null;
  lowAtMetres: number;
  costPerMetre: number | null;
  swatch: string | null;
  notes: string | null;
}): UpdateFabricRequest {
  return body as unknown as UpdateFabricRequest;
}

/** New fabric, or — with `?fabricId=` — the same form editing an existing one (metres on the shelf then change through movements). */
export default function NewFabricScreen() {
  const { fabricId } = useLocalSearchParams<{ fabricId?: string }>();
  const router = useRouter();
  const detailQuery = useFabric(fabricId || undefined);

  if (!fabricId) return <FabricForm />;
  if (detailQuery.isPending) {
    return (
      <Screen back eyebrow="Edit fabric" title="Fabric">
        <LoadingBlock />
      </Screen>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen back eyebrow="Edit fabric" title="Fabric">
        {isNotFoundError(detailQuery.error) ? (
          <EmptyState
            icon="layers-outline"
            title="Fabric not found"
            body="This fabric may have been removed."
            action={<Button size="sm" variant="secondary" title="Back to fabrics" onPress={() => router.dismissTo(fabricRoutes.list)} />}
          />
        ) : (
          <ErrorBlock error={detailQuery.error} onRetry={() => void detailQuery.refetch()} retrying={detailQuery.isFetching} />
        )}
      </Screen>
    );
  }
  return <FabricForm initial={detailQuery.data.fabric} orderClientIds={detailQuery.data.orders.map((o) => o.clientId)} />;
}

interface FieldErrors {
  name?: string;
  width?: string;
  metres?: string;
  low?: string;
  cost?: string;
}

/** The form itself; `initial` switches it to edit mode. Split out so the drafts can start from the saved values. */
function FabricForm({ initial, orderClientIds = [] }: { initial?: Fabric; orderClientIds?: string[] }) {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const editing = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [colour, setColour] = useState(initial?.colour ?? "");
  const [kind, setKind] = useState<FabricKind>(initial?.kind ?? "suiting");
  const [widthCm, setWidthCm] = useState<number | null>(initial?.widthCm ?? null);
  const [metresLeft, setMetresLeft] = useState<number | null>(null);
  const [lowAt, setLowAt] = useState<number | null>(initial?.lowAtMetres ?? DEFAULT_LOW_AT);
  const [cost, setCost] = useState<number | null>(initial?.costPerMetre ?? null);
  const [swatch, setSwatch] = useState<string | null>(initial?.swatch ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearField = (key: keyof FieldErrors) => {
    if (fieldErrors[key]) setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const createMutation = useMutation({
    mutationFn: (body: CreateFabricRequest) => api.createFabric(body),
    onSuccess: ({ fabric }) => {
      cacheFabric(queryClient, fabric);
      afterFabricChanged(queryClient);
      router.replace(fabricRoutes.detail(fabric.id));
    },
    onError: (err) => showError(err, "Couldn't add the fabric"),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateFabricRequest) => api.updateFabric((initial as Fabric).id, body),
    onSuccess: ({ fabric }) => {
      cacheFabric(queryClient, fabric);
      afterFabricChanged(queryClient);
      // The API copies a new name onto the orders cut from this bolt, so their screens need a refresh too.
      if (initial && fabric.name !== initial.name) afterFabricOrdersChanged(queryClient, orderClientIds);
      if (router.canGoBack()) router.back();
      else router.replace(fabricRoutes.detail(fabric.id));
    },
    onError: (err) => showError(err, "Couldn't save the fabric"),
  });

  const submit = () => {
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) errors.name = "Give the fabric a name, e.g. Super 130s navy wool.";
    if (widthCm !== null && (!Number.isInteger(widthCm) || widthCm < 50 || widthCm > 400)) errors.width = "A whole number between 50 and 400 cm.";
    if (!editing && metresLeft !== null && (metresLeft < 0 || metresLeft > FABRIC_LIMITS.maxMetres)) errors.metres = `Between 0 and ${FABRIC_LIMITS.maxMetres} m.`;
    if (lowAt !== null && (lowAt < 0 || lowAt > 100)) errors.low = "Between 0 and 100 m.";
    if (cost !== null && (cost < 0 || cost > 1_000_000)) errors.cost = "Up to ฿1,000,000 a metre.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return setError("Check the highlighted fields.");
    setError(null);

    if (initial) {
      updateMutation.mutate(
        updateBody({
          name: trimmedName,
          supplier: supplier.trim() || null,
          colour: colour.trim() || null,
          kind,
          widthCm,
          lowAtMetres: roundMetres(lowAt ?? DEFAULT_LOW_AT),
          costPerMetre: cost,
          swatch,
          notes: notes.trim() || null,
        }),
      );
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      supplier: supplier.trim() || undefined,
      colour: colour.trim() || undefined,
      kind,
      widthCm: widthCm ?? undefined,
      metresLeft: metresLeft === null ? undefined : roundMetres(metresLeft),
      lowAtMetres: lowAt === null ? undefined : roundMetres(lowAt),
      costPerMetre: cost ?? undefined,
      swatch: swatch ?? undefined,
      notes: notes.trim() || undefined,
    });
  };

  const busy = createMutation.isPending || updateMutation.isPending;
  const selectedSwatch = swatch ? SWATCH_PALETTE.find((p) => p.hex.toUpperCase() === swatch.toUpperCase()) : undefined;

  return (
    <Screen
      back
      eyebrow={editing ? "Edit fabric" : "Workshop"}
      title={editing ? initial.name : "New fabric"}
      keyboard
      footer={<Button title={editing ? "Save changes" : "Add fabric"} fullWidth onPress={submit} loading={busy} testID="fabric-save" />}
    >
      <ErrorBanner message={error} />

      <Field
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          clearField("name");
          if (error) setError(null);
        }}
        placeholder="e.g. Super 130s navy wool"
        autoCapitalize="sentences"
        returnKeyType="next"
        error={fieldErrors.name}
        editable={!busy}
        autoFocus={!editing}
        testID="fabric-name"
      />

      <View style={styles.row}>
        <Field label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Mill or merchant" autoCapitalize="words" returnKeyType="next" containerStyle={styles.cell} editable={!busy} />
        <Field label="Colour" value={colour} onChangeText={setColour} placeholder="e.g. Navy" autoCapitalize="sentences" returnKeyType="next" containerStyle={styles.cell} editable={!busy} />
      </View>

      <View style={styles.block}>
        <Eyebrow>Kind</Eyebrow>
        <View style={styles.chips}>
          {FABRIC_KINDS.map((k) => (
            <Chip key={k} label={fabricKindLabel(k)} selected={kind === k} onPress={() => setKind(k)} disabled={busy} style={styles.chip} />
          ))}
        </View>
      </View>

      <Card style={styles.card}>
        <Eyebrow>On the shelf</Eyebrow>
        <View style={styles.row}>
          <NumberField
            label="Width"
            unit="cm"
            decimals={0}
            value={widthCm}
            onChangeValue={(v) => {
              setWidthCm(v);
              clearField("width");
            }}
            placeholder="150"
            error={fieldErrors.width}
            containerStyle={styles.cell}
            editable={!busy}
            testID="fabric-width"
          />
          {editing ? null : (
            <NumberField
              label="Metres on the shelf"
              unit="m"
              decimals={1}
              value={metresLeft}
              onChangeValue={(v) => {
                setMetresLeft(v);
                clearField("metres");
              }}
              error={fieldErrors.metres}
              containerStyle={styles.cell}
              editable={!busy}
              testID="fabric-metres"
            />
          )}
        </View>
        <View style={styles.row}>
          <NumberField
            label="Warn me below"
            unit="m"
            decimals={1}
            value={lowAt}
            onChangeValue={(v) => {
              setLowAt(v);
              clearField("low");
            }}
            placeholder={String(DEFAULT_LOW_AT)}
            error={fieldErrors.low}
            containerStyle={styles.cell}
            editable={!busy}
            testID="fabric-low-at"
          />
          <NumberField
            label="Cost per metre"
            unit="฿"
            decimals={0}
            value={cost}
            onChangeValue={(v) => {
              setCost(v);
              clearField("cost");
            }}
            error={fieldErrors.cost}
            containerStyle={styles.cell}
            editable={!busy}
            testID="fabric-cost"
          />
        </View>
        <Text style={typography.small}>
          {editing
            ? "Metres on the shelf change from the fabric's own screen: a delivery or a corrected count."
            : "The starting length is recorded as a delivery. Orders take their length off when they reach Cutting."}
        </Text>
      </Card>

      <View style={styles.block}>
        <Text style={typography.label}>Swatch colour</Text>
        <View style={styles.palette}>
          {SWATCH_PALETTE.map((p) => {
            const selected = selectedSwatch?.key === p.key;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                accessibilityState={{ selected, disabled: busy }}
                onPress={() => setSwatch(selected ? null : p.hex)}
                disabled={busy}
                style={({ pressed }) => [styles.swatchOption, selected && styles.swatchOptionSelected, pressed && styles.pressed]}
                testID={`fabric-swatch-${p.key}`}
              >
                <View style={[styles.swatchFill, { backgroundColor: p.hex }]}>
                  {selected ? <Ionicons name="checkmark" size={18} color={isPaleHex(p.hex) ? colors.navy : colors.ivory} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={typography.small}>
          {selectedSwatch ? `${selectedSwatch.label} · tap it again to clear.` : swatch ? `${swatch} · pick a preset to change it.` : "Optional. Shown as the square next to the name."}
        </Text>
      </View>

      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Weight, composition, where it's kept" multiline editable={!busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  cell: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  card: { gap: 12 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatchOption: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatchOptionSelected: { borderColor: colors.navy },
  swatchFill: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(20, 33, 58, 0.14)" },
  pressed: { opacity: 0.8 },
});
