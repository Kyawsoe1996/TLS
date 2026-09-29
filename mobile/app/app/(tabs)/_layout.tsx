import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { colors, fonts } from "@/constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(filled: IoniconName, outline: IoniconName) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={22} color={color} />;
  };
}

export default function TabsLayout() {
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
      <Tabs.Screen name="clients" options={{ title: "Clients", tabBarIcon: tabIcon("people", "people-outline") }} />
      <Tabs.Screen name="grow" options={{ title: "Grow", tabBarIcon: tabIcon("trending-up", "trending-up-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("settings", "settings-outline") }} />
    </Tabs>
  );
}
