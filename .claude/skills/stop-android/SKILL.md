---
name: stop-android
description: Close the Android emulator and any Gradle build daemons. Use when the user types /stop-android or asks to close the Android emulator.
---

Run this single Bash command, then report the result in one line:

```bash
ADB=$HOME/Library/Android/sdk/platform-tools/adb; $ADB emu kill >/dev/null 2>&1; sleep 3; pgrep -f "qemu-system|emulator64|emulator -avd" >/dev/null && pkill -f "qemu-system|emulator64|emulator -avd"; pkill -f GradleDaemon 2>/dev/null; sleep 1; pgrep -f "qemu-system|emulator64" >/dev/null && echo "Android emulator: still running" || echo "Android emulator: closed"; pgrep -f GradleDaemon >/dev/null && echo "Gradle daemon: still running" || echo "Gradle daemons: none running"
```

Do not quit Android Studio itself unless the user asks. Do not stop the Expo dev server or the local API; those are handled by /stop-mobile.
