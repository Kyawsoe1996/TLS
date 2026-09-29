import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { colors, spacing, typography } from "@/constants/theme";

import { Eyebrow } from "./Eyebrow";

export interface ScreenProps {
  children?: ReactNode;
  /** Serif page title. */
  title?: string;
  /** Small gold label above the title. */
  eyebrow?: string;
  /** Muted line under the title. */
  subtitle?: string;
  /** Show a back button (calls `onBack` or `router.back()`). */
  back?: boolean;
  onBack?: () => void;
  /** Node on the right of the header row (e.g. an action button). */
  headerRight?: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Wrap in KeyboardAvoidingView for forms. */
  keyboard?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Safe-area edges (default ["top"]; tab bars/headers handle the rest). */
  edges?: Edge[];
  /** Sticky content under the scroll area (e.g. a submit button). */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Ivory page with safe area, 20px padding, optional header (back + eyebrow + serif title). */
export function Screen({
  children,
  title,
  eyebrow,
  subtitle,
  back = false,
  onBack,
  headerRight,
  scroll = true,
  keyboard = false,
  refreshing = false,
  onRefresh,
  edges = ["top"],
  footer,
  contentStyle,
  style,
  testID,
}: ScreenProps) {
  const router = useRouter();
  const hasHeader = !!(title || eyebrow || back || headerRight);

  const header = hasHeader ? (
    <View style={styles.header}>
      {back || headerRight ? (
        <View style={styles.headerRow}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.navy} />
            </Pressable>
          ) : (
            <View />
          )}
          {headerRight ? <View>{headerRight}</View> : null}
        </View>
      ) : null}
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  ) : null;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.goldDark} colors={[colors.goldDark]} /> : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>
      {header}
      {children}
    </View>
  );

  const inner = (
    <>
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <SafeAreaView testID={testID} edges={edges} style={[styles.safe, style]}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ivory },
  flex: { flex: 1 },
  content: { padding: spacing.screen, paddingBottom: 40, gap: 16 },
  header: { gap: 6, marginBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  pressed: { opacity: 0.7 },
  title: typography.title,
  subtitle: { ...typography.bodyMuted, marginTop: 2 },
  footer: {
    padding: spacing.screen,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.ivory,
  },
});
