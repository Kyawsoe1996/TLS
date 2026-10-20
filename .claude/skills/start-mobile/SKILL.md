---
name: start-mobile
description: Start the TLS mobile development setup - the local API (wrangler dev on port 8787, reachable on the Wi-Fi) and one Expo dev server - then open the development build on the chosen devices. Use when the user types /start-mobile or asks to run / open / start the mobile app. Argument: none or "ios" = iPhone Simulator, "android" = Android emulator, "all" = both, "phone" = servers only (the Android phone on the same Wi-Fi connects by itself).
---

One Metro and one API serve every device at the same time (iPhone Simulator, Android emulator and the
Android phone on the same Wi-Fi are all clients of the same servers). The Mac's Wi-Fi address changes per
network, so step 1 writes it into the app's local env every time. Argument: `$ARGUMENTS` (empty = `ios`).

1. Write this Mac's Wi-Fi address into `mobile/app/.env.local` and start the local API on all interfaces (skip the start if it is already running):

```bash
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); [ -z "$IP" ] && echo "No Wi-Fi address found - is Wi-Fi on?"; ENV=/Users/gmt_01/Documents/GitHub/TLS/mobile/app/.env.local; if grep -q '^EXPO_PUBLIC_API_URL=' "$ENV"; then sed -i '' "s#^EXPO_PUBLIC_API_URL=.*#EXPO_PUBLIC_API_URL=http://$IP:8787#" "$ENV"; else echo "EXPO_PUBLIC_API_URL=http://$IP:8787" >> "$ENV"; fi; echo "Mac address: $IP (API URL written to .env.local)"; pgrep -f "wrangler dev" >/dev/null && echo "API already running" || { cd /Users/gmt_01/Documents/GitHub/TLS/mobile/api && (npx wrangler dev --port 8787 --ip 0.0.0.0 > /tmp/tls-api.log 2>&1 &); for i in $(seq 1 30); do sleep 1; curl -s -m 2 http://localhost:8787/health >/dev/null 2>&1 && break; done; }; echo "API on the Wi-Fi: $(curl -s -m 3 http://$IP:8787/health)"
```

2. Start Metro once. Env values are baked in when Metro starts, so if it is already running with a different address, restart it:

```bash
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); cd /Users/gmt_01/Documents/GitHub/TLS/mobile/app; START=""; if pgrep -f "expo start" >/dev/null; then if grep -q "$IP" /tmp/tls-expo.log 2>/dev/null; then echo "Metro already running on $IP"; else pkill -f "expo start"; pkill -f "metro"; sleep 2; START=1; fi; else START=1; fi; [ -n "$START" ] && { (npx expo start --port 8081 > /tmp/tls-expo.log 2>&1 &); for i in $(seq 1 45); do sleep 2; grep -qE "Metro waiting on|Waiting on|error" /tmp/tls-expo.log && break; done; grep -E "Metro waiting on|Waiting on|error" /tmp/tls-expo.log | head -2; }
```

3. Open the development build on the requested devices (the deep link tells the installed dev build which Metro to load):

```bash
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); URL="expo-development-client/?url=http%3A%2F%2F$IP%3A8081"; ADB=$HOME/Library/Android/sdk/platform-tools/adb; EMU=$HOME/Library/Android/sdk/emulator/emulator; ARG="${ARGUMENTS:-ios}"
open_ios() { xcrun simctl boot "iPhone 17 Pro" >/dev/null 2>&1; open -a Simulator; for i in $(seq 1 20); do sleep 1; xcrun simctl list devices booted | grep -q Booted && break; done; sleep 2; xcrun simctl openurl booted "tls://$URL" && echo "iPhone Simulator: opened"; }
open_android() { if ! $ADB devices | grep -q "^emulator-"; then AVD=$($EMU -list-avds | head -1); ($EMU -avd "$AVD" -netdelay none -netspeed full > /dev/null 2>&1 &); for i in $(seq 1 60); do sleep 2; $ADB devices | grep -q "^emulator-" && break; done; fi; E=$($ADB devices | grep "^emulator-" | cut -f1 | head -1); for i in $(seq 1 60); do $ADB -s "$E" shell getprop sys.boot_completed 2>/dev/null | grep -q 1 && break; sleep 2; done; $ADB -s "$E" shell am start -a android.intent.action.VIEW -d "exp+tls://$URL" >/dev/null 2>&1 && echo "Android emulator ($E): opened"; }
case "$ARG" in ios) open_ios ;; android) open_android ;; all) open_ios; open_android ;; phone) echo "Servers only." ;; *) echo "Unknown argument '$ARG' (use ios, android, all or phone)"; open_ios ;; esac
echo "On the phone (same Wi-Fi): open Magick Tailor and tap this Mac's server, or enter http://$IP:8081"
```

4. Report in three short lines: the Mac's address and whether the API answered on it, whether Metro is running (new or already), and which devices were opened — plus the one-line phone instruction. Mention that /stop-mobile closes everything.

Notes:
- The app's dev config is `mobile/app/.env.local` (local API at the Mac's Wi-Fi address, Clerk development key); `.env` holds the production values and is not used while `.env.local` exists. `mobile/api/.dev.vars` must hold the API secrets. If the app shows "Missing configuration", check those files.
- The dev build must already be installed on a device (simulator: EAS `development-simulator` build; phone/emulator: `npx expo run:android --device`). Expo Go cannot run this app any more (native modules).
- If the Wi-Fi blocks phone-to-laptop traffic (guest / hotel networks), plug the phone in and run `$HOME/Library/Android/sdk/platform-tools/adb reverse tcp:8787 tcp:8787` (Metro's port 8081 is tunnelled automatically by `expo run:android`); the phone then also needs the API URL as `http://localhost:8787` - set it by hand for that session.
- Logs: /tmp/tls-api.log and /tmp/tls-expo.log. Read them if something fails.
