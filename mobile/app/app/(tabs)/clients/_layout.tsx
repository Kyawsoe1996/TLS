import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

// Nested stack so client detail / fitting screens can be added as siblings of index.tsx.
export default function ClientsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
