/* ═══════════════════════════════════════
   UPG — DATA SYNC (Firestore write-through / pull-down)
   Applies uniformly to BOTH email and guest users — every uid gets
   its data synced to /users/{uid}/data/{key} in Firestore, matching
   firestore.rules exactly. Guest data syncs too (explicitly required):
   it just can't be recovered on a different device without linking a
   real credential later, since a new anonymous sign-in always gets a
   new uid — that's a Firebase limitation, not a gap in this module.

   Design choice: keys are NOT hand-enumerated anywhere. Firestore's
   "list all documents in a collection" is used to pull down whatever
   has been synced, so any current OR future per-user Storage key
   (tables, goals, badges, whatever gets added later) is automatically
   covered without ever touching this file again.

   Merge/conflict policy is intentionally NOT decided here — this is a
   thin I/O layer. The caller (app boot logic) decides what to do with
   pulled data (e.g. "only fill in keys local storage doesn't already
   have" — see README-SYNC.md for the actual policy used and why).

   This file contains NO Firebase SDK calls directly — it takes a
   `firestoreAdapter` object (see bottom of file) so the logic is fully
   unit-testable without a live Firebase project.
═══════════════════════════════════════ */
'use strict';

const DataSyncFactory = (() => {

  /**
   * @param {object} deps
   * @param {object} deps.firestoreAdapter - Firestore bindings (see bottom of file)
   */
  function createDataSync({ firestoreAdapter }) {

    // ── PULL EVERYTHING SYNCED FOR THIS USER ──
    // Returns { key: value, ... } for every document found under
    // /users/{uid}/data/ — empty object if nothing has ever synced
    // (e.g. a brand new account) or on any failure (fails soft, never
    // blocks login).
    const pullAll = async (app, uid) => {
      const result = {};
      try {
        const db = await firestoreAdapter.getFirestore(app);
        const collRef = firestoreAdapter.collectionRef(db, uid);
        const docs = await firestoreAdapter.getDocs(collRef);
        for (const d of docs) {
          result[d.id] = d.data;
        }
      } catch (e) {
        console.warn('[DataSync] pullAll failed — continuing with local data only:', e?.message);
      }
      return result;
    };

    // ── PUSH ONE KEY THROUGH TO FIRESTORE ──
    // Fire-and-forget from the caller's perspective is fine — this
    // resolves ok:false on failure rather than throwing, so a flaky
    // connection never breaks the local-first experience. `ts` (ms
    // epoch, from Storage.getTimestamp) rides along with every write so
    // a later pull can tell which side — this device or another one —
    // last touched the key, instead of only ever trusting "local is
    // empty" (see README-SYNC.md for the full policy this replaces).
    const push = async (app, uid, key, value, ts) => {
      try {
        const db = await firestoreAdapter.getFirestore(app);
        const ref = firestoreAdapter.docRef(db, uid, key);
        await firestoreAdapter.setDoc(ref, value, ts || Date.now());
        return { ok: true };
      } catch (e) {
        console.warn('[DataSync] push failed for key', key, '—', e?.message);
        return { ok: false, error: e?.message };
      }
    };

    return { pullAll, push };
  }

  return { createDataSync };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataSyncFactory;
}

/* ═══════════════════════════════════════
   ADAPTER SHAPE (implemented for real in firebase-init.js):

   getFirestore(app)              -> Promise<Firestore>
   collectionRef(db, uid)         -> CollectionReference   (/users/{uid}/data)
   docRef(db, uid, key)           -> DocumentReference     (/users/{uid}/data/{key})
   getDocs(collectionRef)         -> Promise<[{id, data}]>   (data includes __ts)
   setDoc(docRef, value, ts)      -> Promise<void>
═══════════════════════════════════════ */

export default DataSyncFactory;
