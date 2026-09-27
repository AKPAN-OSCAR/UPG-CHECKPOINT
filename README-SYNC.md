# UPG Data Sync — Merge Policy (v2 — timestamp-based)

## What changed from v1
The original policy only pulled a key down from Firestore if local
storage for that key was completely empty — great for "log in on a
brand new device," useless for "an existing device should ever receive
someone else's newer edit." v2 replaces that with a real per-key
comparison.

## What's implemented now
Every write through `Storage.uSet(uid, key, val)` now also records a
local last-modified timestamp (`Storage.getTimestamp(uid, key)`) and
pushes it to Firestore alongside the value (`data-sync.js`'s `push()`
takes a `ts` argument; `firebase-init.js`'s real Firestore adapter
stores it as a `__ts` field on the document).

On login/switch (`auth.js`'s `_pullAndSeed`), for every key returned
from `DataSync.pullAll`:

1. Compare the remote document's `__ts` against this device's locally
   stored timestamp for that same key (`Storage.getTimestamp`).
2. If local has no value yet, OR the remote timestamp is strictly
   newer than the local one → the remote value wins, and it's written
   locally via `Storage.uSetLocal(uid, key, val, remoteTs)` (recording
   the remote timestamp, not "now," so future comparisons stay correct).
3. Otherwise, local is newer or equal → local wins, nothing changes,
   and the existing sync hook will push it back up on the next write.

This is **last-write-wins per key**, evaluated at login/switch time
(not live). It correctly handles:
- New device, first login → every key pulled (local was empty).
- Same device, logged out for a while, another device pushed updates
  in the meantime → those newer keys are now pulled in on next login,
  which v1 could never do.
- One device offline for days, comes back → picks up whatever's newer,
  key by key.

## What this still does NOT do (stated plainly)
- **No live sync.** Two devices open and being edited *at the same
  time* won't see each other's changes until one of them logs
  out/in or the app reloads and re-runs `_pullAndSeed`. Real-time
  sync would need `onSnapshot` listeners kept alive for the whole
  session — a bigger, separate piece of work.
- **Same key edited on two offline devices before either syncs**:
  whichever device's local timestamp is newer wins entirely — there's
  no field-level merge inside a key (e.g. if `tables` is one big
  array, the entire array is replaced, not merged item-by-item). For
  how this app is actually used (one person, mostly one device at a
  time) this is a rare edge case, not the common path v1 got wrong.
- **Clock skew**: timestamps are `Date.now()` on each device. A device
  with a badly wrong system clock could wrongly "win" a comparison. Not
  handled — would need server timestamps (Firestore's
  `serverTimestamp()`) to fully close, which is a reasonable next step
  if this ever becomes a real problem in practice.

## Where this lives in code
- `js/core/storage.js` — records/reads the per-key timestamp
  (`getTimestamp`), passes it through the sync hook.
- `js/core/data-sync.js` — thin I/O layer, `push()` now forwards a
  `ts` value; still has no merge policy opinion of its own.
- `js/core/firebase-init.js` — the real Firestore adapter, stores/reads
  `__ts` on each synced document.
- `js/features/auth.js`'s `_pullAndSeed` — where the actual per-key
  timestamp comparison and merge decision happens (unchanged
  architecture: the policy lives at the login flow, not the sync
  engine, same as v1).

## Applies identically to guests and to Google/Phone accounts
Every sign-in method (email, Google, phone, guest) authenticates to a
real Firebase Auth uid and goes through the exact same `DataSync` +
timestamp comparison — no special-casing by provider. Guest data still
can't follow a guest to a different device, since anonymous sign-in
always mints a new uid — that's a Firebase platform limitation, not
something this sync layer can fix. A real fix would be an "upgrade
this guest to a real account" linking flow (`linkWithCredential`) —
still not in scope for this build.
