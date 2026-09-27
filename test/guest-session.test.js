'use strict';
const assert = require('assert');
const GuestSession = require('../js/core/guest-session.js');

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

function mockStore() {
  const data = {};
  return {
    get: (k) => (k in data ? data[k] : null),
    set: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); return true; },
    _raw: data,
  };
}

function mockAdapter() {
  const sessions = new Map(); // appName -> uid | null
  let uidCounter = 1;
  return {
    async initializeApp(config, name) { return { name }; },
    async getAuth(app) { return { appName: app.name }; },
    async signInAnonymously(auth) {
      const uid = 'anon_' + (uidCounter++);
      sessions.set(auth.appName, uid);
      return { uid };
    },
    async getCurrentUser(auth) {
      const uid = sessions.get(auth.appName);
      return uid ? { uid } : null;
    },
    async signOut(auth) { sessions.delete(auth.appName); },
    _forceExpire(appName) { sessions.delete(appName); },
  };
}

async function main() {
  console.log('addGuest()');

  await test('creates a guest with valid nickname + PINs', async () => {
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store: mockStore(), config: {} });
    const r = await gs.addGuest({ nickname: 'Bola', pins: ['11111', '22222'] });
    assert.strictEqual(r.ok, true);
    assert.ok(r.uid.startsWith('anon_'));
  });

  await test('rejects missing nickname', async () => {
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store: mockStore(), config: {} });
    const r = await gs.addGuest({ pins: ['11111', '22222'] });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects identical PINs', async () => {
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store: mockStore(), config: {} });
    const r = await gs.addGuest({ nickname: 'X', pins: ['11111', '11111'] });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects non-5-digit PIN', async () => {
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store: mockStore(), config: {} });
    const r = await gs.addGuest({ nickname: 'X', pins: ['123', '22222'] });
    assert.strictEqual(r.ok, false);
  });

  await test('rejects a PIN already used by another guest on this device', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    await gs.addGuest({ nickname: 'A', pins: ['11111', '22222'] });
    const r2 = await gs.addGuest({ nickname: 'B', pins: ['11111', '33333'] });
    assert.strictEqual(r2.ok, false);
  });

  await test('stores hashed PINs, never raw PINs', async () => {
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store, config: {} });
    await gs.addGuest({ nickname: 'X', pins: ['13579', '24680'] });
    const raw = JSON.stringify(store._raw);
    assert.ok(!raw.includes('13579'));
    assert.ok(!raw.includes('24680'));
  });

  console.log('\nrestoreAll() / switchTo()');

  await test('correct PIN unlocks a restored guest session', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'Bola', pins: ['12345', '54321'] });

    const gs2 = GuestSession.createGuestSession({ adapter, store, config: {} });
    const restored = await gs2.restoreAll();
    assert.strictEqual(restored[0].restored, true);

    const r = gs2.switchTo(created.uid, '12345');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(gs2.getActiveUid(), created.uid);
  });

  await test('either of the 2 PINs works', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'X', pins: ['11111', '99999'] });
    await gs.restoreAll();
    assert.strictEqual(gs.switchTo(created.uid, '99999').ok, true);
  });

  await test('wrong PIN is rejected', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'X', pins: ['11111', '22222'] });
    await gs.restoreAll();
    const r = gs.switchTo(created.uid, '00000');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(gs.getActiveUid(), null);
  });

  await test('expired session reports needsReauth distinctly from wrong PIN', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'X', pins: ['11111', '22222'] });

    const slots = store.get('guestSlots');
    adapter._forceExpire(slots[0].appName);
    const gs2 = GuestSession.createGuestSession({ adapter, store, config: {} });
    await gs2.restoreAll();

    const r = gs2.switchTo(created.uid, '11111'); // PIN is still correct
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.needsReauth, true);
  });

  console.log('\nlistGuests() / updatePins() / removeGuest()');

  await test('listGuests never exposes pinHashes', async () => {
    const gs = GuestSession.createGuestSession({ adapter: mockAdapter(), store: mockStore(), config: {} });
    await gs.addGuest({ nickname: 'Bola', pins: ['11111', '22222'] });
    const list = gs.listGuests();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].pinHashes, undefined);
    assert.strictEqual(list[0].nickname, 'Bola');
  });

  await test('updatePins changes PINs and the old one stops working', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'A', pins: ['11111', '22222'] });
    await gs.restoreAll();

    const r = gs.updatePins(created.uid, ['55555', '66666']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(gs.switchTo(created.uid, '11111').ok, false);
    assert.strictEqual(gs.switchTo(created.uid, '55555').ok, true);
  });

  await test('updatePins rejects collision with another guest\'s PIN', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const a = await gs.addGuest({ nickname: 'A', pins: ['11111', '22222'] });
    const b = await gs.addGuest({ nickname: 'B', pins: ['33333', '44444'] });
    const r = gs.updatePins(b.uid, ['11111', '99999']);
    assert.strictEqual(r.ok, false);
  });

  await test('removeGuest forgets the slot and signs out', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const created = await gs.addGuest({ nickname: 'X', pins: ['11111', '22222'] });
    await gs.restoreAll();
    gs.switchTo(created.uid, '11111');
    await gs.removeGuest(created.uid);
    assert.strictEqual(gs.listGuests().length, 0);
    assert.strictEqual(gs.getActiveUid(), null);
  });

  await test('multiple guests coexist and switch correctly, each to their own identity', async () => {
    const adapter = mockAdapter();
    const store = mockStore();
    const gs = GuestSession.createGuestSession({ adapter, store, config: {} });
    const a = await gs.addGuest({ nickname: 'Mansa-Guest', pins: ['11111', '22222'] });
    const b = await gs.addGuest({ nickname: 'Bola-Guest', pins: ['33333', '44444'] });
    await gs.restoreAll();

    assert.strictEqual(gs.switchTo(a.uid, '11111').nickname, 'Mansa-Guest');
    assert.strictEqual(gs.switchTo(b.uid, '33333').nickname, 'Bola-Guest');
    assert.strictEqual(gs.getActiveUid(), b.uid); // last switch wins
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
