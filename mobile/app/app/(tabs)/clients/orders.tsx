import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Order } from "@shared/types";

import { ErrorBlock, LoadingBlock, OrderRow, clientRoutes, orderStatusLabel, useShopOrders, type ShopOrdersFilter } from "@/components/clients";
import { Card, Chip, EmptyState, Eyebrow, KpiList, Screen, SectionTitle } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { daysSince } from "@/lib/format";

interface Group {
  key: string;
  title: string;
  orders: Order[];
}

/** Which summary row is acting as a filter. "all" = every open order. */
type Focus = "all" | "overdue" | "due";

/** Open orders by urgency: overdue, due within 7 days, later, no date. Empty groups are dropped. */
function groupOpenOrders(orders: Order[], now = new Date()): Group[] {
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const overdue: Order[] = [];
  const week: Order[] = [];
  const later: Order[] = [];
  const noDate: Order[] = [];
  for (const order of orders) {
    if (order.overdue) overdue.push(order);
    else if (!order.dueAt) noDate.push(order);
    else if (new Date(order.dueAt).getTime() <= weekAhead) week.push(order);
    else later.push(order);
  }
  return [
    { key: "overdue", title: "Overdue", orders: overdue },
    { key: "week", title: "Due this week", orders: week },
    { key: "later", title: "Later", orders: later },
    { key: "noDate", title: "No due date", orders: noDate },
  ].filter((g) => g.orders.length > 0);
}

/** "Daniel R. · John Doe" or "Daniel R. · John Doe · +2" for the Overdue row's note. */
function overdueNames(orders: Order[]): string | undefined {
  const names = Array.from(new Set(orders.map((o) => o.clientName?.replace(/\s*\(sample\)$/i, "") ?? "Client")));
  if (names.length === 0) return undefined;
  const shown = names.slice(0, 2).join(" · ");
  return names.length > 2 ? `${shown} · +${names.length - 2}` : shown;
}

/** Plain-language nudge for the oldest overdue order. No AI call: the facts are all local. */
function overdueNudge(orders: Order[]): string | null {
  const oldest = orders.filter((o) => o.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  if (!oldest) return null;
  const who = (oldest.clientName ?? "This client").replace(/\s*\(sample\)$/i, "");
  const first = who.split(" ")[0];
  const late = daysSince(oldest.dueAt!);
  const garment = oldest.garment.toLowerCase();
  const stage = orderStatusLabel(oldest.status).toLowerCase();
  const next =
    oldest.status === "ready"
      ? `It's ready, so let ${first} know it can be collected today.`
      : oldest.status === "fitting"
        ? `Book ${first}'s next fitting this week and tell them the new date.`
        : `Move it to the front of the workshop and tell ${first} the new date.`;
  return `${first}'s ${garment} is ${late} ${late === 1 ? "day" : "days"} late and still at ${stage}. ${next}`;
}

/** Every open order in the shop (grouped by urgency), or the delivered ones. Reached from Home. */
export default function ShopOrdersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ShopOrdersFilter>("open");
  const [focus, setFocus] = useState<Focus>("all");
  const query = useShopOrders(filter);
  const [refreshing, setRefreshing] = useState(false);

  const orders = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => (filter === "open" ? groupOpenOrders(orders) : []), [filter, orders]);

  // Summary numbers, the same definitions as Home: "due this week" includes the overdue ones.
  const overdueOrders = useMemo(() => groups.find((g) => g.key === "overdue")?.orders ?? [], [groups]);
  const weekOrders = useMemo(() => groups.find((g) => g.key === "week")?.orders ?? [], [groups]);
  const dueSoonCount = overdueOrders.length + weekOrders.length;

  const visibleGroups = useMemo(() => {
    if (focus === "overdue") return groups.filter((g) => g.key === "overdue");
    if (focus === "due") return groups.filter((g) => g.key === "overdue" || g.key === "week");
    return groups;
  }, [focus, groups]);

  const toggle = (next: Focus) => setFocus((current) => (current === next ? "all" : next));
  const nudge = useMemo(() => (focus === "overdue" ? overdueNudge(overdueOrders) : null), [focus, overdueOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openOrder = (order: Order) => router.push(clientRoutes.order(order.clientId, order.id));

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (orders.length === 0) {
    body =
      filter === "open" ? (
        <EmptyState icon="cube-outline" title="No open orders" body="Create an order from a client's file." />
      ) : (
        <EmptyState icon="checkmark-circle-outline" title="No delivered orders" body="Orders marked as delivered will appear here." />
      );
  } else if (filter === "open") {
    body =
      visibleGroups.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={focus === "overdue" ? "Nothing overdue" : "Nothing due this week"}
          body="Every order is on track."
        />
      ) : (
        <View style={styles.groups}>
          {visibleGroups.map((group) => (
            <View key={group.key}>
              <SectionTitle title={group.title} right={<Text style={typography.small}>{group.orders.length}</Text>} />
              <View style={styles.list}>
                {group.orders.map((order) => (
                  <OrderRow key={order.id} order={order} onPress={() => openOrder(order)} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
  } else {
    body = (
      <View style={styles.list}>
        <Text style={styles.count}>
          {orders.length} {orders.length === 1 ? "order" : "orders"} delivered
        </Text>
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} onPress={() => openOrder(order)} />
        ))}
      </View>
    );
  }

  const n = (value: number) => (query.isPending ? "—" : String(value));

  return (
    <Screen back eyebrow="Workshop" title="Orders" refreshing={refreshing} onRefresh={() => void onRefresh()}>
      {filter === "open" ? (
        // Same rows as Home; here they filter the list instead of navigating.
        <KpiList
          items={[
            { key: "open", icon: "cube-outline", label: "Orders in progress", value: n(orders.length), onPress: () => setFocus("all") },
            {
              key: "overdue",
              icon: "alert-circle-outline",
              label: "Overdue",
              value: n(overdueOrders.length),
              note: focus === "overdue" ? overdueNames(overdueOrders) : undefined,
              accent: overdueOrders.length > 0 ? "danger" : false,
              selected: focus === "overdue",
              onPress: () => toggle("overdue"),
            },
            {
              key: "due",
              icon: "time-outline",
              label: "Due this week",
              value: n(dueSoonCount),
              note: dueSoonCount > 0 ? "Check the workshop" : undefined,
              accent: dueSoonCount > 0,
              selected: focus === "due",
              onPress: () => toggle("due"),
            },
          ]}
        />
      ) : null}

      <View style={styles.chips}>
        <Chip label="Open" icon="cube-outline" selected={filter === "open"} onPress={() => setFilter("open")} style={styles.chip} />
        <Chip label="Delivered" icon="checkmark-circle-outline" selected={filter === "delivered"} onPress={() => setFilter("delivered")} style={styles.chip} />
      </View>

      {filter === "open" && focus !== "all" ? (
        <View style={[styles.filterBar, focus === "overdue" ? styles.filterBarDanger : styles.filterBarAccent]}>
          <Ionicons
            name={focus === "overdue" ? "alert-circle-outline" : "time-outline"}
            size={16}
            color={focus === "overdue" ? colors.dangerDeep : colors.goldDark}
          />
          <Text style={[styles.filterText, focus === "overdue" ? styles.filterTextDanger : styles.filterTextAccent]}>
            {focus === "overdue" ? "Showing overdue orders only" : "Showing orders due this week"}
          </Text>
          <Pressable onPress={() => setFocus("all")} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.filterClear, focus === "overdue" ? styles.filterTextDanger : styles.filterTextAccent]}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {body}

      {nudge ? (
        <Card variant="dark" style={styles.nudge}>
          <Eyebrow tone="onDark">Suggestion</Eyebrow>
          <Text style={styles.nudgeText}>{nudge}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  groups: { gap: 20 },
  list: { gap: 10 },
  count: { ...typography.small, marginBottom: 2 },
  filterBar: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 12 },
  filterBarDanger: { backgroundColor: colors.dangerSoft },
  filterBarAccent: { backgroundColor: colors.sand },
  filterText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13 },
  filterTextDanger: { color: colors.dangerDeep },
  filterTextAccent: { color: colors.goldDark },
  filterClear: { fontFamily: fonts.bodyBold, fontSize: 13, minHeight: 24 },
  nudge: { gap: 8 },
  nudgeText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.ivorySoft },
});
