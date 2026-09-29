import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

// Nested stack: index (hub) → content / seo.
export default function GrowLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
