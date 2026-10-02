import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";

import { colors, fonts } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(filled: IoniconName, outline: IoniconName) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={22} color={color} />;
  };
}

export default function TabsLayout() {
  const api = useApi();
  // Same key as Home, so the two share one cache entry and every order write (afterOrderChanged) refreshes the badge.
  const homeQuery = useQuery({ queryKey: queryKeys.home, queryFn: () => api.getHome() });
  const overdue = homeQuery.data?.ordersOverdue ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.goldDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.cardSoft,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.ivory },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: tabIcon("people", "people-outline"),
          // Overdue open orders. Hidden at 0.
          tabBarBadge: overdue > 0 ? overdue : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.dangerDeep, color: colors.card, fontFamily: fonts.bodySemi, fontSize: 11 },
          tabBarAccessibilityLabel: overdue > 0 ? `Clients, ${overdue} ${overdue === 1 ? "order" : "orders"} overdue` : "Clients",
        }}
      />
      <Tabs.Screen name="grow" options={{ title: "Grow", tabBarIcon: tabIcon("trending-up", "trending-up-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("settings", "settings-outline") }} />
    </Tabs>
  );
}
