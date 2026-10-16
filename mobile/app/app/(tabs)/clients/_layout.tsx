import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

// Nested stack so client detail / fitting screens can be added as siblings of index.tsx.
// `anchor` keeps index.tsx at the bottom of the stack even when another tab (Home) pushes a deeper
// screen directly, so the back button and popToTopOnBlur in (tabs)/_layout.tsx always land on it.
export const unstable_settings = { anchor: "index" };

export default function ClientsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
