import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Order } from "@shared/types";

import { Card } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDate, formatThb } from "@/lib/format";

import { OrderStatusTag, OverdueTag } from "./Tag";

export interface OrderRowProps {
  order: Order;
  onPress: () => void;
}

/** "Due 12 Jun 2026" / "Overdue · due 10 Jun 2026" / "Delivered 15 Jun 2026" / "No due date". */
export function orderDueLine(order: Order): string {
  if (order.status === "delivered") return order.deliveredAt ? `Delivered ${formatDate(order.deliveredAt)}` : "Delivered";
  if (!order.dueAt) return "No due date";
  return order.overdue ? `Overdue · due ${formatDate(order.dueAt)}` : `Due ${formatDate(order.dueAt)}`;
}

/** What's still owed: the API's `balance`, or price − deposit (never below 0) if it's missing. `null` when no price is set. */
export function orderBalance(order: Order): number | null {
  if (order.price === null || order.price === undefined) return null;
  if (typeof order.balance === "number") return order.balance;
  return Math.max(0, order.price - (order.deposit ?? 0));
}

/** One order on the client file or the shop-wide list: garment · fabric, client (shop-wide), status tags, due line, balance. */
export function OrderRow({ order, onPress }: OrderRowProps) {
  const balance = orderBalance(order);
  return (
    <Card onPress={onPress} style={styles.card} testID={`order-row-${order.id}`}>
      <View style={styles.top}>
        <View style={styles.titleBlock}>
          <Text style={typography.h3} numberOfLines={2}>
            {order.garment}
            {order.fabric ? <Text style={styles.fabric}> · {order.fabric}</Text> : null}
          </Text>
          {order.clientName ? (
            <Text style={styles.client} numberOfLines={1}>
              {order.clientName}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
      <View style={styles.tags}>
        <OrderStatusTag status={order.status} />
        {order.overdue ? <OverdueTag /> : null}
      </View>
      <Text style={[typography.small, order.overdue && styles.overdueLine]}>{orderDueLine(order)}</Text>
      {balance === null ? null : balance > 0 ? (
        <Text style={styles.balanceDue}>Balance due {formatThb(balance)}</Text>
      ) : (
        <Text style={typography.small}>Paid in full</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titleBlock: { flex: 1, gap: 2, minWidth: 0 },
  fabric: { color: colors.muted },
  client: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  overdueLine: { color: colors.danger },
  balanceDue: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.goldDark, marginTop: -4 },
});
