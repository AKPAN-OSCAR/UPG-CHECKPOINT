/* ═══════════════════════════════════════
   UPG — STORAGE
   Key scheme: upg_{key}
   Per-user: upg_u_{uid}_{key}
   Renamed from lp10_/lp9_ (UPG) — migrate() below carries over
   any existing installs' data so nobody loses their tables/goals/etc
   just because the app got renamed.
   Added: quota-guard write with fallback warn
   Added: sync hook — uSet() automatically fires a registered callback
     so Firestore write-through can be layered on top without this
     module needing to know anything about Firebase. See data-sync.js
     and the wiring in firebase-init.js for the actual sync logic.
═══════════════════════════════════════ */
const Storage = (() => {
  const P = 'upg_';

  const get = k => {
    try { return JSON.parse(localStorage.getItem(P + k)); }
    catch(e) { return null; }
  };

  const set = (k, v) => {
    try {
      localStorage.setItem(P + k, JSON.stringify(v));
      return true;
    } catch(e) {
      // QuotaExceededError — warn but don't crash
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[UPG] Storage quota exceeded for key:', k);
      } else {
        console.error('[UPG] Storage write failed:', k, e);
      }
      return false;
    }
  };

  const del  = k => { try { localStorage.removeItem(P + k); } catch(e) {} };

  // ── SYNC HOOK ──
  // Registered once at boot (see firebase-init.js) once we know the
  // active user's uid + Firebase app instance. Fires on every uSet()
  // so every per-user key — present and future — automatically syncs,
  // without this module ever importing Firebase.
  let _syncHook = null; // (uid, key, val) => void
  const setSyncHook   = (fn) => { _syncHook = fn; };
  const clearSyncHook = () => { _syncHook = null; };

  // Per-user helpers
  const uKey = (uid, key) => `u_${uid}_${key}`;
  const uGet = (uid, key) => get(uKey(uid, key));

  // Per-key last-modified timestamps, kept separately from the value
  // itself so every existing caller of uGet()/uSet() is unaffected —
  // only the sync layer needs to know when a key last changed.
  const _tsKey = (uid, key) => `ts_u_${uid}_${key}`;
  const getTimestamp = (uid, key) => {
    try { return parseInt(localStorage.getItem(P + _tsKey(uid, key)), 10) || 0; }
    catch (e) { return 0; }
  };
  const _setTimestamp = (uid, key, t) => {
    try { localStorage.setItem(P + _tsKey(uid, key), String(t)); } catch (e) {}
  };

  const uSet = (uid, key, val) => {
    const ok = set(uKey(uid, key), val);
    if (ok) {
      const now = Date.now();
      _setTimestamp(uid, key, now);
      if (_syncHook) {
        try { _syncHook(uid, key, val, now); }
        catch (e) { console.warn('[UPG] sync hook threw for key', key, e); }
      }
    }
    return ok;
  };

  // Used ONLY when seeding local storage from a Firestore pull-down —
  // must NOT re-trigger the sync hook, or we'd immediately push the
  // exact data we just pulled straight back to where it came from.
  // Still records the remote timestamp locally so future syncs can
  // keep comparing correctly.
  const uSetLocal = (uid, key, val, remoteTs) => {
    const ok = set(uKey(uid, key), val);
    if (ok && remoteTs) _setTimestamp(uid, key, remoteTs);
    return ok;
  };

  const uDel = (uid, key) => del(uKey(uid, key));

  // Export all lp10_ keys as JSON string
  const exportAll = () => {
    const data = {};
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(P))
        .forEach(k => {
          try { data[k.slice(P.length)] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
        });
    } catch(e) {}
    return JSON.stringify(data, null, 2);
  };

  // Import from JSON string — merges on top of existing
  const importAll = str => {
    try {
      const d = JSON.parse(str);
      let ok = true;
      Object.entries(d).forEach(([k, v]) => { if (!set(k, v)) ok = false; });
      return ok;
    } catch(e) { return false; }
  };

  // Migrate any lp9_ keys to lp10_ so existing users don't lose data
  const migrate = () => {
    try {
      const LEGACY_PREFIXES = ['lp10_', 'lp9_']; // both pre-rename UPG prefixes
      let migrated = 0;
      LEGACY_PREFIXES.forEach(OLD => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(OLD));
        keys.forEach(k => {
          const newKey = P + k.slice(OLD.length);
          if (!localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, localStorage.getItem(k));
            migrated++;
          }
        });
      });
      if (migrated) console.log('[UPG] Migrated', migrated, 'keys from UPG → UPG');
    } catch(e) {}
  };

  return { get, set, del, uGet, uSet, uSetLocal, uDel, uKey, exportAll, importAll, migrate, setSyncHook, clearSyncHook, getTimestamp };
})();
