---
name: stop-mobile
description: Stop everything used for TLS mobile development in one go - the iPhone Simulator, the Android emulator, the Expo dev server and the local API (wrangler). Use when the user types /stop-mobile or asks to close everything / shut down the mobile dev setup.
---

Run this single Bash command, then report the result as a short checklist:

```bash
# iPhone Simulator
xcrun simctl shutdown all >/dev/null 2>&1; osascript -e 'tell application "Simulator" to quit' >/dev/null 2>&1; sleep 2; pgrep -x Simulator >/dev/null && pkill -x Simulator
# Android emulator + Gradle
$HOME/Library/Android/sdk/platform-tools/adb emu kill >/dev/null 2>&1; pkill -f "qemu-system|emulator64|emulator -avd" 2>/dev/null; pkill -f GradleDaemon 2>/dev/null
# Expo dev server + Metro
pkill -f "expo start" 2>/dev/null; pkill -f "metro" 2>/dev/null
# Local API (Cloudflare wrangler dev + its workerd runtime)
pkill -f "wrangler dev" 2>/dev/null; pkill -f "workerd" 2>/dev/null
sleep 2
pgrep -x Simulator >/dev/null && echo "iPhone Simulator: still running" || echo "iPhone Simulator: closed"
pgrep -f "qemu-system|emulator64" >/dev/null && echo "Android emulator: still running" || echo "Android emulator: closed"
pgrep -f "expo start" >/dev/null && echo "Expo dev server: still running" || echo "Expo dev server: stopped"
pgrep -f "wrangler dev" >/dev/null && echo "Local API: still running" || echo "Local API: stopped"
```

The deployed API on Cloudflare (https://tls-api.shamubtr.workers.dev) is not affected; it keeps running in the cloud.
