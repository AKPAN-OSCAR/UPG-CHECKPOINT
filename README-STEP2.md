# UPG Auth + Data Sync — Corrected Architecture

## What changed from the previous (wrong) build
The earlier version gave every user — email or guest — 2 local PINs
for device switching, with multiple simultaneous named Firebase app
instances even for email accounts. That was wrong. This build replaces
it with two genuinely separate paths:

## EMAIL / PASSWORD
- Real Firebase account. Sign in with email + password **only** — no
  PINs anywhere in this path.
- Uses Firebase's **default app instance** (not a named sub-instance),
  since only one email session is ever active on a device at a time.
- **Stays logged in automatically** until explicit logout — like
  Gmail. `EmailAuth.checkPersistedSession()` runs at boot; if found,
  the switcher is skipped entirely and the app launches straight in.
- Multiple email accounts on one shared device work by **logging out,
  then logging in as someone else** — never simultaneously.
- Module: `js/core/email-auth.js` (13 unit tests, `test/email-auth.test.js`)

## GUEST / ANONYMOUS
- No email collected. A nickname (reusing the name from step 1 of the
  wizard) + 2 PINs are the **only** credential, since there's nothing
  else to authenticate with.
- Each guest gets their own **named Firebase app instance** (anonymous
  auth), kept alive so multiple guests can coexist on one device with
  instant PIN-based switching via the switcher screen.
- Module: `js/core/guest-session.js` (15 unit tests, `test/guest-session.test.js`)

## DATA SYNC (Firestore) — now actually built, not deferred
- `js/core/data-sync.js` — thin Firestore I/O layer (pull everything
  synced for a uid; push one key). No merge policy here; see
  README-SYNC.md for the actual policy (seed-if-locally-empty) and its
  known limitation (not real bidirectional sync).
- `js/core/storage.js` — `Storage.uSet()` now fires a registered sync
  hook automatically, so every per-user key (present and future) syncs
  without ever being hand-enumerated. `Storage.uSetLocal()` exists for
  seeding from a pull without re-triggering the hook.
- Applies identically to **both** email and guest users — guest data
  syncs too, standalone under the guest's own anonymous uid (it just
  can't follow to a different device without linking a real credential
  later, a Firebase platform limitation, not a gap in this layer).
- Module: 7 unit tests (`test/data-sync.test.js`) + 6 more for the
  Storage sync-hook wiring (`test/storage-sync.test.js`).

## The switcher, concretely
Only shown when there's **no active email session**. Shows:
- Guest cards (PIN-protected) — only guests ever appear here
- "NEW USER" — the 6-step wizard, branching to EMAIL or GUEST at step 6
- "SIGN IN" — plain email + password, for an existing email account on
  this or any device — no PIN, no wizard, just the two fields

Email users **never** appear as a switcher card — signing in directly
(or staying persisted) is how they access the app.

## A real bug this rebuild caught, worth remembering
`window.EmailAuth = EmailAuth.createEmailAuth(...)` — reusing the same
name for the classic-script factory (`const EmailAuth = ...` in
email-auth.js) and the instance assigned via `window.EmailAuth = ...`
in firebase-init.js — silently shadowed the instance for every OTHER
classic script's bare identifier lookups (`auth.js` kept resolving
`EmailAuth` to the ORIGINAL factory object, not the instance), because
classic top-level `const` bindings take precedence over Object
Environment Record properties of the same name. Fixed by renaming the
internal factories (`EmailAuthFactory`, `GuestSessionFactory`,
`DataSyncFactory`) so the public instance name is never shadowed —
matching the pattern the original codebase already used correctly
(`SessionManager` factory → `Session` instance). Caught by the E2E
test throwing a real `pageerror`, not by static analysis.

## Full verification, this build
- 41 unit tests across 4 files (email-auth, guest-session, data-sync,
  storage-sync), all passing
- A single real-browser E2E run (`e2e/run.js`) covering BOTH paths in
  one continuous flow: fresh load → email signup with zero PIN fields
  → real data write → reload stays logged in → logout → sign-in on a
  simulated new device restores both identity AND previous data →
  wrong password rejected → guest profile created → guest correctly
  invisible as an email-style switcher card → guest PIN login (wrong
  rejected, correct accepted) → guest data syncs too → second guest
  with colliding PIN rejected → both guests coexist and switch
  correctly — zero console errors throughout, confirmed stable across
  3 consecutive runs.

## What's still NOT built (explicitly, not silently)
- Google / Phone sign-in — still stubbed behind `COMING_SOON_PROVIDERS`
  equivalents, waiting on the Firebase console providers being enabled
- Real bidirectional data sync / conflict resolution — see
  README-SYNC.md for exactly what policy IS implemented instead
- "Upgrade a guest to a real email account" linking flow — the only
  way to make a guest's data follow them to a new device
