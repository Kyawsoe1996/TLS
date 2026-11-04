// Removes the iOS push entitlement (`aps-environment`) that the expo-notifications config plugin always adds.
// The app only schedules local notifications (lib/notifications.ts, Settings → Reminders): no push token, no APNs.
// Without this, every App Store build needs a provisioning profile with the Push Notifications capability.
// Listed just BEFORE "expo-notifications" in app.json: mods run in reverse order, so this one runs after that plugin.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
