import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, ErrorBanner, Field, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { errorMessage } from "@/lib/toast";

type Step = "email" | "code";

export default function SignInScreen() {
  const signInCtx = useSignIn();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    if (!signInCtx.isLoaded) return;
    const { signIn } = signInCtx;
    const identifier = email.trim().toLowerCase();
    if (!identifier) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier });
      const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (!factor || factor.strategy !== "email_code") {
        throw new Error("Email code sign-in isn't available for this account.");
      }
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
      setCode("");
      setStep("code");
    } catch (err) {
      if (isClerkAPIResponseError(err) && err.errors?.[0]?.code === "form_identifier_not_found") {
        setError("No account for that email yet. Create one below.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!signInCtx.isLoaded) return;
    const { signIn, setActive } = signInCtx;
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code: trimmed });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        // Root layout's guard switches to (tabs) / onboarding from here.
      } else {
        setError("We couldn't finish signing you in. Please request a new code.");
      }
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      eyebrow="Welcome back"
      title="Sign in"
      subtitle={step === "email" ? "We'll email you a one-time code." : `Enter the code we sent to ${email.trim()}.`}
      keyboard
      edges={["top", "bottom"]}
    >
      <ErrorBanner message={error} />

      {step === "email" ? (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => void sendCode()}
            autoFocus
          />
          <Button
            title="Send code"
            onPress={() => void sendCode()}
            loading={busy}
            disabled={!signInCtx.isLoaded || !email.trim()}
            fullWidth
          />
        </>
      ) : (
        <>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => void verify()}
            autoFocus
          />
          <Button title="Verify and sign in" onPress={() => void verify()} loading={busy} disabled={code.length < 6} fullWidth />
          <Card variant="soft" style={styles.helpCard}>
            <Text style={typography.small}>Didn&apos;t get it? Check spam, or</Text>
            <View style={styles.helpRow}>
              <Button size="sm" variant="secondary" title="Resend code" onPress={() => void sendCode()} disabled={busy} />
              <Button
                size="sm"
                variant="ghost"
                title="Change email"
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
              />
            </View>
          </Card>
        </>
      )}

      <View style={styles.footer}>
        <Text style={typography.bodyMuted}>New to TLS?</Text>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  helpCard: { gap: 10 },
  helpRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  link: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.goldDark },
});
