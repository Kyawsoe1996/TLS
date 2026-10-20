import { Ionicons } from "@expo/vector-icons";
import type { NotificationPermissionsStatus } from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { Button, Card, Chip, Screen, TimePickerSheet } from "@/components/ui";
import { colors, fonts, typography } from "@/constants/theme";
import { formatDateTime } from "@/lib/format";
import { getNotifications } from "@/lib/notifications";
import {
  BEFORE_PRESETS,
  EVENING_PRESETS,
  MORNING_PRESETS,
  formatLead,
  formatMinutes,
  getLastReminderPlan,
  requestReminderSync,
  sendTestReminder,
  subscribeReminders,
  type PlannedReminder,
  type ReminderPrefs,
} from "@/lib/reminders";
import { showError, showToast } from "@/lib/toast";
import { useReminderPrefs } from "@/lib/useReminderSync";

/** "unavailable" = Expo Go, where the notification module isn't bundled. */
type Permission = "loading" | "undetermined" | "granted" | "denied" | "unavailable";

type ToggleKey = "appointmentsEvening" | "appointmentsBefore" | "ordersWeekly" | "overdueDaily" | "readyUncollected";

/** The switches; subtitles quote the times the owner picked under Timing. */
function rowsFor(prefs: ReminderPrefs | null): { key: ToggleKey; title: string; subtitle: string }[] {
  const evening = formatMinutes(prefs?.eveningMinutes ?? 18 * 60);
  const morning = formatMinutes(prefs?.morningMinutes ?? 9 * 60);
  const lead = formatLead(prefs?.beforeMinutes ?? 60);
  return [
    { key: "appointmentsEvening", title: "Tomorrow's appointments", subtitle: `The evening before, at ${evening}` },
    { key: "appointmentsBefore", title: "Before each appointment", subtitle: `On the day, ${lead} before — covers same-day bookings` },
    { key: "ordersWeekly", title: "Orders due this week", subtitle: `Monday at ${morning}, with the list` },
    { key: "overdueDaily", title: "Overdue orders", subtitle: `Every morning at ${morning} while any order is late` },
    { key: "readyUncollected", title: "Ready for collection", subtitle: "When an order is marked Ready and not collected after 3 days" },
  ];
}

function toPermission(status: NotificationPermissionsStatus): Permission {
  if (status.granted || status.ios?.status === getNotifications()?.IosAuthorizationStatus.PROVISIONAL) return "granted";
  return status.canAskAgain ? "undetermined" : "denied";
}

/**
 * Reminders (local notifications only). Reached from Settings. The switches are saved on the phone; the actual
 * scheduling happens in useReminderSync, which runs whenever these change. This is the only place that asks for
 * notification permission.
 */
export default function RemindersScreen() {
  const [prefs, setPrefs] = useReminderPrefs();
  const [permission, setPermission] = useState<Permission>("loading");
  const [asking, setAsking] = useState(false);
  const [plan, setPlan] = useState<PlannedReminder[]>(getLastReminderPlan());
  const [testing, setTesting] = useState(false);

  // Show what the last sync scheduled, and ask for a fresh sync on arrival so the list is current.
  useEffect(() => {
    const unsubscribe = subscribeReminders(() => setPlan(getLastReminderPlan()));
    requestReminderSync();
    return unsubscribe;
  }, []);

  const sendTest = async () => {
    setTesting(true);
    try {
      await sendTestReminder();
      showToast("Test reminder sent", "It should pop up now; it also sits in the notification shade.");
    } catch (err) {
      showError(err, "Couldn't schedule the test");
    } finally {
      setTesting(false);
    }
  };

  const refresh = useCallback(async () => {
    const Notifications = getNotifications();
    if (!Notifications) {
      setPermission("unavailable");
      return;
    }
    try {
      setPermission(toPermission(await Notifications.getPermissionsAsync()));
    } catch {
      setPermission("denied");
    }
  }, []);

  // Re-check when coming back from Settings.
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const ask = async (): Promise<boolean> => {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    setAsking(true);
    try {
      const next = toPermission(await Notifications.requestPermissionsAsync());
      setPermission(next);
      if (next === "granted") requestReminderSync();
      return next === "granted";
    } catch (err) {
      showError(err, "Couldn't ask for notifications");
      return false;
    } finally {
      setAsking(false);
    }
  };

  const toggle = async (key: ToggleKey, value: boolean) => {
    if (!prefs || permission === "unavailable") return;
    setPrefs({ ...prefs, [key]: value });
    if (value && permission === "undetermined") await ask();
  };

  const setTime = (key: "eveningMinutes" | "morningMinutes" | "beforeMinutes", minutes: number) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: minutes });
  };

  const ROWS = rowsFor(prefs);
  const anyOn = !!prefs && ROWS.some((row) => prefs[row.key]);
  const settingsApp = Platform.OS === "ios" ? "iOS Settings" : "Android Settings";

  return (
    <Screen back eyebrow="Settings" title="Reminders" subtitle="Notifications on this phone only. Nothing is sent to clients." edges={["top", "bottom"]}>
      {permission === "unavailable" ? (
        <Card variant="soft" style={styles.allowCard} testID="reminders-unavailable">
          <Text style={typography.body}>Reminders work in the full Magick Tailor app. Expo Go can&apos;t schedule notifications, so the switches are off here.</Text>
        </Card>
      ) : null}

      {permission === "denied" ? (
        <View style={styles.notice} accessibilityRole="alert" testID="reminders-denied">
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <View style={styles.noticeText}>
            <Text style={styles.noticeMessage}>Notifications are off for Magick Tailor in {settingsApp}.</Text>
            <Button size="sm" variant="secondary" icon="settings-outline" title="Open Settings" onPress={() => void Linking.openSettings()} />
          </View>
        </View>
      ) : null}

      {permission === "undetermined" && anyOn ? (
        <Card variant="soft" style={styles.allowCard} testID="reminders-allow">
          <Text style={typography.body}>Allow notifications so these reminders can reach you.</Text>
          <Button size="sm" variant="gold" icon="notifications-outline" title="Allow notifications" onPress={() => void ask()} loading={asking} />
        </Card>
      ) : null}

      <Card padding={0}>
        {ROWS.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <ToggleRow
              title={row.title}
              subtitle={row.subtitle}
              value={prefs?.[row.key] ?? false}
              disabled={!prefs}
              onValueChange={(value) => void toggle(row.key, value)}
              testID={`reminder-${row.key}`}
            />
          </View>
        ))}
      </Card>

      <Card style={styles.timingCard} testID="reminders-timing">
        <Text style={styles.planTitle}>Timing</Text>
        <TimeSetting
          label="Evening reminder"
          hint="The day before each appointment."
          minutes={prefs?.eveningMinutes ?? 18 * 60}
          presets={EVENING_PRESETS}
          disabled={!prefs}
          onChange={(minutes) => setTime("eveningMinutes", minutes)}
          testID="reminders-evening"
        />
        <TimeSetting
          label="Morning reminder"
          hint="Orders due this week, overdue and uncollected orders. Times follow the phone's clock."
          minutes={prefs?.morningMinutes ?? 9 * 60}
          presets={MORNING_PRESETS}
          disabled={!prefs}
          onChange={(minutes) => setTime("morningMinutes", minutes)}
          testID="reminders-morning"
        />
        <TimeSetting
          label="Before each appointment"
          hint="How long before, on the day."
          minutes={prefs?.beforeMinutes ?? 60}
          presets={BEFORE_PRESETS}
          mode="duration"
          disabled={!prefs}
          onChange={(minutes) => setTime("beforeMinutes", Math.max(5, minutes))}
          testID="reminders-before"
        />
      </Card>

      {permission === "granted" ? (
        <Card style={styles.planCard} testID="reminders-plan">
          <Text style={styles.planTitle}>Coming up on this phone</Text>
          {plan.length === 0 ? (
            <Text style={typography.small}>Nothing scheduled yet. Add an appointment for tomorrow, or an order due this week, and it appears here.</Text>
          ) : (
            plan.slice(0, 6).map((reminder) => (
              <View key={reminder.id} style={styles.planRow}>
                <Ionicons name="notifications-outline" size={16} color={colors.goldDark} />
                <View style={styles.planText}>
                  <Text style={styles.planRowTitle} numberOfLines={2}>
                    {reminder.title}
                  </Text>
                  <Text style={typography.small}>{formatDateTime(reminder.at.toISOString())}</Text>
                </View>
              </View>
            ))
          )}
          {plan.length > 6 ? <Text style={typography.small}>+{plan.length - 6} more</Text> : null}
          <Button size="sm" variant="secondary" icon="paper-plane-outline" title="Send a test reminder" onPress={() => void sendTest()} loading={testing} testID="reminders-test" />
        </Card>
      ) : null}

      <Card variant="soft" style={styles.infoCard}>
        <Ionicons name="phone-portrait-outline" size={18} color={colors.goldDark} />
        <Text style={styles.infoText}>
          Reminders are scheduled on this phone from the appointments and orders already in the app, so they work without a signal. They
          refresh each time you open Magick Tailor.
        </Text>
      </Card>
    </Screen>
  );
}

/** A time of day (or a lead time): tap the value to pick it on hour / minute wheels; quick-pick chips underneath. */
function TimeSetting({
  label,
  hint,
  minutes,
  presets,
  mode = "time",
  disabled,
  onChange,
  testID,
}: {
  label: string;
  hint: string;
  minutes: number;
  presets: readonly number[];
  mode?: "time" | "duration";
  disabled?: boolean;
  onChange: (minutes: number) => void;
  testID?: string;
}) {
  const [picking, setPicking] = useState(false);
  const show = mode === "duration" ? formatLead : formatMinutes;
  return (
    <View style={styles.timingBlock}>
      <Pressable
        onPress={() => setPicking(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${show(minutes)}. Change`}
        style={({ pressed }) => [styles.timeRow, pressed && styles.timeRowPressed]}
        testID={testID}
      >
        <View style={styles.timeText}>
          <Text style={styles.timeLabel}>{label}</Text>
          <Text style={typography.small}>{hint}</Text>
        </View>
        <Text style={[styles.timeValue, mode === "duration" && styles.timeValueSmall]}>{show(minutes)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <View style={styles.chips}>
        {presets.map((preset) => (
          <Chip key={preset} label={show(preset)} selected={minutes === preset} onPress={() => onChange(preset)} disabled={disabled} />
        ))}
      </View>
      <TimePickerSheet
        visible={picking}
        title={label}
        minutes={minutes}
        mode={mode}
        onConfirm={(next) => {
          setPicking(false);
          if (next !== minutes) onChange(next);
        }}
        onCancel={() => setPicking(false)}
      />
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
  testID,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={typography.small}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.gold }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.line}
        accessibilityLabel={title}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: { flex: 1, gap: 10, alignItems: "flex-start" },
  noticeMessage: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.danger },
  allowCard: { gap: 10, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  timingCard: { gap: 14 },
  timingBlock: { gap: 8 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 6 },
  timeRowPressed: { opacity: 0.7 },
  timeText: { flex: 1, minWidth: 0, gap: 2 },
  timeLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  timeValue: { fontFamily: fonts.serif, fontSize: 24, color: colors.navy },
  timeValueSmall: { fontSize: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  planCard: { gap: 10, alignItems: "flex-start" },
  planTitle: { ...typography.h3, marginBottom: 2 },
  planRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, alignSelf: "stretch" },
  planText: { flex: 1, minWidth: 0, gap: 2 },
  planRowTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.ink },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  infoText: { ...typography.small, flex: 1, color: colors.ink },
});
