/* ═══════════════════════════════════════
   UPG — EMAIL AUTH (default Firebase app instance)
   Real accounts. Sign in with email+password only — NO PINs for this
   group. Uses Firebase's DEFAULT app instance (not a named sub-instance
   like guests get), because only ONE email session is ever active on
   a device at a time. Firebase's own persisted session means once
   logged in, staying logged in is automatic — no re-entering a
   password on every app open, exactly like Gmail. Explicit logout is
   the only thing that ends the session.

   Multiple email accounts CAN be used on one shared device, but by
   logging out then logging in as someone else — never simultaneously.

   This file contains NO Firebase SDK calls directly — it takes an
   `adapter` object (see bottom of file) so the logic is fully
   unit-testable without a live Firebase project.
═══════════════════════════════════════ */
'use strict';

const EmailAuthFactory = (() => {

  /**
   * @param {object} deps
   * @param {object} deps.adapter - Firebase bindings (see bottom of file)
   */
  function createEmailAuth({ adapter }) {
    let _auth = null;         // the default app's Auth instance, lazily created
    let _currentUser = null;  // { uid, email, displayName } | null

    const _ensureAuth = async () => {
      if (!_auth) _auth = await adapter.getDefaultAuth();
      return _auth;
    };

    // ── SIGN UP ──
    // credentials: { name, email, password }
    const signUp = async (credentials) => {
      const name     = credentials?.name?.trim() || '';
      const email    = credentials?.email?.trim() || '';
      const password = credentials?.password || '';

      if (!name)     return { ok: false, error: 'Name is required' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' };
      if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };

      const auth = await _ensureAuth();
      let authUser;
      try {
        authUser = await adapter.createUserWithEmailAndPassword(auth, email, password);
        await adapter.updateProfile(authUser, { displayName: name });
        authUser.displayName = name; // mirror in case adapter doesn't mutate in place
      } catch (e) {
        return { ok: false, error: e?.message || 'Sign-up failed' };
      }

      if (!authUser?.uid) return { ok: false, error: 'Sign-up did not return a valid account' };

      _currentUser = { uid: authUser.uid, email, displayName: name };
      return { ok: true, uid: authUser.uid, name, email };
    };

    // ── SIGN IN ──
    // credentials: { email, password }
    const signIn = async (credentials) => {
      const email    = credentials?.email?.trim() || '';
      const password = credentials?.password || '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' };
      if (!password) return { ok: false, error: 'Enter your password' };

      const auth = await _ensureAuth();
      let authUser;
      try {
        authUser = await adapter.signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        return { ok: false, error: e?.message || 'Sign-in failed — check your email and password' };
      }

      if (!authUser?.uid) return { ok: false, error: 'Sign-in did not return a valid account' };

      const name = (authUser.displayName && authUser.displayName.trim()) || email.split('@')[0];
      _currentUser = { uid: authUser.uid, email, displayName: name };
      return { ok: true, uid: authUser.uid, name, email };
    };

    // ── CHECK FOR AN ALREADY-PERSISTED SESSION ──
    // Called once at app boot. Resolves to { uid, name, email } if
    // Firebase already has someone signed in on the default app
    // (i.e. they never logged out), or null if not.
    const checkPersistedSession = async () => {
      const auth = await _ensureAuth();
      const user = await adapter.getCurrentUser(auth);
      if (!user?.uid) {
        _currentUser = null;
        return null;
      }
      const name = (user.displayName && user.displayName.trim()) || (user.email ? user.email.split('@')[0] : 'User');
      _currentUser = { uid: user.uid, email: user.email || null, displayName: name };
      return { uid: user.uid, name, email: user.email || null };
    };

    // ── GOOGLE SIGN-IN ──
    // One tap, no name/password needed — the account's Google
    // displayName/email are used directly. Same default app + same
    // uid namespace as email accounts, so DataSync/rules need no
    // changes: a Google user is just another real Firebase Auth uid.
    const signInWithGoogle = async () => {
      if (!adapter.signInWithGoogle) return { ok: false, error: 'Google sign-in not available' };
      const auth = await _ensureAuth();
      try {
        const user = await adapter.signInWithGoogle(auth);
        if (!user) return { ok: false, redirecting: true }; // redirect flow — page is navigating away
        const name = (user.displayName && user.displayName.trim()) || (user.email ? user.email.split('@')[0] : 'User');
        _currentUser = { uid: user.uid, email: user.email || null, displayName: name };
        return { ok: true, uid: user.uid, name, email: user.email || null, isNew: user.metadata?.creationTime === user.metadata?.lastSignInTime };
      } catch (e) {
        if (e?.code === 'auth/popup-closed-by-user') return { ok: false, error: 'Sign-in was cancelled' };
        return { ok: false, error: e?.message || 'Google sign-in failed' };
      }
    };

    // Call once on page load (after a redirect-based Google sign-in
    // navigates back) — no-op if there was no pending redirect.
    const checkGoogleRedirect = async () => {
      if (!adapter.getGoogleRedirectResult) return null;
      const auth = await _ensureAuth();
      const user = await adapter.getGoogleRedirectResult(auth);
      if (!user) return null;
      const name = (user.displayName && user.displayName.trim()) || (user.email ? user.email.split('@')[0] : 'User');
      _currentUser = { uid: user.uid, email: user.email || null, displayName: name };
      return { uid: user.uid, name, email: user.email || null };
    };

    // ── PHONE SIGN-IN (2-step: send code, then confirm) ──
    let _confirmationResult = null;

    const startPhoneSignIn = async (phoneNumber) => {
      if (!adapter.startPhoneSignIn) return { ok: false, error: 'Phone sign-in not available' };
      if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber || '')) {
        return { ok: false, error: 'Enter phone number in international format, e.g. +2348012345678' };
      }
      const auth = await _ensureAuth();
      try {
        _confirmationResult = await adapter.startPhoneSignIn(auth, phoneNumber);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Could not send verification code' };
      }
    };

    const confirmPhoneCode = async (code) => {
      if (!_confirmationResult) return { ok: false, error: 'Request a code first' };
      try {
        const cred = await _confirmationResult.confirm(code);
        const user = cred.user;
        const name = user.displayName?.trim() || 'User';
        _currentUser = { uid: user.uid, email: null, displayName: name, phone: user.phoneNumber };
        _confirmationResult = null;
        return { ok: true, uid: user.uid, name };
      } catch (e) {
        return { ok: false, error: e?.code === 'auth/invalid-verification-code' ? 'Wrong code — try again' : (e?.message || 'Verification failed') };
      }
    };

    const getCurrentUser = () => _currentUser;
    const getAuthInstance = () => _auth;

    // ── LOGOUT ──
    const logout = async () => {
      if (_auth) {
        try { await adapter.signOut(_auth); } catch (e) { /* best-effort */ }
      }
      _currentUser = null;
      return { ok: true };
    };

    return {
      signUp, signIn, checkPersistedSession, getCurrentUser, getAuthInstance, logout,
      signInWithGoogle, checkGoogleRedirect, startPhoneSignIn, confirmPhoneCode,
    };
  }

  return { createEmailAuth };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailAuthFactory;
}

/* ═══════════════════════════════════════
   ADAPTER SHAPE (implemented for real in firebase-init.js):

   getDefaultAuth()                    -> Promise<Auth>   (the SAME instance every call)
   getCurrentUser(auth)                -> Promise<User|null>
   createUserWithEmailAndPassword(auth, email, password) -> Promise<{uid,email,displayName}>
   signInWithEmailAndPassword(auth, email, password)     -> Promise<{uid,email,displayName}>
   updateProfile(user, {displayName})  -> Promise<void>
   signOut(auth)                       -> Promise<void>
═══════════════════════════════════════ */

export default EmailAuthFactory;
