/* ═══════════════════════════════════════
   UPG — GUEST SESSION (anonymous accounts only)
   Scope corrected: this module is now ONLY for people who don't want
   to give an email. They pick a nickname and set 2 PINs as their ONLY
   credential (no email/password exists for them to use instead).
   Email/password users are handled entirely by email-auth.js and have
   NO PINs — do not add email-related code back into this file.

   Each guest gets their own named Firebase App instance running
   signInAnonymously, kept alive so multiple guests can coexist on one
   device with instant PIN-based switching — this is the one case
   where multiple simultaneous Firebase sessions in one tab are
   actually needed (email users never need this, since only one email
   session is ever active at a time).

   This file contains NO Firebase SDK calls directly. It takes an
   `adapter` object (see bottom of file) so the logic can be fully
   unit-tested without a live Firebase project.
═══════════════════════════════════════ */
'use strict';

const GuestSessionFactory = (() => {

  // djb2 hash, kept private to this module so PIN hashing has exactly
  // one implementation and one place raw PINs ever touch memory.
  const _hashPin = pin => {
    let h = 5381;
    for (let i = 0; i < pin.length; i++) h = ((h << 5) + h) + pin.charCodeAt(i);
    return String(Math.abs(h >>> 0));
  };

  /**
   * @param {object} deps
   * @param {object} deps.adapter - Firebase bindings (see bottom of file)
   * @param {object} deps.store   - { get(key), set(key, val) } — local persistence
   * @param {object} deps.config  - Firebase project config object
   */
  function createGuestSession({ adapter, store, config }) {
    const SLOTS_KEY = 'guestSlots';

    const _loadSlots = () => store.get(SLOTS_KEY) || [];
    const _saveSlots = (slots) => store.set(SLOTS_KEY, slots);

    // Live (in-memory only) map of uid -> { app, auth } — never persisted,
    // rebuilt each boot via restoreAll().
    const _live = new Map();
    let _activeUid = null;

    // ── PIN COLLISION CHECK ──
    // Used so two guests on the same device can never share a PIN.
    // Never exposes hashes externally.
    const isPinTaken = (pin, excludeUid = null) => {
      const hash = _hashPin(pin);
      return _loadSlots().some(s => s.uid !== excludeUid && s.pinHashes.includes(hash));
    };

    const _validatePins = (pins) => {
      if (pins.length !== 2 || pins[0] === pins[1]) {
        return 'Exactly 2 different PINs are required';
      }
      for (const p of pins) {
        if (!/^\d{5}$/.test(p)) return 'Each PIN must be exactly 5 digits';
      }
      if (isPinTaken(pins[0])) return 'PIN 1 is already used by another guest on this device';
      if (isPinTaken(pins[1])) return 'PIN 2 is already used by another guest on this device';
      return null;
    };

    // ── ADD A NEW GUEST TO THIS DEVICE ──
    // credentials: { nickname, pins:[p1,p2] }
    const addGuest = async (credentials) => {
      const nickname = credentials?.nickname?.trim() || '';
      if (!nickname) return { ok: false, error: 'Nickname is required' };

      const pins = credentials?.pins || [];
      const pinError = _validatePins(pins);
      if (pinError) return { ok: false, error: pinError };

      const appName = 'lp_guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

      let app, auth, authUser;
      try {
        app  = await adapter.initializeApp(config, appName);
        auth = await adapter.getAuth(app);
        authUser = await adapter.signInAnonymously(auth);
      } catch (e) {
        return { ok: false, error: e?.message || 'Could not create guest account' };
      }

      if (!authUser?.uid) return { ok: false, error: 'Guest sign-in did not return a valid account' };

      const slots = _loadSlots();
      const slot = {
        uid: authUser.uid, appName,
        nickname,
        pinHashes: pins.map(_hashPin),
        addedAt: new Date().toISOString(),
      };
      slots.push(slot);
      _saveSlots(slots);
      _live.set(authUser.uid, { app, auth });

      return { ok: true, uid: authUser.uid, slot };
    };

    // ── RESTORE ALL GUEST SLOTS ON BOOT ──
    // Re-initializes a named app+auth per slot and relies on Firebase's
    // own persisted session (each named app has independent persistence).
    const restoreAll = async () => {
      const slots = _loadSlots();
      const results = [];
      for (const slot of slots) {
        try {
          const app  = await adapter.initializeApp(config, slot.appName);
          const auth = await adapter.getAuth(app);
          const current = await adapter.getCurrentUser(auth);
          if (current?.uid === slot.uid) {
            _live.set(slot.uid, { app, auth });
            results.push({ uid: slot.uid, nickname: slot.nickname, restored: true });
          } else {
            results.push({ uid: slot.uid, nickname: slot.nickname, restored: false });
          }
        } catch (e) {
          results.push({ uid: slot.uid, nickname: slot.nickname, restored: false, error: e?.message });
        }
      }
      return results;
    };

    // ── LIST CARDS FOR THE SWITCHER SCREEN ──
    const listGuests = () => _loadSlots().map(s => ({
      uid: s.uid, nickname: s.nickname, addedAt: s.addedAt,
    }));

    // ── CHANGE AN EXISTING GUEST'S PINS ──
    const updatePins = (uid, pins) => {
      const pinErrorFormat = (() => {
        if (pins.length !== 2 || pins[0] === pins[1]) return 'Exactly 2 different PINs are required';
        for (const p of pins) if (!/^\d{5}$/.test(p)) return 'Each PIN must be exactly 5 digits';
        return null;
      })();
      if (pinErrorFormat) return { ok: false, error: pinErrorFormat };

      const slots = _loadSlots();
      const slot = slots.find(s => s.uid === uid);
      if (!slot) return { ok: false, error: 'Unknown guest on this device' };
      if (isPinTaken(pins[0], uid)) return { ok: false, error: 'PIN 1 is already used by another guest on this device' };
      if (isPinTaken(pins[1], uid)) return { ok: false, error: 'PIN 2 is already used by another guest on this device' };

      slot.pinHashes = pins.map(_hashPin);
      _saveSlots(slots);
      return { ok: true };
    };

    // ── PIN UNLOCK ──
    // Verifies PIN locally against the stored hash, then makes that
    // already-live session the active one.
    const switchTo = (uid, pin) => {
      const slots = _loadSlots();
      const slot = slots.find(s => s.uid === uid);
      if (!slot) return { ok: false, error: 'Unknown guest on this device' };

      if (!slot.pinHashes.includes(_hashPin(pin))) {
        return { ok: false, error: 'Incorrect PIN' };
      }
      if (!_live.has(uid)) {
        return { ok: false, error: 'Session expired — this guest profile needs to be re-created', needsReauth: true };
      }
      _activeUid = uid;
      return { ok: true, uid, nickname: slot.nickname };
    };

    const getActiveUid   = () => _activeUid;
    const getActiveApp   = () => _activeUid ? (_live.get(_activeUid)?.app  || null) : null;
    const getActiveAuth  = () => _activeUid ? (_live.get(_activeUid)?.auth || null) : null;

    // ── REMOVE A GUEST FROM THIS DEVICE ──
    const removeGuest = async (uid) => {
      const live = _live.get(uid);
      if (live) {
        try { await adapter.signOut(live.auth); } catch (e) { /* best-effort */ }
        _live.delete(uid);
      }
      const slots = _loadSlots().filter(s => s.uid !== uid);
      _saveSlots(slots);
      if (_activeUid === uid) _activeUid = null;
      return { ok: true };
    };

    const logoutActive = () => { _activeUid = null; };

    return {
      addGuest, restoreAll, listGuests, switchTo, updatePins, isPinTaken,
      getActiveUid, getActiveApp, getActiveAuth, removeGuest, logoutActive,
    };
  }

  return { createGuestSession };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GuestSessionFactory;
}

/* ═══════════════════════════════════════
   ADAPTER SHAPE (implemented for real in firebase-init.js):

   initializeApp(config, name)   -> Promise<FirebaseApp>
   getAuth(app)                  -> Promise<Auth>
   getCurrentUser(auth)          -> Promise<User|null>
   signInAnonymously(auth)       -> Promise<{uid}>
   signOut(auth)                 -> Promise<void>
═══════════════════════════════════════ */

export default GuestSessionFactory;
