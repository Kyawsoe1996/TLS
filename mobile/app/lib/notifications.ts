// expo-notifications, loaded on demand. Importing it at the top of a module logs "Cannot find native module
// 'ExpoPushTokenManager'" in Expo Go (its push half isn't bundled there since SDK 53), so the reminders code
// asks for it through here: null in Expo Go or in a build without the native module, the real module otherwise.
import { requireOptionalNativeModule } from "expo";
import Constants, { ExecutionEnvironment } from "expo-constants";

export type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

/** The module, or null when notifications can't work in this build (Expo Go). */
export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  // Ask for the native module before requiring the package: a require that fails at runtime is reported by Metro
  // as a fatal error rather than thrown, so the try/catch alone can't protect a build without the module.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient || requireOptionalNativeModule("ExpoNotificationScheduler") == null) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded only once we know it exists
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True in the app's own builds (development, TestFlight, store); false in Expo Go. */
export function notificationsAvailable(): boolean {
  return getNotifications() !== null;
}
