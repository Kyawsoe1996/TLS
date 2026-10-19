import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthField, AuthScreen, CodeInput, PrivacyLine, SocialSignIn, SwitchLine } from "@/components/auth";
import { Button, ErrorBanner } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";
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

  const verify = async (value = code) => {
    if (!signInCtx.isLoaded) return;
    const { signIn, setActive } = signInCtx;
    const trimmed = value.trim();
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

  const backToEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  if (step === "code") {
    return (
      <AuthScreen
        crestSize={84}
        eyebrow="One-time code"
        title="Check your email"
        subtitle={
          <>
            We sent a 6-digit code to{"\n"}
            <Text style={styles.emphasis}>{email.trim()}</Text>
          </>
        }
        onBack={backToEmail}
        footer={<Text style={styles.hint}>Didn&apos;t get it? Check your spam folder. The code expires in 10 minutes.</Text>}
      >
        <ErrorBanner message={error} />
        <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} autoFocus disabled={busy} />
        <Button title="Verify and sign in" variant="gold" onPress={() => void verify()} loading={busy} disabled={code.length < 6} fullWidth style={styles.cta} />
        <View style={styles.linkRow}>
          <Pressable hitSlop={6} onPress={() => void sendCode()} disabled={busy}>
            <Text style={styles.link}>Resend code</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable hitSlop={6} onPress={backToEmail} disabled={busy}>
            <Text style={styles.mutedLink}>Change email</Text>
          </Pressable>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="Pick the account you use, or get a one-time code by email."
      footer={
        <>
          <SwitchLine question="New to Magick Tailor?" linkLabel="Create an account" href="/(auth)/sign-up" />
          <PrivacyLine />
        </>
      }
    >
      <ErrorBanner message={error} />
      <SocialSignIn onError={setError} disabled={busy} />
      <AuthField
        label="Email"
        icon="mail-outline"
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
      />
      <Button
        title="Send me a code"
        variant="gold"
        icon="arrow-forward"
        iconPosition="right"
        onPress={() => void sendCode()}
        loading={busy}
        disabled={!signInCtx.isLoaded || !email.trim()}
        fullWidth
        style={styles.cta}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cta: { minHeight: 52, borderRadius: 26, marginTop: 4 },
  emphasis: { fontFamily: fonts.bodySemi, color: colors.navy },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 2 },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.goldDark },
  mutedLink: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  dot: { color: colors.line, fontSize: 14 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted, textAlign: "center" },
});
