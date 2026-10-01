import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { OrderStatus } from "@shared/types";

import type { IoniconName } from "@/components/ui";
import { colors, fonts } from "@/constants/theme";

export type TagTone = "inactive" | "ai" | "neutral" | "success" | "warning" | "danger";

export interface TagProps {
  label: string;
  tone?: TagTone;
  icon?: IoniconName;
  style?: StyleProp<ViewStyle>;
}

const palette: Record<TagTone, { bg: string; fg: string }> = {
  inactive: { bg: colors.sand, fg: colors.goldDark },
  ai: { bg: colors.successBg, fg: colors.successFg },
  neutral: { bg: colors.cardSoft, fg: colors.muted },
  success: { bg: colors.successBg, fg: colors.successFg },
  warning: { bg: colors.sand, fg: colors.goldDark },
  // Softer than the form error red; 5:1 on the pale bg so the small label stays readable.
  danger: { bg: "#F3E1DD", fg: "#8A2E24" },
};

/** Small, non-interactive pill: "Inactive", "AI analysed", an order status, or a measurement like "Chest 102.4". */
export function Tag({ label, tone = "neutral", icon, style }: TagProps) {
  const p = palette[tone];
  return (
    <View style={[styles.tag, { backgroundColor: p.bg }, tone === "neutral" && styles.neutralBorder, style]}>
      {icon ? <Ionicons name={icon} size={12} color={p.fg} /> : null}
      <Text style={[styles.label, { color: p.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Convenience: the "Inactive" tag used on client rows and the client file. */
export function InactiveTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Tag label="Inactive" tone="inactive" icon="time-outline" style={style} />;
}

/** Convenience: the "AI analysed" tag used on fitting rows. */
export function AnalysedTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Tag label="AI analysed" tone="ai" icon="sparkles" style={style} />;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  measured: "Measured",
  cutting: "Cutting",
  fitting: "Fitting",
  ready: "Ready",
  delivered: "Delivered",
};

const ORDER_STATUS_TONES: Record<OrderStatus, TagTone> = {
  measured: "neutral",
  cutting: "warning",
  fitting: "warning",
  ready: "success",
  delivered: "neutral",
};

/** Display label for an order status ("cutting" → "Cutting"). */
export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status];
}

/** Workshop status pill: in-progress steps in gold, "Ready" in green, the ends neutral. */
export function OrderStatusTag({ status, style }: { status: OrderStatus; style?: StyleProp<ViewStyle> }) {
  return <Tag label={ORDER_STATUS_LABELS[status]} tone={ORDER_STATUS_TONES[status]} style={style} />;
}

/** Convenience: the red "Overdue" tag on order rows and the order screen. */
export function OverdueTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Tag label="Overdue" tone="danger" icon="alert-circle-outline" style={style} />;
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  neutralBorder: { borderWidth: 1, borderColor: colors.line },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
});
