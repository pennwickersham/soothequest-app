# Soothe Quest — Android APK Build Guide

The game is a single self-contained HTML file, which is the easiest possible
thing to package for Android. The recommended wrapper is **Capacitor**
(modern, maintained, used by thousands of shipped apps). Total time for a
first build: about 30–45 minutes.

## Prerequisites (one-time)

1. **Node.js** 18+ — https://nodejs.org
2. **Android Studio** — https://developer.android.com/studio
   - During setup, install the default SDK and an emulator image
   - Or skip the emulator and test on your own phone (enable
     *Developer options → USB debugging*)

## Build steps

```bash
# 1. Create the project
mkdir soothe-quest && cd soothe-quest
npm init -y
npm install @capacitor/core @capacitor/cli

# 2. Initialize Capacitor
npx cap init "Soothe Quest" "com.yourstudio.soothequest" --web-dir=www

# 3. Add the game
mkdir www
#    copy soothe-quest.html into www/ and rename it:
cp /path/to/soothe-quest.html www/index.html

# 4. Add the Android platform
npm install @capacitor/android
npx cap add android

# 5. Open in Android Studio and build
npx cap open android
#    In Android Studio: Build > Build App Bundles / APK(s) > Build APK(s)
#    The debug APK lands in android/app/build/outputs/apk/debug/
```

Install `app-debug.apk` on any Android phone (you'll need to allow
"install from unknown sources" for a debug build) and you're testing.

## Recommended config tweaks

In `capacitor.config.json`, after `cap init`:

```json
{
  "appId": "com.yourstudio.soothequest",
  "appName": "Soothe Quest",
  "webDir": "www",
  "android": {
    "backgroundColor": "#1B1340"
  }
}
```

In `android/app/src/main/AndroidManifest.xml`, on the `<activity>` tag:

```xml
android:screenOrientation="portrait"
```

Two small native niceties worth adding before wide testing:

```bash
npm install @capacitor/status-bar @capacitor/haptics
npx cap sync
```

- **Status bar**: set overlay + dark style so the game runs edge-to-edge
- **Haptics**: fire a light impact on matches and a medium one on
  detonations — haptics matter disproportionately for immersion in a
  pain-distraction app, and it's ~10 lines of JS

## Fonts offline

The game currently loads Fredoka/Nunito from Google Fonts. For the APK,
download both .woff2 files, place them in `www/fonts/`, and swap the
`<link>` tag for local `@font-face` rules so the game works with no
network. (Everything else — graphics, music, sound — is already
generated in-code and needs no assets.)

## Before real users (production checklist)

- Persist `state` to storage (`@capacitor/preferences`) — the demo is
  in-memory by design
- Move the daily life refill and trial countdown to **server time**
  (client clocks are trivially cheated)
- Replace the simulated shop with **Google Play Billing** via
  `@capacitor-community/in-app-purchases`; configure the 7-day trial as
  a Play Billing *introductory offer* so Google handles trial/renewal
- `keep-awake` plugin so the screen doesn't sleep mid-level
- Test on a low-end device (~$100 phone) — DOM-based rendering is fine
  for an 8x8 board, but verify cascade animations hold 60fps there

## Alternative: PWA / TWA

If you'd rather skip Android Studio for the first test round: host the
HTML anywhere (even GitHub Pages), add a one-page manifest.json, and
testers can "Add to Home Screen" — instant full-screen install with zero
build. Bubblewrap can later turn that same PWA into a Play-Store-ready
package. Capacitor is still the better end state (billing, haptics), but
PWA gets phones in hands today.
