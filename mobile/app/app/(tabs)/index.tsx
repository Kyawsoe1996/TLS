import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { clientRoutes } from "@/components/clients";
import { Button, Card, ErrorBanner, Eyebrow, KpiList, Screen, type IoniconName } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { greeting, initials } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { errorMessage } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const INACTIVE_CLIENTS: Href = { pathname: "/(tabs)/clients", params: { inactive: "1" } };

const TILES: { key: string; title: string; hint: string; icon: IoniconName; href: Href }[] = [
  { key: "fit", title: "Smart Fitting", hint: "Open a client to log a fitting", icon: "body-outline", href: "/(tabs)/clients" },
  { key: "seo", title: "Local SEO", hint: "Keyword ideas for your district", icon: "location-outline", href: "/(tabs)/grow/seo" },
  { key: "content", title: "Content Studio", hint: "Blog + social post in your tone", icon: "create-outline", href: "/(tabs)/grow/content" },
  { key: "winback", title: "Win-back", hint: "Email clients who drifted", icon: "mail-outline", href: INACTIVE_CLIENTS },
];

export default function HomeScreen() {
  const api = useApi();
  const router = useRouter();
  const shopQuery = useShop();
  const homeQuery = useQuery({ queryKey: queryKeys.home, queryFn: () => api.getHome() });
  const [refreshing, setRefreshing] = useState(false);

  const home = homeQuery.data;
  const shopName = home?.shopName ?? shopQuery.data?.name ?? "Your shop";
  const inactive = home?.inactiveCount ?? 0;
  const dueSoon = home?.ordersDueSoon ?? 0;
  const overdue = home?.ordersOverdue ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([homeQuery.refetch(), shopQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const kpi = (n: number | undefined) => (homeQuery.isPending ? "—" : String(n ?? 0));

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Eyebrow>{greeting()}</Eyebrow>
          <Text style={typography.title} numberOfLines={2}>
            {shopName}
          </Text>
        </View>
        <View style={styles.avatar} accessibilityLabel={`${shopName} monogram`}>
          <Text style={styles.avatarText}>{initials(shopName) || "T"}</Text>
        </View>
      </View>

      {homeQuery.isError ? (
        <View style={styles.errorBlock}>
          <ErrorBanner message={errorMessage(homeQuery.error)} />
          <Button size="sm" variant="secondary" title="Try again" onPress={() => void homeQuery.refetch()} loading={homeQuery.isFetching} />
        </View>
      ) : null}

      {/* One card of rows instead of a tile grid: labels never wrap or truncate. */}
      <KpiList
        items={[
          { key: "open", icon: "cube-outline", label: "Orders in progress", value: kpi(home?.ordersOpen), onPress: () => router.push(clientRoutes.orders) },
          {
            key: "overdue",
            icon: "alert-circle-outline",
            label: "Overdue",
            value: kpi(home?.ordersOverdue),
            accent: overdue > 0 ? "danger" : false,
            onPress: () => router.push(clientRoutes.orders),
          },
          {
            key: "due",
            icon: "time-outline",
            label: "Due this week",
            value: kpi(home?.ordersDueSoon),
            note: dueSoon > 0 ? "Check the workshop" : undefined,
            accent: dueSoon > 0,
            onPress: () => router.push(clientRoutes.orders),
          },
          { key: "clients", icon: "people-outline", label: "Clients", value: kpi(home?.clientsCount), onPress: () => router.push("/(tabs)/clients") },
          { key: "fittings", icon: "body-outline", label: "Fittings this month", value: kpi(home?.fittingsThisMonth) },
          {
            key: "inactive",
            icon: "mail-outline",
            label: "Inactive 90+ days",
            value: kpi(home?.inactiveCount),
            note: inactive > 0 ? "Win-back ready" : undefined,
            onPress: () => router.push(INACTIVE_CLIENTS),
          },
        ]}
      />

      {dueSoon > 0 ? (
        <Card variant="dark" style={styles.aiCard}>
          <Eyebrow tone="onDark">AI suggestion</Eyebrow>
          <Text style={styles.aiText}>
            {dueSoon} {dueSoon === 1 ? "order is" : "orders are"} due this week. Check the cutting table and confirm fittings with those clients.
          </Text>
          <Button variant="gold" size="sm" icon="cube-outline" title="See orders" onPress={() => router.push(clientRoutes.orders)} />
        </Card>
      ) : (
        <Card variant="dark" style={styles.aiCard}>
          <Eyebrow tone="onDark">AI suggestion</Eyebrow>
          <Text style={styles.aiText}>
            {inactive > 0
              ? `${inactive} ${inactive === 1 ? "client hasn't" : "clients haven't"} been back in 90+ days. A win-back email with their saved fit profile could bring a few home.`
              : "Everyone on your book has visited in the last 90 days. Log fittings as you go and the AI will flag clients worth a nudge."}
          </Text>
          <Button
            variant="gold"
            size="sm"
            icon={inactive > 0 ? "mail-outline" : "people-outline"}
            title={inactive > 0 ? "Draft win-back emails" : "Open clients"}
            onPress={() => router.push(inactive > 0 ? INACTIVE_CLIENTS : "/(tabs)/clients")}
          />
        </Card>
      )}

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <Card key={tile.key} onPress={() => router.push(tile.href)} style={styles.tile}>
            <View style={styles.tileIcon}>
              <Ionicons name={tile.icon} size={20} color={colors.goldDark} />
            </View>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileHint}>{tile.hint}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 },
  heroText: { flex: 1, gap: 4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 20, color: colors.ivory },
  errorBlock: { gap: 10 },
  aiCard: { gap: 12 },
  aiText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.ivorySoft },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "48%", flexGrow: 1, gap: 4, minHeight: 132 },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileTitle: typography.h3,
  tileHint: typography.small,
});
