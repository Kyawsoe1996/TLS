import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Order } from "@shared/types";

import { ErrorBlock, LoadingBlock, OrderRow, clientRoutes, useShopOrders, type ShopOrdersFilter } from "@/components/clients";
import { Chip, EmptyState, Screen, SectionTitle } from "@/components/ui";
import { typography } from "@/constants/theme";

interface Group {
  key: string;
  title: string;
  orders: Order[];
}

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

/** Every open order in the shop (grouped by urgency), or the delivered ones. Reached from Home. */
export default function ShopOrdersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ShopOrdersFilter>("open");
  const query = useShopOrders(filter);
  const [refreshing, setRefreshing] = useState(false);

  const orders = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => (filter === "open" ? groupOpenOrders(orders) : []), [filter, orders]);

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
    body = (
      <View style={styles.groups}>
        {groups.map((group) => (
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

  return (
    <Screen back eyebrow="Workshop" title="Orders" refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <View style={styles.chips}>
        <Chip label="Open" icon="cube-outline" selected={filter === "open"} onPress={() => setFilter("open")} style={styles.chip} />
        <Chip label="Delivered" icon="checkmark-circle-outline" selected={filter === "delivered"} onPress={() => setFilter("delivered")} style={styles.chip} />
      </View>

      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44 },
  groups: { gap: 20 },
  list: { gap: 10 },
  count: { ...typography.small, marginBottom: 2 },
});
