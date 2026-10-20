// Keeps the phone's reminders in step with the shop's data. Mounted once in the tabs layout: while the owner is
// signed in with a shop, it loads the agenda and the open orders (same cache entries the screens use) and re-plans
// the notifications whenever that data or the preferences change and each time the app comes to the foreground.
// It never asks for permission itself — it only schedules once notifications are already allowed.
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { Appointment, Order } from "@shared/types";

import { useApi } from "./api";
import { getNotifications } from "./notifications";
import { queryKeys } from "./queryKeys";
import {
  cancelReminders,
  ensureRemindersChannel,
  getCachedReminderPrefs,
  loadReminderPrefs,
  notificationsAllowed,
  saveReminderPrefs,
  subscribeReminders,
  syncReminders,
  type ReminderPrefs,
} from "./reminders";
import { useShop } from "./useShop";

/** The reminder preferences (null until loaded) and a setter that persists them and re-syncs. */
export function useReminderPrefs(): [ReminderPrefs | null, (next: ReminderPrefs) => void] {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(getCachedReminderPrefs());

  useEffect(() => {
    let alive = true;
    void loadReminderPrefs().then((loaded) => {
      if (alive) setPrefs(loaded);
    });
    const unsubscribe = subscribeReminders(() => setPrefs(getCachedReminderPrefs()));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback((next: ReminderPrefs) => {
    void saveReminderPrefs(next);
  }, []);

  return [prefs, update];
}

export function useReminderSync(): void {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const shop = useShop().data ?? null;
  const enabled = isLoaded && !!isSignedIn && !!shop;
  const [prefs] = useReminderPrefs();
  // Bumped on foreground and on requestReminderSync(), so the plan is redone even when the data didn't change
  // (a new day moves the "tomorrow 09:00" reminders; permission may have been granted in Settings).
  const [tick, setTick] = useState(0);

  // Same keys as the agenda and orders screens, so there's one cache entry and one request for both.
  const appointmentsQuery = useQuery<Appointment[]>({
    queryKey: queryKeys.shopAppointments,
    queryFn: async () => (await api.listShopAppointments()).appointments,
    enabled,
  });
  const ordersQuery = useQuery<Order[]>({
    queryKey: queryKeys.openOrders("open"),
    queryFn: async () => (await api.listShopOrders()).orders,
    enabled,
    retry: 1,
  });

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return; // Expo Go: no reminders at all
    // Show a reminder even if it fires while the app is open; without a handler it's dropped.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    void ensureRemindersChannel().catch(() => undefined);
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") setTick((t) => t + 1);
    });
    const unsubscribe = subscribeReminders(() => setTick((t) => t + 1));
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, []);

  const appointments = appointmentsQuery.data;
  const orders = ordersQuery.data;

  useEffect(() => {
    if (!enabled) {
      // Signed out (or no shop yet): nothing of this account may keep firing, client names included.
      void cancelReminders().catch(() => {});
      return;
    }
    if (!prefs || !appointments || !orders) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await notificationsAllowed()) || cancelled) return;
        await syncReminders({ appointments, orders, prefs });
      } catch {
        // Reminders are a convenience; never let them disturb the screen that's open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, prefs, appointments, orders, tick]);
}
