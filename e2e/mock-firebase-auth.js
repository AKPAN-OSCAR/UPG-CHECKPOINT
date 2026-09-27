const PREFIX = '__mockfb_';
function _load(appName) {
  try { return JSON.parse(localStorage.getItem(PREFIX + appName)) || null; } catch (e) { return null; }
}
function _save(appName, user) {
  localStorage.setItem(PREFIX + appName, JSON.stringify(user));
}
let _uidCounter = 1;

const _emails = (() => {
  try { return JSON.parse(localStorage.getItem(PREFIX + '__emails')) || {}; } catch (e) { return {}; }
})();
function _saveEmails() { localStorage.setItem(PREFIX + '__emails', JSON.stringify(_emails)); }

// uid -> displayName, persisted separately so it survives across
// different "devices" (different appName sessions) signing into the
// SAME account — exactly like real Firebase Auth's server-side profile.
const _profiles = (() => {
  try { return JSON.parse(localStorage.getItem(PREFIX + '__profiles')) || {}; } catch (e) { return {}; }
})();
function _saveProfiles() { localStorage.setItem(PREFIX + '__profiles', JSON.stringify(_profiles)); }

export function getAuth(app) { return { appName: app.name }; }

export async function createUserWithEmailAndPassword(auth, email, password) {
  if (_emails[email]) {
    const err = new Error('Firebase: Error (auth/email-already-in-use).');
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  const uid = 'uid_' + (_uidCounter++) + '_' + Date.now();
  _emails[email] = { uid, password }; // mock only — real Firebase never stores plaintext like this
  _saveEmails();
  const user = { uid, email, displayName: null };
  _save(auth.appName, user);
  return { user };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const record = _emails[email];
  if (!record) {
    const err = new Error('Firebase: Error (auth/user-not-found).');
    err.code = 'auth/user-not-found';
    throw err;
  }
  if (record.password !== password) {
    const err = new Error('Firebase: Error (auth/wrong-password).');
    err.code = 'auth/wrong-password';
    throw err;
  }
  const user = { uid: record.uid, email, displayName: _profiles[record.uid]?.displayName || null };
  _save(auth.appName, user);
  return { user };
}

export async function signInAnonymously(auth) {
  const uid = 'anon_' + (_uidCounter++) + '_' + Date.now();
  const user = { uid, displayName: null };
  _save(auth.appName, user);
  return { user };
}

export async function updateProfile(user, profile) {
  if (profile.displayName !== undefined) {
    _profiles[user.uid] = { ..._profiles[user.uid], displayName: profile.displayName };
    _saveProfiles();
    user.displayName = profile.displayName; // mimic real SDK mutating the object in place
  }
}

export function onAuthStateChanged(auth, cb) {
  const user = _load(auth.appName);
  if (user) {
    // Always reflect the latest displayName from the profiles store —
    // mirrors real Firebase Auth, where updateProfile() persists
    // server-side and any subsequent session restore reflects it.
    user.displayName = _profiles[user.uid]?.displayName || user.displayName || null;
  }
  setTimeout(() => cb(user), 0);
  return () => {};
}

export async function signOut(auth) {
  localStorage.removeItem(PREFIX + auth.appName);
}
