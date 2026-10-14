import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { Appointment, AppointmentKind } from "@shared/types";

import { Card, type IoniconName } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";

import { appointmentKindLabel, appointmentWhenLine } from "./appointments";
import { AppointmentStatusTag, Tag } from "./Tag";

export interface AppointmentRowProps {
  appointment: Appointment;
  onPress: () => void;
}

const KIND_ICONS: Record<AppointmentKind, IoniconName> = {
  fitting: "body-outline",
  collection: "bag-handle-outline",
  consultation: "chatbubbles-outline",
};

/** One appointment on the client file, the agenda or Home: kind, client (shop-wide), when, status, reminder sent. */
export function AppointmentRow({ appointment, onPress }: AppointmentRowProps) {
  const muted = appointment.status !== "scheduled";
  return (
    <Card onPress={onPress} style={styles.card} testID={`appointment-row-${appointment.id}`}>
      <View style={[styles.icon, muted && styles.iconMuted]}>
        <Ionicons name={KIND_ICONS[appointment.kind]} size={18} color={muted ? colors.muted : colors.goldDark} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {appointmentKindLabel(appointment.kind)}
          {appointment.clientName ? <Text style={styles.client}> · {appointment.clientName}</Text> : null}
        </Text>
        <Text style={[typography.small, !muted && styles.when]} numberOfLines={1}>
          {appointmentWhenLine(appointment)}
        </Text>
        {appointment.notes ? (
          <Text style={typography.small} numberOfLines={1}>
            {appointment.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.tags}>
        {muted ? <AppointmentStatusTag status={appointment.status} /> : null}
        {appointment.reminderSentAt && !muted ? <Tag label="Reminded" tone="success" icon="mail-outline" /> : null}
      </View>
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
  iconMuted: { backgroundColor: colors.cardSoft },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  client: { fontFamily: fonts.body, color: colors.muted },
  when: { color: colors.ink },
  tags: { alignItems: "flex-end", gap: 4 },
});
