import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

// Nested stack: index (hub) → content / seo.
// `anchor` keeps index.tsx at the bottom of the stack even when another tab (Home) pushes a deeper
// screen directly, so the back button and popToTopOnBlur in (tabs)/_layout.tsx always land on it.
export const unstable_settings = { anchor: "index" };

export default function GrowLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
