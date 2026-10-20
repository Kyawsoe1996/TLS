import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";

/**
 * Where the browser lands after a Google / Facebook sign-in (`tls://sso-callback`). Registered outside both
 * guarded groups in the root layout so the link always resolves, whatever the auth state is at that instant;
 * once Clerk's session is active we move on to the app (the root layout then sends new users to onboarding),
 * and if nothing arrives within a few seconds (cancelled, failed) we go back to sign-in.
 */
export default function SsoCallbackScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const delay = isSignedIn ? 0 : 4000;
    const timer = setTimeout(() => router.replace(isSignedIn ? "/(tabs)" : "/(auth)/sign-in"), delay);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.goldDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ivory },
});
