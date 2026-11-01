import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { CommonActions, type NavigationProp, type ParamListBase, type RouteProp } from "@react-navigation/native";
import { Tabs } from "expo-router";

import { colors, fonts } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useReminderSync } from "@/lib/useReminderSync";

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(filled: IoniconName, outline: IoniconName) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={22} color={color} />;
  };
}

/**
 * Tapping Clients or Grow always lands on that tab's list. Home, Grow and the website screens push straight to a
 * screen inside another tab (Fabrics, Orders, a client), which builds that tab's stack without its list underneath,
 * so the stack's own "tap the tab again to go to the top" and popToTopOnBlur had nowhere to go and the tab looked
 * stuck. When the list is missing, rebuild the tab fresh; it then opens on its anchor (index.tsx).
 */
function openListOnPress({ navigation, route }: { navigation: NavigationProp<ParamListBase>; route: RouteProp<ParamListBase> }) {
  return {
    tabPress: (e: { preventDefault: () => void }) => {
      const tabs = navigation.getState();
      const tab = tabs?.routes.find((r) => r.key === route.key);
      const stack = tab?.state;
      if (!tabs || !tab || !stack || stack.routes[0]?.name === "index") return; // normal behaviour works
      e.preventDefault();
      navigation.dispatch(
        CommonActions.reset({
          ...tabs,
          index: tabs.routes.indexOf(tab),
          // Drop the nested state and the params that named the inner screen, so the stack starts on its list.
          routes: tabs.routes.map((r) => (r.key === route.key ? { key: r.key, name: r.name } : r)),
        }),
      );
    },
  };
}

export default function TabsLayout() {
  const api = useApi();
  // Same key as Home, so the two share one cache entry and every order write (afterOrderChanged) refreshes the badge.
  const homeQuery = useQuery({ queryKey: queryKeys.home, queryFn: () => api.getHome() });
  const overdue = homeQuery.data?.ordersOverdue ?? 0;
  // Local reminders follow the agenda and the open orders; the tabs are only shown signed in with a shop.
  useReminderSync();

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
        listeners={openListOnPress}
        options={{
          title: "Clients",
          tabBarIcon: tabIcon("people", "people-outline"),
          // Reset the nested stack when leaving the tab, so tapping Clients again shows the list,
          // not the client / order / appointment screen that was open before.
          popToTopOnBlur: true,
          // Overdue open orders. Hidden at 0.
          tabBarBadge: overdue > 0 ? overdue : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.dangerDeep, color: colors.card, fontFamily: fonts.bodySemi, fontSize: 11 },
          tabBarAccessibilityLabel: overdue > 0 ? `Clients, ${overdue} ${overdue === 1 ? "order" : "orders"} overdue` : "Clients",
        }}
      />
      <Tabs.Screen
        name="grow"
        listeners={openListOnPress}
        options={{ title: "Grow", tabBarIcon: tabIcon("trending-up", "trending-up-outline"), popToTopOnBlur: true }}
      />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("settings", "settings-outline") }} />
    </Tabs>
  );
}
