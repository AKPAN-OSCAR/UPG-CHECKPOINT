'use strict';
const assert = require('assert');
const EmailAuth = require('../js/core/email-auth.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ── Mock adapter simulating a real Firebase default-app Auth instance ──
function mockAdapter() {
  const users = new Map();  // email -> { uid, password, displayName }
  let currentSession = null; // { uid, email, displayName } | null
  let uidCounter = 1;
  const auth = { _tag: 'default-auth' };

  return {
    async getDefaultAuth() { return auth; },
    async createUserWithEmailAndPassword(a, email, password) {
      if (users.has(email)) {
        const err = new Error('auth/email-already-in-use');
        throw err;
      }
      const uid = 'uid_' + (uidCounter++);
      const user = { uid, email, password, displayName: null };
      users.set(email, user);
      currentSession = { uid, email, displayName: null };
      return { uid, email, displayName: null };
    },
    async signInWithEmailAndPassword(a, email, password) {
      const user = users.get(email);
      if (!user) { const e = new Error('auth/user-not-found'); throw e; }
      if (user.password !== password) { const e = new Error('auth/wrong-password'); throw e; }
      currentSession = { uid: user.uid, email, displayName: user.displayName };
      return { uid: user.uid, email, displayName: user.displayName };
    },
    async updateProfile(user, profile) {
      const rec = [...users.values()].find(u => u.uid === user.uid);
      if (rec && profile.displayName !== undefined) rec.displayName = profile.displayName;
      if (currentSession && currentSession.uid === user.uid) currentSession.displayName = profile.displayName;
    },
    async getCurrentUser(a) {
      return currentSession ? { ...currentSession } : null;
    },
    async signOut(a) { currentSession = null; },
    _debug: { users, getSession: () => currentSession },
  };
}

async function main() {
  console.log('signUp()');

  await test('creates an account with valid input', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const r = await ea.signUp({ name: 'Mansa', email: 'mansa@example.com', password: 'supersecret' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.name, 'Mansa');
  });

  await test('rejects missing name', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const r = await ea.signUp({ email: 'a@b.com', password: 'supersecret' });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects invalid email', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const r = await ea.signUp({ name: 'X', email: 'not-an-email', password: 'supersecret' });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects short password', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const r = await ea.signUp({ name: 'X', email: 'a@b.com', password: '123' });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects duplicate email', async () => {
    const adapter = mockAdapter();
    const ea = EmailAuth.createEmailAuth({ adapter });
    await ea.signUp({ name: 'X', email: 'dup@example.com', password: 'supersecret' });
    const r2 = await ea.signUp({ name: 'Y', email: 'dup@example.com', password: 'supersecret2' });
    assert.strictEqual(r2.ok, false);
  });

  await test('sets displayName on the Firebase account at signup (no PIN anywhere)', async () => {
    const adapter = mockAdapter();
    const ea = EmailAuth.createEmailAuth({ adapter });
    await ea.signUp({ name: 'Mansa', email: 'mansa2@example.com', password: 'supersecret' });
    const rec = adapter._debug.users.get('mansa2@example.com');
    assert.strictEqual(rec.displayName, 'Mansa');
  });

  console.log('\nsignIn()');

  await test('signs in with correct credentials', async () => {
    const adapter = mockAdapter();
    const ea = EmailAuth.createEmailAuth({ adapter });
    await ea.signUp({ name: 'Mansa', email: 'signin1@example.com', password: 'supersecret' });
    await ea.logout();
    const r = await ea.signIn({ email: 'signin1@example.com', password: 'supersecret' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.name, 'Mansa'); // recalled automatically, never re-asked
  });

  await test('rejects wrong password', async () => {
    const adapter = mockAdapter();
    const ea = EmailAuth.createEmailAuth({ adapter });
    await ea.signUp({ name: 'X', email: 'signin2@example.com', password: 'correctpw' });
    await ea.logout();
    const r = await ea.signIn({ email: 'signin2@example.com', password: 'wrongpw' });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects unknown email', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const r = await ea.signIn({ email: 'nope@example.com', password: 'whatever1' });
    assert.strictEqual(r.ok, false);
  });

  console.log('\ncheckPersistedSession() — the "stay logged in like Gmail" behavior');

  await test('resumes an existing session automatically on a fresh EmailAuth instance (simulated reload)', async () => {
    const adapter = mockAdapter();
    const eaFirstLoad = EmailAuth.createEmailAuth({ adapter });
    await eaFirstLoad.signUp({ name: 'Mansa', email: 'persist@example.com', password: 'supersecret' });

    // Simulate a page reload: brand new EmailAuth instance, SAME adapter
    // (mirroring how Firebase's own persisted session survives reload)
    const eaReload = EmailAuth.createEmailAuth({ adapter });
    const resumed = await eaReload.checkPersistedSession();
    assert.ok(resumed, 'should find a persisted session');
    assert.strictEqual(resumed.name, 'Mansa');
  });

  await test('returns null when nobody is logged in', async () => {
    const ea = EmailAuth.createEmailAuth({ adapter: mockAdapter() });
    const resumed = await ea.checkPersistedSession();
    assert.strictEqual(resumed, null);
  });

  await test('logout ends the persisted session — next check finds nobody', async () => {
    const adapter = mockAdapter();
    const eaFirstLoad = EmailAuth.createEmailAuth({ adapter });
    await eaFirstLoad.signUp({ name: 'X', email: 'logout-test@example.com', password: 'supersecret' });
    await eaFirstLoad.logout();

    const eaReload = EmailAuth.createEmailAuth({ adapter });
    const resumed = await eaReload.checkPersistedSession();
    assert.strictEqual(resumed, null);
  });

  await test('getCurrentUser() reflects in-memory state without re-hitting the adapter', async () => {
    const adapter = mockAdapter();
    const ea = EmailAuth.createEmailAuth({ adapter });
    await ea.signUp({ name: 'Mansa', email: 'current@example.com', password: 'supersecret' });
    const cur = ea.getCurrentUser();
    assert.strictEqual(cur.uid !== undefined, true);
    assert.strictEqual(cur.displayName, 'Mansa');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
