# UPG Security Rules

## What these enforce
Both `firestore.rules` and `database.rules.json` implement the exact
same model as the auth system already built:

- **Default-deny everything.** Nothing is readable or writable unless
  explicitly allowed below.
- **Every real end-user gets their own Firebase Auth `uid`** the moment
  they sign up or sign in through the app's UI (email, anonymous, and
  later Google/Phone all produce a real `uid` the same way).
- **A user may only read/write data under their own `/users/{uid}/...`
  path.** Not another user's data, not a shared pool, not even other
  authenticated users' data. This applies uniformly regardless of which
  sign-in method that user used.
- There is no "admin" or "client" bypass in these rules — this app has
  no concept of a privileged operator account. Every reader/writer is
  just another authenticated end-user restricted to their own subtree.

## Why these matter even though data sync isn't built yet
The app doesn't write to Firestore/RTDB yet (still `localStorage`-only
for tables/goals/etc, as documented in `README-STEP2.md`). These rules
exist now so that:
1. The security model is decided and locked in *before* any real data
   sync code gets written on top of it — not retrofitted after the fact.
2. If you deploy these today, your Firebase project is already safe by
   default (deny-all) even before the sync feature exists, rather than
   sitting on default/open rules in the meantime.

## Deploying them

**Firestore** — Console → Firestore Database → Rules tab → paste the
contents of `firestore.rules` → Publish.
Or via CLI: `firebase deploy --only firestore:rules` (requires
`firestore.rules` referenced in your `firebase.json`).

**Realtime Database** — Console → Realtime Database → Rules tab →
paste the contents of `database.rules.json` → Publish.
Or via CLI: `firebase deploy --only database`.

## Honesty check on verification
I validated both files for syntax correctness (valid JSON for the RTDB
rules; balanced braces/parens and structurally correct Firestore rules
syntax) — I do **not** have network access to run the Firebase Rules
emulator/simulator here, so I cannot claim to have executed these
against a live test suite the way I did with the auth code. Before
trusting these in production, use the Firebase Console's built-in
Rules Playground (Firestore/RTDB → Rules tab → "Simulator") to try a
few real reads/writes as different uids and confirm cross-user access
is actually denied. That's a 2-minute manual check I'd genuinely
recommend doing, not a formality.
