/* @vite-ignore */
/* ═══════════════════════════════════════
   UPG — FIREBASE INIT
   Loads the real Firebase modular SDK from CDN and wires it into
   THREE separate modules, matching the corrected architecture:
     - EmailAuth    → default Firebase app instance, no PINs
     - GuestSession → named Firebase app instances, PIN-protected
     - DataSync     → Firestore, shared by both user types

   Runs as an ES module — `EmailAuth`, `GuestSession`, `DataSync`, and
   `Storage` are read as plain global identifiers because classic
   <script> top-level consts and module top-level code share the same
   realm's global environment (same pattern this codebase already
   relies on for Storage/State/Toast/etc). Those scripts must load
   BEFORE this module in index.html.

   ✅ FIREBASE_CONFIG below is the real project (ur-personal-plan-guide).
   Make sure Authentication → Sign-in method → Email/Password and
   Anonymous are both enabled in the Firebase Console, or real
   sign-up/sign-in calls will fail with auth/operation-not-allowed.
   Also make sure Firestore Database has been created (Console →
   Firestore Database → Create database) — Auth alone doesn't create it.
═══════════════════════════════════════ */

import {
  initializeApp,
  getApp,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
  signOut,
  getIdToken,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

// ── Real project config (ur-personal-plan-guide) ──
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBS66iLXQ5FdSllKJqbWA7ViR80P2VfmwA',
  authDomain:        'ur-personal-plan-guide.firebaseapp.com',
  databaseURL:       'https://ur-personal-plan-guide-default-rtdb.firebaseio.com',
  projectId:         'ur-personal-plan-guide',
  storageBucket:     'ur-personal-plan-guide.firebasestorage.app',
  messagingSenderId: '529744661379',
  appId:             '1:529744661379:web:2cad2416cf373479c504b6',
};

const _authReady = (auth) => new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    resolve(user || null);
  });
});

// ── DEFAULT APP (email users only — exactly one at a time) ──
const _defaultApp = initializeApp(FIREBASE_CONFIG);

const emailAdapter = {
  async getDefaultAuth() {
    return getAuth(_defaultApp);
  },
  async getCurrentUser(auth) {
    return _authReady(auth);
  },
  async createUserWithEmailAndPassword(auth, email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user; // the real Firebase User object, not a plain copy
  },
  async signInWithEmailAndPassword(auth, email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async updateProfile(user, profile) {
    return updateProfile(user, profile); // `user` is a real Firebase User — pass through directly
  },
  async signOut(auth) {
    return signOut(auth);
  },
  // ── GOOGLE SIGN-IN ──
  // Popup works fine on desktop web and in a real mobile browser tab.
  // Inside a Capacitor WebView on Android, Google actively blocks
  // sign-in popups/redirects from an embedded WebView ("disallowed
  // user agent") — this path is correct for the web build, but once
  // wrapped in Capacitor you'll want the native Google Sign-In flow
  // via the @capacitor-firebase/authentication plugin instead. That
  // plugin swap is a follow-up task for the Capacitor step, not
  // something fixable in browser code alone.
  async signInWithGoogle(auth) {
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      return cred.user;
    } catch (e) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return null; // page will reload; getRedirectResult below picks it up
      }
      throw e;
    }
  },
  async getGoogleRedirectResult(auth) {
    const res = await getRedirectResult(auth).catch(() => null);
    return res?.user || null;
  },
  // ── PHONE SIGN-IN ──
  // Requires an invisible reCAPTCHA container (#recaptcha-container,
  // already added in index.html) and the Phone provider enabled in
  // Firebase Console → Authentication → Sign-in method. Real SMS
  // messages cost a small amount per verification once past Firebase's
  // free monthly quota — worth knowing before turning this on for lots
  // of users.
  async startPhoneSignIn(auth, phoneNumber) {
    if (!window.__recaptchaVerifier) {
      window.__recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, window.__recaptchaVerifier);
    return confirmationResult; // caller holds this, then calls .confirm(code)
  },
};

// Fetch a fresh ID token for whichever Firebase app is currently active
// (undefined = default/email app, or a named guest app instance) — used
// by anything that calls a Cloud Function needing to prove who's asking
// (currently just the AI Coach proxy).
window.__getIdToken = async (app) => {
  try {
    const auth = getAuth(app);
    if (!auth.currentUser) return null;
    return await getIdToken(auth.currentUser);
  } catch (e) {
    console.warn('[Firebase] getIdToken failed:', e?.message);
    return null;
  }
};

// ── NAMED APPS (guests only — multiple may coexist) ──
const guestAdapter = {
  async initializeApp(config, name) {
    try {
      return getApp(name); // already initialized this session
    } catch (e) {
      return initializeApp(config, name);
    }
  },
  async getAuth(app) {
    return getAuth(app);
  },
  async getCurrentUser(auth) {
    return _authReady(auth);
  },
  async signInAnonymously(auth) {
    const cred = await signInAnonymously(auth);
    return { uid: cred.user.uid };
  },
  async signOut(auth) {
    return signOut(auth);
  },
};

// ── FIRESTORE (shared by both — scoped by whichever app's auth made the call) ──
const firestoreAdapter = {
  async getFirestore(app) {
    return getFirestore(app);
  },
  collectionRef(db, uid) {
    return collection(db, 'users', uid, 'data');
  },
  docRef(db, uid, key) {
    return doc(db, 'users', uid, 'data', key);
  },
  async getDocs(collRef) {
    const snap = await getDocs(collRef);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, data: d.data() }));
    return out;
  },
  async setDoc(ref, value, ts) {
    // Firestore documents must be objects — wrap non-object values
    // (arrays, primitives) so any Storage value can be synced uniformly.
    // __ts rides alongside so a later pull on any device can tell
    // which copy of this key is newer.
    const payload = (value && typeof value === 'object' && !Array.isArray(value))
      ? { ...value, __ts: ts || Date.now() }
      : { __value: value, __ts: ts || Date.now() };
    return setDoc(ref, payload, { merge: false });
  },
};

// Make adapters available as window globals for React components
window.emailAdapter = emailAdapter;
window.guestAdapter = guestAdapter;
window.firestoreAdapter = firestoreAdapter;

// EmailAuth, GuestSession, DataSync, Storage come from their respective
// classic <script> tags, all loaded before this module in index.html.
window.EmailAuth    = EmailAuthFactory.createEmailAuth({ adapter: emailAdapter });
window.GuestSession = GuestSessionFactory.createGuestSession({ adapter: guestAdapter, store: Storage, config: FIREBASE_CONFIG });
window.DataSync     = DataSyncFactory.createDataSync({ firestoreAdapter });

// Firestore stores non-object values wrapped as { __value, __ts }, and
// every object value also carries a sibling __ts field — reads need to
// strip both conventions back out. Shared by auth.js's pull/merge logic
// so this convention lives in exactly one place.
window.__unwrapSyncValue = (v) => {
  if (!v || typeof v !== 'object') return v;
  if ('__value' in v) return v.__value; // primitive/array, ts stripped separately
  if ('__ts' in v) { const { __ts, ...rest } = v; return rest; } // object value
  return v;
};
window.__syncValueTs = (v) => (v && typeof v === 'object' && typeof v.__ts === 'number') ? v.__ts : 0;

// app.js's DOMContentLoaded handler awaits this so it never races the
// module load (module scripts are deferred and DOMContentLoaded already
// waits for them — this event is a belt-and-suspenders signal for any
// code that might check for these globals before that point).
window.dispatchEvent(new CustomEvent('upg:firebase-ready'));
