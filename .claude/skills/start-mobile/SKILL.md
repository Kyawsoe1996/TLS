---
name: start-mobile
description: Start the TLS mobile development setup - the local API (wrangler dev on port 8787) and the Expo dev server, then open the app in the iPhone Simulator. Use when the user types /start-mobile or asks to run / open / start the mobile app. Optional argument "android" opens the Android emulator instead of the iPhone Simulator.
---

Start both servers in the background and open the app. If the argument is `android`, use `--android` instead of `--ios`.

1. Start the local API (skip if already running):

```bash
pgrep -f "wrangler dev" >/dev/null && echo "API already running" || { cd /Users/gmt_01/Documents/GitHub/TLS/mobile/api && (npx wrangler dev --port 8787 > /tmp/tls-api.log 2>&1 &); for i in $(seq 1 20); do sleep 1; curl -s -m 2 http://localhost:8787/health && break; done; echo; }
```

2. Start Expo and open the app in the simulator (skip if already running):

```bash
pgrep -f "expo start" >/dev/null && echo "Expo already running" || { cd /Users/gmt_01/Documents/GitHub/TLS/mobile/app && (npx expo start --ios --port 8081 > /tmp/tls-expo.log 2>&1 &); until grep -qiE "Opening exp://|error" /tmp/tls-expo.log; do sleep 2; done; grep -iE "Opening|error" /tmp/tls-expo.log | head -3; }
```

3. Report in two lines: whether the API answered on /health and which device the app opened on. Remind the user that the app uses `mobile/app/.env` (local API at localhost:8787) in this mode, and that /stop-mobile closes everything.

Notes:
- `mobile/api/.dev.vars` and `mobile/app/.env` must already contain the keys; if the app shows "Missing configuration", tell the user to check those files.
- Logs: /tmp/tls-api.log and /tmp/tls-expo.log. Read them if something fails.
