# App config: `app.json` and `eas.json`

Merge these into `mobile/app/`. Values in `[BRACKETS]` must be replaced before a store build.

Before the plugin list below works, the packages must be installed with SDK-compatible versions:

```bash
npx expo install expo-router expo-secure-store expo-font expo-splash-screen expo-linking expo-constants
```

`package.json` → `"main": "expo-router/entry"` (create-expo-app's blank template sets `index.ts`; expo-router needs its own entry).

## `app.json`

```json
{
  "expo": {
    "name": "TLS",
    "slug": "tls",
    "scheme": "tls",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#14213A"
    },
    "ios": {
      "bundleIdentifier": "com.generalmagickindustries.tls",
      "buildNumber": "1",
      "supportsTablet": false,
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "com.generalmagickindustries.tls",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#14213A"
      },
      "permissions": [],
      "blockedPermissions": [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION"
      ],
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-font",
      [
        "expo-splash-screen",
        {
          "image": "./assets/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#14213A"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": "[RUN eas init]"
      }
    }
  }
}
```

Notes:

- **Bundle id / package.** `com.generalmagickindustries.tls` is a placeholder derived from the team email domain. Confirm it or change it *before* the first `eas build`: Apple binds the id to the App Store Connect record and it cannot be changed after the app is created there. Both values must match on iOS and Android only by convention; they can differ.
- **`extra.eas.projectId`.** `eas init` writes the real id. It refuses to overwrite an unrecognised value, so either delete the `extra` block first or run `eas init --force`.
- **Splash.** SDK 54 reads the `expo-splash-screen` plugin config for native builds; the top-level `splash` key is kept for Expo Go and web. Keep both in sync.
- **Permissions.** `android.permissions: []` adds nothing extra; `blockedPermissions` strips camera, microphone and location even if a library declares them, which keeps the Play Data safety form and Apple review simple. `INTERNET` is always included by Expo. No `NS*UsageDescription` strings are needed on iOS because the app uses no camera, mic, location, contacts or photos.
- **Versioning.** With `appVersionSource: "remote"` (below), EAS stores and increments `buildNumber` / `versionCode` on its servers; the values here only seed the first build. Bump `version` by hand for each store release (`1.0.0` → `1.0.1`).
- **`userInterfaceStyle: "light"`** locks the app to light mode so the navy/gold UI is not inverted by system dark mode.

## `eas.json`

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true,
      "environment": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "[APPLE ID EMAIL]",
        "ascAppId": "[APP STORE CONNECT APP ID]",
        "appleTeamId": "[TEAM ID]"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

Notes:

- **`environment`** on each profile makes the build pull the EAS environment variables of that name (created with `eas env:create`, see below). This is the recommended place for `EXPO_PUBLIC_*` values; they are baked into the JS bundle at build time and are not secret.
- Alternative: put them straight in the profile instead, e.g. in `production`:

  ```json
  "env": {
    "EXPO_PUBLIC_API_URL": "https://[WORKER].workers.dev",
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_[...]"
  }
  ```

  Fine for a small team, but the values then live in git. Use whichever the app code reads; the variable names must match `process.env.EXPO_PUBLIC_*` references in the app.
- `google-service-account.json` must be listed in `.gitignore`. It is only read locally by `eas submit`.
- `ascAppId` is the numeric Apple ID of the app shown in App Store Connect → App Information → General Information, not the bundle id.
- `preview` builds an installable Android APK and an ad-hoc iOS build for hands-on testing on real devices without the stores. iOS ad-hoc requires the device to be registered first (`eas device:create`).

## Environment variables (EAS-hosted)

```bash
# one per environment; repeat for development / preview with the test values
eas env:create --environment production --scope project --visibility plaintext \
  --name EXPO_PUBLIC_API_URL --value "https://[WORKER].workers.dev"
eas env:create --environment production --scope project --visibility plaintext \
  --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_[...]"

eas env:list --environment production   # verify
eas env:pull --environment development  # writes .env.local for `npx expo start`
```

Local development reads `.env.local` (git-ignored) in `mobile/app/`; the API URL there is normally `http://localhost:8787` (wrangler dev) or the machine's LAN IP for a physical device.
