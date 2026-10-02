import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Message, MessageKind, MessageStatus } from "@shared/types";

import { Card, type IoniconName } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDateTime } from "@/lib/format";

import { Tag, type TagTone } from "./Tag";

const KIND_LABELS: Record<MessageKind, string> = {
  winback: "Win-back email",
  order_ready: "Order ready",
  followup: "Fitting follow-up",
};

const STATUS: Record<MessageStatus, { label: string; tone: TagTone; icon?: IoniconName }> = {
  sent: { label: "Sent", tone: "success", icon: "checkmark" },
  simulated: { label: "Simulated", tone: "warning" },
  failed: { label: "Failed", tone: "danger", icon: "alert-circle-outline" },
};

/** "order_ready" → "Order ready". */
export function messageKindLabel(kind: MessageKind): string {
  return KIND_LABELS[kind];
}

/** "simulated" → "Simulated". */
export function messageStatusLabel(status: MessageStatus): string {
  return STATUS[status].label;
}

/** Status pill: green "Sent", gold "Simulated", red "Failed". */
export function MessageStatusTag({ status, style }: { status: MessageStatus; style?: StyleProp<ViewStyle> }) {
  const s = STATUS[status];
  return <Tag label={s.label} tone={s.tone} icon={s.icon} style={style} />;
}

export interface MessageRowProps {
  message: Message;
  onPress: () => void;
}

/** One sent email on the client file: kind, when it went out, status. */
export function MessageRow({ message, onPress }: MessageRowProps) {
  return (
    <Card onPress={onPress} style={styles.card} testID={`message-row-${message.id}`}>
      <View style={styles.icon}>
        <Ionicons name="mail-outline" size={18} color={colors.goldDark} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {messageKindLabel(message.kind)}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {formatDateTime(message.createdAt)} · Email
        </Text>
      </View>
      <MessageStatusTag status={message.status} />
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
});
