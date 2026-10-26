import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FABRIC_KINDS, type Fabric } from "@shared/types";

import { ErrorBlock, LoadingBlock } from "@/components/clients";
import { FabricRow, fabricKindLabel, fabricRoutes, filterFabrics, groupFabrics, listSubtitle, lowBanner, useFabrics, type FabricFilter } from "@/components/fabrics";
import { Button, Chip, EmptyState, Field, Screen, SectionTitle } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";

/**
 * Every bolt on the shelf, low ones first. `?low=1` (from Home's "Fabrics running low") preselects the Low filter.
 * The search box and chips filter on the phone; the list itself is one GET /fabrics.
 */
export default function FabricsScreen() {
  const { low } = useLocalSearchParams<{ low?: string }>();
  const lowParam = low === "1" || low === "true";
  const router = useRouter();
  const query = useFabrics();

  const [filter, setFilter] = useState<FabricFilter>(lowParam ? "low" : "all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Re-apply the filter whenever Home navigates here with (or without) the param.
  useEffect(() => {
    setFilter(lowParam ? "low" : "all");
  }, [lowParam]);

  const fabrics = useMemo(() => query.data ?? [], [query.data]);
  const lowCount = useMemo(() => fabrics.filter((f) => f.low).length, [fabrics]);
  // Only the kinds the shop actually keeps get a chip.
  const kinds = useMemo(() => FABRIC_KINDS.filter((kind) => fabrics.some((f) => f.kind === kind)), [fabrics]);
  const visible = useMemo(() => filterFabrics(fabrics, search, filter), [fabrics, search, filter]);
  const groups = useMemo(() => groupFabrics(visible), [visible]);
  const filtered = search.trim() !== "" || filter !== "all";

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  const openFabric = (fabric: Fabric) => router.push(fabricRoutes.detail(fabric.id));
  const addFabric = () => router.push(fabricRoutes.newFabric);

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError && !query.data) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (fabrics.length === 0) {
    body = (
      <EmptyState
        icon="layers-outline"
        title="No fabrics yet"
        body="Add the bolts you keep on the shelf. Orders cut from them take their length off at Cutting."
        action={<Button size="sm" variant="gold" icon="add" title="Add fabric" onPress={addFabric} />}
      />
    );
  } else if (visible.length === 0) {
    body =
      filter === "low" && !search.trim() ? (
        <EmptyState icon="checkmark-circle-outline" title="Nothing running low" body="Every bolt is above its minimum." action={<Button size="sm" variant="secondary" title="Show all" onPress={clearFilters} />} />
      ) : (
        <EmptyState icon="search-outline" title="No matches" body="Try another name, colour or supplier, or clear the filter." action={<Button size="sm" variant="secondary" title="Clear filters" onPress={clearFilters} />} />
      );
  } else {
    const sections = [
      { key: "low", title: "Running low", fabrics: groups.low },
      { key: "stock", title: "In stock", fabrics: groups.inStock },
    ].filter((s) => s.fabrics.length > 0);
    body = (
      <View style={styles.groups}>
        {sections.map((section) => (
          <View key={section.key}>
            <SectionTitle title={section.title} right={<Text style={typography.small}>{section.fabrics.length}</Text>} />
            <View style={styles.list}>
              {section.fabrics.map((fabric) => (
                <FabricRow key={fabric.id} fabric={fabric} onPress={() => openFabric(fabric)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen
      back
      eyebrow="Workshop"
      title="Fabrics"
      subtitle={query.isPending ? undefined : listSubtitle(fabrics.length, lowCount)}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New fabric"
          hitSlop={8}
          onPress={addFabric}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          testID="fabrics-add"
        >
          <Ionicons name="add" size={24} color={colors.navy} />
        </Pressable>
      }
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, colour or supplier"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search fabrics"
        right={
          search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Ionicons name="search-outline" size={20} color={colors.muted} />
          )
        }
      />

      <View style={styles.chips}>
        <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} style={styles.chip} />
        <LowChip count={lowCount} selected={filter === "low"} onPress={() => setFilter(filter === "low" ? "all" : "low")} />
        {kinds.map((kind) => (
          <Chip key={kind} label={fabricKindLabel(kind)} selected={filter === kind} onPress={() => setFilter(filter === kind ? "all" : kind)} style={styles.chip} />
        ))}
      </View>

      {lowCount > 0 ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={colors.dangerDeep} />
          <Text style={styles.bannerText}>{lowBanner(lowCount)}</Text>
        </View>
      ) : null}

      {query.isError && query.data ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}

      {body}

      {!query.isPending && fabrics.length > 0 && !filtered ? (
        <Text style={styles.footnote}>Tap a bolt for its history, or add the next delivery with the + button.</Text>
      ) : null}
    </Screen>
  );
}

/** The "Low" filter chip: a red dot and the count, styled like the kit's Chip. */
function LowChip({ count, selected, onPress }: { count: number; selected: boolean; onPress: () => void }) {
  const fg = selected ? colors.ivory : colors.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Running low, ${count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.lowChip, selected ? styles.lowChipSelected : styles.lowChipIdle, pressed && styles.pressed]}
      testID="fabrics-filter-low"
    >
      <View style={[styles.lowDot, count === 0 && styles.lowDotQuiet]} />
      <Text style={[styles.lowChipLabel, { color: fg }]}>Low</Text>
      {count > 0 ? <Text style={[styles.lowChipCount, selected ? styles.lowChipCountSelected : styles.lowChipCountIdle]}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  lowChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.chip, borderWidth: 1 },
  lowChipIdle: { backgroundColor: colors.card, borderColor: colors.line },
  lowChipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  lowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  lowDotQuiet: { backgroundColor: colors.line },
  lowChipLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  lowChipCount: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, minWidth: 20, textAlign: "center", borderRadius: 10, paddingHorizontal: 6 },
  lowChipCountIdle: { backgroundColor: colors.dangerSoft, color: colors.dangerDeep },
  lowChipCountSelected: { backgroundColor: colors.danger, color: colors.ivory },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.dangerDeep },
  groups: { gap: 20 },
  list: { gap: 10 },
  footnote: { ...typography.small, textAlign: "center" },
});
