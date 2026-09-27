import { useState, useCallback, useRef, useEffect } from 'react';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import EmailAuthFactory from '../core/email-auth.js';
import GuestSessionFactory from '../core/guest-session.js';
import State from '../core/state.js';

/* ═══════════════════════════════════════
   Email/password still goes through the original EmailAuthFactory +
   web adapter — that path never had the WebView problem, so it's
   untouched. Google and Phone are rebuilt on @capacitor-firebase/
   authentication, which calls Android's REAL native Google Sign-In
   and native phone-auth SDKs — no popup, no WebView, no reCAPTCHA.
   This is the actual fix for the bug your users hit, not a second
   layer wrapped around the thing that was broken.

   Guest/PIN is unchanged (core/guest-session.js) — that path never
   had this problem either.
═══════════════════════════════════════ */
export default function useAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [phoneVerificationId, setPhoneVerificationId] = useState(null);

  const emailAuthRef = useRef(null);
  const getEmailAuth = () => (emailAuthRef.current ??= EmailAuthFactory.createEmailAuth({ adapter: window.emailAdapter }));

  const _afterSignIn = (uid, name) => {
    State.loadUser(uid);
    setUser({ uid, name });
  };

  // ── Native phone-auth event listeners (set up once) ──
  useEffect(() => {
    const sentSub = FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
      setPhoneVerificationId(event.verificationId);
      setStatus('idle');
    });
    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      setStatus('error');
      setError(event.message || 'Phone verification failed');
    });
    return () => { sentSub.then(s => s.remove()); failedSub.then(s => s.remove()); };
  }, []);

  const signUpEmail = useCallback(async (name, email, password) => {
    setStatus('loading'); setError(null);
    const res = await getEmailAuth().signUp({ name, email, password });
    if (!res.ok) { setStatus('error'); setError(res.error); return res; }
    _afterSignIn(res.uid, res.name);
    setStatus('idle');
    return res;
  }, []);

  const signInEmail = useCallback(async (email, password) => {
    setStatus('loading'); setError(null);
    const res = await getEmailAuth().signIn({ email, password });
    if (!res.ok) { setStatus('error'); setError(res.error); return res; }
    _afterSignIn(res.uid, res.name);
    setStatus('idle');
    return res;
  }, []);

  // ── REAL native Google Sign-In — opens Android's actual account
  // picker, not a WebView popup. This resolves directly; no redirect
  // dance, no "stuck for hours" failure mode. ──
  const signInWithGoogle = useCallback(async () => {
    setStatus('loading'); setError(null);
    try {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const u = result.user;
      if (!u) { setStatus('error'); setError('Google sign-in was cancelled'); return { ok: false }; }
      const name = u.displayName?.trim() || (u.email ? u.email.split('@')[0] : 'User');
      _afterSignIn(u.uid, name);
      setStatus('idle');
      return { ok: true, uid: u.uid, name };
    } catch (e) {
      setStatus('error');
      setError(e?.message || 'Google sign-in failed');
      return { ok: false, error: e?.message };
    }
  }, []);

  // ── REAL native phone auth — uses Android's Play Integrity / SMS
  // auto-retrieval instead of a browser reCAPTCHA widget. Two steps:
  // start (fires the phoneCodeSent listener above), then confirm.
  const startPhoneSignIn = useCallback(async (phoneNumber) => {
    if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber || '')) {
      return { ok: false, error: 'Use international format, e.g. +2348012345678' };
    }
    setStatus('loading'); setError(null);
    try {
      await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber });
      // Resolution happens via the phoneCodeSent listener (sets
      // phoneVerificationId + status back to idle) or
      // phoneVerificationFailed (sets error) — both wired above.
      return { ok: true };
    } catch (e) {
      setStatus('error');
      setError(e?.message || 'Could not send verification code');
      return { ok: false, error: e?.message };
    }
  }, []);

  const confirmPhoneCode = useCallback(async (code) => {
    if (!phoneVerificationId) return { ok: false, error: 'Request a code first' };
    setStatus('loading'); setError(null);
    try {
      const result = await FirebaseAuthentication.confirmVerificationCode({ verificationId: phoneVerificationId, verificationCode: code });
      const u = result.user;
      const name = u?.displayName?.trim() || 'User';
      _afterSignIn(u.uid, name);
      setStatus('idle');
      return { ok: true, uid: u.uid, name };
    } catch (e) {
      setStatus('error');
      setError(e?.code === 'auth/invalid-verification-code' ? 'Wrong code — try again' : (e?.message || 'Verification failed'));
      return { ok: false };
    }
  }, [phoneVerificationId]);

  const guestAuthRef = useRef(null);
  const getGuestAuth = () => (guestAuthRef.current ??= GuestSessionFactory.createGuestSession({ adapter: window.guestAdapter }));

  const createGuest = useCallback(async (nickname, pins) => {
    setStatus('loading'); setError(null);
    const res = await getGuestAuth().addGuest({ nickname, pins });
    if (!res.ok) { setStatus('error'); setError(res.error); return res; }
    _afterSignIn(res.uid, nickname);
    setStatus('idle');
    return res;
  }, []);

  const signOut = useCallback(async () => {
    await FirebaseAuthentication.signOut().catch(() => {});
    await getEmailAuth().logout?.().catch(() => {});
    setUser(null);
  }, []);

  return {
    user, status, error,
    signUpEmail, signInEmail, signInWithGoogle,
    startPhoneSignIn, confirmPhoneCode, createGuest, signOut,
  };
}
