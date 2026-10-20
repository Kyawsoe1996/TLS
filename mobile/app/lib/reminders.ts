// Reminders on this phone (expo-notifications, local only — nothing is sent to clients). The preferences live in
// SecureStore; `syncReminders` replaces every notification this app scheduled with a fresh plan from
// lib/reminderPlan.ts. Permission is never requested here: the Reminders screen asks, and the sync only runs once
// the owner has allowed notifications (see useReminderSync).
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getNotifications } from "./notifications";
import { DEFAULT_REMINDER_PREFS, MINUTES_PER_DAY, REMINDER_ID_PREFIX, planReminders, type PlanInput, type PlannedReminder, type ReminderPrefs } from "./reminderPlan";

export {
  BEFORE_PRESETS,
  DEFAULT_REMINDER_PREFS,
  EVENING_PRESETS,
  MORNING_PRESETS,
  formatLead,
  formatMinutes,
  minutesToInput,
  parseTimeInput,
  planReminders,
  type PlanInput,
  type PlannedReminder,
  type ReminderPrefs,
} from "./reminderPlan";

/** Identifier of the "send a test reminder" notification (outside the tls: prefix so a sync doesn't cancel it). */
const TEST_ID = "tls-test";

const PREFS_KEY = "tls.reminders.prefs";
/**
 * Android notification channel (required from Android 8); iOS ignores it. Importance HIGH so a reminder pops up as a
 * banner rather than landing silently in the shade. Android never changes an existing channel's importance, so the
 * id carries a suffix: bump it if the settings change again.
 */
export const REMINDERS_CHANNEL_ID = "reminders-v2";

// ---- Preferences: a tiny store so the Reminders screen and the sync hook see the same values ----

let cachedPrefs: ReminderPrefs | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Fires after the preferences change and whenever `requestReminderSync()` is called. */
export function subscribeReminders(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Asks every mounted `useReminderSync` to run again (e.g. right after notification permission was granted). */
export function requestReminderSync(): void {
  emit();
}

/** The preferences once loaded; null before the first `loadReminderPrefs()` resolves. */
export function getCachedReminderPrefs(): ReminderPrefs | null {
  return cachedPrefs;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY ? value : fallback;
}

/** A lead time: at least 5 minutes, at most a day. */
function pickLead(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 5 && value <= MINUTES_PER_DAY ? value : fallback;
}

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  if (cachedPrefs) return cachedPrefs;
  let stored: Partial<Record<keyof ReminderPrefs, unknown>> = {};
  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY);
    if (raw) stored = JSON.parse(raw) as typeof stored;
  } catch {
    // Unreadable entry: fall back to the defaults and overwrite on the next save.
  }
  cachedPrefs = {
    appointmentsEvening: pickBoolean(stored.appointmentsEvening, DEFAULT_REMINDER_PREFS.appointmentsEvening),
    ordersWeekly: pickBoolean(stored.ordersWeekly, DEFAULT_REMINDER_PREFS.ordersWeekly),
    overdueDaily: pickBoolean(stored.overdueDaily, DEFAULT_REMINDER_PREFS.overdueDaily),
    readyUncollected: pickBoolean(stored.readyUncollected, DEFAULT_REMINDER_PREFS.readyUncollected),
    appointmentsBefore: pickBoolean(stored.appointmentsBefore, DEFAULT_REMINDER_PREFS.appointmentsBefore),
    eveningMinutes: pickMinutes(stored.eveningMinutes, DEFAULT_REMINDER_PREFS.eveningMinutes),
    morningMinutes: pickMinutes(stored.morningMinutes, DEFAULT_REMINDER_PREFS.morningMinutes),
    beforeMinutes: pickLead(stored.beforeMinutes, DEFAULT_REMINDER_PREFS.beforeMinutes),
  };
  return cachedPrefs;
}

export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  cachedPrefs = prefs;
  emit();
  try {
    await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Kept in memory for this launch; the defaults come back next time.
  }
}

// ---- Notifications ----

/** Allowed to show notifications (iOS provisional counts: those land quietly in Notification Centre). False in Expo Go. */
export async function notificationsAllowed(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Creates the Android channel reminders are posted on (a no-op on iOS). Safe to call on every launch. */
export async function ensureRemindersChannel(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
    name: "Reminders",
    description: "Appointments tomorrow, orders due this week, overdue and uncollected orders.",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#14213A",
  });
}

/** Removes every reminder this app scheduled (sign-out, account deletion, or before a re-plan). */
export async function cancelReminders(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(REMINDER_ID_PREFIX))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

let lastPlan: PlannedReminder[] = [];

/** What the last sync scheduled, soonest first — the Reminders screen shows it so the owner can see what's coming. */
export function getLastReminderPlan(): PlannedReminder[] {
  return lastPlan;
}

async function doSync(input: PlanInput): Promise<number> {
  const Notifications = getNotifications();
  if (!Notifications) return 0;
  const plan = planReminders(input);
  await cancelReminders();
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: REMINDERS_CHANNEL_ID },
    });
  }
  lastPlan = [...plan].sort((a, b) => a.at.getTime() - b.at.getTime());
  emit();
  return plan.length;
}

/**
 * A sample reminder, shown right away, so the owner can see what one looks like without waiting for 6 PM. Shown
 * immediately rather than "in 10 seconds": without the exact-alarm permission Android 12+ may hold a short timer back
 * for minutes (battery batching), which reads as "nothing arrived".
 */
export async function sendTestReminder(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await ensureRemindersChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_ID,
    content: { title: "Tomorrow: Somchai P., fitting at 3:00 PM", body: "Two-piece suit · Super 130s navy wool (this is a test reminder)" },
    // A channel-only trigger presents at once (no alarm involved), on the reminders channel so it pops up like a real one.
    trigger: { channelId: REMINDERS_CHANNEL_ID },
  });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Cancels every scheduled notification whose identifier starts with "tls:" and schedules the current plan (future
 * triggers only, device time zone). Calls are serialised so two syncs can't interleave their cancel / schedule
 * steps. Resolves to the number scheduled.
 */
export function syncReminders(input: PlanInput): Promise<number> {
  const run = queue.then(() => doSync(input));
  queue = run.catch(() => undefined);
  return run;
}
