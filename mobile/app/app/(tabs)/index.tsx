import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppointmentRow, clientRoutes } from "@/components/clients";
import { fabricRoutes } from "@/components/fabrics";
import { websiteRoutes } from "@/components/website";
import { Button, Card, ErrorBanner, Eyebrow, KpiList, Screen, SectionTitle, type IoniconName } from "@/components/ui";
import { FEATURES } from "@/constants/features";
import { colors, fonts, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { greeting, initials } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { errorMessage } from "@/lib/toast";
import { useShop } from "@/lib/useShop";

const INACTIVE_CLIENTS: Href = { pathname: "/(tabs)/clients", params: { inactive: "1" } };
/** Smart Referral's screen (friends who asked for a fitting); cast until the route is generated. */
const REFERRALS = "/(tabs)/grow/referrals" as Href;

// The daily loop: measure, track the garment, post, bring clients back. Local SEO returns here when
// FEATURES.localSeo is switched on.
const TILES: { key: string; title: string; hint: string; icon: IoniconName; href: Href }[] = [
  { key: "fit", title: "Smart Fitting", hint: "Measure and get cutter notes", icon: "body-outline", href: "/(tabs)/clients" },
  { key: "orders", title: "Orders", hint: "Every garment through the workshop", icon: "cube-outline", href: clientRoutes.orders },
  { key: "fabrics", title: "Fabrics", hint: "Cloth on the shelf, in metres", icon: "layers-outline", href: fabricRoutes.list },
  { key: "content", title: "Content Studio", hint: "Blog + social post in your tone", icon: "create-outline", href: "/(tabs)/grow/content" },
  { key: "winback", title: "Win-back", hint: "Email clients who drifted", icon: "mail-outline", href: INACTIVE_CLIENTS },
  ...(FEATURES.localSeo
    ? [{ key: "seo", title: "Local SEO", hint: "Keyword ideas for your district", icon: "location-outline" as IoniconName, href: "/(tabs)/grow/seo" as Href }]
    : []),
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
  const upcoming = home?.upcomingAppointments ?? [];
  const appointmentsThisWeek = home?.appointmentsThisWeek ?? 0;
  const fabricsLow = home?.fabricsLow ?? 0;
  const referralLeadsNew = home?.referralLeadsNew ?? 0;
  const websiteEnquiriesNew = home?.websiteEnquiriesNew ?? 0;
  const websiteOn = shopQuery.data?.websiteEnabled ?? false;

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

      {/* One card of rows instead of a tile grid: labels never wrap or truncate. Order counts live on the Orders screen. */}
      <KpiList
        items={[
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
          {
            key: "fabricsLow",
            icon: "layers-outline",
            label: "Fabrics running low",
            value: kpi(home?.fabricsLow),
            note: fabricsLow > 0 ? "Order more" : undefined,
            accent: fabricsLow > 0 ? "danger" : false,
            onPress: () => router.push(fabricRoutes.low),
          },
          {
            key: "referrals",
            icon: "gift-outline",
            label: "New referral friends",
            value: kpi(home?.referralLeadsNew),
            note: referralLeadsNew > 0 ? "Book their fitting" : undefined,
            accent: referralLeadsNew > 0 ? "danger" : false,
            onPress: () => router.push(REFERRALS),
          },
          ...(websiteEnquiriesNew > 0 || websiteOn
            ? [
                {
                  key: "websiteEnquiries",
                  icon: "globe-outline" as IoniconName,
                  label: "Website enquiries",
                  value: kpi(home?.websiteEnquiriesNew),
                  note: websiteEnquiriesNew > 0 ? "Reply today" : undefined,
                  accent: websiteEnquiriesNew > 0 ? ("danger" as const) : false,
                  onPress: () => router.push(websiteRoutes.enquiries),
                },
              ]
            : []),
        ]}
      />

      <View>
        <SectionTitle
          title="This week"
          right={
            <Pressable accessibilityRole="button" onPress={() => router.push(clientRoutes.appointments)} hitSlop={8}>
              <Text style={styles.seeAll}>{appointmentsThisWeek > upcoming.length ? `See all ${appointmentsThisWeek}` : "See all"}</Text>
            </Pressable>
          }
        />
        {homeQuery.isPending ? (
          <Text style={typography.small}>Loading appointments…</Text>
        ) : upcoming.length === 0 ? (
          <Card variant="soft" style={styles.emptyWeek}>
            <Ionicons name="calendar-outline" size={18} color={colors.goldDark} />
            <Text style={styles.emptyWeekText}>No appointments in the next 7 days. Schedule one from a client&apos;s file.</Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} appointment={a} onPress={() => router.push(clientRoutes.appointment(a.clientId, a.id))} />
            ))}
          </View>
        )}
      </View>

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
  seeAll: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.goldDark, paddingBottom: 2 },
  list: { gap: 10 },
  emptyWeek: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  emptyWeekText: { ...typography.small, flex: 1, color: colors.ink },
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
