# Building the UPG APK (on your Windows machine)

## Why this step has to happen on your machine, not here
The Capacitor project itself is fully done and included in this zip —
`android/` is a real, complete native Android project. But actually
*compiling* it into an APK requires downloading:
- the Gradle build tool distribution (`services.gradle.org`)
- the Android Gradle Plugin + Android SDK components
  (`dl.google.com`, `maven.google.com`)
- assorted Java dependencies (`repo.maven.apache.org`)

The sandboxed environment I did this work in only allows network
access to npm/GitHub/PyPI/crates — not Google's Maven or Gradle's own
distribution servers — so the compile step itself has to happen
somewhere with normal internet access. Everything up to that point
(the whole native project, permissions, plugin wiring) is done.

## One-time setup
1. Install **Android Studio** (includes the Android SDK + a bundled
   JDK): https://developer.android.com/studio
2. Open Android Studio once, let it finish its own first-run SDK
   download (this is the same Google Maven access mentioned above —
   totally normal on a real machine with internet).

## Build the APK
1. Unzip this project somewhere on your machine.
2. Open a terminal in the project folder (where `package.json` is) and run:
   ```
   npm install
   npm run sync
   ```
   (`npm run sync` regenerates `www/` from the real source files and
   copies it into `android/app/src/main/assets/public` — do this again
   any time you change `index.html`/`css`/`js` before rebuilding.)
3. Open the `android` folder in Android Studio (File → Open →
   select the `android` folder specifically, not the project root).
4. Let Gradle sync finish (first time will take a few minutes — this
   is Android Studio downloading everything mentioned above).
5. Build → Build Bundle(s) / APK(s) → **Build APK(s)**.
6. Android Studio will show a notification with a "locate" link to the
   generated file — it'll be at:
   `android/app/build/outputs/apk/debug/app-debug.apk`

That debug APK installs directly on any Android phone (enable
"Install unknown apps" for whichever app you transfer it with) — no
Play Store, no signing required for debug builds.

## What's already wired up for you
- App ID: `com.upg` (worth double-checking this is
  what you want before any public release — it can't be changed later
  without effectively shipping a new app).
- `@capacitor/local-notifications` is installed and registered — the
  native alarm code in `js/features/widget.js` (from the last fix
  pass) will start working for real once this is running as an
  installed app instead of a browser tab.
- `AndroidManifest.xml` already has the three permissions
  Local Notifications needs: `POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.

## Known follow-ups (not blockers, just next-in-line)
- **Google Sign-In**: works in the web build, but Google blocks
  sign-in popups inside an Android WebView. Swap to
  `@capacitor-firebase/authentication`'s native Google Sign-In before
  relying on this in the shipped app — flagged in `firebase-init.js`'s
  comments too.
- **App icon / splash screen**: currently Capacitor's default
  placeholder icon. Worth running
  `npx @capacitor/assets generate` against a real 1024×1024 icon
  before a real release build.
- **Signing for release** (as opposed to this debug APK): needs a
  keystore + signing config in `android/app/build.gradle` — only
  needed once you're ready for a release build / Play Store, not for
  a debug APK to test on your own phone.
