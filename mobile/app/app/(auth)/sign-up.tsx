import { isClerkAPIResponseError, useSignUp } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, ErrorBanner, Field, Screen } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { errorMessage } from "@/lib/toast";

type Step = "email" | "code";

export default function SignUpScreen() {
  const signUpCtx = useSignUp();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    if (!signUpCtx.isLoaded) return;
    const { signUp } = signUpCtx;
    const emailAddress = email.trim().toLowerCase();
    if (!emailAddress) return;
    setBusy(true);
    setError(null);
    try {
      if (step === "email") await signUp.create({ emailAddress });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      setStep("code");
    } catch (err) {
      if (isClerkAPIResponseError(err) && err.errors?.[0]?.code === "form_identifier_exists") {
        setError("That email already has an account. Sign in instead.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!signUpCtx.isLoaded) return;
    const { signUp, setActive } = signUpCtx;
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: trimmed });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        // Root layout's guard sends the new user to onboarding from here.
      } else {
        const missing = result.missingFields?.length ? ` Missing: ${result.missingFields.join(", ")}.` : "";
        setError(`We couldn't finish creating your account.${missing}`);
      }
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      eyebrow="Get started"
      title="Create account"
      subtitle={step === "email" ? "We'll email you a one-time code to verify it." : `Enter the code we sent to ${email.trim()}.`}
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
            disabled={!signUpCtx.isLoaded || !email.trim()}
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
          <Button title="Verify and continue" onPress={() => void verify()} loading={busy} disabled={code.length < 6} fullWidth />
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
        <Text style={typography.bodyMuted}>Already have an account?</Text>
        <Link href="/(auth)/sign-in" asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>Sign in</Text>
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
