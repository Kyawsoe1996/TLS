import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Appointment } from "@shared/types";

import { AppointmentRow, ErrorBlock, LoadingBlock, clientRoutes, useShopAppointments } from "@/components/clients";
import { EmptyState, Screen, SectionTitle } from "@/components/ui";
import { typography } from "@/constants/theme";

interface Group {
  key: string;
  title: string;
  appointments: Appointment[];
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Scheduled appointments by day: earlier today, today, tomorrow, the rest of this week, later. Empty groups are dropped. */
function groupAppointments(appointments: Appointment[], now = new Date()): Group[] {
  const today = startOfLocalDay(now);
  const tomorrow = today + 86_400_000;
  const dayAfter = tomorrow + 86_400_000;
  const weekEnd = today + 7 * 86_400_000;
  const earlier: Appointment[] = [];
  const todayList: Appointment[] = [];
  const tomorrowList: Appointment[] = [];
  const week: Appointment[] = [];
  const later: Appointment[] = [];
  for (const a of appointments) {
    const t = new Date(a.startsAt).getTime();
    if (t < now.getTime() && t < today) earlier.push(a);
    else if (t < tomorrow) todayList.push(a);
    else if (t < dayAfter) tomorrowList.push(a);
    else if (t < weekEnd) week.push(a);
    else later.push(a);
  }
  return [
    { key: "earlier", title: "Not marked done", appointments: earlier },
    { key: "today", title: "Today", appointments: todayList },
    { key: "tomorrow", title: "Tomorrow", appointments: tomorrowList },
    { key: "week", title: "This week", appointments: week },
    { key: "later", title: "Later", appointments: later },
  ].filter((g) => g.appointments.length > 0);
}

/** Every scheduled appointment in the shop, soonest first, grouped by day. Reached from Home's "This week". */
export default function ShopAppointmentsScreen() {
  const router = useRouter();
  const query = useShopAppointments();
  const [refreshing, setRefreshing] = useState(false);

  const appointments = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => groupAppointments(appointments), [appointments]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (appointments.length === 0) {
    body = <EmptyState icon="calendar-outline" title="Nothing scheduled" body="Schedule a fitting, collection or consultation from a client's file." />;
  } else {
    body = (
      <View style={styles.groups}>
        {groups.map((group) => (
          <View key={group.key}>
            <SectionTitle title={group.title} right={<Text style={typography.small}>{group.appointments.length}</Text>} />
            <View style={styles.list}>
              {group.appointments.map((a) => (
                <AppointmentRow key={a.id} appointment={a} onPress={() => router.push(clientRoutes.appointment(a.clientId, a.id))} />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen
      back
      eyebrow="Diary"
      title="Appointments"
      subtitle={appointments.length > 0 ? `${appointments.length} scheduled` : undefined}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 20 },
  list: { gap: 10 },
});
