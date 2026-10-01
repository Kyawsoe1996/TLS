import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  ErrorBlock,
  FittingRow,
  InactiveTag,
  LoadingBlock,
  Monogram,
  OrderRow,
  clientRoutes,
  isNotFoundError,
  useClient,
  useFittings,
  useOrders,
} from "@/components/clients";
import { Button, Card, EmptyState, Eyebrow, Screen, SectionTitle, type IoniconName } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDate, formatMonthsSince, monthsSince } from "@/lib/format";
import { showError } from "@/lib/toast";

/** Client file: contact details, actions, orders and fittings (both newest first). */
export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const clientQuery = useClient(id);
  const ordersQuery = useOrders(id);
  const fittingsQuery = useFittings(id);
  const [refreshing, setRefreshing] = useState(false);
  const client = clientQuery.data;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([clientQuery.refetch(), ordersQuery.refetch(), fittingsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const open = async (url: string, what: string) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      showError(err, `Couldn't open ${what}`);
    }
  };

  if (clientQuery.isPending) {
    return (
      <Screen back eyebrow="Client file">
        <LoadingBlock />
      </Screen>
    );
  }

  if (clientQuery.isError || !client) {
    return (
      <Screen back eyebrow="Client file">
        {isNotFoundError(clientQuery.error) ? (
          <EmptyState
            icon="person-remove-outline"
            title="Client not found"
            body="This client may have been deleted."
            action={<Button size="sm" variant="secondary" title="Back to clients" onPress={() => router.dismissTo(clientRoutes.list)} />}
          />
        ) : (
          <ErrorBlock error={clientQuery.error} onRetry={() => void clientQuery.refetch()} retrying={clientQuery.isFetching} />
        )}
      </Screen>
    );
  }

  const firstName = client.name.trim().split(/\s+/)[0] || client.name;
  const quietMonths = monthsSince(client.lastOrderAt ?? client.createdAt);
  const hasContact = !!(client.phone || client.email || client.lineId);
  const orders = ordersQuery.data ?? [];
  const fittings = fittingsQuery.data ?? [];

  return (
    <Screen
      back
      eyebrow="Client file"
      title={client.name}
      headerRight={<Monogram name={client.name} size={44} />}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <Card style={styles.headerCard}>
        <View style={styles.lastOrderRow}>
          <View style={styles.lastOrderText}>
            <Eyebrow tone="muted">Last order</Eyebrow>
            <Text style={typography.body}>
              {formatMonthsSince(client.lastOrderAt)}
              {client.lastOrderAt ? <Text style={typography.small}> · {formatDate(client.lastOrderAt)}</Text> : null}
            </Text>
          </View>
          {client.inactive ? <InactiveTag /> : null}
        </View>

        <View style={styles.divider} />

        {hasContact ? (
          <View style={styles.contacts}>
            {client.phone ? (
              <ContactRow icon="call-outline" label="Phone" value={client.phone} action="Call" onPress={() => void open(`tel:${client.phone}`, "the dialer")} />
            ) : null}
            {client.email ? (
              <ContactRow icon="mail-outline" label="Email" value={client.email} action="Mail" onPress={() => void open(`mailto:${client.email}`, "Mail")} />
            ) : null}
            {client.lineId ? <CopyRow icon="chatbubble-ellipses-outline" label="LINE" value={client.lineId} /> : null}
          </View>
        ) : (
          <Text style={typography.small}>No contact details yet. Add a phone, email or LINE ID so win-back emails have somewhere to go.</Text>
        )}

        {client.notes ? (
          <>
            <View style={styles.divider} />
            <Eyebrow tone="muted">Notes</Eyebrow>
            <Text style={typography.body}>{client.notes}</Text>
          </>
        ) : null}
      </Card>

      {client.inactive ? (
        <Card variant="dark" style={styles.aiCard}>
          <Eyebrow tone="onDark">AI suggestion</Eyebrow>
          <Text style={styles.aiText}>
            {firstName} has been quiet for {quietMonths === 1 ? "a month" : `${quietMonths} months`}. A win-back email with the saved fit
            profile could bring them home.
          </Text>
          <Button variant="gold" size="sm" icon="mail-outline" title="Draft win-back email" onPress={() => router.push(clientRoutes.winback(id))} />
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button variant="gold" icon="cube-outline" title="New order" fullWidth onPress={() => router.push(clientRoutes.newOrder(id))} />
        <Button variant="secondary" icon="body-outline" title="New fitting" fullWidth onPress={() => router.push(clientRoutes.newFitting(id))} />
        <View style={styles.actionRow}>
          <Button variant="secondary" icon="mail-outline" title="Win-back email" style={styles.grow} onPress={() => router.push(clientRoutes.winback(id))} />
          <Button variant="ghost" icon="pencil-outline" title="Edit" onPress={() => router.push(clientRoutes.edit(id))} />
        </View>
      </View>

      <View>
        <SectionTitle title="Orders" right={orders.length > 0 ? <Text style={typography.small}>{orders.length}</Text> : undefined} />
        {ordersQuery.isPending ? (
          <LoadingBlock />
        ) : ordersQuery.isError ? (
          <ErrorBlock error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()} retrying={ordersQuery.isFetching} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No orders yet"
            body="Open an order to track the garment through the workshop."
            action={<Button size="sm" variant="secondary" icon="add" title="New order" onPress={() => router.push(clientRoutes.newOrder(id))} />}
          />
        ) : (
          <View style={styles.list}>
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} onPress={() => router.push(clientRoutes.order(id, order.id))} />
            ))}
          </View>
        )}
      </View>

      <View>
        <SectionTitle
          title="Fittings"
          right={fittings.length > 0 ? <Text style={typography.small}>{fittings.length}</Text> : undefined}
        />
        {fittingsQuery.isPending ? (
          <LoadingBlock />
        ) : fittingsQuery.isError ? (
          <ErrorBlock error={fittingsQuery.error} onRetry={() => void fittingsQuery.refetch()} retrying={fittingsQuery.isFetching} />
        ) : fittings.length === 0 ? (
          <EmptyState
            icon="body-outline"
            title="No fittings yet"
            body="Log the first fitting to start the fit profile."
            action={<Button size="sm" variant="secondary" icon="add" title="New fitting" onPress={() => router.push(clientRoutes.newFitting(id))} />}
          />
        ) : (
          <View style={styles.list}>
            {fittings.map((fitting) => (
              <FittingRow key={fitting.id} fitting={fitting} onPress={() => router.push(clientRoutes.fitting(id, fitting.id))} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function ContactRow({
  icon,
  label,
  value,
  action,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${value}`} onPress={onPress} style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}>
      <View style={styles.contactIcon}>
        <Ionicons name={icon} size={18} color={colors.goldDark} />
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.contactAction}>{action}</Text>
    </Pressable>
  );
}

/** LINE has no URL scheme we can rely on — copy the ID instead and confirm inline. */
function CopyRow({ icon, label, value }: { icon: IoniconName; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      showError(err, "Couldn't copy");
    }
  };

  return <ContactRow icon={icon} label={label} value={value} action={copied ? "Copied" : "Copy"} onPress={() => void onCopy()} />;
}

const styles = StyleSheet.create({
  headerCard: { gap: 12 },
  lastOrderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  lastOrderText: { flex: 1, gap: 2 },
  divider: { height: 1, backgroundColor: colors.line },
  contacts: { gap: 2 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderRadius: 10 },
  pressed: { opacity: 0.7 },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: { flex: 1, minWidth: 0 },
  contactLabel: { ...typography.small, lineHeight: 16 },
  contactValue: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  contactAction: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.goldDark },
  aiCard: { gap: 12 },
  aiText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ivorySoft },
  actions: { gap: 10 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  list: { gap: 10 },
});
