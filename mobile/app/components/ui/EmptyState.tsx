import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, typography } from "@/constants/theme";

import type { IoniconName } from "./Button";

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: IoniconName;
  /** Usually a Button. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Centered placeholder for empty lists / unfinished areas. */
export function EmptyState({ title, body, icon = "sparkles-outline", action, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={24} color={colors.goldDark} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { ...typography.h3, textAlign: "center" },
  body: { ...typography.bodyMuted, textAlign: "center" },
  action: { marginTop: 10 },
});
