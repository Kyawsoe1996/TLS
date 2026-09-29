import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { QueryClient, QueryClientProvider, focusManager, useQueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Button } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { API_URL } from "@/lib/api";
import { errorMessage } from "@/lib/toast";
import { tokenCache } from "@/lib/tokenCache";
import { useShop } from "@/lib/useShop";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30 * 1000, refetchOnWindowFocus: true },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Let react-query refetch stale data when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      focusManager.setFocused(status === "active");
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return <Boot />;
  if (!publishableKey || !API_URL) return <MissingConfig />;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootNavigator />
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Gate:
 *  - signed out            → (auth)
 *  - signed in, no shop    → /onboarding (GET /shop was 404)
 *  - signed in, has shop   → (tabs)
 */
function RootNavigator() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const signedIn = isLoaded && !!isSignedIn;
  const shopQuery = useShop({ enabled: signedIn });
  const segments = useSegments();
  const router = useRouter();
  const qc = useQueryClient();

  // Drop cached data from a previous session.
  useEffect(() => {
    if (isLoaded && !isSignedIn) qc.clear();
  }, [isLoaded, isSignedIn, qc]);

  // Signed in but not onboarded yet → send to onboarding (unless already there).
  useEffect(() => {
    if (!signedIn || !shopQuery.isSuccess) return;
    if (shopQuery.data === null && segments[0] !== "onboarding") {
      router.replace("/onboarding");
    }
  }, [signedIn, shopQuery.isSuccess, shopQuery.data, segments, router]);

  if (!isLoaded) return <Boot />;

  if (signedIn && shopQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={typography.h2}>Couldn&apos;t load your shop</Text>
        <Text style={[typography.bodyMuted, styles.centerText]}>{errorMessage(shopQuery.error)}</Text>
        <View style={styles.row}>
          <Button title="Try again" onPress={() => void shopQuery.refetch()} loading={shopQuery.isFetching} />
          <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      {signedIn && shopQuery.isPending ? <Boot overlay /> : null}
    </View>
  );
}

function Boot({ overlay = false }: { overlay?: boolean }) {
  return (
    <View style={[styles.center, overlay && StyleSheet.absoluteFillObject]}>
      <ActivityIndicator color={colors.goldDark} />
    </View>
  );
}

function MissingConfig() {
  return (
    <View style={styles.center}>
      <Text style={styles.configTitle}>Missing configuration</Text>
      <Text style={styles.configBody}>
        Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL in mobile/app/.env (see .env.example) or in the EAS
        environment, then rebuild or restart the dev server.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  center: {
    flex: 1,
    backgroundColor: colors.ivory,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  centerText: { textAlign: "center" },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  configTitle: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, textAlign: "center" },
  configBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center" },
});
