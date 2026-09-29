---
name: stop-ios
description: Close the iPhone Simulator (shuts down every booted virtual iPhone and quits the Simulator app). Use when the user types /stop-ios or asks to close the iOS simulator.
---

Run this single Bash command, then report the result in one line:

```bash
xcrun simctl shutdown all >/dev/null 2>&1; osascript -e 'tell application "Simulator" to quit' >/dev/null 2>&1; sleep 2; pgrep -x Simulator >/dev/null && pkill -x Simulator; sleep 1; pgrep -x Simulator >/dev/null && echo "Simulator: still running" || echo "iPhone Simulator: closed"
```

Do not stop the Expo dev server or the local API; those are handled by /stop-mobile.
