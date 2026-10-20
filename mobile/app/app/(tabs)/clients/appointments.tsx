import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Appointment, AppointmentKind, Client, Order } from "@shared/types";

import { ErrorBlock, LoadingBlock, Tag, appointmentKindLabel, clientRoutes, useShopOrders } from "@/components/clients";
import {
  STRIP_DAYS,
  addDays,
  addMonths,
  appointmentsOn,
  busyDays,
  clockLabel,
  dayKey,
  daySummary,
  dayTitle,
  monthGrid,
  monthTitle,
  sameDay,
  startOfDay,
  startOfWeek,
  timelineFor,
  weekDays,
  weekLabel,
} from "@/components/clients/agenda";
import { useAgendaRange } from "@/components/clients/queries";
import { Button, Card, Field, Screen, type IoniconName } from "@/components/ui";
import { colors, fonts, radii, typography } from "@/constants/theme";
import { useApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const KIND_ICONS: Record<AppointmentKind, IoniconName> = {
  fitting: "body-outline",
  collection: "bag-handle-outline",
  consultation: "chatbubbles-outline",
};

/**
 * The diary as a day view: a Mon–Sun strip (arrows move a week, a calendar button jumps to any date), the chosen
 * day's appointments on a timeline with the free gaps, and "New appointment on <day>" which asks for the client and
 * hands the day to the schedule form. Reached from Home's "This week" and the Clients tab.
 */
export default function ShopAppointmentsScreen() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selected, setSelected] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today));
  const [monthOpen, setMonthOpen] = useState(false);
  const [pickingClient, setPickingClient] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const query = useAgendaRange(weekStart, weekEnd);
  const ordersQuery = useShopOrders("open");
  const garmentById = useMemo(() => new Map((ordersQuery.data ?? []).map((o) => [o.id, o] as const)), [ordersQuery.data]);

  const appointments = useMemo(() => query.data ?? [], [query.data]);
  const dots = useMemo(() => busyDays(appointments), [appointments]);
  const dayList = useMemo(() => appointmentsOn(appointments, selected), [appointments, selected]);
  const timeline = useMemo(() => timelineFor(dayList, selected), [dayList, selected]);
  const restOfWeek = useMemo(
    () => appointments.filter((a) => !sameDay(new Date(a.startsAt), selected) && a.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appointments, selected],
  );

  const goToDay = (day: Date) => {
    setSelected(day);
    setWeekStart(startOfWeek(day));
  };
  const shiftWeek = (weeks: number) => {
    const next = addDays(weekStart, weeks * 7);
    setWeekStart(next);
    // Keep the same weekday selected in the new week.
    setSelected(addDays(selected, weeks * 7));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([query.refetch(), ordersQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const openAppointment = (a: Appointment) => router.push(clientRoutes.appointment(a.clientId, a.id));
  const startNew = (client: Client) => {
    setPickingClient(false);
    router.push(clientRoutes.newAppointment(client.id, undefined, dayKey(selected)));
  };

  const isToday = sameDay(selected, today);
  const weekdayName = dayTitle(selected).split(" ")[0];

  let body;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError) {
    body = <ErrorBlock error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  } else if (dayList.length === 0) {
    body = (
      <>
        <View style={styles.freeDay}>
          <View style={styles.freeIcon}>
            <Ionicons name="calendar-outline" size={24} color={colors.goldDark} />
          </View>
          <Text style={styles.freeTitle}>{isToday ? "Nothing on today" : "A free day"}</Text>
          <Text style={styles.freeBody}>Book a fitting or a collection here, or pick a client first from the Clients tab.</Text>
          <Button title={`New appointment on ${weekdayName}`} variant="gold" icon="add" fullWidth onPress={() => setPickingClient(true)} testID="agenda-new" />
        </View>
        {restOfWeek.length > 0 ? (
          <View style={styles.block}>
            <Text style={typography.eyebrow}>Also this week</Text>
            {restOfWeek.map((a) => (
              <WeekRow key={a.id} appointment={a} order={a.orderId ? garmentById.get(a.orderId) : undefined} onPress={() => openAppointment(a)} />
            ))}
          </View>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <View>
          {timeline.map((entry, i) =>
            entry.kind === "gap" ? (
              <GapRow key={`gap-${i}`} text={entry.text} />
            ) : (
              <TimelineRow
                key={entry.appointment.id}
                appointment={entry.appointment}
                order={entry.appointment.orderId ? garmentById.get(entry.appointment.orderId) : undefined}
                onPress={() => openAppointment(entry.appointment)}
              />
            ),
          )}
        </View>
        <Button title={`New appointment on ${weekdayName}`} variant="gold" icon="add" fullWidth onPress={() => setPickingClient(true)} testID="agenda-new" />
      </>
    );
  }

  return (
    <Screen
      back
      eyebrow="Diary"
      title="Appointments"
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick a date"
          hitSlop={8}
          onPress={() => setMonthOpen(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.navy} />
        </Pressable>
      }
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <Card padding={0} style={styles.strip}>
        <View style={styles.stripHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8} onPress={() => shiftWeek(-1)} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={18} color={colors.navy} />
          </Pressable>
          <Text style={styles.stripLabel}>{weekLabel(weekStart)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" hitSlop={8} onPress={() => shiftWeek(1)} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={18} color={colors.navy} />
          </Pressable>
        </View>
        <View style={styles.days}>
          {weekDays(weekStart).map((day, i) => {
            const isSelected = sameDay(day, selected);
            const isTodayCell = sameDay(day, today);
            const busy = dots.has(dayKey(day));
            return (
              <Pressable
                key={dayKey(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${dayTitle(day)}${busy ? ", has appointments" : ""}`}
                onPress={() => setSelected(day)}
                style={styles.dayCell}
              >
                <Text style={styles.dayName}>{STRIP_DAYS[i]}</Text>
                <View style={[styles.dayNumber, isTodayCell && styles.dayNumberToday, isSelected && styles.dayNumberSelected]}>
                  <Text style={[styles.dayNumberText, isSelected && styles.dayNumberTextSelected]}>{day.getDate()}</Text>
                </View>
                <View style={[styles.dot, busy && (isSelected ? styles.dotSelected : styles.dotBusy)]} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.dayHeader}>
        <View style={styles.dayHeaderText}>
          <Text style={styles.dayTitle}>{dayTitle(selected)}</Text>
          <Text style={typography.small}>{query.isPending ? "Loading…" : daySummary(dayList)}</Text>
        </View>
        {!isToday ? (
          <Pressable hitSlop={8} onPress={() => goToDay(today)} accessibilityRole="button">
            <Text style={styles.todayLink}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      {body}

      <Text style={styles.footnote}>Arrows move a week · the calendar button jumps to any date.</Text>

      <MonthSheet visible={monthOpen} selected={selected} today={today} onPick={(day) => {
        setMonthOpen(false);
        goToDay(day);
      }} onClose={() => setMonthOpen(false)} />
      <ClientPicker visible={pickingClient} dayLabel={dayTitle(selected)} onPick={startNew} onClose={() => setPickingClient(false)} />
    </Screen>
  );
}

function TimelineRow({ appointment, order, onPress }: { appointment: Appointment; order?: Order; onPress: () => void }) {
  const done = appointment.status === "done";
  const cancelled = appointment.status === "cancelled";
  const time = clockLabel(appointment.startsAt).split(" ");
  const detail = order ? `${order.garment}${order.fabric ? ` · ${order.fabric}` : ""}` : appointment.notes?.trim() || `${appointmentKindLabel(appointment.kind)} with ${appointment.clientName ?? "client"}`;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{time[0]}</Text>
        <Text style={styles.timeSuffix}>{time[1]}</Text>
      </View>
      <View style={styles.rail}>
        <View style={[styles.railDot, done && styles.railDotDone, cancelled && styles.railDotCancelled]} />
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${appointment.clientName ?? "Client"}, ${appointmentKindLabel(appointment.kind)} at ${clockLabel(appointment.startsAt)}`}
        style={({ pressed }) => [styles.card, (done || cancelled) && styles.cardMuted, pressed && styles.pressed]}
      >
        <View style={styles.cardText}>
          <Text style={styles.cardName} numberOfLines={1}>
            {appointment.clientName ?? "Client"}
          </Text>
          <View style={styles.tags}>
            {done ? (
              <Tag label="Done" tone="success" icon="checkmark" />
            ) : cancelled ? (
              <Tag label="Cancelled" tone="danger" icon="close" />
            ) : (
              <Tag label={appointmentKindLabel(appointment.kind)} tone="warning" icon={KIND_ICONS[appointment.kind]} />
            )}
            {appointment.reminderSentAt ? (
              <View style={styles.reminded}>
                <Ionicons name="notifications-outline" size={12} color={colors.muted} />
                <Text style={styles.remindedText}>Reminded</Text>
              </View>
            ) : null}
          </View>
          <Text style={typography.small} numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function GapRow({ text }: { text: string }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timeColumn} />
      <View style={[styles.rail, styles.railFaint]} />
      <Text style={styles.gapText}>{text}</Text>
    </View>
  );
}

function WeekRow({ appointment, order, onPress }: { appointment: Appointment; order?: Order; onPress: () => void }) {
  const start = new Date(appointment.startsAt);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.weekRow, pressed && styles.pressed]}>
      <View style={styles.weekDate}>
        <Text style={styles.weekDay}>{STRIP_DAYS[(start.getDay() + 6) % 7].toUpperCase()}</Text>
        <Text style={styles.weekNumber}>{start.getDate()}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.weekTitle} numberOfLines={1}>
          {appointment.clientName ?? "Client"} · {appointmentKindLabel(appointment.kind)}
        </Text>
        <Text style={typography.small} numberOfLines={1}>
          {clockLabel(start)}
          {order ? ` · ${order.garment}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Month grid in a bottom sheet: dots on busy days, gold ring on today, the chosen day in navy. */
function MonthSheet({ visible, selected, today, onPick, onClose }: { visible: boolean; selected: Date; today: Date; onPick: (day: Date) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [chosen, setChosen] = useState<Date>(selected);
  const monthEnd = useMemo(() => addMonths(month, 1), [month]);
  const range = useAgendaRange(month, monthEnd);
  const dots = useMemo(() => busyDays(range.data ?? []), [range.data]);
  const cells = useMemo(() => monthGrid(month), [month]);

  // Reopen on the day currently shown.
  const open = () => {
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setChosen(selected);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose} onShow={open}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <View style={styles.stripHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} onPress={() => setMonth(addMonths(month, -1))} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={18} color={colors.navy} />
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} onPress={() => setMonth(addMonths(month, 1))} style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
              <Ionicons name="chevron-forward" size={18} color={colors.navy} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {STRIP_DAYS.map((d) => (
              <Text key={d} style={styles.gridHead}>
                {d[0]}
              </Text>
            ))}
            {cells.map((day, i) =>
              day ? (
                <Pressable
                  key={dayKey(day)}
                  onPress={() => setChosen(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sameDay(day, chosen) }}
                  accessibilityLabel={dayTitle(day)}
                  style={[styles.gridCell, sameDay(day, today) && styles.gridCellToday, sameDay(day, chosen) && styles.gridCellChosen]}
                >
                  <Text style={[styles.gridCellText, sameDay(day, chosen) && styles.gridCellTextChosen]}>{day.getDate()}</Text>
                  {dots.has(dayKey(day)) ? <View style={[styles.gridDot, sameDay(day, chosen) && styles.dotSelected]} /> : null}
                </Pressable>
              ) : (
                <View key={`blank-${i}`} style={styles.gridCell} />
              ),
            )}
          </View>
          <Text style={styles.footnote}>Dots mark days with appointments · gold ring is today</Text>
          <View style={styles.sheetActions}>
            <Button title={`Go to ${chosen.getDate()} ${monthTitle(chosen).split(" ")[0]}`} variant="gold" onPress={() => onPick(chosen)} style={styles.flex} testID="agenda-go" />
            <Button title="Today" variant="secondary" onPress={() => onPick(today)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** "Who is it for?" — the client list with search; picking one opens the schedule form on the chosen day. */
function ClientPicker({ visible, dayLabel, onPick, onClose }: { visible: boolean; dayLabel: string; onPick: (client: Client) => void; onClose: () => void }) {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const params = useMemo(() => (search.trim() ? { search: search.trim() } : undefined), [search]);
  const clients = useQuery({
    queryKey: queryKeys.clients(params),
    queryFn: () => api.listClients(params),
    select: (res) => res.clients,
    enabled: visible,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={typography.h2}>Who is it for?</Text>
          <Text style={typography.small}>New appointment on {dayLabel}</Text>
          <Field label="Client" value={search} onChangeText={setSearch} placeholder="Search by name" autoCorrect={false} returnKeyType="search" />
          {clients.isPending ? (
            <LoadingBlock />
          ) : clients.isError ? (
            <ErrorBlock error={clients.error} onRetry={() => void clients.refetch()} retrying={clients.isFetching} />
          ) : (
            <FlatList
              data={clients.data ?? []}
              keyExtractor={(c) => c.id}
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[typography.small, styles.pickerEmpty]}>No client matches. Add one from the Clients tab first.</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
                  <Text style={styles.pickerName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  strip: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 10, gap: 10 },
  stripHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  stripLabel: { flex: 1, textAlign: "center", fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  arrow: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  days: { flexDirection: "row", gap: 2 },
  dayCell: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 2 },
  dayName: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: colors.muted },
  dayNumber: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent" },
  dayNumberToday: { borderColor: colors.gold, backgroundColor: colors.sand },
  dayNumberSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  dayNumberText: { fontFamily: fonts.serif, fontSize: 20, color: colors.navy },
  dayNumberTextSelected: { color: colors.ivory },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" },
  dotBusy: { backgroundColor: colors.goldDark },
  dotSelected: { backgroundColor: colors.gold },
  dayHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  dayHeaderText: { flex: 1, gap: 2 },
  dayTitle: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28, color: colors.navy },
  todayLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.goldDark, paddingBottom: 2 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timeColumn: { width: 58, alignItems: "flex-end", paddingTop: 14, gap: 2 },
  timeText: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 20, color: colors.navy },
  timeSuffix: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  rail: { width: 2, backgroundColor: colors.line, borderRadius: 1, marginVertical: 6, alignItems: "center" },
  railFaint: { opacity: 0.6 },
  railDot: { marginTop: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.ivory },
  railDotDone: { backgroundColor: colors.successFg },
  railDotCancelled: { backgroundColor: colors.danger },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  cardMuted: { opacity: 0.55 },
  cardText: { flex: 1, minWidth: 0, gap: 4 },
  cardName: { fontFamily: fonts.serifSemi, fontSize: 19, lineHeight: 22, color: colors.navy },
  tags: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  reminded: { flexDirection: "row", alignItems: "center", gap: 4 },
  remindedText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  gapText: { flex: 1, paddingTop: 6, paddingBottom: 14, paddingLeft: 4, fontFamily: fonts.body, fontSize: 12, fontStyle: "italic", color: colors.muted },
  freeDay: {
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.gold,
    borderRadius: radii.card,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  freeIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" },
  freeTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.navy },
  freeBody: { ...typography.bodyMuted, textAlign: "center", maxWidth: 280 },
  block: { gap: 8 },
  weekRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  weekDate: { width: 40, alignItems: "center" },
  weekDay: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  weekNumber: { fontFamily: fonts.serif, fontSize: 20, color: colors.navy },
  weekTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  footnote: { ...typography.small, textAlign: "center" },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20, 33, 58, 0.45)" },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  pickerSheet: { maxHeight: "80%", gap: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 2 },
  monthTitle: { flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 24, color: colors.navy },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 4 },
  gridHead: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, textTransform: "uppercase" },
  gridCell: { width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1.5, borderColor: "transparent" },
  gridCellToday: { borderColor: colors.gold },
  gridCellChosen: { backgroundColor: colors.navy, borderColor: colors.navy },
  gridCellText: { fontFamily: fonts.serif, fontSize: 18, color: colors.navy },
  gridCellTextChosen: { color: colors.ivory },
  gridDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.goldDark },
  sheetActions: { flexDirection: "row", gap: 10 },
  pickerList: { maxHeight: 360 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  pickerName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  pickerEmpty: { paddingVertical: 12 },
});
