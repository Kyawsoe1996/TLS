# Local development: simulator, emulator and a real phone at once

Everything in development runs from this Mac: one **Metro** server (the app's JavaScript, port 8081) and
one **local API** (`wrangler dev`, port 8787, the development Turso database). The iPhone Simulator, the
Android emulator and an Android phone are all just clients of those two servers, so they can run at the
same time and all see the same data.

## Day to day

- `/start-mobile` (iPhone Simulator), `/start-mobile android` (emulator), `/start-mobile all` (both),
  `/start-mobile phone` (servers only). `/stop-mobile` closes everything.
- The skill writes the Mac's current Wi-Fi address into `mobile/app/.env.local` as
  `EXPO_PUBLIC_API_URL=http://<ip>:8787` every time, because that address changes with the network.
  `.env.local` is git-ignored; it also carries the Clerk **development** key. `.env` holds the production
  values and is ignored while `.env.local` exists.
- Code changes (screens, logic, API) reach every device on reload — no rebuild. Only native changes need a
  new build: a package with native code, `app.json` permissions / plugins, icon or splash, an Expo SDK
  upgrade. We say so explicitly when that is the case.

## The phone over Wi-Fi

The phone runs a **development build** (installed once over USB with `npx expo run:android --device`;
the debug APK is at `mobile/app/android/app/build/outputs/apk/debug/app-debug.apk`). It has no app code
of its own: it loads the app from Metro and calls the API on the Mac.

Requirements:
1. Phone and Mac on the **same Wi-Fi**. Any network is fine as long as both are on it; run `/start-mobile`
   again after switching networks so the new address is written.
2. The network must allow devices to talk to each other. Guest and hotel networks often block that
   ("client isolation"); a phone hotspot that the Mac joins works.

On the phone: open **Magick Tailor** → the launcher lists this Mac's Metro server (tap it), or enter
`http://<ip>:8081` by hand (the address `/start-mobile` prints).

Fallback with a cable: `adb reverse tcp:8787 tcp:8787` after plugging in (Metro's port is tunnelled by
`expo run:android` already) and set `EXPO_PUBLIC_API_URL=http://localhost:8787` in `.env.local` for that
session.

## Simulator and emulator

- iPhone Simulator: the development build comes from EAS (`development-simulator` profile; see
  `mobile/docs/release-checklist.md` and the `eas.json` profiles). Local `npx expo run:ios` needs an
  Apple signing certificate because of the Sign in with Apple and notification entitlements, so use EAS.
- Android emulator: `npx expo run:android` builds and installs the debug build on the running emulator
  (AVD `rn_api36`), the same APK as the phone.

Speech recognition does not work in the iPhone Simulator; test dictation on the phone or the emulator
(the emulator needs the Google app for the recogniser).
