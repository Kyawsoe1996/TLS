import { Ionicons } from "@expo/vector-icons";
import { useSSO, useSignInWithApple } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";
import { errorMessage } from "@/lib/toast";

// Lets the browser sheet hand the OAuth result back to the app when it returns via the `tls://` scheme.
WebBrowser.maybeCompleteAuthSession();

// Sign in with Apple needs the app's own entitlement, which Expo Go doesn't have; a development or
// production build does. Hidden in Expo Go so testers aren't shown a button that can't work.
const SHOW_APPLE = Platform.OS === "ios" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Provider = "apple" | "google" | "facebook";

export interface SocialSignInProps {
  /** Called with a human-readable message when a flow fails (not when the user cancels). */
  onError: (message: string | null) => void;
  /** Disables the buttons while the email flow is busy. */
  disabled?: boolean;
}

/**
 * Sign in with Apple (native sheet, iOS only), Google and Facebook (Clerk's browser flow), drawn as
 * white pills on the ivory auth screens. On success Clerk's session becomes active and the root
 * layout's guard moves the user on (onboarding when they have no shop yet).
 */
export function SocialSignIn({ onError, disabled = false }: SocialSignInProps) {
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [busy, setBusy] = useState<Provider | null>(null);

  // Pre-warm the Android custom tab / iOS auth session so the Google and Facebook sheets open faster.
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const run = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    onError(null);
    try {
      if (provider === "apple") {
        const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
        if (createdSessionId && setActive) await setActive({ session: createdSessionId });
        else onError("Apple sign-in didn't finish. Please try again or use your email.");
        return;
      }
      const { createdSessionId, setActive, authSessionResult } = await startSSOFlow({
        strategy: provider === "google" ? "oauth_google" : "oauth_facebook",
        // A real route (app/sso-callback.tsx): returning to the bare `tls://` made expo-router resolve "/" against
        // the signed-out navigator and log "state couldn't be applied" every time.
        redirectUrl: AuthSession.makeRedirectUri({ path: "sso-callback" }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else if (authSessionResult?.type === "success") {
        // Clerk returned without a session: a sign-up still waiting on a requirement we don't collect.
        onError("We couldn't finish signing you in with that account. Please use your email instead.");
      }
      // Cancelled or dismissed: stay quiet.
    } catch (err) {
      const code = appleErrorCode(err);
      if (code === "ERR_REQUEST_CANCELED") return;
      if (code === "ERR_REQUEST_UNKNOWN" || code === "ERR_REQUEST_NOT_HANDLED" || /not available/i.test(errorMessage(err, ""))) {
        // No Apple ID on the device, or a build without the entitlement: iOS has already shown its own prompt.
        onError("Sign in with Apple isn't available on this device. Use Google, Facebook or your email.");
        return;
      }
      onError(errorMessage(err, "Sign-in didn't finish. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const inactive = disabled || busy !== null;

  return (
    <View style={styles.root}>
      {SHOW_APPLE ? (
        <View>
          <Button
            title="Continue with Apple"
            icon="logo-apple"
            variant="secondary"
            onPress={() => void run("apple")}
            loading={busy === "apple"}
            disabled={inactive && busy !== "apple"}
            fullWidth
            style={styles.pill}
            testID="sign-in-apple"
          />
          <Text style={styles.hint}>If you choose Apple&apos;s Hide My Email, sign in with Apple each time.</Text>
        </View>
      ) : null}
      <Button
        title="Continue with Google"
        iconNode={<Ionicons name="logo-google" size={18} color="#EA4335" />}
        variant="secondary"
        onPress={() => void run("google")}
        loading={busy === "google"}
        disabled={inactive && busy !== "google"}
        fullWidth
        style={styles.pill}
        testID="sign-in-google"
      />
      <Button
        title="Continue with Facebook"
        iconNode={<Ionicons name="logo-facebook" size={20} color="#1877F2" />}
        variant="secondary"
        onPress={() => void run("facebook")}
        loading={busy === "facebook"}
        disabled={inactive && busy !== "facebook"}
        fullWidth
        style={styles.pill}
        testID="sign-in-facebook"
      />
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.or}>or</Text>
        <View style={styles.rule} />
      </View>
    </View>
  );
}

/** expo-apple-authentication rejects with a `code` such as ERR_REQUEST_CANCELED when the user dismisses the sheet. */
function appleErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  pill: { minHeight: 52, borderRadius: 26 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: "center", marginTop: 6 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 6 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  or: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted },
});
