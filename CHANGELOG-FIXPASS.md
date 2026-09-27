# UPG v10 — Fix Pass (July 2026)

This pass closed the 5 gaps identified before the Capacitor/APK step.
All 46 existing unit tests still pass, plus 5 new ones for the sync
timestamp logic (test/storage-sync.test.js).

## 1. AI Coach backend — now exists
- Added `functions/index.js` + `functions/package.json`: a real Cloud
  Function (`aiChat`) that verifies the caller's Firebase ID token,
  proxies to Anthropic with the API key held server-side only, and
  streams the SSE response straight through.
- Added `js/config.js` for the deployed endpoint URL (was hardcoded to
  a localhost placeholder before).
- `js/features/ai-coach.js` now sends `Authorization: Bearer <token>`
  and fails softly into the existing local-data fallback if the
  function isn't deployed/configured yet.
- **You still need to**: `cd functions && npm install`, set the
  `ANTHROPIC_API_KEY` secret, `firebase deploy --only functions`, then
  paste the printed URL into `js/config.js`. Requires the Blaze plan
  (outbound network calls aren't allowed on the free Spark plan).

## 2. Reliable alarms — native path added
- `js/features/widget.js` now schedules real OS-level notifications
  via Capacitor's Local Notifications plugin when running as an
  installed app, so alarms fire even when the app is closed.
- Completely inert on the current web build — falls back to the
  existing browser-based alarm until the Capacitor step adds the
  plugin. Nothing to do here yet; this activates automatically once
  `@capacitor/local-notifications` is installed and synced.

## 3. Google + Phone sign-in — wired for real
- Both tabs in the setup screen are live (were "Coming soon" stubs).
- Google: popup sign-in with automatic redirect fallback for
  browsers/webviews that block popups.
- Phone: real Firebase Phone Auth — send code → confirm code, with the
  required invisible reCAPTCHA container added to `index.html`.
- Fixed the PIN manager, which previously assumed only 'email' and
  'guest' existed, to correctly treat Google/Phone accounts as
  PIN-less too.
- **Known limitation for the Capacitor step**: Google sign-in via
  popup/redirect is blocked inside Android WebViews. Once wrapped,
  swap this for `@capacitor-firebase/authentication`'s native Google
  Sign-In — flagged in the code comments where this applies.
- **You still need to**: enable Google and Phone as sign-in providers
  in Firebase Console → Authentication → Sign-in method (both are
  currently only wired in code, not turned on server-side).

## 4. Sync — real per-key timestamp merge
- Replaced "only fill in empty keys" with genuine last-write-wins
  comparison per key (`Storage.getTimestamp`, `__ts` on synced
  Firestore docs). See the rewritten `README-SYNC.md` for exactly
  what this does and doesn't solve.
- 5 new unit tests cover the timestamp behavior.

## 5. Security rules — reviewed, simplified, made deployable
- Simplified `firestore.rules` to one recursive rule instead of three
  overlapping ones (same effective permissions, easier to audit).
- Manually traced every real read/write path this app performs against
  the rules (documented in the rules file's own comments) — not run
  through the live Rules Playground (no network access here), worth a
  2-minute manual check there before a public launch.
- `database.rules.json` reviewed — correct, but the Realtime Database
  isn't actually used by any client code right now, so these rules are
  currently inert. Harmless to keep for future use.
- **Added `firebase.json` and `.firebaserc`** — there was no deploy
  configuration at all before this, which means none of the deploy
  commands above (functions, rules) would have worked without it.

## Next step
Ready for the Capacitor wrap. The two things worth doing during that
step specifically because of this pass: swap Google sign-in to the
native plugin, and confirm `@capacitor/local-notifications` connects
to the scheduling code already written in `widget.js`.
