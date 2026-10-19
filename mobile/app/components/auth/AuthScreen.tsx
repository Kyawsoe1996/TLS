import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Eyebrow } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";

export interface AuthScreenProps {
  /** Small gold label above the title. */
  eyebrow: string;
  title: string;
  /** Centred line under the title; a node lets part of it be emphasised. */
  subtitle?: ReactNode;
  /** Width of the crest above the title (default 112; smaller on the code step). */
  crestSize?: number;
  /** Shows a round back button top-left. */
  onBack?: () => void;
  children?: ReactNode;
  /** Links pinned to the bottom of the screen. */
  footer?: ReactNode;
  testID?: string;
}

/**
 * The sign-in layout: ivory ground, the crest centred over a big serif title, the form below and
 * links at the foot. Keyboard pushes the content up.
 */
export function AuthScreen({ eyebrow, title, subtitle, crestSize = 112, onBack, children, footer, testID }: AuthScreenProps) {
  return (
    <SafeAreaView testID={testID} edges={["top", "bottom"]} style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.navy} />
            </Pressable>
          ) : null}

          <View style={[styles.hero, !onBack && styles.heroTop]}>
            {/* The Atelier crest on a transparent ground: the same artwork as the app icon. */}
            <Image source={require("../../assets/splash-icon.png")} style={{ width: crestSize, height: crestSize }} accessibilityLabel="Magick Tailor crest" />
            <Eyebrow>{eyebrow}</Eyebrow>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          {children}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ivory },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 14 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  pressed: { opacity: 0.7 },
  hero: { alignItems: "center", gap: 8, marginBottom: 10 },
  heroTop: { marginTop: 28 },
  title: { fontFamily: fonts.serifSemi, fontSize: 44, lineHeight: 48, color: colors.navy, textAlign: "center", marginTop: 2 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center", maxWidth: 300 },
  footer: { marginTop: "auto", paddingTop: 22, alignItems: "center", gap: 6 },
});
