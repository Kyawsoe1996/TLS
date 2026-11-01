import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

// Nested stack: index (hub) → content / seo.
// `anchor` makes index.tsx the stack's first screen. A push from another tab (Home) does not load it underneath
// (that needs withAnchor), so (tabs)/_layout.tsx rebuilds the stack on a tab press when the list is missing.
export const unstable_settings = { anchor: "index" };

export default function GrowLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
