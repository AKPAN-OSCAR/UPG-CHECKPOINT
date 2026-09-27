# UPG v2 — Real Port, Second Pass

This replaces the first React pass, which reinvented several features
instead of porting them and was rightly rejected. This pass is a
genuine port: every mechanic below was read from the original
`js/` files in full before being rebuilt in React — nothing was
redesigned from assumption.

## What's real and matches the original mechanics
- **Two genuinely different table types**, not one unified model:
  - **Timetables**: fixed daily block list, 3-state tap cycle per
    block per day (blank → done → missed → blank), organized by
    week/day strip. Ported from `app.js`'s `Views.TT` logic.
  - **Habit trackers** (build/stop): calendar-grid since creation
    date, same 3-state cycle, streak = consecutive days back from
    today. Ported from `Views.Streak`.
- **Real priority system**: the actual 4 tiers (critical/high/normal/
  background) with their real colors/weights from `state.js`, used in
  the block editor exactly as before.
- **Real 10 badges** (`BADGE_DEFS`) with their real unlock logic
  (`Badges.check()` ported from `badges.js` line-for-line, DOM
  stripped) — not the invented 18 from the first pass.
- **Real consistency score** algorithm (`Stats.getConsistencyScore`),
  same active-days-only averaging as the original.
- **Real AI context**: per-table breakdown, habit streaks, goals with
  milestone %, not just "today's task list."
- **Real quotes rotation**, streak-at-risk banner, and table status
  pills (`NOT STARTED` / `X/Y DONE` / `✓ COMPLETE` / `🔥 N DAYS`) —
  all ported from `app.js`'s actual `_pill()` function.
- **Navigation fixed per your correction**: the `+` button now only
  exists on Home (floating, not in the nav bar). Everything else —
  table detail, Alarms, Goals — is a pushed full-screen view with an
  animated slide-in and a working back arrow.

## The alarm system — the part asked for the most effort
- **Per-alert choice of Ring / Speak / Vibrate** (your explicit ask),
  not the original's two-independent-toggles model.
- **Ring**: the exact synthesized tone pattern from the original
  `widget.js` (same frequency sequence, same envelope) — ported, not
  reinvented.
- **Speak**: real `SpeechSynthesis` with the actual 3 voice
  personalities (Strict/Friendly/Motivational) and their real message
  banks, sentence-chained exactly as the original did for Android
  reliability. You pick which voice when Speak is selected.
- **Vibrate**: new — uses `@capacitor/haptics` on-device, falls back
  to `navigator.vibrate` in a browser preview.
- **Manual times + auto-detect**, test-alert button — same config
  shape as the original `alertCfg`.
- **Honest scope limit, stated plainly**: this schedules and fires
  correctly while the app is open/foregrounded. Making it fire with
  the same reliability while the app is fully closed — the genuinely
  "disturbing, can't-miss-it" experience — needs native Android alarm
  code (`AlarmManager` + a full-screen intent) that has to be written
  and compiled in Android Studio, the same category of work as the
  Gradle setup earlier. That native piece is the very next task, not
  something skipped or faked here.

## Verified in this environment
- `npm install && npm run build` — clean, 1621 modules, outputs to `www/`
- `npm test` — all 46 original tests still pass unchanged

## Native auth fix — done, verified compiling
`useAuth.js` now uses `@capacitor-firebase/authentication` for Google
and Phone — real native Android sign-in (system account picker, native
phone verification), not the web popup/reCAPTCHA that caused the
original "stuck for hours" bug. Verified: `npm run build` clean,
`npx cap sync android` correctly picked up all 4 native plugins.

**What's left is Firebase Console config, not code** — the Gradle side
already safely handles a missing `google-services.json` (won't crash
the build, Google/Phone sign-in just won't work until it's added):
1. Firebase Console → Project Settings → Android app registered as
   `com.upg` (add it if it isn't there yet)
2. Download `google-services.json`, place at `android/app/google-services.json`
3. **Required for Google Sign-In to work at all**: run
   `cd android && ./gradlew signingReport`, copy the debug SHA-1 (and
   SHA-256), paste into that Firebase Android app's settings
4. Firebase Console → Authentication → Sign-in method → confirm
   Google and Phone are both enabled with real allowed regions

## Alarm system — major upgrade, this pass
Per the explicit request for real effort here:

- **Loudness, the honest version**: no app can exceed a phone's
  physical speaker limit — that's hardware, not permissions. What's
  real and built: `UpgAlarmPlugin.kt`'s `boostAlarmVolume()` forces
  the dedicated **alarm audio stream** (`STREAM_ALARM`) to its actual
  maximum before firing — the same mechanism real alarm clock apps
  use to stay loud even when media/ringer volume is turned down. Plus
  a genuine Do-Not-Disturb bypass request flow (opens the exact system
  settings screen — Android requires the user grant this themselves,
  no app can silently self-grant it).
- **12 real alarm sounds**: synthesized (not licensed/recorded — none
  available to source here) but genuinely distinct patterns, defined
  once in `src/core/alarm-tones.js` AND rendered as 12 real bundled
  `.wav` files in `android/app/src/main/res/raw/`, generated with
  Python's stdlib `wave` module to match the same patterns. This means
  UPG's own sounds play through the exact same `STREAM_ALARM` native
  path as device sounds — not a weaker in-app-only fallback.
- **Device alarm sounds**: `UpgAlarmPlugin.kt`'s `getDeviceAlarmSounds()`
  queries Android's real `RingtoneManager` (`TYPE_ALARM`) — the same
  list the phone's own Clock app shows. Users pick UPG sounds or their
  own device's sounds, wired into `AlarmSettings.jsx`.
- **Voice mode**: gender (male/female, chosen via TTS voice-name
  heuristics since Android TTS engines don't expose a reliable gender
  field) × style (Arrogant/Friendly/Normal — arrogant maps to a
  sharpened version of the original "strict" personality, Normal is a
  genuinely new, plain/neutral personality added this pass).
- **Per-block escalation** — the actual "5 times at start, keep
  reminding until marked done, escalate again at end time" behavior,
  tied automatically to every block's real start/end time across every
  timetable, not a single global daily alarm. Runs in `App.jsx` via
  `useAlarmSystem`'s `scheduleBlockEscalation`.

**New native plugin**: `UpgAlarmPlugin.kt` — a custom (non-npm) local
Capacitor plugin. Registered manually in `MainActivity.java`
(`registerPlugin(UpgAlarmPlugin.class)`), which is why `npx cap sync`
correctly does NOT list it alongside the npm-installed plugins — local
plugins aren't auto-discovered that way, this is expected, not missing.
Kotlin support (`org.jetbrains.kotlin.android` plugin + stdlib) was
added to `android/build.gradle`/`android/app/build.gradle` since
neither had it before this pass.

**The one thing genuinely not done, stated plainly**: everything above
is real and verified compiling on the JS/React side (`npm run build`,
`npm test`, `npx cap sync` all clean). The Kotlin file itself has
**not been compiled or run on a device** — there's no Android SDK in
this environment, same limitation as all along. It needs a real build
+ on-device test in Android Studio before being trusted as fully
working. Making the escalation survive the app being fully closed
(true background reliability) needs native `AlarmManager` scheduling
on top of this — this pass covers foreground/open-app reliability
only, and that native scheduling gap is called out here rather than
silently left for you to discover.

## `npm run dev` crash — found, fixed, verified
This is very likely what you saw. `@capacitor-firebase/authentication`
auto-detects platform: on a real compiled APK it runs actual native
Android code and never touches this. In a plain browser tab (`npm run
dev`, no native bridge available), it falls back to its own web
implementation, which calls the npm `firebase` package's `getAuth()`
— a completely separate module instance from the CDN-loaded SDK the
rest of the app uses. Without registering a Firebase app via that npm
SDK too, this throws immediately on load and breaks the whole page in
browser preview.

Confirmed directly, not just assumed:
```
Before fix: "Firebase: No Firebase App '[DEFAULT]' has been created
             - call initializeApp() first (app/no-app)."
After fix:  getAuth() succeeds, no throw.
```
Fixed in `src/main.jsx` — registers the same project via the npm SDK
alongside the existing CDN-based one. Native Android is completely
unaffected either way, since it never runs this code path at all.

## Still open
- Native background-alarm reliability (above)
- Native Google/Phone auth plugin swap (the original WebView bug is
  not yet fixed — Login still uses the same web adapters)
- Home Screen Widget, Account, Data & Sync, Help screens — placeholder
  "next in line" screens exist so nothing 404s, but the real screens
  aren't built yet
- Calendar month-view and mood tracker (read and understood from
  `calendar.js`, not yet ported into a screen)
- Export/backup (`ExportData` module, read from `badges.js`, not yet
  wired to a UI)
- Subscription tiers exist in the ported `state.js` data model but
  have no enforcement/paywall UI yet
