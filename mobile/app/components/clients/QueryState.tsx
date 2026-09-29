import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button, ErrorBanner } from "@/components/ui";
import { colors, typography } from "@/constants/theme";
import { errorMessage } from "@/lib/toast";

/** Centered spinner for a screen's initial load. */
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator color={colors.goldDark} />
      {label ? <Text style={typography.small}>{label}</Text> : null}
    </View>
  );
}

export interface ErrorBlockProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Inline error banner with a "Try again" button (same pattern as Home). */
export function ErrorBlock({ error, onRetry, retrying = false }: ErrorBlockProps) {
  return (
    <View style={styles.errorBlock}>
      <ErrorBanner message={errorMessage(error)} />
      {onRetry ? <Button size="sm" variant="secondary" title="Try again" onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 10 },
  errorBlock: { gap: 10 },
});
